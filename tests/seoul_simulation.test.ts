import assert from "node:assert/strict";
import test from "node:test";
import { canonical, sha256 } from "../tools/shared.js";
import {
  generateSimulation,
  validateSimulation,
  type SimulationGraph,
  type SimulationSpec,
  type SimulationTruth,
} from "../tools/vehicle_simulator.js";
import { geodesicSphere } from "../tools/geodesy.js";
import {
  evaluateSeoul,
  regionalAmbiguous,
  seoulSpec,
} from "../tools/seoul_simulation.js";
import {
  interpretRun,
  MatchingSession,
  type MatchingEnvelope,
  type MatchingGraph,
  type MatchingHooks,
  type MatchingResult,
} from "../tools/matching_evidence.js";
import type { EdgeMapping } from "../tools/graph_evidence.js";
import type { SeoulGraphBundle } from "../tools/seoul_types.js";
import { fixture } from "./helpers.js";
import { unitBundle } from "./matching_helpers.js";
function edge(id: number, line: number[][], way = id): EdgeMapping {
  return {
    label: `edge-${id}`,
    osm_way_id: way,
    edge_id: String(id),
    forward: true,
    engine_forward: true,
    car_access: true,
    source_geometry: line,
    directed_geometry: line,
    evidence_path: "unit-only.json",
  };
}
function regional(): SeoulGraphBundle {
  const edges = [
    edge(1, [
      [127, 37.5],
      [127.001, 37.5],
      [127.001, 37.501],
    ]),
  ];
  return {
    directory: "unit-only",
    graphId: "unit-graph",
    manifest: {},
    manifestSha256: "unit-hash",
    fixture: { fixture_id: "seoul-osm-20261023-v1" },
    geometry_policy: "geodesic-sphere-v1",
    edges,
    routes: ["teheran", "downtown", "mapo-bridge"].map((route_id) => ({
      route_id,
      name_en: route_id,
      name_ko: route_id,
      edge_ids: ["1"],
      bounds: [127, 37.5, 127.001, 37.501] as [number, number, number, number],
    })),
    context_roads: [],
  };
}
function encoded(line: number[][]): string {
  let latitude = 0,
    longitude = 0,
    result = "";
  const component = (value: number) => {
    let encoded = value < 0 ? ~(value << 1) : value << 1;
    while (encoded >= 32) {
      result += String.fromCharCode((32 | (encoded & 31)) + 63);
      encoded >>>= 5;
    }
    result += String.fromCharCode(encoded + 63);
  };
  for (const point of line) {
    const lat = Math.round(point[1]! * 1e6),
      lon = Math.round(point[0]! * 1e6);
    component(lat - latitude);
    component(lon - longitude);
    latitude = lat;
    longitude = lon;
  }
  return result;
}

test("tiny simulation truth and noise hashes retain pre-regional byte parity / tiny 정답·잡음의 지역 확장 이전 바이트 보존", () => {
  const spec = fixture<SimulationSpec>("fixtures/simulation/demo.json");
  spec.graph_id = unitBundle.graphId;
  const result = generateSimulation(
    validateSimulation(spec, unitBundle),
    unitBundle,
  );
  /* Recorded clean P03 main evidence, before geographic strategy changes. / 지역 전략 변경 전 깨끗한 P03 메인 증거입니다. */ assert.equal(
    sha256(canonical(result.truth)),
    "268ab6a27baa117fc0263cc56cc6e2cf2ce90dfe18ba95cad0078ea9f0ea57ff",
  );
  assert.equal(
    sha256(canonical(result.observations)),
    "c756bedf503ee9933514643c7d133e3867093d7f0fde0b5a61e2111c4c0edc6a",
  );
});
test("regional spec has nine vehicles, fixed source-relative clock and explicit modes / 지역 규격9대·원본 이후 시각·명시 모드", () => {
  const bundle = regional(),
    spec = validateSimulation(seoulSpec(bundle), bundle);
  assert.equal(spec.vehicles.length, 9);
  assert.equal(spec.start_time_utc, "2026-10-24T00:00:00Z");
  assert.equal(spec.sample_interval_ms, 500);
  const generated = generateSimulation(spec, bundle);
  assert.ok(generated.assertions.every((item) => item.status === "PASS"));
  assert.ok(
    generated.truth.samples
      .filter((item) => item.offset_ms <= 5000)
      .every((item) => item.longitude === 127 && item.latitude === 37.5),
  );
  const other = structuredClone(spec);
  other.seed = 8;
  assert.deepEqual(generateSimulation(other, bundle).truth, generated.truth);
  assert.notDeepEqual(
    generateSimulation(other, bundle).observations,
    generated.observations,
  );
});
test("regional polyline simulation permits 128 edges while tiny limit stays 20 / 지역128구간·tiny20구간 유지", () => {
  const bundle = regional();
  bundle.edges = Array.from({ length: 128 }, (_, index) =>
    edge(index + 1, [
      [127 + index * 0.00001, 37.5],
      [127 + (index + 1) * 0.00001, 37.5],
    ]),
  );
  bundle.routes[0]!.edge_ids = bundle.edges.map((item) => item.edge_id);
  const spec = seoulSpec(bundle);
  spec.vehicles = [spec.vehicles[0]!];
  validateSimulation(spec, bundle);
  const tiny: SimulationGraph = {
    graphId: bundle.graphId,
    fixture: { fixture_id: "tiny-city-v1" },
    edges: bundle.edges,
  };
  const changed = structuredClone(spec);
  changed.fixture_id = "tiny-city-v1";
  assert.throws(() => validateSimulation(changed, tiny));
});
test("regional matching uses full curved geometry and preserves session policy / 지역 매칭의 전체 곡선 지형·세션 정책", () => {
  const bundle = regional(),
    line = bundle.edges[0]!.directed_geometry,
    graph: MatchingGraph = {
      graphId: bundle.graphId,
      fixture: bundle.fixture,
      edges: bundle.edges,
    };
  const observations = [0, 0.5, 1].map((fraction, index) => {
    const position = geodesicSphere.position(
      line,
      fraction * geodesicSphere.length(line),
    );
    return {
      sample_id: "curved-" + index,
      vehicle_id: "curved",
      offset_ms: index * 500,
      event_time_utc: new Date(
        Date.parse("2026-10-24T00:00:00Z") + index * 500,
      ).toISOString(),
      longitude: position[0]!,
      latitude: position[1]!,
      accuracy_m: 0.01,
      source_class: "SYNTHETIC" as const,
    };
  });
  const response = {
      shape: encoded(line),
      edges: [{ id: 1, way_id: 1, begin_shape_index: 0, end_shape_index: 2 }],
      matched_points: observations.map((observation, index) => ({
        lon: observation.longitude,
        lat: observation.latitude,
        type: "matched",
        edge_index: 0,
        distance_along_edge: index / 2,
        distance_from_trace_point: 0,
      })),
    },
    envelope: MatchingEnvelope = {
      schema_version: "0.1",
      matching_id: "curved",
      graph_id: bundle.graphId,
      observations,
    },
    hooks: MatchingHooks = {
      policy_id: "seoul-observed-v1",
      geometry: geodesicSphere,
      ambiguous: () => false,
    };
  const run = { vehicle_id: "curved", index: 0, observations };
  assert.equal(
    interpretRun(envelope, graph, run, response, hooks).traversals[0]!.status,
    "ACCEPTED",
  );
  const session = new MatchingSession(
    { schema_version: "0.1", matching_id: "curved", graph_id: bundle.graphId },
    graph,
    () => response,
    hooks,
  );
  session.append(observations.slice(0, 2));
  session.append(observations.slice(1));
  assert.equal(session.finalize().policy_id, "seoul-observed-v1");
});
test("parallel guard ignores same physical-way hierarchy and opposing IDs / 같은 물리 도로의 계층·역방향 중복은 모호성 아님", () => {
  const first = edge(1, [
      [127, 37.5],
      [127, 37.501],
    ]),
    second = edge(2, first.directed_geometry, 1),
    point = {
      sample_id: "point",
      vehicle_id: "point",
      offset_ms: 0,
      event_time_utc: "2026-10-24T00:00:00.000Z",
      longitude: 127,
      latitude: 37.5005,
      accuracy_m: 3,
      source_class: "SYNTHETIC" as const,
    };
  assert.equal(regionalAmbiguous(point, [first, second]), false);
  const parallel = edge(
    3,
    first.directed_geometry.map((p) => geodesicSphere.offset(p, 4, 0)),
  );
  const middle = geodesicSphere.offset([127, 37.5005], 2, 0);
  assert.equal(
    regionalAmbiguous(
      { ...point, longitude: middle[0]!, latitude: middle[1]! },
      [first, parallel],
    ),
    true,
  );
});
test("boundary equivalence uses real shared endpoint rather than nearest sample / 경계 동등성은 가까운 표본 대신 실제 공유 끝점 사용", () => {
  const bundle = regional(),
    a = [127, 37.5],
    b = geodesicSphere.offset(a, 100, 0),
    c = geodesicSphere.offset(b, 100, 0),
    edges = [edge(1, [a, b]), edge(2, [b, c])],
    spec = seoulSpec(bundle);
  spec.vehicles = [{ ...spec.vehicles[0]!, vehicle_id: "unit-clean" }];
  const evaluate = (distance: number) => {
    const position = geodesicSphere.offset(b, -distance, 0),
      sample = {
        sample_id: "boundary",
        vehicle_id: "unit-clean",
        offset_ms: 9800,
        event_time_utc: "2026-10-24T00:00:09.800Z",
        longitude: position[0]!,
        latitude: position[1]!,
        edge_id: "1",
      },
      truth: SimulationTruth = {
        samples: [sample],
        traversals: edges.map((e, index) => ({
          vehicle_id: "unit-clean",
          edge_id: e.edge_id,
          label: e.label,
          forward: true,
          entered_at_ms: index * 10000,
          exited_at_ms: (index + 1) * 10000,
          distance_m: 100,
        })),
      },
      matching: MatchingResult = {
        policy_id: "seoul-observed-v1",
        matching_id: "unit",
        graph_id: bundle.graphId,
        input_samples: 1,
        matched_samples: 1,
        excluded_samples: 0,
        accepted_traversals: 0,
        excluded_traversals: 0,
        points: [
          { ...sample, edge_id: "2", status: "MATCHED", reason_codes: [] },
        ],
        traversals: [],
        semantic_sha256: "unit",
      };
    return evaluateSeoul(
      spec,
      truth,
      [{ ...sample, accuracy_m: 0.01, source_class: "SYNTHETIC" }],
      matching,
      edges,
    )[0]!;
  };
  assert.equal(evaluate(2).boundary_equivalent_points, 0);
  assert.equal(evaluate(0.5).boundary_equivalent_points, 1);
});

test("regional profile refuses missing explicit geometry policy hooks / 지역형의 명시적 지형 정책 함수 누락 거부", () => {
  const bundle = regional(),
    graph: MatchingGraph = {
      graphId: bundle.graphId,
      fixture: bundle.fixture,
      edges: bundle.edges,
    };
  assert.throws(
    () =>
      new MatchingSession(
        {
          schema_version: "0.1",
          matching_id: "missing-hooks",
          graph_id: bundle.graphId,
        },
        graph,
        () => ({}),
      ),
    /hooks/,
  );
});
