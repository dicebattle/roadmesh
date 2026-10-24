import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  loadGraphBundle,
  bundlePath,
  type GraphBundle,
} from "../tools/graph_bundle.js";
import {
  EARTH_RADIUS_M,
  generateSimulation,
  localDistance,
  main,
  runSimulation,
  validateSimulation,
  type SimulationSpec,
  type SimulationTruth,
} from "../tools/vehicle_simulator.js";
import { canonical, InputError, sha256 } from "../tools/shared.js";
import { captured, fixture, temporary } from "./helpers.js";
const archive = fixture<{ files: Record<string, string> }>(
  "fixtures/simulation/p02-reference.json",
);
function restore(directory: string): void {
  mkdirSync(directory);
  for (const [path, base64] of Object.entries(archive.files)) {
    const destination = join(directory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.from(base64, "base64"));
  }
}
function spec(bundle: GraphBundle): SimulationSpec {
  const value = fixture<SimulationSpec>("fixtures/simulation/demo.json");
  value.graph_id = bundle.graphId;
  return value;
}
function setup(directory: string): {
  bundle: GraphBundle;
  value: SimulationSpec;
} {
  restore(directory);
  const bundle = loadGraphBundle(directory);
  return { bundle, value: spec(bundle) };
}

test("archived real bundle integrity is independently recomputed / 보존된 실제 묶음의 무결성을 다시 계산", (t) => {
  const { bundle } = setup(join(temporary(t), "graph"));
  assert.equal(bundle.edges.length, 22);
  assert.ok(bundle.edges.every((edge) => typeof edge.edge_id === "string"));
  assert.equal(
    bundle.manifestSha256,
    sha256(readFileSync(join(bundle.directory, "manifest.json"))),
  );
});
test("bundle rejects tampered inputs, mapping and completion / 묶음 입력·구간 대응·완료 변조 거부", (t) => {
  const parent = temporary(t);
  for (const name of [
    "xml",
    "pbf",
    "config",
    "tile",
    "manifest",
    "edge-map",
    "locate",
    "assertions",
  ]) {
    const directory = join(parent, name);
    restore(directory);
    const json = (file: string) =>
      JSON.parse(readFileSync(join(directory, file), "utf8")) as Record<
        string,
        unknown
      >;
    if (name === "xml" || name === "pbf" || name === "config")
      writeFileSync(
        join(
          directory,
          name === "xml"
            ? "tiny-city.osm.xml"
            : name === "pbf"
              ? "tiny-city.osm.pbf"
              : "config.json",
        ),
        "tampered",
      );
    else if (name === "tile") {
      const key = Object.keys(json("manifest.json").tile_sha256 as object)[0]!;
      writeFileSync(join(directory, "tiles", key), "tampered");
    } else if (name === "manifest") {
      const value = json("manifest.json");
      value.cleanup_verified = false;
      writeFileSync(join(directory, "manifest.json"), JSON.stringify(value));
    } else if (name === "edge-map") {
      const value = JSON.parse(
        readFileSync(join(directory, "edge-map.json"), "utf8"),
      );
      value[0].edge_id = "999";
      writeFileSync(join(directory, "edge-map.json"), JSON.stringify(value));
    } else if (name === "locate") {
      const value = JSON.parse(
        readFileSync(join(directory, "locate-ab.response.json"), "utf8"),
      );
      value[0].edges[0].edge.access.car = false;
      writeFileSync(
        join(directory, "locate-ab.response.json"),
        JSON.stringify(value),
      );
    } else {
      writeFileSync(join(directory, "assertions.json"), "[]");
    }
    assert.throws(() => loadGraphBundle(directory), Error, name);
  }
});
test("bundle rejects escapes and symlinks at every evidence boundary / 증거 경로 탈출·심볼릭 링크 거부", (t) => {
  const directory = join(temporary(t), "graph");
  restore(directory);
  for (const path of [
    "../manifest.json",
    "/etc/passwd",
    "tiles/../manifest.json",
    "tiles\\escape",
    "./manifest.json",
  ])
    assert.throws(() => bundlePath(directory, path));
  const original = readFileSync(join(directory, "config.json")),
    outside = join(dirname(directory), "outside.json");
  writeFileSync(outside, original);
  rmSync(join(directory, "config.json"));
  symlinkSync(outside, join(directory, "config.json"));
  assert.throws(() => loadGraphBundle(directory), /symlink/);
});
test("independent equatorial distance and baseline crossings / 독립 적도 거리·기본 경로 통과 시각", (t) => {
  assert.equal(EARTH_RADIUS_M, 6371008.8);
  assert.ok(
    Math.abs(localDistance([0, 0], [0.001, 0]) - 111.1950802335329) < 1e-10,
  );
  const { bundle, value } = setup(join(temporary(t), "graph"));
  validateSimulation(value, bundle);
  const result = generateSimulation(value, bundle);
  const traversals = result.truth.traversals.filter(
    (item) => item.vehicle_id === "baseline-clean",
  );
  assert.deepEqual(
    traversals.map((item) => item.entered_at_ms),
    [0, 22240],
  );
  assert.deepEqual(
    traversals.map((item) => item.exited_at_ms),
    [22240, 44479],
  );
  assert.ok(Math.abs(traversals[0]!.distance_m - 222.3901604670658) < 1e-9);
  const arrival = result.truth.samples
    .filter((item) => item.vehicle_id === "baseline-clean")
    .at(-1)!;
  assert.equal(arrival.offset_ms, 44479);
  assert.equal(arrival.longitude, 0.004);
  assert.equal(arrival.latitude, 0);
});
test("authored demo counts and zero-speed wait match hand calculations / 시연 개수·정지 대기를 수작업 계산과 대조", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph")),
    result = generateSimulation(value, bundle);
  assert.equal(result.truth.samples.length, 187);
  assert.equal(result.observations.length, 177);
  assert.equal(result.omissions.length, 10);
  assert.equal(result.truth.traversals.length, 8);
  const upper = result.truth.traversals.filter(
    (item) => item.vehicle_id === "upper-waiting",
  );
  assert.equal(upper[0]!.entered_at_ms, 0);
  assert.deepEqual(
    upper.map((item) => item.exited_at_ms),
    [27240, 49479, 71718, 93957],
  );
  assert.ok(
    result.truth.samples
      .filter(
        (item) => item.vehicle_id === "upper-waiting" && item.offset_ms <= 5000,
      )
      .every((item) => item.latitude === 0 && item.longitude === 0),
  );
});
test("on-grid arrival is included exactly once and exit precedes entry / 정시 도착 중복 방지·진출 후 진입", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph"));
  value.vehicles = [value.vehicles[0]!];
  value.vehicles[0]!.path = [{ label: "ab", forward: true }];
  value.vehicles[0]!.speed_profile = [
    { duration_ms: 10000, speed_mps: 222.3901604670658 / 10 },
  ];
  const result = generateSimulation(validateSimulation(value, bundle), bundle);
  assert.equal(result.truth.samples.length, 11);
  assert.equal(result.truth.samples.at(-1)!.offset_ms, 10000);
  assert.equal(
    new Set(result.truth.samples.map((item) => item.sample_id)).size,
    11,
  );
});
test("speed changes integrate continuously and round once / 속도 변경을 연속 적분하고 한 번 올림", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph"));
  value.vehicles = [value.vehicles[0]!];
  value.vehicles[0]!.speed_profile = [
    { duration_ms: 10000, speed_mps: 5 },
    { duration_ms: 60000, speed_mps: 10 },
  ];
  const result = generateSimulation(validateSimulation(value, bundle), bundle),
    traversals = result.truth.traversals;
  assert.equal(traversals[0]!.exited_at_ms, 27240);
  assert.equal(traversals[1]!.exited_at_ms, 49479);
  const at10 = result.truth.samples.find(
    (sample) => sample.offset_ms === 10000,
  )!;
  assert.ok(
    Math.abs(localDistance([0, 0], [at10.longitude, at10.latitude]) - 50) <
      0.001,
  );
});
test("same seed and declaration reorder preserve all deterministic content / 같은 시드·선언 순서의 결정성", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph"));
  const baseline = generateSimulation(value, bundle);
  assert.deepEqual(generateSimulation(value, bundle), baseline);
  value.vehicles.reverse();
  assert.deepEqual(generateSimulation(value, bundle), baseline);
});
test("faults and seeds never alter truth or traversal times / 장애·시드가 정답·통과 시각을 바꾸지 않음", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph")),
    baseline = generateSimulation(value, bundle);
  const clean = structuredClone(value);
  clean.vehicles.forEach((vehicle) => {
    vehicle.noise_radius_m = 0;
    vehicle.drop_intervals = [];
  });
  assert.deepEqual(generateSimulation(clean, bundle).truth, baseline.truth);
  const other = structuredClone(value);
  other.seed = 8;
  const changed = generateSimulation(other, bundle);
  assert.deepEqual(changed.truth, baseline.truth);
  assert.notDeepEqual(changed.observations, baseline.observations);
});
test("drop boundaries preserve IDs and surviving noise stream / 누락 경계·식별자·남은 잡음 흐름 보존", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph")),
    result = generateSimulation(value, bundle),
    withoutDrop = structuredClone(value);
  withoutDrop.vehicles.forEach((vehicle) => (vehicle.drop_intervals = []));
  const full = generateSimulation(withoutDrop, bundle);
  assert.deepEqual(
    result.omissions.map((sample) => sample.offset_ms),
    [15000, 16000, 17000, 18000, 19000, 20000, 21000, 22000, 23000, 24000],
  );
  assert.ok(
    result.observations.some(
      (sample) =>
        sample.vehicle_id === "baseline-noisy" && sample.offset_ms === 25000,
    ),
  );
  for (const sample of result.observations)
    assert.deepEqual(
      full.observations.find((item) => item.sample_id === sample.sample_id),
      sample,
    );
});
test("unrelated vehicle does not perturb existing streams or leak edge IDs / 다른 차량 추가의 흐름 독립·정답 식별자 비노출", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph")),
    before = generateSimulation(value, bundle);
  const extra = structuredClone(value.vehicles[1]!);
  extra.vehicle_id = "new-unrelated";
  value.vehicles.push(extra);
  const after = generateSimulation(value, bundle);
  assert.deepEqual(
    after.observations.filter(
      (sample) => sample.vehicle_id !== "new-unrelated",
    ),
    before.observations,
  );
  assert.ok(
    after.observations.every(
      (sample) => sample.source_class === "SYNTHETIC" && !("edge_id" in sample),
    ),
  );
  assert.ok(after.assertions.every((item) => item.status === "PASS"));
});
test("invalid values, illegal turns and disconnected paths fail early / 잘못된 값·금지 회전·경로 단절 조기 거부", (t) => {
  const { bundle, value } = setup(join(temporary(t), "graph"));
  const mutations: ((spec: SimulationSpec) => void)[] = [
    (spec) => {
      spec.seed = true as unknown as number;
    },
    (spec) => {
      Object.assign(spec, { extra: true });
    },
    (spec) => {
      spec.graph_id = "wrong";
    },
    (spec) => {
      spec.fixture_id = "different";
    },
    (spec) => {
      spec.start_time_utc = "2026-02-30T00:00:00Z";
    },
    (spec) => {
      spec.duration_ms = 300001;
    },
    (spec) => {
      spec.sample_interval_ms = 99;
    },
    (spec) => {
      spec.vehicles.push(structuredClone(spec.vehicles[0]!));
    },
    (spec) => {
      spec.vehicles[0]!.noise_radius_m = 21;
    },
    (spec) => {
      spec.vehicles[0]!.path = [{ label: "unknown", forward: true }];
    },
    (spec) => {
      spec.vehicles[0]!.path = [{ label: "oneway", forward: false }];
    },
    (spec) => {
      spec.vehicles[0]!.path = [
        { label: "ab", forward: true },
        { label: "bg", forward: true },
      ];
    },
    (spec) => {
      spec.vehicles[0]!.path = [
        { label: "ab", forward: true },
        { label: "disconnected", forward: true },
      ];
    },
    (spec) => {
      spec.vehicles[0]!.speed_profile = [{ duration_ms: 120000, speed_mps: 0 }];
    },
    (spec) => {
      spec.vehicles[0]!.speed_profile = [
        { duration_ms: 120000, speed_mps: 31 },
      ];
    },
    (spec) => {
      spec.vehicles[0]!.drop_intervals = [
        { start_ms: 100, end_ms: 200 },
        { start_ms: 199, end_ms: 300 },
      ];
    },
  ];
  for (const mutation of mutations) {
    const changed = structuredClone(value);
    mutation(changed);
    assert.throws(() => validateSimulation(changed, bundle), InputError);
  }
});
test("CLI writes reproducible bound evidence and refuses existing output / 재현 가능한 결합 증거·기존 출력 거부", (t) => {
  const directory = temporary(t),
    { bundle, value } = setup(join(directory, "graph")),
    path = join(directory, "spec.json");
  writeFileSync(path, JSON.stringify(value));
  assert.equal(
    runSimulation(path, bundle.directory, join(directory, "simulation")),
    0,
  );
  assert.equal(
    runSimulation(path, bundle.directory, join(directory, "replay")),
    0,
  );
  const first = JSON.parse(
      readFileSync(join(directory, "simulation/manifest.json"), "utf8"),
    ),
    second = JSON.parse(
      readFileSync(join(directory, "replay/manifest.json"), "utf8"),
    );
  assert.equal(first.truth_sha256, second.truth_sha256);
  assert.equal(first.observations_sha256, second.observations_sha256);
  assert.equal(first.graph_id, bundle.graphId);
  assert.equal(first.graph_manifest_sha256, bundle.manifestSha256);
  for (const [name, hash] of Object.entries(first.output_sha256))
    assert.equal(
      sha256(readFileSync(join(directory, "simulation", name))),
      hash,
    );
  const truth = JSON.parse(
    readFileSync(join(directory, "simulation/truth.json"), "utf8"),
  ) as SimulationTruth;
  assert.equal(first.truth_sha256, sha256(canonical(truth)));
  const manifestBefore = readFileSync(
    join(directory, "simulation/manifest.json"),
  );
  assert.equal(
    main(
      [
        path,
        "--graph",
        bundle.directory,
        "--output",
        join(directory, "simulation"),
      ],
      captured().io,
    ),
    2,
  );
  assert.ok(
    readFileSync(join(directory, "simulation/manifest.json")).equals(
      manifestBefore,
    ),
  );
  const invalid = structuredClone(value);
  invalid.vehicles[0]!.path = [{ label: "unknown", forward: true }];
  writeFileSync(path, JSON.stringify(invalid));
  assert.equal(
    main(
      [
        path,
        "--graph",
        bundle.directory,
        "--output",
        join(directory, "invalid"),
      ],
      captured().io,
    ),
    2,
  );
  assert.throws(() => readFileSync(join(directory, "invalid/manifest.json")));
});
test("simulation help identifies template and invalid CLI / 시뮬레이션 틀 안내·인자 오류", () => {
  const out = captured();
  assert.equal(main(["--help"], out.io), 0);
  assert.match(out.output[0]!, /template.*틀/);
  assert.equal(main([], captured().io), 2);
  assert.equal(main(["--unknown"], captured().io), 2);
});
