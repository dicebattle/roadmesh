import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./helpers.js";
import { geodesicSphere } from "../tools/geodesy.js";
import {
  interpretRun,
  observedBoundaryCluster,
  type MatchingEnvelope,
  type MatchingGraph,
  type MatchingHooks,
} from "../tools/matching_evidence.js";
import type { Observation } from "../tools/vehicle_simulator.js";
import type { EdgeMapping } from "../tools/graph_evidence.js";
interface ActualBoundary {
  graph_id: string;
  observations: Observation[];
  response: unknown;
  edges: EdgeMapping[];
}
const actual = fixture<ActualBoundary>(
  "tests/fixtures/seoul-boundary-stop.json",
);
const graph: MatchingGraph = {
  graphId: actual.graph_id,
  fixture: { fixture_id: "seoul-osm-20261023-v1" },
  edges: actual.edges,
};
const envelope: MatchingEnvelope = {
  schema_version: "0.1",
  matching_id: "boundary-stop-reproduction",
  graph_id: actual.graph_id,
  observations: actual.observations,
};
const baseHooks: MatchingHooks = {
  policy_id: "seoul-observed-v1",
  geometry: geodesicSphere,
  connection_tolerance_m: 1,
  ambiguous: () => false,
};
const hooks: MatchingHooks = {
  ...baseHooks,
  policy_id: "seoul-observed-v2",
  ambiguous_boundary_ms: 1000,
};
function observation(
  time: number,
  distance: number,
  accuracy = 3,
): Observation {
  const point = geodesicSphere.offset([127, 37.5], distance, 0);
  return {
    sample_id: "observed-" + time,
    vehicle_id: "unit",
    offset_ms: time,
    event_time_utc: new Date(
      Date.parse("2026-10-24T00:00:00Z") + time,
    ).toISOString(),
    longitude: point[0]!,
    latitude: point[1]!,
    accuracy_m: accuracy,
    source_class: "SYNTHETIC",
  };
}

test("actual downtown boundary stop excludes both adjacent candidates without truth repair / 실제 도심 경계 정지는 정답 보정 없이 양쪽 후보 제외", () => {
  const run = {
    vehicle_id: "downtown-gap",
    index: 0,
    observations: actual.observations,
    end_reason: "OBSERVATION_GAP" as const,
  };
  const previous = interpretRun(
      envelope,
      graph,
      run,
      actual.response,
      baseHooks,
    ),
    result = interpretRun(envelope, graph, run, actual.response, hooks);
  assert.equal(
    previous.traversals.find((item) => item.edge_id === "671994632592")!.status,
    "ACCEPTED",
  );
  assert.equal(
    previous.traversals.find((item) => item.edge_id === "671994632592")!
      .entered_at_ms,
    5000,
  );
  for (const id of ["672531503504", "671994632592"]) {
    const candidate = result.traversals.find((item) => item.edge_id === id)!;
    assert.equal(candidate.status, "EXCLUDED");
    assert.ok(candidate.reason_codes.includes("AMBIGUOUS_BOUNDARY"));
    const cluster = candidate.boundary_ambiguities![0]!;
    assert.equal(cluster.start_offset_ms, 0);
    assert.ok(cluster.end_offset_ms >= 5000);
    assert.ok(cluster.sample_ids.length >= 11);
    assert.ok(cluster.distances_m.every((distance) => distance <= 4));
  }
  assert.equal(
    result.traversals.find((item) => item.edge_id === "671994632592")!
      .entered_at_ms,
    5000,
  );
  assert.deepEqual(result.points, previous.points);
  assert.equal(
    result.traversals.find((item) => item.edge_id === "671826860432")!.status,
    "ACCEPTED",
  );
});
test("normal 10 m/s boundary crossing is not a stationary cluster / 정상 초속10미터 경계 통과는 정지 묶음 아님", () => {
  const observations = Array.from({ length: 9 }, (_, index) =>
    observation(index * 500, -20 + index * 5),
  );
  assert.equal(
    observedBoundaryCluster(observations, 5, [127, 37.5], geodesicSphere, 1000),
    null,
  );
});
test("interior stop cannot make a distant boundary ambiguous / 구간 내부 정지가 먼 경계를 모호하게 만들지 않음", () => {
  const observations = [
    observation(0, -20),
    observation(500, -20),
    observation(1000, -20),
    observation(1500, -5),
    observation(2000, 5),
  ];
  assert.equal(
    observedBoundaryCluster(observations, 4, [127, 37.5], geodesicSphere, 1000),
    null,
  );
});
test("cluster requires original uncertainty radius and uninterrupted time / 묶음은 원관측 불확실성 반경·연속 시각 필수", () => {
  const observations = [
    observation(0, 0),
    observation(500, 0),
    observation(1000, 0),
    observation(1500, 10),
  ];
  assert.ok(
    observedBoundaryCluster(observations, 3, [127, 37.5], geodesicSphere, 1000),
  );
  assert.equal(
    observedBoundaryCluster(
      observations.map((point) => ({
        ...point,
        ...Object.fromEntries(
          Object.entries(observation(point.offset_ms, 10)).filter(
            ([key]) => key === "longitude" || key === "latitude",
          ),
        ),
      })),
      3,
      [127, 37.5],
      geodesicSphere,
      1000,
    ),
    null,
  );
  const separated = [
    observation(0, 0),
    observation(4000, 0),
    observation(4500, 0),
    observation(5000, 10),
  ];
  assert.equal(
    observedBoundaryCluster(separated, 3, [127, 37.5], geodesicSphere, 1000),
    null,
  );
});

test("post-transition observations cannot extend stationary eligibility / 전환 이후 관측을 정지 판정 시간에 합산하지 않음", () => {
  const observations = [
    observation(0, -10),
    observation(500, -2),
    observation(1000, 0),
    observation(1500, 2),
  ];
  assert.equal(
    observedBoundaryCluster(observations, 3, [127, 37.5], geodesicSphere, 1000),
    null,
  );
});
