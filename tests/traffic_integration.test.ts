import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrafficScenario,
  TRAFFIC_TARGETS,
} from "../tools/traffic_scenario.js";
import {
  requireTrafficCases,
  TRAFFIC_CASE_IDS,
  summarizeTrafficRoute,
  assertPublicTrafficProvenance,
  main,
} from "../tools/traffic_checks.js";
import type { SeoulGraphBundle } from "../tools/seoul_types.js";
import type { SimulationAssertion } from "../tools/vehicle_simulator.js";
import type { TrafficResult } from "../tools/traffic_types.js";
function graph(): SeoulGraphBundle {
  const coordinates: number[][] = [
    [127.03665, 37.5006],
    ...TRAFFIC_TARGETS.map((t) => [...t.start]),
    [...TRAFFIC_TARGETS[2].end],
    [127.0388, 37.5013],
  ];
  const edges = coordinates.slice(1).map((end, i) => ({
    label: "fixture-" + i,
    osm_way_id: i >= 1 && i <= 3 ? 919983793 : 42,
    edge_id: String(i + 100),
    forward: true,
    engine_forward: true,
    car_access: true,
    source_geometry: [coordinates[i]!, end],
    directed_geometry: [coordinates[i]!, end],
    evidence_path: "authored-unit-fixture.json",
  }));
  return {
    directory: "unused",
    graphId: "a".repeat(64),
    manifest: {},
    manifestSha256: "b".repeat(64),
    fixture: {
      fixture_id: "seoul-osm-20261023-v1",
    },
    geometry_policy: "geodesic-sphere-v1",
    edges,
    routes: [
      {
        route_id: "teheran",
        name_en: "unit corridor",
        name_ko: "단위 구간",
        edge_ids: edges.map((e) => e.edge_id),
        bounds: [127, 37, 128, 38],
      },
    ],
    context_roads: [],
  };
}
test("fixed source resolves endpoints, authors fifteen independent trips, and retains full truth / 고정 끝점·독립15여행·전체정답보존", () => {
  const g = graph(),
    s = createTrafficScenario(g);
  assert.equal(s.expected.length, 15);
  assert.equal(new Set(s.expected.map((e) => e.contributor_id)).size, 15);
  assert.deepEqual(
    s.targets.map((t) => t.edge_id),
    ["101", "102", "103"],
  );
  assert.equal(s.spec.duration_ms, 240000);
  assert.equal(s.spec.sample_interval_ms, 500);
  assert.equal(s.simulation.truth.traversals.length, 45);
  assert.ok(s.observations.length < s.simulation.observations.length);
  for (const t of s.targets) {
    const expected = s.expected.filter((e) => e.target.edge_id === t.edge_id);
    assert.equal(expected.length, 5);
    assert.deepEqual(
      expected.map((e) => e.speed_mps),
      [0.4, 0.45, 0.5, 0.55, 0.6],
    );
  }
  for (const e of s.expected) {
    assert.ok(e.entered_at_ms >= 0);
    assert.ok(e.exited_at_ms >= 209999 && e.exited_at_ms <= 210000);
    assert.equal(e.trip_activity, "TRAVEL");
    assert.equal(e.exited_at_ms, 210000);
    assert.equal(e.boundary_buffer_m, 3);
    assert.equal(e.boundary_speed_mps, 5);
    assert.ok(e.entry_buffer_m >= 3 && e.entry_buffer_m < 3.0051);
    assert.ok(
      Math.abs(e.duration_s - e.target.distance_m / e.speed_mps) <= 0.001,
    );
    assert.ok(Math.abs(e.duration_error_ms) <= 1);
    assert.ok(
      Math.abs(e.expected_average_speed_mps / e.speed_mps - 1) < 0.0001,
    );
    const vehicle = s.spec.vehicles.find((v) => v.vehicle_id === e.vehicle_id)!;
    assert.equal(vehicle.speed_profile[0]!.speed_mps, 5);
    assert.equal(vehicle.speed_profile[1]!.speed_mps, e.central_speed_mps);
    assert.equal(vehicle.speed_profile[2]!.speed_mps, 5);
    assert.ok(e.central_speed_mps > 0 && e.central_speed_mps < e.speed_mps);
    assert.ok(
      Math.abs(
        (e.central_distance_m / e.central_speed_mps) * 1000 -
          vehicle.speed_profile[1]!.duration_ms,
      ) < 1e-7,
    );
    const truth = s.simulation.truth.traversals.find(
      (t) => t.vehicle_id === e.vehicle_id && t.edge_id === e.target.edge_id,
    )!;
    assert.ok(Math.abs(truth.entered_at_ms - e.entered_at_ms) < 1);
    assert.ok(Math.abs(truth.exited_at_ms - e.exited_at_ms) < 1);
    const observations = s.observations.filter(
      (o) => o.vehicle_id === e.vehicle_id,
    );
    assert.ok(observations.length > 2);
    assert.ok(
      observations.every(
        (o) =>
          o.offset_ms >= e.observation_start_ms &&
          o.offset_ms <= e.observation_end_ms,
      ),
    );
    assert.ok(observations.some((o) => o.offset_ms < e.entered_at_ms));
    assert.ok(observations.some((o) => o.offset_ms > e.exited_at_ms));
    assert.ok(
      observations.every((o) => !("edge_id" in o) && !("speed_mps" in o)),
    );
  }
});
test("source drift, duplicates, inaccessible and reordered corridor fail closed / 원본변경·중복·접근불가·순서변경거부", () => {
  const missing = graph();
  missing.edges[2]!.osm_way_id = 1;
  assert.throws(() => createTrafficScenario(missing), /source drift/);
  const duplicate = graph();
  duplicate.edges.push({
    ...duplicate.edges[2]!,
  });
  assert.throws(() => createTrafficScenario(duplicate), /source drift/);
  const access = graph();
  access.edges[1]!.car_access = false;
  assert.throws(() => createTrafficScenario(access), /source drift/);
  const order = graph();
  order.routes[0]!.edge_ids.reverse();
  assert.throws(() => createTrafficScenario(order), /Ordered complete/);
  const wrong = graph();
  wrong.edges[1]!.directed_geometry[0] = [127, 37];
  assert.throws(() => createTrafficScenario(wrong), /source drift/);
});
test("single traffic case inventory rejects missing, duplicate, failed and extra cases / 단일교통검사목록누락·중복·실패·추가거부", () => {
  const cases: SimulationAssertion[] = TRAFFIC_CASE_IDS.map((assertion_id) => ({
    assertion_id,
    status: "PASS",
    message_en: "Actual evidence",
    message_ko: "실제근거",
    expected: true,
    actual: true,
    evidence_path: "original.json",
  }));
  requireTrafficCases(cases);
  assert.throws(() => requireTrafficCases(cases.slice(1)));
  assert.throws(() => requireTrafficCases([...cases, cases[0]!]));
  assert.throws(() =>
    requireTrafficCases(
      cases.map((c, i) =>
        i === 0
          ? {
              ...c,
              status: "FAIL",
            }
          : c,
      ),
    ),
  );
  assert.throws(() =>
    requireTrafficCases(
      cases.map((c, i) =>
        i === 0
          ? {
              ...c,
              assertion_id: "unexpected",
            }
          : c,
      ),
    ),
  );
});
test("route summary requires actual route and trace evidence / 경로요약에 실제경로·trace원문필요", () => {
  const refused: TrafficResult = {
    code: "UNAVAILABLE",
    reason: "test",
    message_en: "Unavailable",
    message_ko: "사용불가",
  };
  assert.throws(
    () => summarizeTrafficRoute("unit", refused, "unit.json"),
    /Actual route required/,
  );
  const malformed = {
    code: "ROUTE",
    engine_result: {
      route: {},
      trace: {},
    },
    provenance: {},
  } as unknown as TrafficResult;
  assert.throws(
    () => summarizeTrafficRoute("unit", malformed, "unit.json"),
    /Original route/,
  );
});
test("traffic CLI rejects incomplete arguments before creating resources / 교통명령이 자원생성전불완전인자거부", async () => {
  const messages: string[] = [];
  const io = {
    out: (s: string) => messages.push(s),
    error: (s: string) => messages.push(s),
  };
  assert.equal(await main(["--graph", "verified", "--output"], io), 1);
  assert.match(messages[0]!, /Graph and new output required/);
  assert.equal(await main(["--help"], io), 0);
});
test("public routing provenance rejects extra raw fields and credentials / 공개경로출처가 원관측필드·인증값거부", () => {
  const p = {
    graph_id: "a".repeat(64),
    high_water: 1,
    sequence: 1,
    traffic_snapshot_id: "b".repeat(64),
    compiler_policy: "valhalla-current-v1",
    generation_id: "c".repeat(64),
    traffic_sha256: "d".repeat(64),
    traffic_byte_length: 100,
    checked_at_event_time: "2026-10-24T00:04:30.000Z",
    valid_until: "2026-10-24T00:07:00.000Z",
    traffic_mode: "LIVE",
    engine: {
      image_id: "engine",
      version: "3.9.1",
    },
    message_en: "Accepted traffic",
    message_ko: "수용 교통정보",
  };
  assertPublicTrafficProvenance(p);
  assert.throws(
    () =>
      assertPublicTrafficProvenance({
        ...p,
        longitude: 127,
      }),
    /Unexpected public/,
  );
  assert.throws(
    () =>
      assertPublicTrafficProvenance({
        ...p,
        engine: {
          ...p.engine,
          token: "private",
        },
      }),
    /Unexpected public engine/,
  );
  assert.throws(
    () =>
      assertPublicTrafficProvenance(
        {
          ...p,
          message_en: "secret-value",
        },
        ["secret-value"],
      ),
    /Sensitive diagnostic/,
  );
});

test("traffic report keeps source replay and embeds safe bilingual routing evidence / 교통보고서가 기존원본재생·안전한한영경로근거보존", async () => {
  const { renderSimulationReport } = await import(
    "../tools/simulation_report.js"
  );
  const input: import("../tools/simulation_report.js").SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "unit-source", dirty: true },
    graph_id: "a".repeat(64),
    generated_at_utc: "2026-10-24T00:00:00.000Z",
    implementation_sha256: "b".repeat(64),
    summary: {
      status: "PASS",
      assertions_passed: 0,
      assertions_total: 0,
      vehicle_count: 1,
      observation_count: 0,
      omission_count: 0,
      duration_ms: 240000,
    },
    stages: [],
    roads: [
      {
        label: "road",
        edge_id: "101",
        forward: true,
        car_access: true,
        coordinates: [
          [127, 37.5],
          [127.001, 37.501],
        ],
      },
    ],
    vehicles: [
      {
        vehicle_id: "original-vehicle",
        truth: [],
        observations: [],
        omissions: [],
        traversals: [],
      },
    ],
    assertions: [],
    limitations: [],
    traffic: {
      assertions_passed: 32,
      assertions_total: 32,
      cleanup_verified: true,
      targets: [],
      routes: [],
      cases: [],
      evidence: [
        {
          name_en: "Original bytes </script><script>bad()",
          name_ko: "원문 바이트",
          path: "traffic/readbacks/compiled.json",
        },
      ],
    },
  };
  const html = renderSimulationReport(input);
  assert.match(html, /P08 recorded traffic routing and expiry/);
  assert.match(html, /P08 기록된 교통 경로·만료/);
  assert.match(html, /same two-point request/);
  assert.match(html, /data\.context_roads/);
  assert.match(html, /Math\.cos/);
  assert.ok(!html.includes("</script><script>bad()"));
  const embedded = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(embedded.vehicles, input.vehicles);
  assert.deepEqual(embedded.traffic, input.traffic);
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!;
  assert.doesNotThrow(() => new Function(script));
});
