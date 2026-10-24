import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLICATION_CASE_IDS,
  requirePublicationCases,
  main,
} from "../tools/publication_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
import type { SimulationAssertion } from "../tools/vehicle_simulator.js";
test("whole publication gate rejects missing, duplicate and failed actual cases / 전체 게시 관문이 누락·중복·실패 사례 거부", () => {
  const cases = PUBLICATION_CASE_IDS.map(
    (id) =>
      ({
        assertion_id: id,
        status: "PASS",
        message_en: "actual evidence",
        message_ko: "실제 증거",
        expected: true,
        actual: true,
        evidence_path: "case.json",
      }) as SimulationAssertion,
  );
  requirePublicationCases(cases);
  assert.throws(() => requirePublicationCases(cases.slice(1)));
  assert.throws(() => requirePublicationCases([...cases, cases[0]!]));
  assert.throws(() =>
    requirePublicationCases(
      cases.map((c, i) => (i === 0 ? { ...c, status: "FAIL" } : c)),
    ),
  );
});
test("publication CLI rejects incomplete arguments without starting resources / 게시 명령이 불완전 인자를 자원 생성 전에 거부", async () => {
  const messages: string[] = [];
  const io = {
    out: (s: string) => messages.push(s),
    error: (s: string) => messages.push(s),
  };
  assert.equal(await main(["--graph", "verified", "--output"], io), 1);
  assert.match(messages[0]!, /Graph and new output required/);
  assert.equal(await main(["--help"], io), 0);
});
test("offline publication report preserves recorded sequence, hashes and bilingual evidence safely / 오프라인 게시보고서가 순번·해시·한영증거 안전 보존", () => {
  const input: SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "unit-source", dirty: true },
    graph_id: "a".repeat(64),
    generated_at_utc: "2026-10-24T00:00:00.000Z",
    implementation_sha256: "b".repeat(64),
    summary: {
      status: "PASS",
      assertions_passed: 1,
      assertions_total: 1,
      vehicle_count: 0,
      observation_count: 0,
      omission_count: 0,
      duration_ms: 60000,
    },
    stages: [],
    roads: [
      {
        label: "unit-road",
        edge_id: "unit-edge",
        forward: true,
        car_access: true,
        coordinates: [
          [127, 37.5],
          [127.0001, 37.5],
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
    publication: {
      publisher_id: "unit-publisher",
      simulation_namespace: "unit-namespace",
      high_water: 5,
      active_snapshot_id: null,
      assertions_passed: 1,
      assertions_total: 1,
      cleanup_verified: true,
      versions: [
        {
          sequence: 1,
          kid: "public-key",
          snapshot_id: "c".repeat(64),
          target_status: "LIVE",
          valid_until: "2026-10-24T00:04:00.000Z",
          artifact_path: "publication/public/artifact.json",
          jws_path: "publication/public/manifest.jws.txt",
        },
      ],
      cases: [
        {
          case_id: "unit",
          status: "PASS",
          message_en: "</script><script>bad()</script>",
          message_ko: "만료 후 최고순번 보존",
          evidence_path: "publication/case.json",
        },
      ],
      evidence: [
        {
          name_en: "Original bytes",
          name_ko: "원본 바이트",
          path: "publication/public/artifact.json",
        },
      ],
    },
  };
  const html = renderSimulationReport(input);
  assert.match(html, /P07 signed publication and durable acceptance/);
  assert.match(html, /P07 서명 게시·영속 수용/);
  assert.match(html, /#publication-evidence/);
  assert.match(html, /overflow-wrap: anywhere/);
  assert.ok(!html.includes("</script><script>bad()"));
  const embedded = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(embedded.publication, input.publication);
  assert.match(html, /P08 routing evidence is recorded separately/);
});
