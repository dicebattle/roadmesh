import test from "node:test";
import assert from "node:assert/strict";
import { createAggregationScenario } from "../tools/aggregation_scenario.js";
import { checkPublicDraft } from "../tools/aggregation_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
import type { SeoulGraphBundle } from "../tools/seoul_types.js";
import type { AggregationDraft } from "../tools/aggregation_types.js";
function unitGraph(): SeoulGraphBundle {
  const edges = Array.from({ length: 3 }, (_, i) => {
    const coordinates = [
      [127 + i * 0.0001, 37.5],
      [127 + (i + 0.5) * 0.0001, 37.50001],
      [127 + (i + 1) * 0.0001, 37.5],
    ];
    return {
      label: "edge-" + i,
      edge_id: String(i),
      osm_way_id: i + 1,
      forward: true,
      engine_forward: true,
      car_access: true,
      source_geometry: coordinates,
      directed_geometry: coordinates,
      evidence_path: "unit-only",
    };
  });
  return {
    directory: "unit-only",
    graphId: "a".repeat(64),
    manifest: {},
    manifestSha256: "unit",
    fixture: { fixture_id: "seoul-osm-20261023-v1" },
    geometry_policy: "geodesic-sphere-v1",
    edges,
    routes: [
      {
        route_id: "teheran",
        name_en: "Unit Teheran",
        name_ko: "단위 테헤란",
        edge_ids: ["0", "1", "2"],
        bounds: [127, 37.5, 127.0003, 37.50001],
      },
    ],
    context_roads: [],
  };
}
const draft: AggregationDraft = {
  schema_version: "0.1",
  graph_id: "a".repeat(64),
  region_id: "seoul-pilot-corridors-v1",
  aggregation_policy: "seoul-window-median-v1",
  window_start: "2026-10-24T00:00:00.000Z",
  window_end: "2026-10-24T00:01:00.000Z",
  valid_until: "2026-10-24T00:04:00.000Z",
  entries: [
    {
      edge_id: "1",
      forward: true,
      source_class: "SYNTHETIC",
      status: "LIVE",
      speed_mps: 1,
      sample_bucket: "5-9",
    },
  ],
};
test("authored short trips retain independent signal timing and explicit moving PARKED state / 짧은여행의 독립 신호시간·명시이동PARKED 보존", () => {
  const result = createAggregationScenario(unitGraph());
  assert.equal(result.spec.vehicles.length, 6);
  assert.equal(result.spec.sample_interval_ms, 500);
  assert(result.spec.vehicles.every((v) => v.speed_profile[0]!.speed_mps > 0));
  assert.equal(result.expected[5]!.trip_activity, "PARKED");
  assert.equal(result.expected[5]!.speed_mps, 2);
  for (const expected of result.expected) {
    const truth = result.simulation.truth.traversals.find(
      (t) =>
        t.vehicle_id === expected.vehicle_id &&
        t.edge_id === result.target.edge_id,
    )!;
    assert(truth);
    assert(
      Math.abs(
        (truth.exited_at_ms - truth.entered_at_ms) / 1000 - expected.duration_s,
      ) < 0.002,
    );
    assert.equal(
      result.spec.vehicles.find((v) => v.vehicle_id === expected.vehicle_id)!
        .speed_profile[1]!.duration_ms,
      8000,
    );
  }
  assert.equal(
    result.expected_median_duration_s,
    result.expected[2]!.duration_s,
  );
  assert.equal(
    result.expected_speed_mps,
    result.target.distance_m / result.expected_median_duration_s,
  );
});
test("candidate validation rejects private fields and unusable-state speed / 후보의 비공개필드·사용불가속도 거부", () => {
  checkPublicDraft(draft, []);
  assert.throws(() =>
    checkPublicDraft(
      { ...draft, contributor_id: "private" } as AggregationDraft,
      [],
    ),
  );
  assert.throws(() =>
    checkPublicDraft(
      { ...draft, entries: [{ ...draft.entries[0]!, status: "STALE" }] },
      [],
    ),
  );
  assert.throws(() =>
    checkPublicDraft(
      {
        ...draft,
        entries: [
          {
            ...draft.entries[0]!,
            sample_id: "private",
          } as AggregationDraft["entries"][number],
        ],
      },
      [],
    ),
  );
});
test("report separates original and P06 cohorts and preserves actual unsigned draft bytes / 보고서 기존·P06차량군 분리와 실제서명전 후보 보존", () => {
  const scenario = createAggregationScenario(unitGraph());
  const vehicles = scenario.spec.vehicles.map((v) => ({
    vehicle_id: v.vehicle_id,
    truth: scenario.simulation.truth.samples.filter(
      (s) => s.vehicle_id === v.vehicle_id,
    ),
    observations: scenario.simulation.observations.filter(
      (s) => s.vehicle_id === v.vehicle_id,
    ),
    omissions: [],
    traversals: scenario.simulation.truth.traversals.filter(
      (t) => t.vehicle_id === v.vehicle_id,
    ),
  }));
  const matching = {
    policy_id: "seoul-observed-v3",
    input_samples: 0,
    matched_samples: 0,
    excluded_samples: 0,
    accepted_traversals: 0,
    excluded_traversals: 0,
    points: [],
    traversals: [],
    cases: [],
  };
  const input: SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "unit-provenance", dirty: true },
    graph_id: unitGraph().graphId,
    generated_at_utc: windowDate(),
    implementation_sha256: "unit-fingerprint",
    summary: {
      status: "PASS",
      assertions_passed: 1,
      assertions_total: 1,
      vehicle_count: 9,
      observation_count: 1,
      omission_count: 0,
      duration_ms: 300000,
    },
    stages: [],
    roads: unitGraph().edges.map((e) => ({
      label: e.label,
      edge_id: e.edge_id,
      forward: e.forward,
      car_access: true,
      coordinates: e.directed_geometry,
    })),
    vehicles: [{ ...vehicles[0]!, vehicle_id: "original-only" }],
    assertions: [],
    limitations: [],
    aggregation: {
      policy_id: "seoul-window-median-v1",
      target: scenario.target,
      window_start: draft.window_start,
      deadline: "2026-10-24T00:01:30.000Z",
      valid_until: draft.valid_until,
      cases: [
        {
          case_id: "count-5",
          name_en: "Five contributors",
          name_ko: "5명",
          draft,
          canonical_sha256: "unit-only",
          evidence_path: "aggregation/drafts/count-5.json",
        },
      ],
      population: {
        duration_ms: 60000,
        vehicles,
        matching,
        case_vehicle_ids: {
          "count-0": [],
          "count-5": vehicles.map((v) => v.vehicle_id),
        },
        case_matching: { "count-5": matching },
      },
      assertions_passed: 1,
      assertions_total: 1,
      cleanup_verified: true,
    },
  };
  const html = renderSimulationReport(input);
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1]!);
  const saved = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(saved.aggregation.cases[0].draft, draft);
  assert.equal(saved.vehicles[0].vehicle_id, "original-only");
  assert(
    saved.aggregation.population.vehicles.every(
      (v: { vehicle_id: string }) => v.vehicle_id !== "original-only",
    ),
  );
  assert(html.includes('id="dataset"'));
  assert(html.includes("P06 short-trip population"));
  assert(html.includes("not automatic parking detection"));
  assert(html.includes("seoul-observed-v3"));
});
function windowDate() {
  return "2026-10-24T00:00:00.000Z";
}
