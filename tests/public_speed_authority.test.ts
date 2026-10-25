import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPair, exportJWK } from "jose";
import { canonical, sha256 } from "../tools/shared.js";
import { normalizeItsResponse } from "../tools/public_speed_source.js";
import { buildPublicTrafficSnapshot, signPublicTraffic, type PublicTrafficTrust } from "../tools/public_speed_publication.js";
import { PublicSpeedAuthority } from "../tools/public_speed_authority.js";
import type { PublicRoadMapping } from "../tools/public_speed_geometry.js";

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "routelens-public-authority-"));
  const clock = {value: Date.parse("2026-10-25T14:01:10.000Z")};
  const catalog = [{edge_id: "100", forward: true, distance_m: 75}];
  const mapping: PublicRoadMapping = {schema_version: "kr-directed-mapping-0.1", policy: "kr-directed-envelope-v1",
    graph_id: "a".repeat(64), geometry_sha256: "b".repeat(64), graph_edges_sha256: "c".repeat(64),
    entries: [{edge_id: "100", forward: true, link_id: "1010000301", start_node_id: "1010000600",
      end_node_id: "1010006900", max_distance_m: 1, start_fraction: 0.1, end_fraction: 0.9}], excluded: []};
  const keys = await generateKeyPair("EdDSA", {crv: "Ed25519", extractable: true});
  const private_jwk = await exportJWK(keys.privateKey);
  const trust: PublicTrafficTrust = {kid: "key", public_jwk: await exportJWK(keys.publicKey), publisher_id: "publisher",
    graph_id: mapping.graph_id, mapping_sha256: sha256(canonical(mapping)), valid_from: "2026-10-25T00:00:00.000Z",
    valid_until: "2026-10-26T00:00:00.000Z", revoked: false};
  const config = {state_path: join(directory, "accepted.sqlite"), trust, mapping, catalog, clock: () => clock.value};
  const sign = async (sequence: number, speed = "21", retrieved_at = "2026-10-25T14:01:10.000Z") => {
    const batch = normalizeItsResponse(canonical({header: {resultCode: 0, resultMsg: "SUCCESS"}, body: {totalCount: 1,
      items: [{linkId: "1010000301", startNodeId: "1010000600", endNodeId: "1010006900", roadName: "Authored / 자체",
        speed, travelTime: "10.65", createdDate: "20261025230000"}]}}), retrieved_at, [126.98,37.46,127.10,37.56]);
    const snapshot = buildPublicTrafficSnapshot(batch, mapping, "publisher", sequence, new Date(clock.value).toISOString())!;
    return signPublicTraffic(snapshot, "key", private_jwk, catalog);
  };
  const handles: PublicSpeedAuthority[] = [];
  const open = async () => {const h = await PublicSpeedAuthority.open(config); handles.push(h); return h;};
  return {directory, clock, config, sign, open, async cleanup() {
    for (const h of handles) await h.close(); rmSync(directory, {recursive: true, force: true});
  }};
}
test("durable sequence rejects rollback/conflict and preserves duplicate bytes / 영속 순서·충돌 거부·중복 원문 유지", async () => {
  const f = await setup();
  try {
    const a = await f.open(), one = await f.sign(1), two = await f.sign(2);
    assert.equal(await a.accept(two.jws, two.artifact), "ACCEPTED");
    assert.equal(await a.accept(two.jws, two.artifact), "DUPLICATE");
    await assert.rejects(a.accept(one.jws, one.artifact), /PUBLIC_SEQUENCE_ROLLBACK/);
    const conflict = await f.sign(2, "22");
    await assert.rejects(a.accept(conflict.jws, conflict.artifact), /PUBLIC_SEQUENCE_CONFLICT/);
    const state = await a.inspect();
    assert.equal(state.high_water, 2); assert.equal(state.active!.manifest.traffic_snapshot_id, two.manifest.traffic_snapshot_id);
    // Caller mutation cannot alter the accepted record. / 호출자의 수정으로 수용 원문을 바꿀 수 없습니다.
    state.active!.snapshot.entries[0]!.speed_mps = 0;
    assert.equal((await a.inspect()).active!.snapshot.entries[0]!.speed_mps, 21/3.6);
    await a.close();
    assert.equal((await (await f.open()).inspect()).high_water, 2);
  } finally { await f.cleanup(); }
});
test("expiry/revocation remove active speed without resetting durable order / 만료·철회 뒤 순서를 유지하며 현재 속도 제거", async () => {
  const f = await setup();
  try {
    const a = await f.open(), one = await f.sign(1); await a.accept(one.jws, one.artifact);
    a.setRevoked(true); assert.equal((await a.inspect()).active, null);
    assert.equal((await a.inspect()).high_water, 1);
    a.setRevoked(false); assert.ok((await a.inspect()).active);
    f.clock.value = Date.parse(one.snapshot.valid_until);
    const expired = await a.inspect(); assert.equal(expired.active, null); assert.equal(expired.high_water, 1);
    await a.close();
    const restored = await (await f.open()).inspect(); assert.equal(restored.active, null); assert.equal(restored.high_water, 1);
  } finally { await f.cleanup(); }
});
test("two independent connections cannot overwrite a higher sequence / 독립 연결의 낮은 순번 덮어쓰기 금지", async () => {
  const f = await setup();
  try {
    const a = await f.open(), b = await f.open(), one = await f.sign(1), two = await f.sign(2);
    const results = await Promise.allSettled([a.accept(two.jws, two.artifact), b.accept(one.jws, one.artifact)]);
    assert.equal(results[0]!.status, "fulfilled");
    assert.equal((await a.inspect()).high_water, 2); assert.equal((await b.inspect()).high_water, 2);
    await assert.rejects(b.accept(one.jws, one.artifact), /PUBLIC_SEQUENCE_ROLLBACK/);
    const db = new DatabaseSync(f.config.state_path);
    try {
      assert.equal(db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal");
      const raw = String(db.prepare("SELECT record_json FROM public_acceptance").get()!.record_json);
      assert.equal(JSON.parse(raw).high_water, 2);
      assert.equal(JSON.parse(raw).artifact_base64, Buffer.from(two.artifact).toString("base64"));
    } finally { db.close(); }
  } finally { await f.cleanup(); }
});
test("bad signature and older source time leave the previous acceptance intact / 서명·관측 역행 오류 때 기존 수용 유지", async () => {
  const f = await setup();
  try {
    const a = await f.open(), one = await f.sign(1); await a.accept(one.jws, one.artifact);
    await assert.rejects(a.accept(one.jws.slice(0, -5) + "abcde", one.artifact), /PUBLIC_SIGNATURE_INVALID/);
    const older = await f.sign(2, "22", "2026-10-25T14:01:00.000Z");
    await assert.rejects(a.accept(older.jws, older.artifact), /PUBLIC_SOURCE_TIME_ROLLBACK/);
    assert.equal((await a.inspect()).high_water, 1);
  } finally { await f.cleanup(); }
});
test("stored-state corruption or another mapping fails closed on restart / 저장 상태 손상·다른 대응표 재시작 거부", async () => {
  const f = await setup();
  try {
    const a = await f.open(), one = await f.sign(1); await a.accept(one.jws, one.artifact); await a.close();
    await assert.rejects(PublicSpeedAuthority.open({...f.config, trust: {...f.config.trust, kid: "other"}}), /INVALID_PUBLIC_STATE/);
    const db = new DatabaseSync(f.config.state_path);
    try {
      const row = JSON.parse(String(db.prepare("SELECT record_json FROM public_acceptance").get()!.record_json));
      row.high_water = 99;
      db.prepare("UPDATE public_acceptance SET record_json=?").run(JSON.stringify(row));
    } finally { db.close(); }
    await assert.rejects(PublicSpeedAuthority.open(f.config), /INVALID_PUBLIC_STATE/);
  } finally { await f.cleanup(); }
});
test("owned SQLite handle closes idempotently and refuses later work / 소유 SQLite 종료·이후 작업 거부", async () => {
  const f = await setup();
  try {
    const a = await f.open(); await a.close(); await a.close();
    await assert.rejects(a.inspect(), /PUBLIC_AUTHORITY_CLOSED/);
    const p = await f.sign(1); await assert.rejects(a.accept(p.jws, p.artifact), /PUBLIC_AUTHORITY_CLOSED/);
  } finally { await f.cleanup(); }
});
