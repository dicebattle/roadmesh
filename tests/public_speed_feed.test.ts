import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, exportJWK } from "jose";
import { canonical, sha256 } from "../tools/shared.js";
import { normalizeItsResponse, type ItsRead } from "../tools/public_speed_source.js";
import { PublicSpeedAuthority } from "../tools/public_speed_authority.js";
import { PublicSpeedFeed } from "../tools/public_speed_feed.js";
import type { PublicRoadMapping } from "../tools/public_speed_geometry.js";

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "routelens-public-feed-"));
  const clock = {value: Date.parse("2026-10-25T14:01:10.000Z")}, bounds = [126.98, 37.46, 127.10, 37.56] as const;
  const catalog = ["100", "101"].map(edge_id => ({edge_id, forward: true, distance_m: 75}));
  const mapping: PublicRoadMapping = {schema_version: "kr-directed-mapping-0.1", policy: "kr-directed-envelope-v1",
    graph_id: "a".repeat(64), geometry_sha256: "b".repeat(64), graph_edges_sha256: "c".repeat(64), excluded: [],
    entries: ["100", "101"].map((edge_id, i) => ({edge_id, forward: true, link_id: "101000030" + (i + 1),
      start_node_id: "1010000600", end_node_id: "1010006900", max_distance_m: 1, start_fraction: 0, end_fraction: 1}))};
  const keys = await generateKeyPair("EdDSA", {crv: "Ed25519", extractable: true});
  const signer = {kid: "key", private_jwk: await exportJWK(keys.privateKey)};
  const trust = {kid: "key", public_jwk: await exportJWK(keys.publicKey), publisher_id: "publisher", graph_id: mapping.graph_id,
    mapping_sha256: sha256(canonical(mapping)), valid_from: "2026-10-25T00:00:00.000Z", valid_until: "2026-10-26T00:00:00.000Z", revoked: false};
  const config = {state_path: join(directory, "accepted.sqlite"), trust, mapping, catalog, clock: () => clock.value};
  let collect: () => Promise<ItsRead> = async () => read(), calls = 0;
  function read(speed = "21", observed = ["20261025230000", "20261025230100"]): ItsRead {
    const raw = canonical({header: {resultCode: 0, resultMsg: "SUCCESS"}, body: {totalCount: 2,
      items: observed.map((createdDate, i) => ({roadName: "Authored / 자체", linkId: "101000030" + (i + 1),
        startNodeId: "1010000600", endNodeId: "1010006900", speed, travelTime: "10.65", createdDate}))}});
    return {raw, batch: normalizeItsResponse(raw, new Date(clock.value).toISOString(), bounds)};
  }
  const authorities: PublicSpeedAuthority[] = [], feeds: PublicSpeedFeed[] = [];
  async function open() {
    const authority = await PublicSpeedAuthority.open(config); authorities.push(authority);
    const feed = PublicSpeedFeed.open({directory, bounds, mapping, catalog, publisher_id: "publisher", signer, authority,
      collect: async () => {calls++; return collect();}, clock: () => clock.value}); feeds.push(feed);
    return {authority, feed};
  }
  return {clock, read, open, setCollect: (run: typeof collect) => {collect = run;}, calls: () => calls,
    async cleanup() {for (const f of feeds) await f.close(); for (const a of authorities) await a.close(); rmSync(directory, {recursive: true, force: true});}};
}
test("source producer signs original bytes once and exposes original observation time / 발급 원문·한 번 게시·원 관측 시각", async () => {
  const f = await fixture();
  try {
    const {feed} = await f.open(); assert.equal((await feed.select()).metadata.source_state, "UNAVAILABLE");
    await feed.refresh(); const a = await feed.select(), b = await feed.select();
    assert.equal(a.selection.high_water, 1); assert.equal(b.selection.high_water, 1);
    assert.equal(a.selection.active!.jws, b.selection.active!.jws);
    assert.equal(a.metadata.observed_from, "2026-10-25T14:00:00.000Z");
    assert.equal(a.metadata.live_edges, 2); assert.equal(a.metadata.source_state, "CURRENT");
  } finally {await f.cleanup();}
});
test("outage preserves original expiry, then selects remaining entries and baseline / 장애 원기한 유지·부분 만료·기본값", async () => {
  const f = await fixture();
  try {
    const {feed} = await f.open(); await feed.refresh(); const a = await feed.select();
    f.setCollect(async () => {throw Error("Authored outage / 자체 장애");}); await feed.refresh();
    const failed = await feed.select(); assert.equal(failed.metadata.refresh_state, "FAILED");
    assert.equal(failed.selection.active!.manifest.valid_until, a.selection.active!.manifest.valid_until);
    f.clock.value = Date.parse("2026-10-25T14:10:00.000Z");
    const partial = await feed.select(); assert.equal(partial.selection.high_water, 2); assert.equal(partial.metadata.live_edges, 1);
    assert.equal(partial.selection.active!.snapshot.entries[0]!.edge_id, "101");
    f.clock.value += 60000; const expired = await feed.select();
    assert.equal(expired.selection.active, null); assert.equal(expired.selection.high_water, 2); assert.equal(expired.metadata.source_state, "EXPIRED");
  } finally {await f.cleanup();}
});
test("new all-unknown source durably withdraws old positive traffic and duplicate replay cannot restore it / 최신 미확인 자료의 영속 철회·중복 복구 금지", async () => {
  const f = await fixture();
  try {
    const first = await f.open(); await first.feed.refresh(); const old = (await first.feed.select()).selection.active!;
    f.clock.value += 60000; f.setCollect(async () => f.read("0")); await first.feed.refresh();
    const withdrawn = await first.feed.select(); assert.equal(withdrawn.selection.active, null); assert.equal(withdrawn.selection.high_water, 1);
    assert.equal(await first.authority.accept(old.jws, old.artifact), "DUPLICATE");
    assert.equal((await first.authority.inspect()).active, null);
    await first.feed.close(); await first.authority.close();
    const restarted = await f.open(); assert.equal((await restarted.feed.select()).selection.active, null);
    f.clock.value += 60000; f.setCollect(async () => f.read("30")); await restarted.feed.refresh();
    const restored = await restarted.feed.select(); assert.equal(restored.selection.high_water, 2); assert.equal(restored.metadata.live_edges, 2);
  } finally {await f.cleanup();}
});
test("slow refresh coalesces without blocking currently accepted context / 느린 수집 병합·현재 문맥 비차단", async () => {
  const f = await fixture(); let release: (() => void) | undefined;
  try {
    const {feed} = await f.open(); await feed.refresh(); await feed.select();
    f.setCollect(() => new Promise(done => {release = () => done(f.read());}));
    const a = feed.refresh(), b = feed.refresh(); assert.equal(a, b); assert.equal(f.calls(), 2);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const current = await Promise.race([feed.select(), new Promise<never>((_, fail) => {timer = setTimeout(() => fail(Error("Context blocked / 문맥 차단")), 1000);})]);
      assert.equal(current.metadata.source_state, "CURRENT");
    } finally {clearTimeout(timer); release!();}
    await a;
  } finally {release?.(); await f.cleanup();}
});
test("forged normalized payload or older retrieval cannot replace actual cached bytes / 정규화 객체 위조·검색 역행 거부", async () => {
  const f = await fixture();
  try {
    const {feed} = await f.open(); await feed.refresh(); const before = await feed.select();
    f.setCollect(async () => {const r = f.read(); r.batch.observations[0]!.speed_mps = 70; return r;});
    await feed.refresh(); const after = await feed.select(); assert.equal(after.metadata.refresh_state, "FAILED");
    assert.equal(after.selection.active!.manifest.traffic_snapshot_id, before.selection.active!.manifest.traffic_snapshot_id);
  } finally {await f.cleanup();}
});
