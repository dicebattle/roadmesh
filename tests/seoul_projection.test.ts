import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./helpers.js";
import { canonical } from "../tools/shared.js";
import { geodesicSphere } from "../tools/geodesy.js";
import {
  noisyTraversalCoverageAssertions,
  type VehicleEvaluation,
} from "../tools/seoul_simulation.js";
import type { EdgeMapping } from "../tools/graph_evidence.js";
import type { Observation } from "../tools/vehicle_simulator.js";
import {
  interpretRun,
  matchObservations,
  type MatchingEnvelope,
  type MatchingGraph,
  type MatchingHooks,
  type MatchingPoint,
  type MatchedTraversal,
} from "../tools/matching_evidence.js";

interface Captured {
  graph_id: string;
  matching_id: string;
  edges: EdgeMapping[];
  cases: Array<{
    vehicle_id: string;
    expected: { target_edge_id: string; expected_duration_ms: number };
    observations: Observation[];
    response: unknown;
    v2_expected: { points: MatchingPoint[]; traversals: MatchedTraversal[] };
  }>;
}
const actual = fixture<Captured>("tests/fixtures/seoul-projection-v3.json");
const hooks: MatchingHooks = {
  policy_id: "seoul-observed-v3",
  geometry: geodesicSphere,
  connection_tolerance_m: 1,
  ambiguous_boundary_ms: 1000,
  ambiguous: () => false,
};
const graph: MatchingGraph = {
  graphId: actual.graph_id,
  fixture: { fixture_id: "seoul-osm-20261023-v1" },
  edges: actual.edges,
};
function envelope(
  observations: Observation[],
  matching_id = actual.matching_id,
): MatchingEnvelope {
  return {
    schema_version: "0.1",
    matching_id,
    graph_id: graph.graphId,
    observations,
  };
}
for (const captured of actual.cases) {
  test(`actual ${captured.vehicle_id} rounded endpoint uses observed projection without changing v2 / 실제 끝점 원문 투영·v2 보존`, () => {
    const input = envelope(captured.observations),
      run = {
        vehicle_id: captured.vehicle_id,
        index: 0,
        observations: captured.observations,
      };
    const old = interpretRun(input, graph, run, captured.response, {
      ...hooks,
      policy_id: "seoul-observed-v2",
    });
    assert.ok(
      canonical(old).equals(canonical(captured.v2_expected)),
      "Preserve original v2 result bytes / 기존 v2 결과 바이트 보존",
    );
    const projected = interpretRun(input, graph, run, captured.response, hooks);
    const target = projected.traversals.find(
      (edge) => edge.edge_id === captured.expected.target_edge_id,
    )!;
    assert.equal(target.status, "ACCEPTED");
    assert.ok(
      Math.abs(
        target.exited_at_ms! -
          target.entered_at_ms! -
          captured.expected.expected_duration_ms,
      ) <= 150,
    );
    assert.ok(
      projected.points.every(
        (point) =>
          point.status === "MATCHED" &&
          point.position_method === "observed-path-projection-v1",
      ),
    );
    assert.notEqual(
      target.traversal_id,
      old.traversals.find((edge) => edge.edge_id === target.edge_id)!
        .traversal_id,
    );
  });
}
test("actual engine distance rejection remains enforced / 실제 원문 엔진 거리 거부 유지", () => {
  const captured = actual.cases[1]!,
    response = structuredClone(captured.response) as {
      matched_points: Array<Record<string, unknown>>;
    };
  response.matched_points[21]!.distance_from_trace_point = 1.02;
  const interpreted = interpretRun(
    envelope(captured.observations),
    graph,
    {
      vehicle_id: captured.vehicle_id,
      index: 0,
      observations: captured.observations,
    },
    response,
    hooks,
  );
  assert.deepEqual(interpreted.points[21]!.reason_codes, ["DISTANCE_EXCEEDED"]);
});
function point(x: number, y = 0): number[] {
  return geodesicSphere.offset([127, 37.5], x, y);
}
function edge(id: number, line: number[][]): EdgeMapping {
  return {
    label: `edge-${id}`,
    osm_way_id: id,
    edge_id: String(id),
    forward: true,
    engine_forward: true,
    car_access: true,
    source_geometry: line,
    directed_geometry: line,
    evidence_path: "authored-unit.json",
  };
}
function encoded(points: number[][]): string {
  let latitude = 0,
    longitude = 0,
    result = "";
  for (const p of points) {
    const lat = Math.round(p[1]! * 1e6),
      lon = Math.round(p[0]! * 1e6);
    for (const diff of [lat - latitude, lon - longitude]) {
      let value = diff < 0 ? -diff * 2 - 1 : diff * 2;
      while (value >= 32) {
        result += String.fromCharCode((value % 32) + 95);
        value = Math.floor(value / 32);
      }
      result += String.fromCharCode(value + 63);
    }
    latitude = lat;
    longitude = lon;
  }
  return result;
}
function authored(
  edges: EdgeMapping[],
  values: Array<{
    coordinate: number[];
    index: number;
    fraction: number;
    time?: number;
    flags?: Record<string, boolean>;
  }>,
) {
  const observations: Observation[] = values.map((v, i) => ({
    sample_id: `unit-${i}`,
    vehicle_id: "unit",
    offset_ms: v.time ?? i * 500,
    event_time_utc: new Date(
      Date.parse("2026-10-24T00:00:00Z") + (v.time ?? i * 500),
    ).toISOString(),
    longitude: v.coordinate[0]!,
    latitude: v.coordinate[1]!,
    accuracy_m: 0.01,
    source_class: "SYNTHETIC",
  }));
  const shape: number[][] = [],
    rawEdges = edges.map((edge) => {
      const begin = shape.length;
      shape.push(...edge.directed_geometry);
      return {
        id: Number(edge.edge_id),
        way_id: edge.osm_way_id,
        begin_shape_index: begin,
        end_shape_index: shape.length - 1,
      };
    });
  const response = {
    shape: encoded(shape),
    edges: rawEdges,
    matched_points: values.map((v) => {
      const coordinate = geodesicSphere.position(
        edges[v.index]!.directed_geometry,
        v.fraction * geodesicSphere.length(edges[v.index]!.directed_geometry),
      );
      return {
        type: "matched",
        edge_index: v.index,
        distance_along_edge: v.fraction,
        distance_from_trace_point: 0,
        lon: coordinate[0]!,
        lat: coordinate[1]!,
        ...v.flags,
      };
    }),
  };
  const input = envelope(observations, "authored-projection");
  const selectedGraph = { ...graph, edges };
  return {
    input,
    response,
    graph: selectedGraph,
    run: { vehicle_id: "unit", index: 0, observations },
    read: (selectedHooks = hooks) =>
      interpretRun(
        input,
        selectedGraph,
        { vehicle_id: "unit", index: 0, observations },
        response,
        selectedHooks,
      ),
  };
}
test("connected shared endpoint represents one path position / 연결된 공유 끝점은 동일 진행 위치", () => {
  const data = authored(
    [edge(1, [point(0), point(10)]), edge(2, [point(10), point(20)])],
    [{ coordinate: point(10), index: 0, fraction: 1 }],
  );
  const result = data.read();
  assert.equal(result.points[0]!.status, "MATCHED");
  assert.deepEqual(result.points[0]!.reason_codes, []);
});
test("disconnected neighboring edge cannot repair a point / 비연결 인접 구간으로 표본 보정 금지", () => {
  const data = authored(
    [edge(1, [point(0), point(10)]), edge(2, [point(11.1), point(20)])],
    [{ coordinate: point(12), index: 0, fraction: 1 }],
  );
  assert.deepEqual(data.read().points[0]!.reason_codes, ["DISTANCE_EXCEEDED"]);
});
test("a nonadjacent exact geometry cannot repair an engine point / 비인접 지형은 정확히 가까워도 엔진 표본 보정 금지", () => {
  const data = authored(
    [
      edge(1, [point(0), point(10)]),
      edge(2, [point(10), point(10, 10)]),
      edge(3, [point(10, 10), point(0, 10)]),
    ],
    [{ coordinate: point(5, 10), index: 0, fraction: 0.5 }],
  );
  assert.deepEqual(data.read().points[0]!.reason_codes, ["DISTANCE_EXCEEDED"]);
});
test("a connected returning occurrence with distinct progress is ambiguous / 되돌아오는 연결 경로의 다른 진행 위치는 모호", () => {
  const data = authored(
    [edge(1, [point(0), point(10)]), edge(2, [point(10), point(0)])],
    [{ coordinate: point(5), index: 0, fraction: 0.5 }],
  );
  assert.deepEqual(data.read().points[0]!.reason_codes, [
    "AMBIGUOUS_PROJECTION",
  ]);
});
test("a self-returning full shape must have a unique segment projection / 전체 지형 내부의 되돌아오는 선분도 유일 투영 필수", () => {
  const data = authored(
    [edge(1, [point(0), point(10), point(0)])],
    [{ coordinate: point(5), index: 0, fraction: 0.25 }],
  );
  assert.deepEqual(data.read().points[0]!.reason_codes, [
    "AMBIGUOUS_PROJECTION",
  ]);
});
test("connected projections within one centimetre but different progress are excluded / 1센티미터 이내 동률·다른 진행 위치 제외", () => {
  const data = authored(
    [edge(1, [point(0), point(10)]), edge(2, [point(10), point(0, 0.005)])],
    [{ coordinate: point(5, 0.001), index: 0, fraction: 0.5 }],
  );
  assert.deepEqual(data.read().points[0]!.reason_codes, [
    "AMBIGUOUS_PROJECTION",
  ]);
});
test("engine flags, unmatched points and reversal guards remain effective / 엔진 단절·미대응·역행 거부 유지", () => {
  const data = authored(
    [edge(1, [point(0), point(10)])],
    [
      {
        coordinate: point(0),
        index: 0,
        fraction: 0,
        flags: { begin_route_discontinuity: true },
      },
      { coordinate: point(8), index: 0, fraction: 0.8 },
      { coordinate: point(4), index: 0, fraction: 0.4 },
      { coordinate: point(10), index: 0, fraction: 1 },
    ],
  );
  assert.ok(data.read().traversals[0]!.reason_codes.includes("DISCONTINUITY"));
  const unmatched = structuredClone(data.response);
  unmatched.matched_points[1]!.type = "unmatched";
  assert.equal(
    interpretRun(data.input, data.graph, data.run, unmatched, hooks).points[1]!
      .reason_codes[0],
    "UNMATCHED",
  );
  data.response.matched_points[0]!.lon += 0.01;
  assert.throws(() => data.read(), /fraction and geometry disagree/);
});
test("parallel ambiguity and long observation gaps retain exclusion / 평행 모호성·긴 관측 누락 제외 유지", () => {
  const data = authored(
    [edge(1, [point(0), point(10)])],
    [
      { coordinate: point(0), index: 0, fraction: 0, time: 0 },
      { coordinate: point(10), index: 0, fraction: 1, time: 4000 },
    ],
  );
  const parallel = matchObservations(
    data.input,
    data.graph,
    () => data.response,
    { ...hooks, ambiguous: () => true },
  );
  assert.equal(parallel.matched_samples, 0);
  assert.ok(
    parallel.points.every((p) => p.reason_codes.includes("AMBIGUOUS_PARALLEL")),
  );
  const gap = matchObservations(
    data.input,
    data.graph,
    () => {
      throw Error(
        "A one-point run must not call the engine / 단일 표본은 엔진 호출 금지",
      );
    },
    hooks,
  );
  assert.equal(gap.accepted_traversals, 0);
});
test("actual sustained boundary stop remains excluded in v3 / 실제 지속 경계 정지 v3 제외 유지", () => {
  const stop = fixture<{
    graph_id: string;
    edges: EdgeMapping[];
    observations: Observation[];
    response: unknown;
  }>("tests/fixtures/seoul-boundary-stop.json");
  const input = {
    ...envelope(stop.observations, "boundary-stop-reproduction"),
    graph_id: stop.graph_id,
  };
  const result = interpretRun(
    input,
    { ...graph, graphId: stop.graph_id, edges: stop.edges },
    {
      vehicle_id: "downtown-gap",
      index: 0,
      observations: stop.observations,
      end_reason: "OBSERVATION_GAP",
    },
    stop.response,
    hooks,
  );
  for (const id of ["672531503504", "671994632592"]) {
    const traversal = result.traversals.find((t) => t.edge_id === id)!;
    assert.equal(traversal.status, "EXCLUDED");
    assert.ok(traversal.reason_codes.includes("AMBIGUOUS_BOUNDARY"));
  }
});

test("moved upstream flag remains on original and projected occurrences / 이동한 엔진 단절 표시는 원래·투영 구간 모두에 유지", () => {
  const data = authored(
    [edge(1, [point(0), point(10)]), edge(2, [point(10), point(20)])],
    [
      { coordinate: point(0), index: 0, fraction: 0 },
      {
        coordinate: point(9),
        index: 1,
        fraction: 0,
        flags: { begin_route_discontinuity: true },
      },
      { coordinate: point(11), index: 1, fraction: 0.1 },
      { coordinate: point(20), index: 1, fraction: 1 },
    ],
  );
  const result = data.read();
  assert.equal(result.points[1]!.engine_edge_id, "2");
  assert.equal(result.points[1]!.edge_id, "1");
  for (const traversal of result.traversals) {
    assert.equal(traversal.status, "EXCLUDED");
    assert.ok(traversal.reason_codes.includes("DISCONTINUITY"));
  }
});

interface LocalMinimumFixture {
  coverage_regression_evaluation: VehicleEvaluation[];
  graph_id: string;
  catalog: EdgeMapping[];
  responses: Record<string, { shape: string; edges: unknown[] }>;
  cases: Array<{
    sample_id: string;
    source_response: string;
    source_matched_point_index: number;
    observation: Observation;
    engine_match: Record<string, unknown>;
    expected_status: "MATCHED" | "EXCLUDED";
    expected_reason: string | null;
  }>;
}
const localMinima = fixture<LocalMinimumFixture>(
  "tests/fixtures/seoul-projection-local-minima.json",
);
function interpretLocalMinimumCase(
  captured: LocalMinimumFixture["cases"][number],
) {
  const selectedGraph = {
    ...graph,
    graphId: localMinima.graph_id,
    edges: localMinima.catalog,
  };
  const input = {
    ...envelope([captured.observation], "local-minimum-reproduction"),
    graph_id: localMinima.graph_id,
  };
  const response = {
    ...localMinima.responses[captured.source_response]!,
    matched_points: [captured.engine_match],
  };
  return interpretRun(
    input,
    selectedGraph,
    {
      vehicle_id: captured.observation.vehicle_id,
      index: 0,
      observations: input.observations,
    },
    response,
    hooks,
  ).points[0]!;
}
test("local minima actual thirteen non-minimum vertices retain valid projections / 실제 비최소 꼭짓점13건의 유효 투영 유지", (t) => {
  const cases = localMinima.cases.filter(
    (c) => c.expected_status === "MATCHED",
  );
  assert.equal(cases.length, 13);
  for (const captured of cases) {
    const projected = interpretLocalMinimumCase(captured);
    assert.equal(projected.status, "MATCHED", captured.sample_id);
    assert.deepEqual(projected.reason_codes, []);
    assert.equal(projected.position_method, "observed-path-projection-v1");
    t.diagnostic(
      JSON.stringify({
        sample_id: captured.sample_id,
        status: projected.status,
        edge_id: projected.edge_id,
        fraction: projected.fraction,
        distance_m: projected.distance_m,
      }),
    );
  }
});
test("local minima actual distinct interior projections remain ambiguous / 실제 서로 다른 내부 최소 투영의 모호성 유지", () => {
  const cases = localMinima.cases.filter(
    (c) => c.expected_status === "EXCLUDED",
  );
  assert.equal(cases.length, 1);
  assert.equal(cases[0]!.sample_id, "seoul-road-demo:downtown-gap:4500");
  assert.deepEqual(interpretLocalMinimumCase(cases[0]!).reason_codes, [
    "AMBIGUOUS_PROJECTION",
  ]);
});
test("local minima genuine corner and global path endpoint stay eligible / 실제 모서리 최소·전체 경로 끝점 후보 유지", () => {
  const corner = authored(
    [edge(1, [point(-10), point(0)]), edge(2, [point(0), point(0, 10)])],
    [{ coordinate: point(1, -1), index: 0, fraction: 1 }],
  );
  corner.input.observations[0]!.accuracy_m = 3;
  const cornerPoint = corner.read().points[0]!;
  assert.equal(cornerPoint.status, "MATCHED");
  assert.equal(cornerPoint.fraction, 1);
  const global = authored(
    [edge(1, [point(0), point(10)])],
    [{ coordinate: point(-0.5), index: 0, fraction: 0 }],
  );
  const end = global.read().points[0]!;
  assert.equal(end.status, "MATCHED");
  assert.equal(end.fraction, 0);
});
test("local minima nearby unequal endpoints are not one shared vertex / 가까워도 좌표가 다른 끝점을 공유 꼭짓점으로 합치지 않음", () => {
  const data = authored(
    [edge(1, [point(0), point(10)]), edge(2, [point(10.05), point(20)])],
    [{ coordinate: point(9.9, 2), index: 0, fraction: 0.99 }],
  );
  data.input.observations[0]!.accuracy_m = 3;
  assert.deepEqual(data.read().points[0]!.reason_codes, [
    "AMBIGUOUS_PROJECTION",
  ]);
});

test("noisy coverage fixed floor rejects observed 8/18 regression and includes exactly six cases / 잡음 범위 고정 하한은 실제8/18퇴행 거부·정확히6건 검사", () => {
  const gates = noisyTraversalCoverageAssertions(
    localMinima.coverage_regression_evaluation,
  );
  assert.equal(gates.length, 6);
  assert.ok(gates.every((gate) => !gate.assertion_id.includes("-clean-")));
  const regression = gates.find(
    (gate) => gate.assertion_id === "mapo-bridge-gap-observed-coverage",
  )!;
  assert.equal(regression.status, "FAIL");
  const actual = regression.actual as VehicleEvaluation;
  assert.equal(actual.accepted_traversals, 8);
  assert.equal(actual.truth_traversals, 18);
  assert.equal(actual.traversal_coverage, 8 / 18);
  assert.deepEqual(regression.expected, { traversal_coverage: 0.7 });
  for (const gate of gates)
    assert.equal(
      gate.status,
      (gate.actual as VehicleEvaluation).traversal_coverage >= 0.7
        ? "PASS"
        : "FAIL",
    );
  assert.equal(
    noisyTraversalCoverageAssertions([
      { ...actual, traversal_coverage: 0.7 },
    ])[0]!.status,
    "PASS",
  );
  assert.equal(
    noisyTraversalCoverageAssertions([
      { ...actual, traversal_coverage: 0.699999 },
    ])[0]!.status,
    "FAIL",
  );
  assert.equal(
    noisyTraversalCoverageAssertions([
      { ...actual, vehicle_id: "mapo-bridge-clean" },
    ]).length,
    0,
  );
});
