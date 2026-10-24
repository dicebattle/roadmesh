import test from "node:test";
import assert from "node:assert/strict";
import {
  GATEWAY_CASE_IDS,
  requireGatewayCases,
  gatewayFailureMatches,
} from "../tools/gateway_checks.js";
import type { SimulationAssertion } from "../tools/vehicle_simulator.js";
test("gateway fixed inventory rejects missing, duplicate, failed and substituted cases / 중계고정목록누락·중복·실패·교체거부", () => {
  const cases: SimulationAssertion[] = GATEWAY_CASE_IDS.map((assertion_id) => ({
    assertion_id,
    status: "PASS",
    message_en: "Actual proof",
    message_ko: "실제근거",
    expected: true,
    actual: true,
    evidence_path: "raw.json",
  }));
  assert.equal(cases.length, 32);
  requireGatewayCases(cases);
  assert.throws(() => requireGatewayCases(cases.slice(1)));
  assert.throws(() => requireGatewayCases([...cases, cases[0]!]));
  assert.throws(() =>
    requireGatewayCases(
      cases.map((c, i) => (i === 0 ? { ...c, status: "FAIL" } : c)),
    ),
  );
  assert.throws(() =>
    requireGatewayCases(
      cases.map((c, i) => (i === 0 ? { ...c, assertion_id: "unexpected" } : c)),
    ),
  );
});
test("gateway negatives bind exact HTTP reason and exclude successful routing fields / 중계실패정확상태·사유·성공필드부재", () => {
  const reply = {
    status: 409,
    body: {
      code: "ERROR",
      reason: "TRAFFIC_CHANGED",
      message_en: "Changed",
      message_ko: "변경됨",
    },
  };
  assert.ok(gatewayFailureMatches(reply, 409, "TRAFFIC_CHANGED"));
  assert.ok(!gatewayFailureMatches(reply, 503, "TRAFFIC_CHANGED"));
  assert.ok(!gatewayFailureMatches(reply, 409, "VERSION_MISMATCH"));
  for (const key of [
    "geometry",
    "distance_m",
    "duration_s",
    "engine_result",
    "provenance",
    "snapshot_id",
  ])
    assert.ok(
      !gatewayFailureMatches(
        { ...reply, body: { ...reply.body, [key]: {} } },
        409,
        "TRAFFIC_CHANGED",
      ),
    );
});
import { main } from "../tools/gateway_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
test("gateway CLI rejects incomplete input before resource creation / 중계명령이자원생성전불완전입력거부", async () => {
  const messages: string[] = [],
    io = {
      out: (s: string) => messages.push(s),
      error: (s: string) => messages.push(s),
    };
  assert.equal(await main(["--graph", "verified", "--output"], io), 1);
  assert.match(messages[0]!, /Graph and new output required/);
  assert.equal(await main(["--help"], io), 0);
});
test("gateway report retains original evidence and safe bilingual public route playback / 중계보고서원근거·안전한한영공개경로보존", () => {
  const input: SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "unit-source", dirty: true },
    graph_id: "a".repeat(64),
    implementation_sha256: "b".repeat(64),
    generated_at_utc: "2026-10-25T00:00:00.000Z",
    summary: {
      status: "PASS",
      assertions_passed: 302,
      assertions_total: 302,
      vehicle_count: 1,
      observation_count: 0,
      omission_count: 0,
      duration_ms: 240000,
    },
    stages: [],
    roads: [
      {
        label: "unit-road",
        edge_id: "1",
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
        vehicle_id: "original",
        truth: [],
        observations: [],
        omissions: [],
        traversals: [],
      },
    ],
    assertions: [],
    limitations: [],
    gateway: {
      assertions_passed: 32,
      assertions_total: 32,
      cleanup_verified: true,
      routes: [],
      events: [
        {
          event_id: "old-result",
          recorded_at_utc: "2026-10-25T00:00:00.000Z",
          message_en: "Rejected </script><script>bad()",
          message_ko: "거부",
          evidence_path: "gateway/raw.json",
        },
      ],
      cases: [],
      evidence: [],
    },
  };
  const html = renderSimulationReport(input);
  assert.match(html, /P10 recorded version-aware route gateway/);
  assert.match(html, /P10 기록된 버전확인 경로 중계/);
  assert.match(html, /LIVE_MIXED/);
  assert.match(html, /경로 실시간 적용률/);
  assert.match(html, /not public API fields/);
  assert.ok(!html.includes("</script><script>bad()"));
  const embedded = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(embedded.gateway, input.gateway);
  assert.deepEqual(embedded.vehicles, input.vehicles);
  assert.doesNotThrow(
    () => new Function(html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!),
  );
});
