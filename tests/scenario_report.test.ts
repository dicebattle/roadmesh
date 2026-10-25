import test from "node:test";
import assert from "node:assert/strict";
import { main } from "../tools/scenario_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
test("Scenario CLI refuses malformed flags before creating resources / 시나리오 명령은 자원 생성 전 잘못된 옵션 거부", async () => {
  for (const args of [
    [],
    ["--graph"],
    ["--graph", "x", "--output", "--runtime-only"],
    ["--unknown"],
    ["--runtime-only", "--runtime-only"],
  ])
    assert.equal(await main(args), 1);
  assert.equal(await main(["--help"]), 0);
});
test("Scenario report preserves bilingual evidence and escapes private fixture text / 시나리오 보고서 한영 근거 보존·시험 문장 이스케이프", () => {
  const input = {
    schema_version: "0.1",
    source: { commit: "unit", dirty: true },
    graph_id: "a".repeat(64),
    implementation_sha256: "b".repeat(64),
    generated_at_utc: "2026-10-25T00:00:00Z",
    summary: {
      status: "PASS",
      assertions_passed: 390,
      assertions_total: 390,
      vehicle_count: 1,
      observation_count: 0,
      omission_count: 0,
      duration_ms: 1000,
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
        vehicle_id: "unit-vehicle",
        truth: [],
        observations: [],
        omissions: [],
        traversals: [],
      },
    ],
    assertions: [],
    limitations: [],
    cloudflare: {
      assertions_passed: 32,
      assertions_total: 32,
      cleanup_verified: true,
      cases: [],
      parity: [
        {
          case_id: "unit-count-5",
          canonical_sha256: "c".repeat(64),
          evidence_path: "cloudflare/parity/unit.json",
        },
      ],
      runtime_en: "Local unit fixture",
      runtime_ko: "로컬 단위 입력",
    },
    scenarios: {
      assertions_passed: 24,
      assertions_total: 24,
      cleanup_verified: true,
      matrix_path: "scenarios/matrix.json",
      screenshots: [],
      cases: [
        {
          case_id: "p12-unit",
          status: "PASS",
          message_en: "Test </script><script>bad()",
          message_ko: "검사",
          evidence_path: "scenarios/raw.json",
        },
      ],
    },
  } as SimulationReportData;
  const html = renderSimulationReport(input);
  assert.match(html, /P12 whole-system faults/);
  assert.match(html, /P12 전체 장애/);
  assert.ok(!html.includes("</script><script>bad()"));
  const data = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(data.scenarios, input.scenarios);
  assert.deepEqual(data.cloudflare, input.cloudflare);
  assert.match(html, /P13 recorded local Cloudflare parity/);
  assert.match(html, /P13 기록된 로컬 Cloudflare 비교/);
  assert.doesNotThrow(
    () => new Function(html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!),
  );
});
