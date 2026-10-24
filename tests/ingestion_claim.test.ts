import test from "node:test";
import assert from "node:assert/strict";
import { IngestionStore } from "../tools/ingestion_store.js";

const time = "2026-10-25T00:00:00.000Z";
function fixture(stale: boolean) {
  const store = new IngestionStore({
    database_url: "postgresql://unused",
    namespace: "claim-regression",
    graph_id: "a".repeat(64),
    matching_policy: "seoul-observed-v3",
  });
  const statements: string[] = [];
  let candidates = 0;
  let released = 0;
  const trip = {
    contributor_id: "b", trip_id: "trip-b", vehicle_id: "vehicle-b",
    graph_id: "a".repeat(64), trip_start_utc: time,
    raw_expires_at: "2026-10-25T00:10:00Z", attempt: 0,
  };
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.startsWith("SELECT event_time_utc"))
      return { rows: [{ event_time_utc: time }] };
    if (sql.startsWith("SELECT c.*")) {
      candidates++;
      assert.ok(candidates <= 2, "Empty selection must stop / 빈 선택은 종료해야 함");
      return { rows: stale ? [{ contributor_id: candidates === 1 ? "a" : "b" }] : [] };
    }
    if (sql.startsWith("SELECT * FROM routelens_p05.trips"))
      return { rows: candidates === 1 ? [] : [trip] };
    if (sql.startsWith("UPDATE routelens_p05.trips SET state='LEASED'"))
      return { rows: [{ ...trip, fence: "1", attempt: 1, lease_until: "2026-10-25T00:02:00Z" }] };
    return { rows: [] };
  };
  const replacement = { query, connect: async () => ({ query, release: () => { released++; } }), end: async () => {} };
  // Test-only replacement; production exposes no SQL injection hook.
  (store as unknown as { pool: unknown }).pool = replacement;
  return { store, statements, candidates: () => candidates, released: () => released };
}
test("Stale contributor selection retries after commit and claims remaining work / 오래된 기여자 선택은 커밋 뒤 남은 작업을 재시도", async () => {
  const f = fixture(true);
  try {
    const claim = await f.store.claim("worker", time);
    assert.equal(claim?.contributor_id, "b");
    assert.equal(claim.fence, "1");
    assert.equal(claim.attempt, 1);
    assert.equal(f.candidates(), 2);
    assert.equal(f.released(), 2);
    const first = f.statements.findIndex(s => s.startsWith("SELECT c.*"));
    const second = f.statements.findIndex((s, i) => i > first && s.startsWith("SELECT c.*"));
    assert.ok(f.statements.slice(first, second).includes("COMMIT"));
    assert.ok(f.statements.slice(first, second).includes("BEGIN"));
  } finally { await f.store.close(); }
});
test("Genuine empty contributor selection returns null once / 실제 빈 기여자 선택은 한 번 조회하고 종료", async () => {
  const f = fixture(false);
  try {
    assert.equal(await f.store.claim("worker", time), null);
    assert.equal(f.candidates(), 1);
    assert.equal(f.released(), 1);
    assert.equal(f.statements.some(s => s.startsWith("SELECT * FROM routelens_p05.trips")), false);
  } finally { await f.store.close(); }
});
