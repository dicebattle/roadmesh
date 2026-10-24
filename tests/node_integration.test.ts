import test from "node:test";
import assert from "node:assert/strict";
import {
  NODE_CASE_IDS,
  requireNodeCases,
  nodeFailureMatches,
  main,
} from "../tools/node_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
import type { SimulationAssertion } from "../tools/vehicle_simulator.js";
import type { NodeReply } from "../tools/node_types.js";
test("node required inventory rejects missing, duplicate, failed and unexpected evidence / 노드필수목록누락·중복·실패·예상밖근거거부", () => {
  const cases: SimulationAssertion[] = NODE_CASE_IDS.map((assertion_id) => ({
    assertion_id,
    status: "PASS",
    message_en: "Actual native proof",
    message_ko: "실제지속엔진근거",
    expected: true,
    actual: true,
    evidence_path: "original.json",
  }));
  assert.equal(cases.length, 32);
  requireNodeCases(cases);
  assert.throws(() => requireNodeCases(cases.slice(1)));
  assert.throws(() => requireNodeCases([...cases, cases[0]!]));
  assert.throws(() =>
    requireNodeCases(
      cases.map((c, i) => (i === 0 ? { ...c, status: "FAIL" } : c)),
    ),
  );
  assert.throws(() =>
    requireNodeCases(
      cases.map((c, i) => (i === 0 ? { ...c, assertion_id: "unexpected" } : c)),
    ),
  );
});
test("node negative cases require exact status and reason with no successful result / 노드부정검사가정확한상태·사유와성공결과부재요구", () => {
  const good: NodeReply = {
    status: 409,
    body: {
      code: "UNAVAILABLE",
      reason: "ACCEPTED_STATE_CHANGED",
      message_en: "Changed",
      message_ko: "변경됨",
    },
  };
  assert.equal(nodeFailureMatches(good, 409, "ACCEPTED_STATE_CHANGED"), true);
  assert.equal(nodeFailureMatches(good, 503, "ACCEPTED_STATE_CHANGED"), false);
  assert.equal(nodeFailureMatches(good, 409, "ENGINE_UNAVAILABLE"), false);
  assert.equal(
    nodeFailureMatches(
      {
        ...good,
        body: { ...good.body, engine_result: {} },
      } as unknown as NodeReply,
      409,
      "ACCEPTED_STATE_CHANGED",
    ),
    false,
  );
  assert.equal(
    nodeFailureMatches(
      {
        ...good,
        body: { ...good.body, provenance: {} },
      } as unknown as NodeReply,
      409,
      "ACCEPTED_STATE_CHANGED",
    ),
    false,
  );
});
test("node CLI refuses incomplete input without creating resources / 노드명령이자원생성전불완전입력거부", async () => {
  const messages: string[] = [];
  const io = {
    out: (s: string) => messages.push(s),
    error: (s: string) => messages.push(s),
  };
  assert.equal(await main(["--graph", "verified", "--output"], io), 1);
  assert.match(messages[0]!, /Graph and new output required/);
  assert.equal(await main(["--help"], io), 0);
});
test("node report preserves original datasets and renders safe bilingual recorded transitions / 노드보고서가원래자료와안전한한영전환기록보존", () => {
  const input: SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "unit-source", dirty: true },
    graph_id: "a".repeat(64),
    generated_at_utc: "2026-10-25T00:00:00.000Z",
    implementation_sha256: "b".repeat(64),
    summary: {
      status: "PASS",
      assertions_passed: 270,
      assertions_total: 270,
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
    nodes: {
      assertions_passed: 32,
      assertions_total: 32,
      cleanup_verified: true,
      routes: [],
      events: [
        {
          event_id: "old-draining-new-active",
          recorded_at_utc: "2026-10-25T00:00:00.000Z",
          node_id: "node-a",
          message_en: "Actual draining </script><script>bad()",
          message_ko: "실제마무리",
          evidence_path: "nodes/status/old-draining-new-active.json",
          status: {
            node_id: "node-a",
            instance_id: "instance-a",
            ready: false,
            active: null,
            in_flight: 1,
            slots: [],
            reason: "NOT_READY",
            message_en: "Preparing",
            message_ko: "준비중",
          },
        },
      ],
      cases: [],
      evidence: [],
    },
  };
  const html = renderSimulationReport(input);
  assert.match(html, /P09 recorded two-node native routing/);
  assert.match(html, /P09 기록된 두 노드 지속 엔진 경로/);
  assert.match(html, /HTTP 502/);
  assert.match(html, /not packet loss/);
  assert.match(html, /activation_epoch/);
  assert.match(html, /start_ticks/);
  assert.match(html, /활성화 순번/);
  assert.match(html, /시작 눈금/);
  assert.match(html, /Pause recorded replay/);
  assert.match(html, /기록 재생 일시정지/);
  assert.match(html, /aria-pressed/);
  assert.ok(!html.includes("</script><script>bad()"));
  const embedded = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(embedded.nodes, input.nodes);
  assert.deepEqual(embedded.vehicles, input.vehicles);
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!;
  assert.doesNotThrow(() => new Function(script));
});
