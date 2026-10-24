import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  assertRouteExpectation,
  checkNoPathResponse,
  checkTrace,
  decodeShape,
  mapLocatedWay,
  validateFixture,
  type EdgeMapping,
  type GraphFixture,
} from "../tools/graph_evidence.js";
import {
  GraphCommands,
  GraphError,
  OwnedGraphContainer,
  engineJson,
  graphIdentity,
  main,
  runGraph,
  verifyEngineEvidence,
  type Executor,
} from "../tools/test_graph.js";
import { InputError } from "../tools/shared.js";
import {
  captured,
  fixture,
  object,
  objects,
  temporary,
  type ObjectValue,
} from "./helpers.js";
interface Reference {
  locate_ab: unknown;
  locate_fc: unknown;
  locate_oneway: unknown;
  edge_map: EdgeMapping[];
  trace_baseline: unknown;
  baseline: unknown;
}
const reference = fixture<Reference>("fixtures/graph/engine-reference.json");
const graph = (): GraphFixture => fixture("fixtures/graph/tiny-city.json");
const processResult = (stdout = "", status = 0, stderr = "") => ({
  status,
  stdout,
  stderr,
});

test("fixture preserves six independent checks and legal alternatives / 독립 검사 여섯 개·같은 출발도착 보존", () => {
  const contract = graph();
  validateFixture(contract);
  assert.deepEqual(contract.routes[0]!.expected_ways, [101, 102]);
  assert.deepEqual(
    contract.routes[1]!.expected_ways,
    [101, 103, 104, 105, 106, 102],
  );
  assert.deepEqual(
    contract.routes[0]!.locations[0],
    contract.routes[1]!.locations[0],
  );
  assert.deepEqual(
    contract.routes[0]!.locations.at(-1),
    contract.routes[1]!.locations.at(-1),
  );
  const xml = readFileSync(
    new URL("../../fixtures/graph/tiny-city.osm.xml", import.meta.url),
    "utf8",
  );
  assert.equal((xml.match(/<way /g) ?? []).length, contract.ways.length);
  assert.match(xml, /ref="101" role="from"/);
  assert.match(xml, /ref="1002" role="via"/);
  assert.match(xml, /ref="108" role="to"/);
  assert.match(xml, /v="no_right_turn"/);
});
test("fixture rejects missing expectations, duplicate IDs and invalid references / 기대값 누락·중복·잘못된 참조 거부", () => {
  const mutations: ((value: GraphFixture) => void)[] = [
    (value) => {
      delete value.routes[0]!.expected_ways;
    },
    (value) => {
      value.routes[1]!.id = value.routes[0]!.id;
    },
    (value) => {
      value.routes[0]!.locations = [value.routes[0]!.locations[0]!];
    },
    (value) => {
      value.routes[0]!.expected_ways = [999];
    },
    (value) => {
      delete value.routes[2]!.forbidden_transition;
    },
    (value) => {
      delete value.routes[4]!.expected_error_code;
    },
    (value) => {
      value.routes[4]!.expected_error_code = 500;
    },
    (value) => {
      value.routes[4]!.expected_ways = [201];
    },
    (value) => {
      value.routes[1]!.locations[0]!.lon += 0.001;
    },
    (value) => {
      value.ways[0]!.to = value.ways[0]!.from;
    },
    (value) => {
      value.ways[0]!.to_coordinate = value.ways[0]!.from_coordinate;
    },
    (value) => {
      value.ways[1]!.osm_way_id = value.ways[0]!.osm_way_id;
    },
    (value) => {
      value.restriction.via_node = 999;
    },
    (value) => {
      value.restriction.from_way = 999;
    },
  ];
  for (const mutation of mutations) {
    const value = graph();
    mutation(value);
    assert.throws(() => validateFixture(value), InputError);
  }
  assert.throws(
    () => assertRouteExpectation({ id: "missing", locations: [] }, [101]),
    /missing independent/,
  );
});
test("actual locate responses map stable labels to string edge IDs / 실제 조회의 이름표·문자열 구간 식별자 대응", () => {
  const ways = graph().ways;
  for (const [label, response] of [
    ["ab", reference.locate_ab],
    ["fc", reference.locate_fc],
    ["oneway", reference.locate_oneway],
  ] as const) {
    const mapped = mapLocatedWay(
      ways.find((way) => way.label === label)!,
      response,
      `locate-${label}.response.json`,
    );
    assert.equal(mapped.length, 2);
    assert.ok(
      mapped.every(
        (edge) =>
          typeof edge.edge_id === "string" && /^\d+$/.test(edge.edge_id),
      ),
    );
    assert.equal(new Set(mapped.map((edge) => edge.forward)).size, 2);
    assert.equal(
      mapped.filter((edge) => edge.car_access).length,
      label === "oneway" ? 1 : 2,
    );
    assert.ok(
      mapped.every(
        (edge) => edge.evidence_path === `locate-${label}.response.json`,
      ),
    );
  }
});
test("engine shape direction is independent of original way direction / 저장 지형 방향과 원본 도로 방향 구분", () => {
  const way = graph().ways.find((item) => item.label === "fc")!;
  const mapped = mapLocatedWay(
    way,
    reference.locate_fc,
    "locate-fc.response.json",
  );
  assert.deepEqual(
    mapped.find((edge) => edge.forward)!.directed_geometry[0],
    way.from_coordinate,
  );
  // Reverse only this unit input to exercise opposite stored/source orientations.
  // 단위 입력의 원본 방향만 뒤집어 저장 지형과 반대인 경우를 검사합니다.
  const oppositeSource = {
    ...way,
    from: way.to,
    to: way.from,
    from_coordinate: way.to_coordinate,
    to_coordinate: way.from_coordinate,
  };
  const opposite = mapLocatedWay(
    oppositeSource,
    reference.locate_fc,
    "locate-fc.response.json",
  );
  assert.ok(opposite.some((edge) => edge.engine_forward !== edge.forward));
  assert.deepEqual(
    opposite.find((edge) => edge.forward)!.directed_geometry[0],
    oppositeSource.from_coordinate,
  );
});
test("invalid locate evidence cannot pass / 잘못된 구간 조회 증거 거부", () => {
  const way = graph().ways[0]!;
  const mutate = (callback: (edges: ObjectValue[]) => void): unknown => {
    const response = structuredClone(reference.locate_ab);
    callback(objects(object((response as unknown[])[0]).edges));
    return response;
  };
  for (const response of [
    mutate((edges) => {
      object(edges[0]!.edge_info).way_id = 999;
    }),
    mutate((edges) => {
      object(edges[0]!.edge_id).value = Number.MAX_SAFE_INTEGER + 1;
    }),
    mutate((edges) => {
      object(object(edges[0]!.edge).access).car = false;
    }),
    mutate((edges) => {
      edges.pop();
    }),
    mutate((edges) => {
      edges.push(structuredClone(edges[0]!));
    }),
    mutate((edges) => {
      object(edges[0]!.edge_info).shape = "bad";
    }),
  ])
    assert.throws(() => mapLocatedWay(way, response, "evidence"), InputError);
});
test("actual route trace preserves geometry, direction and car access / 실제 경로 구간의 지형·방향·자동차 접근 검사", () => {
  const shape = object(
    objects(object(object(reference.baseline).trip).legs)[0],
  ).shape;
  assert.deepEqual(
    checkTrace(shape, reference.trace_baseline, reference.edge_map),
    [101, 102],
  );
  assert.deepEqual(decodeShape("???_|B"), [
    [0, 0],
    [0.002, 0],
  ]);
  assert.throws(() => decodeShape("~"), InputError);
  const wrong = structuredClone(reference.trace_baseline);
  object(wrong).shape = "???_|B";
  assert.throws(() => checkTrace(shape, wrong, reference.edge_map), InputError);
  assert.throws(
    () => checkTrace(shape, reference.trace_baseline, []),
    InputError,
  );
  const inaccessible = structuredClone(reference.edge_map);
  inaccessible.find((edge) => edge.edge_id === "4152962")!.car_access = false;
  assert.throws(
    () => checkTrace(shape, reference.trace_baseline, inaccessible),
    InputError,
  );
  const gap = structuredClone(reference.trace_baseline);
  objects(object(gap).edges)[1]!.begin_shape_index = 0;
  assert.throws(() => checkTrace(shape, gap, reference.edge_map), InputError);
});
test("independent route expectations reject forbidden transitions / 독립 경로 기대값으로 금지 전환 거부", () => {
  const fixture = graph();
  assertRouteExpectation(fixture.routes[0]!, [101, 102]);
  assertRouteExpectation(fixture.routes[1]!, [101, 103, 104, 105, 106, 102]);
  assertRouteExpectation(fixture.routes[2]!, [101, 103, 104, 107, 108]);
  assert.throws(
    () => assertRouteExpectation(fixture.routes[0]!, [101, 107, 102]),
    InputError,
  );
  assert.throws(
    () => assertRouteExpectation(fixture.routes[2]!, [101, 108]),
    InputError,
  );
  assert.throws(
    () => assertRouteExpectation(fixture.routes[2]!, [101, 102, 101, 108]),
    InputError,
  );
});
test("no-path requires exact structured engine error and exit one / 경로 없음은 명시적 오류와 종료 코드 1 필요", () => {
  const route = graph().routes[4]!,
    error = {
      error_code: 442,
      error: "No path could be found for input",
      status_code: 400,
    };
  checkNoPathResponse(route, error, 1);
  for (const [response, status] of [
    [error, 0],
    [{ ...error, error_code: 500 }, 1],
    [{ error: "failure" }, 1],
    [{ ...error, trip: {} }, 1],
    [error, null],
  ] as const)
    assert.throws(
      () => checkNoPathResponse(route, response, status),
      InputError,
    );
});
test("engine evidence mismatches have exit one, not input exit two / 엔진 증거 불일치는 종료 코드 1", () => {
  const wrong = structuredClone(reference.locate_ab);
  object(objects(object((wrong as unknown[])[0]).edges)[0]!.edge_info).way_id =
    999;
  assert.throws(
    () =>
      verifyEngineEvidence(() =>
        mapLocatedWay(graph().ways[0]!, wrong, "locate"),
      ),
    (error: unknown) => error instanceof GraphError && error.exitCode === 1,
  );
  const shape = object(
    objects(object(object(reference.baseline).trip).legs)[0],
  ).shape;
  assert.throws(
    () =>
      verifyEngineEvidence(() =>
        checkTrace(shape, reference.trace_baseline, []),
      ),
    (error: unknown) => error instanceof GraphError && error.exitCode === 1,
  );
});
test("tile bytes are bound to whole graph identity / 전체 그래프 식별자에 타일 바이트 결합", () => {
  const inputs = {
    fixture_sha256: "fixture",
    fixture_contract_sha256: "contract",
    config_sha256: "config",
    engine: "3.9.1",
    image_id: "image",
    tile_sha256: { "2/1.gph": "a" },
  };
  assert.equal(graphIdentity(inputs), graphIdentity(structuredClone(inputs)));
  const changed = structuredClone(inputs);
  changed.tile_sha256["2/1.gph"] = "b";
  assert.notEqual(graphIdentity(inputs), graphIdentity(changed));
});
test("owned container limits and cleanup are explicit / 소유 컨테이너 자원 제한·정리 확인", (t) => {
  const output = temporary(t),
    calls: string[][] = [];
  let removed = false;
  let session: OwnedGraphContainer;
  const execute: Executor = (args) => {
    calls.push(args);
    if (args[0] === "container")
      return removed
        ? processResult("", 1, "Error: No such container")
        : processResult(
            JSON.stringify([
              { Config: { Labels: { "io.routelens.run_id": session.runId } } },
            ]),
          );
    if (args[0] === "rm") removed = true;
    return processResult();
  };
  session = new OwnedGraphContainer(new GraphCommands(output, execute));
  session.start("sha256:image", output);
  assert.equal(session.cleanup(), true);
  const create = calls[0]!;
  for (const part of ["--network", "none", "--cpus", "2", "--memory", "2g"])
    assert.ok(create.includes(part));
  assert.equal(create.includes("-p"), false);
  assert.equal(create.filter((value) => value === "--mount").length, 1);
  assert.ok(calls.some((args) => args[0] === "rm" && args[2] === session.name));
  assert.equal(calls.at(-1)![0], "ps");
});
test("ownership mismatch and daemon failure refuse cleanup success / 소유권 불일치·데몬 오류는 정리 성공 아님", (t) => {
  for (const kind of ["foreign", "daemon"]) {
    const output = join(temporary(t), kind);
    mkdirSync(output);
    const calls: string[][] = [];
    const execute: Executor = (args) => {
      calls.push(args);
      if (args[0] === "container")
        return kind === "foreign"
          ? processResult(
              JSON.stringify([
                {
                  Config: { Labels: { "io.routelens.run_id": "someone-else" } },
                },
              ]),
            )
          : processResult("", 1, "Cannot connect to Docker daemon");
      return processResult();
    };
    const container = new OwnedGraphContainer(
      new GraphCommands(output, execute),
    );
    container.start("image", output);
    assert.throws(() => container.cleanup(), GraphError);
    assert.equal(
      calls.some((args) => args[0] === "rm"),
      false,
    );
  }
});
test("injected command failure preserves evidence but no completion manifest / 명령 실패 주입 시 미완료 증거 보존", (t) => {
  const output = join(temporary(t), "failure");
  const execute: Executor = () => processResult("", 1, "Docker unavailable");
  assert.throws(
    () => runGraph(output, execute),
    (error: unknown) => error instanceof GraphError && error.exitCode === 2,
  );
  assert.equal(existsSync(join(output, "manifest.json")), false);
  assert.equal(existsSync(join(output, "assertions.json")), true);
  assert.equal(
    JSON.parse(readFileSync(join(output, "assertions.json"), "utf8")).at(-1)
      .status,
    "FAIL",
  );
  assert.match(
    readFileSync(join(output, "summary.md"), "utf8"),
    /Result \/ 결과: FAIL/,
  );
});
test("output preservation and invalid CLI fail without Docker / 기존 출력 보존·잘못된 인자 거부", (t) => {
  const directory = temporary(t),
    existing = join(directory, "existing");
  mkdirSync(existing);
  const keep = join(existing, "keep");
  writeFileSync(keep, "unchanged");
  const execute: Executor = () => {
    throw new Error("Docker must not run");
  };
  assert.throws(() => runGraph(existing, execute));
  assert.equal(readFileSync(keep, "utf8"), "unchanged");
  const link = join(directory, "dangling");
  symlinkSync(join(directory, "absent"), link);
  assert.throws(() => runGraph(link, execute));
  assert.equal(main([], captured().io), 2);
  assert.equal(main(["--unknown"], captured().io), 2);
  const help = captured();
  assert.equal(main(["--help"], help.io), 0);
  assert.match(help.output[0]!, /usage \/ 사용법/);
});
test("engine parser accepts complete JSON only and records timeouts / 엔진 JSON 완전성·제한시간 실패 기록", (t) => {
  assert.deepEqual(engineJson('upstream log\n{"result":true}\n'), {
    result: true,
  });
  assert.throws(() => engineJson("engine failed"), GraphError);
  const output = temporary(t),
    commands = new GraphCommands(output, () => ({
      status: null,
      stdout: "",
      stderr: "",
      error: new Error("timeout"),
    }));
  assert.throws(
    () => commands.command(["exec", "owned", "tool"], 1),
    GraphError,
  );
  assert.equal(commands.records[0]!.exit_code, null);
  assert.equal(existsSync(join(output, commands.records[0]!.stderr)), true);
});
