import test from "node:test";
import assert from "node:assert/strict";
import { canonical, parseJson } from "../tools/value_contract.js";
import { utc } from "../tools/time_validation.js";
import { IngestionError } from "../tools/ingestion_types.js";
import {
  batchHash,
  configuredScope,
  noticeValid,
  scopes,
  validateBatch,
  type ParityScope,
} from "../infra/cloudflare/contracts.js";
const graph = "a".repeat(64),
  scope: ParityScope = {
    scope_id: "fixture",
    namespace: "p13-test",
    graph_id: graph,
    shard_id: "tile-1",
    catalog: [{ edge_id: "100", forward: true, distance_m: 10 }],
    initial_event_time_utc: "2026-10-24T00:01:30.000Z",
  };
const contribution = {
  observation_id: "b".repeat(64),
  contributor_id: "person-1",
  graph_id: graph,
  matching_policy: "seoul-observed-v3" as const,
  source_class: "SYNTHETIC" as const,
  trip_activity: "TRAVEL" as const,
  edge_id: "100",
  forward: true,
  entered_at_utc: "2026-10-24T00:00:10.000Z",
  exited_at_utc: "2026-10-24T00:00:20.000Z",
  distance_m: 10,
  duration_s: 10,
  available_at_utc: "2026-10-24T00:00:59.000Z",
};
const batch = { batch_id: "first", contributions: [contribution] };
test("portable codec preserves strict JSON and exact ASCII canonical bytes / 이동 가능한 JSON·정확 바이트", () => {
  assert.equal(
    canonical({ z: "한글", a: [1, true, null] }).toString(),
    '{"a":[1,true,null],"z":"\\ud55c\\uae00"}',
  );
  assert.throws(() => parseJson('{"a":1,"a":2}'));
  assert.throws(() => parseJson('{"a":9007199254740992}'));
  assert.throws(() => parseJson('{"a":1,}'));
  assert.throws(() => parseJson(Uint8Array.of(0xc3, 0x28)));
  assert.deepEqual(parseJson(new TextEncoder().encode('\uFEFF{"a":1}')), {
    a: 1,
  });
});
test("UTC extraction preserves ingestion error identity / UTC 분리 후 기존 오류 식별 유지", () => {
  assert.equal(utc("2026-10-24T00:00:00Z"), Date.parse("2026-10-24T00:00:00Z"));
  assert.throws(
    () => utc("2026-02-30T00:00:00Z"),
    (e) => e instanceof IngestionError && e.code === "OBSERVATION_TIME_INVALID",
  );
});
test("configured scopes reject duplicate logical owners and catalog edits / 중복 소유자·목록 입력 거부", () => {
  assert.equal(
    configuredScope(JSON.stringify([scope]), "fixture").namespace,
    "p13-test",
  );
  assert.throws(() =>
    scopes(JSON.stringify([scope, { ...scope, scope_id: "second" }])),
  );
  assert.throws(() =>
    scopes(
      JSON.stringify([
        { ...scope, catalog: [scope.catalog[0], scope.catalog[0]] },
      ]),
    ),
  );
  assert.throws(() => configuredScope(JSON.stringify([scope]), "unknown"));
  assert.throws(() => scopes(JSON.stringify([{ ...scope, extra: true }])));
});
test("matched boundary rejects changed graph, source, timestamps and extra fields / 매칭 경계의 지도·출처·시각·추가 필드 거부", () => {
  for (const c of [
    { ...contribution, graph_id: "c".repeat(64) },
    { ...contribution, source_class: "CAR" },
    { ...contribution, available_at_utc: "2026-10-24T00:02:00.000Z" },
    { ...contribution, extra: 1 },
  ])
    assert.throws(() =>
      validateBatch(
        { ...batch, contributions: [c] },
        scope,
        scope.initial_event_time_utc,
      ),
    );
  assert.throws(() =>
    validateBatch(
      { ...batch, namespace: "other" },
      scope,
      scope.initial_event_time_utc,
    ),
  );
  assert.throws(() => validateBatch(batch, scope, "2026-10-25T00:01:00.000Z"));
});
test("dispatch control cannot change immutable payload hash / 발신 제어와 불변 바이트 구분", () => {
  const a = validateBatch(batch, scope, scope.initial_event_time_utc);
  assert.equal(batchHash(a), batchHash({ ...a, dispatch: "defer" }));
  assert.notEqual(
    batchHash(a),
    batchHash({
      ...a,
      contributions: [{ ...contribution, contributor_id: "person-2" }],
    }),
  );
  assert.throws(() =>
    validateBatch(
      { ...batch, dispatch: "remote" },
      scope,
      scope.initial_event_time_utc,
    ),
  );
});
test("queue notices contain only bounded configured references / 큐 통지는 제한된 참조만 허용", () => {
  assert.deepEqual(
    noticeValid({
      scope_id: "fixture",
      batch_id: "first",
      sha256: "c".repeat(64),
    }),
    { scope_id: "fixture", batch_id: "first", sha256: "c".repeat(64) },
  );
  assert.throws(() =>
    noticeValid({
      scope_id: "fixture",
      batch_id: "first",
      sha256: "c".repeat(64),
      payload: batch,
    }),
  );
  assert.throws(() =>
    noticeValid({
      scope_id: "../other",
      batch_id: "first",
      sha256: "c".repeat(64),
    }),
  );
});

test("Whole P13 gate rejects missing, duplicated and failed cases / P13 전체 판정의 누락·중복·실패 거부", async () => {
  const { CLOUDFLARE_CASE_IDS, requireCloudflareCases } =
    await import("../tools/cloudflare_checks.js");
  const values = CLOUDFLARE_CASE_IDS.map((assertion_id) => ({
    assertion_id,
    status: "PASS" as const,
    message_en: "Unit fixture",
    message_ko: "단위 입력",
    expected: true,
    actual: true,
    evidence_path: "unit.json",
  }));
  assert.doesNotThrow(() => requireCloudflareCases(values));
  assert.throws(() => requireCloudflareCases(values.slice(1)));
  assert.throws(() => requireCloudflareCases([...values.slice(1), values[1]!]));
  assert.throws(() =>
    requireCloudflareCases(
      values.map((v, i) => (i ? v : { ...v, status: "FAIL" as const })),
    ),
  );
});
