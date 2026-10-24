import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  evidenceHashes,
  loadMatchingInput,
  main,
  MAX_MATCHING_BYTES,
  MatchingFailure,
  runMatching,
} from "../tools/map_matcher.js";
import type { Executor } from "../tools/test_graph.js";
import { captured, object, objects, temporary } from "./helpers.js";
import {
  matchingEnvelope,
  midpointObservations,
  probes,
  restoreGraph,
} from "./matching_helpers.js";
import { sha256 } from "../tools/shared.js";
function input(directory: string, envelope = matchingEnvelope()): string {
  const path = join(directory, "input.json");
  writeFileSync(path, JSON.stringify(envelope));
  return path;
}
function fakeEngine(
  output: string,
  options: {
    response?: unknown;
    engineFailure?: boolean;
    cleanupFailure?: boolean;
    afterTrace?: () => void;
  } = {},
): { execute: Executor; calls: string[][] } {
  let owner = "",
    removed = false;
  const calls: string[][] = [];
  const execute: Executor = (args) => {
    calls.push(args);
    const success = (stdout = "") => ({ status: 0, stdout, stderr: "" });
    if (args[0] === "create") {
      owner = args[args.indexOf("--label") + 1]!.split("=")[1]!;
      return success("unit-container");
    }
    if (args[0] === "container")
      return removed
        ? { status: 1, stdout: "", stderr: "Error: no such object" }
        : success(
            JSON.stringify([
              { Config: { Labels: { "io.routelens.run_id": owner } } },
            ]),
          );
    if (args[0] === "rm") {
      if (options.cleanupFailure)
        return { status: 1, stdout: "", stderr: "injected cleanup failure" };
      removed = true;
      return success();
    }
    if (args[0] === "exec" && args.includes("--version"))
      return success("3.9.1\n");
    if (args[0] === "exec" && args.includes("trace_attributes")) {
      assert.match(args.at(-1)!, /^\/work\/requests\/.+\.request\.json$/);
      const request = JSON.parse(
        readFileSync(join(output, args.at(-1)!.slice("/work/".length)), "utf8"),
      );
      assert.equal(request.shape_match, "map_snap");
      assert.equal(request.trace_options.interpolation_distance, 0);
      options.afterTrace?.();
      if (options.engineFailure)
        return {
          status: 1,
          stdout: '{"error_code":444,"error":"Map matching failed"}',
          stderr: "engine failure",
        };
      return success(
        JSON.stringify(options.response ?? probes["baseline-clean"]!.response),
      );
    }
    return success();
  };
  return { execute, calls };
}
test("runtime uses read-only graph, request files and verified raw evidence hashes / 읽기 전용 그래프·요청 파일·원문 해시", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    path = input(directory),
    output = join(directory, "matching"),
    engine = fakeEngine(output);
  const result = runMatching(path, graph.directory, output, {
    execute: engine.execute,
  });
  assert.equal(result.accepted_traversals, 2);
  const create = engine.calls.find((args) => args[0] === "create")!;
  assert.ok(create.some((value) => value.endsWith("dst=/graph,readonly")));
  assert.equal(create.filter((value) => value === "--mount").length, 2);
  assert.equal(create.includes("-p"), false);
  const manifest = JSON.parse(
    readFileSync(join(output, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.cleanup_verified, true);
  assert.equal(manifest.graph_mount, "read-only");
  assert.equal(manifest.graph_manifest_sha256, graph.manifestSha256);
  assert.equal(manifest.input_sha256, sha256(readFileSync(path)));
  assert.ok(
    Object.keys(manifest.output_sha256).some((path) =>
      path.endsWith(".request.json"),
    ),
  );
  assert.ok(
    Object.keys(manifest.output_sha256).some((path) =>
      path.endsWith(".response.json"),
    ),
  );
  assert.ok(
    Object.keys(manifest.output_sha256).some((path) =>
      path.endsWith(".stdout.txt"),
    ),
  );
  for (const [name, expected] of Object.entries(manifest.output_sha256))
    assert.equal(sha256(readFileSync(join(output, name))), expected);
  assert.deepEqual(evidenceHashes(output), manifest.output_sha256);
});
test("ambiguity-only valid result writes empty command inventory and completion / 모호성만 있는 정상 제외 결과의 빈 명령 목록·완료", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    envelope = matchingEnvelope(midpointObservations()),
    path = input(directory, envelope),
    output = join(directory, "excluded");
  const result = runMatching(path, graph.directory, output, {
    execute: () => {
      throw new Error("Engine must not run");
    },
  });
  assert.equal(result.excluded_samples, 21);
  assert.equal(result.accepted_traversals, 0);
  assert.deepEqual(
    JSON.parse(readFileSync(join(output, "commands.json"), "utf8")),
    [],
  );
  const manifest = JSON.parse(
    readFileSync(join(output, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.engine_executed, false);
  assert.equal(manifest.cleanup_verified, true);
});
test("malformed engine response is failure one without a completed manifest / 잘못된 엔진 응답은 완료 없는 실행 실패1", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    path = input(directory),
    output = join(directory, "failure"),
    response = structuredClone(probes["baseline-clean"]!.response);
  objects(object(response).matched_points).pop();
  const engine = fakeEngine(output, { response });
  assert.throws(
    () =>
      runMatching(path, graph.directory, output, { execute: engine.execute }),
    MatchingFailure,
  );
  assert.equal(existsSync(join(output, "manifest.json")), false);
  assert.equal(
    JSON.parse(readFileSync(join(output, "assertions.json"), "utf8"))[0].status,
    "FAIL",
  );
  assert.ok(engine.calls.some((args) => args[0] === "rm"));
});
test("actual engine error cannot become successful exclusion / 엔진 오류를 성공한 제외로 바꾸지 않음", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    path = input(directory),
    output = join(directory, "failure"),
    engine = fakeEngine(output, { engineFailure: true });
  assert.throws(
    () =>
      runMatching(path, graph.directory, output, { execute: engine.execute }),
    MatchingFailure,
  );
  assert.equal(existsSync(join(output, "manifest.json")), false);
  assert.ok(engine.calls.some((args) => args[0] === "rm"));
  assert.ok(
    Object.keys(evidenceHashes(output)).some((path) =>
      path.endsWith(".stdout.txt"),
    ),
  );
});
test("cleanup failure prevents successful completion / 정리 실패는 성공 완료 금지", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    path = input(directory),
    output = join(directory, "failure"),
    engine = fakeEngine(output, { cleanupFailure: true });
  assert.throws(
    () =>
      runMatching(path, graph.directory, output, { execute: engine.execute }),
    /Command failed/,
  );
  assert.equal(existsSync(join(output, "manifest.json")), false);
  assert.equal(
    JSON.parse(readFileSync(join(output, "assertions.json"), "utf8"))[1].status,
    "FAIL",
  );
});
test("graph tampering during matching is execution failure before PASS evidence / 매칭 중 그래프 변조는 통과 증거 전 실행 실패", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    path = input(directory),
    output = join(directory, "failure"),
    tile = Object.keys(graph.manifest.tile_sha256 as object)[0]!,
    engine = fakeEngine(output, {
      afterTrace: () =>
        writeFileSync(join(graph.directory, "tiles", tile), "tampered"),
    });
  assert.throws(
    () =>
      runMatching(path, graph.directory, output, { execute: engine.execute }),
    MatchingFailure,
  );
  assert.equal(existsSync(join(output, "manifest.json")), false);
  assert.match(readFileSync(join(output, "summary.md"), "utf8"), /FAIL/);
});
test("wrong graph and existing output remain invalid input / 다른 그래프·기존 출력은 입력 오류", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    envelope = matchingEnvelope();
  envelope.graph_id = "wrong";
  const path = input(directory, envelope),
    output = join(directory, "invalid");
  assert.equal(
    main([path, "--graph", graph.directory, "--output", output], captured().io),
    2,
  );
  assert.equal(existsSync(output), false);
  mkdirSync(output);
  const correct = input(directory),
    engine = fakeEngine(output);
  assert.throws(() =>
    runMatching(correct, graph.directory, output, { execute: engine.execute }),
  );
  assert.equal(engine.calls.length, 0);
});
test("bounded CLI input refuses over 32 MiB / 명령 입력의32MiB 초과 거부", (t) => {
  const directory = temporary(t),
    graph = restoreGraph(join(directory, "graph")),
    path = join(directory, "oversized.json");
  writeFileSync(path, Buffer.alloc(MAX_MATCHING_BYTES + 1, 32));
  assert.throws(() => loadMatchingInput(path, graph), /32 MiB/);
  assert.equal(main([], captured().io), 2);
  const out = captured();
  assert.equal(main(["--help"], out.io), 0);
  assert.match(out.output[0]!, /32 MiB/);
});
