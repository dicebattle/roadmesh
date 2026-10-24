import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_CASE_IDS,
  requireClientCases,
  main,
} from "../tools/client_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
import type { SimulationAssertion } from "../tools/vehicle_simulator.js";
test("client fixed inventory rejects skipped, duplicate, failed and substituted browser cases / 고정브라우저검사생략·중복·실패·교체거부", () => {
  const cases: SimulationAssertion[] = CLIENT_CASE_IDS.map((assertion_id) => ({
    assertion_id,
    status: "PASS",
    message_en: "Actual browser evidence",
    message_ko: "실제 브라우저 근거",
    expected: true,
    actual: true,
    evidence_path: "raw.json",
  }));
  assert.equal(cases.length, 32);
  requireClientCases(cases);
  assert.throws(() => requireClientCases(cases.slice(1)));
  assert.throws(() => requireClientCases([...cases, cases[0]!]));
  assert.throws(() =>
    requireClientCases(
      cases.map((a, i) => (i === 0 ? { ...a, status: "FAIL" } : a)),
    ),
  );
  assert.throws(() =>
    requireClientCases(
      cases.map((a, i) => (i === 0 ? { ...a, assertion_id: "unexpected" } : a)),
    ),
  );
});
test("client CLI fails incomplete input before browser or native resources / 화면명령불완전입력시브라우저·엔진생성전실패", async () => {
  const messages: string[] = [],
    io = {
      out: (s: string) => messages.push(s),
      error: (s: string) => messages.push(s),
    };
  assert.equal(await main(["--graph", "verified", "--output"], io), 1);
  assert.match(messages[0]!, /Graph and new output required/);
  assert.equal(await main(["--help"], io), 0);
});
test("client report preserves existing replay and safely embeds actual browser evidence / 보고서기존재생보존·안전한브라우저근거삽입", () => {
  const data: SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "unit-source", dirty: true },
    graph_id: "a".repeat(64),
    implementation_sha256: "b".repeat(64),
    generated_at_utc: "2026-10-25T00:00:00.000Z",
    summary: {
      status: "PASS",
      assertions_passed: 334,
      assertions_total: 334,
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
    client: {
      assertions_passed: 32,
      assertions_total: 32,
      cleanup_verified: true,
      browser_version: "test-only",
      screenshots: [
        {
          label_en: "Actual screenshot",
          label_ko: "실제 화면",
          path: "client/screenshots/desktop.png",
        },
      ],
      routes: [],
      events: [
        {
          event_id: "expiry",
          state: "expired",
          message_en: "Expired </script><script>bad()",
          message_ko: "만료",
          evidence_path: "client/states/expired.json",
        },
      ],
      cases: [],
      evidence: [],
    },
  };
  const html = renderSimulationReport(data);
  assert.match(html, /P11 recorded actual browser route client/);
  assert.match(html, /P11 기록된 실제 브라우저 경로 화면/);
  assert.match(html, /pilot:serve/);
  assert.match(html, /browser wall time does not/);
  assert.ok(!html.includes("</script><script>bad()"));
  const embedded = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(embedded.client, data.client);
  assert.deepEqual(embedded.vehicles, data.vehicles);
  assert.doesNotThrow(
    () => new Function(html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!),
  );
});
import { boundedClientOperation } from "../tools/client_checks.js";
test("browser barriers have finite deadlines and signal interruption / 브라우저대기의유한기한·신호중단", async () => {
  const never = new Promise<void>(() => {});
  await assert.rejects(boundedClientOperation(never, 5), /deadline/);
  const abort = new AbortController(),
    pending = boundedClientOperation(never, 1000, abort.signal);
  abort.abort();
  await assert.rejects(pending, /interrupted/);
  assert.equal(
    await boundedClientOperation(Promise.resolve("ready"), 1000),
    "ready",
  );
});
