import { confirmedAbsent } from "../tools/ingestion_runtime.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIngestBatches,
  normalizeStored,
  assertNoSensitiveDiagnostics,
} from "../tools/ingestion_checks.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
import type { Observation } from "../tools/vehicle_simulator.js";
import type { StoredTraversal } from "../tools/ingestion_types.js";
test("HTTP batching retains every sample and bounded exact overlap / HTTP 배치가 모든 표본과 제한된 동일중첩 보존", () => {
  const samples = Array.from(
    { length: 121 },
    (_, i): Observation => ({
      sample_id: "sample-" + i,
      vehicle_id: "v",
      offset_ms: i * 500,
      event_time_utc: new Date(1767225600000 + i * 500).toISOString(),
      longitude: 127,
      latitude: 37.5,
      accuracy_m: 3,
      source_class: "SYNTHETIC",
    }),
  );
  const batches = buildIngestBatches(
    samples,
    "trip",
    "graph",
    "2026-01-01T00:00:00.000Z",
  );
  assert.deepEqual(
    batches.map((b) => b.batch_seq),
    [0, 1, 2],
  );
  assert(batches.every((b) => b.samples.length <= 60));
  assert.equal(batches.filter((b) => b.is_final).length, 1);
  assert(batches.at(-1)!.is_final);
  const unique = new Map(
    batches.flatMap((b) => b.samples.map((s) => [s.sample_id, s] as const)),
  );
  assert.deepEqual([...unique.values()], samples);
  assert.deepEqual(
    batches[0]!.samples.slice(-3),
    batches[1]!.samples.slice(0, 3),
  );
});
test("stored comparison keeps directed occurrence order and UTC times / 저장 대조의 방향순번·UTC시각 보존", () => {
  const rows = [
    {
      edge_id: "2",
      forward: false,
      occurrence: 1,
      entered_at_utc: "2026-01-01T00:00:02Z",
      exited_at_utc: "2026-01-01T00:00:03Z",
    },
    {
      edge_id: "1",
      forward: true,
      occurrence: 0,
      entered_at_utc: "2026-01-01T00:00:00Z",
      exited_at_utc: "2026-01-01T00:00:02Z",
    },
  ] as StoredTraversal[];
  assert.deepEqual(normalizeStored(rows), [
    {
      edge_id: "1",
      forward: true,
      entered_at_ms: 1767225600000,
      exited_at_ms: 1767225602000,
    },
    {
      edge_id: "2",
      forward: false,
      entered_at_ms: 1767225602000,
      exited_at_ms: 1767225603000,
    },
  ]);
});
test("diagnostics reject credentials and raw coordinate fields / 진단의 인증·원시좌표 필드 거부", () => {
  assertNoSensitiveDiagnostics('{"code":"LEASE_LOST"}', ["secret-value"]);
  for (const text of [
    "secret-value",
    '{"longitude":127}',
    '{"latitude":37.5}',
    "postgresql://user:pass@host/db",
    '{"token":"x"}',
  ])
    assert.throws(() => assertNoSensitiveDiagnostics(text, ["secret-value"]));
});
test("offline evidence renders ingestion without changing map provenance / 오프라인 수집증거와 지도출처 보존", () => {
  const data: SimulationReportData = {
    schema_version: "0.1",
    source: { commit: "fixture-only", dirty: true },
    graph_id: "g",
    generated_at_utc: "2026-01-01T00:00:00Z",
    implementation_sha256: "f",
    summary: {
      status: "PASS",
      assertions_passed: 1,
      assertions_total: 1,
      vehicle_count: 1,
      observation_count: 1,
      omission_count: 0,
      duration_ms: 1000,
    },
    stages: [],
    roads: [
      {
        label: "road",
        edge_id: "1",
        forward: true,
        car_access: true,
        coordinates: [
          [127, 37.5],
          [127.001, 37.5],
        ],
      },
    ],
    vehicles: [
      {
        vehicle_id: "v",
        truth: [],
        observations: [],
        omissions: [],
        traversals: [],
      },
    ],
    assertions: [],
    limitations: [],
    ingestion: {
      scenario_count: 10,
      assertions_passed: 1,
      assertions_total: 1,
      submitted_batches: 2,
      duplicate_responses: 1,
      stored_traversals: 1,
      reference_traversals: 1,
      recovered_workers: 1,
      cleanup_verified: true,
      events: [{ phase: "WORKER", code: "LEASE_LOST", elapsed_ms: 1000 }],
      cases: [
        {
          case_id: "recovery",
          status: "PASS",
          message_en: "Recovery verified",
          message_ko: "복구확인",
          evidence_path: "ingestion/readback.json",
        },
      ],
      evidence: [
        {
          name_en: "Read-back",
          name_ko: "재조회",
          path: "ingestion/readback.json",
        },
      ],
    },
  };
  const html = renderSimulationReport(data);
  assert(html.includes("Durable receipt"));
  assert(html.includes("영속 접수"));
  const raw = JSON.parse(
    html.match(
      /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1]!,
  );
  assert.deepEqual(raw.ingestion, data.ingestion);
  assert.deepEqual(raw.source, data.source);
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1]!);
});

test("cleanup requires explicit missing-resource evidence, not daemon failure / 정리 부재는 데몬 실패가 아닌 명시적 자료로 확인", () => {
  assert(
    confirmedAbsent({ status: 1, stderr: "Error: No such container: owned" }),
  );
  assert(
    confirmedAbsent({ status: 1, stderr: "Error: No such object: owned" }),
  );
  assert(
    confirmedAbsent({
      status: 1,
      stderr: "Error response from daemon: get owned: no such volume",
    }),
  );
  assert(
    !confirmedAbsent({
      status: 1,
      stderr: "Cannot connect to the Docker daemon",
    }),
  );
  assert(!confirmedAbsent({ status: 0, stderr: "No such container" }));
});
