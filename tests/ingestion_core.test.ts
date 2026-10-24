import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  utc,
  batchValid,
  digest,
  matchingId,
  completeValid,
} from "../tools/ingestion_validation.js";
import { privateConfig, barrier } from "../tools/ingestion_ipc.js";
import {
  IngestionError,
  type IngestBatch,
  type StoreConfig,
  type Principal,
} from "../tools/ingestion_types.js";
const principal: Principal = {
  contributor_id: "pilot-one",
  vehicle_id: "car-one",
  consent_version: "pilot-consent-v1",
};
const config: StoreConfig = {
  database_url: "private",
  namespace: "test-one",
  graph_id: "a".repeat(64),
  matching_policy: "seoul-observed-v2",
};
const sample = (offset = 0) => ({
  sample_id: `sample-${offset}`,
  vehicle_id: "car-one",
  offset_ms: offset,
  event_time_utc: new Date(
    Date.parse("2026-10-24T00:00:00Z") + offset,
  ).toISOString(),
  longitude: 127,
  latitude: 37,
  accuracy_m: 3,
  source_class: "SYNTHETIC" as const,
});
const batch = (): IngestBatch => ({
  schema_version: "0.1",
  batch_id: "batch-one",
  trip_id: "trip-one",
  batch_seq: 0,
  is_final: true,
  graph_id: config.graph_id,
  matching_policy: "seoul-observed-v2",
  consent_version: "pilot-consent-v1",
  source_class: "SYNTHETIC",
  trip_start_utc: "2026-10-24T00:00:00Z",
  samples: [sample(0), sample(500)],
});
test("Strict UTC rejects calendar normalization and offsets / 엄격 UTC는 날짜 자동 보정과 시간대 오프셋을 거부", () => {
  assert.equal(utc("2026-10-24T00:00:00Z"), utc("2026-10-24T00:00:00.000Z"));
  for (const value of [
    "2026-02-30T00:00:00Z",
    "2026-10-24T24:00:00Z",
    "2026-10-24T09:00:00+09:00",
    "0000-01-01T00:00:00Z",
  ])
    assert.throws(() => utc(value), IngestionError);
});
test("Bounded authenticated batch preserves observation content / 제한된 인증 배치는 관측 내용을 보존", () => {
  const value = batch();
  assert.deepEqual(batchValid(value, principal, config), {
    ...value,
    trip_activity: "TRAVEL",
  });
  for (const change of [
    { batch_seq: 128 },
    { batch_seq: true },
    { is_final: 1 },
    { samples: Array.from({ length: 61 }, (_, i) => sample(i * 500)) },
    { samples: [sample(500), sample(0)] },
    { samples: [sample(0), sample(0)] },
    { samples: [{ ...sample(), vehicle_id: "another-car" }] },
    { samples: [{ ...sample(), offset_ms: 1 }] },
  ])
    assert.throws(() => batchValid({ ...value, ...change }, principal, config));
});
test("Input versions and source are rejected without payload diagnostics / 버전과 출처 거부에 원문을 노출하지 않음", () => {
  for (const [change, code, status] of [
    [{ source_class: "REAL" }, "SOURCE_NOT_ALLOWED", 403],
    [{ graph_id: "b".repeat(64) }, "VERSION_MISMATCH", 409],
    [{ contributor_id: "client-selected" }, "INVALID_INPUT", 422],
  ] as const) {
    assert.throws(
      () => batchValid({ ...batch(), ...change }, principal, config),
      (error: unknown) =>
        error instanceof IngestionError &&
        error.code === code &&
        error.status === status &&
        !error.message.includes("127"),
    );
  }
});
test("Canonical hashes bind identity and preserve key-order replay / 정규 해시는 식별자를 묶고 키 순서 재시도를 보존", () => {
  assert.equal(digest({ a: 1, b: "한글" }), digest({ b: "한글", a: 1 }));
  assert.notEqual(digest(batch()), digest({ ...batch(), is_final: false }));
  assert.notEqual(
    matchingId("one", "person", "trip"),
    matchingId("two", "person", "trip"),
  );
  assert.match(matchingId("one", "person", "trip"), /^[a-f0-9]{64}$/);
});
test("Accepted contribution requires UTC duration, distance and no geometry / 수용 기여는 UTC 시간과 거리만 저장", () => {
  const accepted = {
    traversal_id: "b".repeat(64),
    edge_id: "123",
    forward: true,
    occurrence: 0,
    entered_at_utc: "2026-10-24T00:00:00.000Z",
    exited_at_utc: "2026-10-24T00:00:01.000Z",
    distance_m: 10,
    duration_s: 1,
    source_class: "SYNTHETIC" as const,
  };
  const value = {
    semantic_sha256: "c".repeat(64),
    matched_samples: 3,
    excluded_samples: 0,
    accepted: [accepted],
  };
  completeValid(value);
  for (const change of [
    { duration_s: 2 },
    { distance_m: 0 },
    { longitude: 127 },
    { source_class: "REAL" },
  ])
    assert.throws(() =>
      completeValid({
        ...value,
        accepted: [{ ...accepted, ...change }] as never,
      }),
    );
  assert.throws(() =>
    completeValid({ ...value, accepted: [accepted, accepted] }),
  );
});
test("Private config enforces mode and strict JSON / 비공개 설정은 권한과 엄격 JSON을 검증", () => {
  const directory = mkdtempSync(join(tmpdir(), "routelens-private-"));
  try {
    const path = join(directory, "config.json");
    writeFileSync(path, '{"safe":true}', { mode: 0o600 });
    assert.deepEqual(privateConfig(["--config", path]), { safe: true });
    chmodSync(path, 0o644);
    assert.throws(() => privateConfig(["--config", path]));
    chmodSync(path, 0o600);
    writeFileSync(path, '{"x":1,"x":2}');
    assert.throws(() => privateConfig(["--config", path]));
    assert.throws(() => privateConfig(["--config"]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("Failpoint is unavailable without parent IPC / 부모 IPC가 없으면 중단 지점을 켤 수 없음", async () => {
  await barrier("AFTER_LEASE", undefined);
  await assert.rejects(barrier("AFTER_LEASE", "AFTER_LEASE"), /IPC/);
});
test("Real HTTP rejects raw credentials and returns bounded 413 JSON / 실제 HTTP는 인증 형식과 본문 한도를 검증", async () => {
  const { startService } = await import("../tools/ingestion_service.js");
  let accepted = 0;
  const fake = {
    initialize: async () => {},
    advanceEventTime: async (time: string) => time,
    close: async () => {},
    revoke: async () => {},
    inspect: async () => ({
      counts: {
        contributors: 0,
        trips: 0,
        batches: 0,
        samples: 0,
        raw_payloads: 0,
        traversals: 0,
        events: 0,
      },
      trips: [],
      traversals: [],
    }),
    accept: async () => {
      accepted++;
      return {
        code: "ACCEPTED" as const,
        trip_id: "one",
        state: "READY" as const,
        sample_count: 1,
        batch_count: 1,
      };
    },
  };
  const token = "private-test-token-".repeat(3);
  const server = await startService(
    {
      store: config,
      credentials: [{ token, principal }],
      event_time_utc: "2026-10-24T00:00:00Z",
    },
    fake,
  );
  try {
    const url = `http://127.0.0.1:${server.port}/v1/observations/batches`;
    for (const authorization of [token, `Basic ${token}`]) {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization },
        body: "{}",
      });
      assert.equal(response.status, 401);
      assert.equal(
        ((await response.json()) as { code: string }).code,
        "UNAUTHORIZED",
      );
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: "x".repeat(65537),
    });
    assert.equal(response.status, 413);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      "PAYLOAD_TOO_LARGE",
    );
    assert.equal(accepted, 0);
  } finally {
    await server.close();
  }
});
