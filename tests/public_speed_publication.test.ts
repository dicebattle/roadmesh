import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, CompactSign, importJWK } from "jose";
import { canonical, sha256 } from "../tools/shared.js";
import { normalizeItsResponse } from "../tools/public_speed_source.js";
import { buildPublicTrafficSnapshot, signPublicTraffic, verifyPublicTraffic, readPublicTrafficArtifact,
  publicTrafficManifest, type PublicTrafficSnapshot, type PublicTrafficTrust } from "../tools/public_speed_publication.js";
import type { PublicRoadMapping } from "../tools/public_speed_geometry.js";

const now = "2026-10-25T14:01:10.000Z", catalog = [{edge_id: "100", forward: true, distance_m: 75},
  {edge_id: "101", forward: false, distance_m: 50}];
const mapping: PublicRoadMapping = {schema_version: "kr-directed-mapping-0.1", policy: "kr-directed-envelope-v1",
  graph_id: "a".repeat(64), geometry_sha256: "b".repeat(64), graph_edges_sha256: "c".repeat(64),
  entries: [{edge_id: "100", forward: true, link_id: "1010000301", start_node_id: "1010000600", end_node_id: "1010006900",
    max_distance_m: 1, start_fraction: 0.1, end_fraction: 0.9}], excluded: [{edge_id: "101", reason: "NO_MATCH"}]};
const row = {roadName: "Authored wire / 자체 필드", linkId: "1010000301", startNodeId: "1010000600",
  endNodeId: "1010006900", speed: "21", travelTime: "10.65", createdDate: "20261025230000"};
const batch = (rows: unknown[] = [row]) => normalizeItsResponse(canonical({header: {resultCode: 0, resultMsg: "SUCCESS"},
  body: {totalCount: rows.length, items: rows}}), now, [126.98, 37.46, 127.10, 37.56]);
function snapshot() { return buildPublicTrafficSnapshot(batch(), mapping, "publisher", 1, now)!; }
async function fixture() {
  const keys = await generateKeyPair("EdDSA", {crv: "Ed25519", extractable: true});
  const private_jwk = await exportJWK(keys.privateKey), public_jwk = await exportJWK(keys.publicKey);
  const trust: PublicTrafficTrust = {kid: "key", public_jwk, publisher_id: "publisher", graph_id: mapping.graph_id,
    mapping_sha256: sha256(canonical(mapping)), valid_from: "2026-10-25T00:00:00.000Z",
    valid_until: "2026-10-26T00:00:00.000Z", revoked: false};
  const publication = await signPublicTraffic(snapshot(), "key", private_jwk, catalog);
  return {trust, private_jwk, publication};
}
test("agency artifact has original expiry and full graph denominator without contributors / 공공 원시각 만료·전체 분모·제보 수 없음", () => {
  const s = snapshot();
  assert.equal(s.source_class, "PUBLIC_AGENCY");
  assert.equal(s.entries[0]!.observed_at, "2026-10-25T14:00:00.000Z");
  assert.equal(s.valid_until, "2026-10-25T14:10:00.000Z");
  assert.deepEqual(s.coverage, {graph_edges: 2, mapped_edges: 1, unmapped_edges: 1, live_edges: 1,
    missing_observations: 0, expired_observations: 0, invalid_observations: 0, node_mismatches: 0});
  assert.equal(JSON.stringify(s).includes("contributor"), false);
  const later = buildPublicTrafficSnapshot(batch(), mapping, "publisher", 2, "2026-10-25T14:09:59.999Z")!;
  assert.equal(later.valid_until, s.valid_until);
  assert.equal(buildPublicTrafficSnapshot(batch(), mapping, "publisher", 3, s.valid_until), null);
});
test("missing, invalid and mismatched nodes never acquire a public engine speed / 누락·오류·다른 노드 속도 적용 금지", () => {
  for (const b of [batch([]), batch([{...row, speed: "0"}]), batch([{...row, startNodeId: "1010000601"}])])
    assert.equal(buildPublicTrafficSnapshot(b, mapping, "publisher", 1, now), null);
  assert.throws(() => buildPublicTrafficSnapshot(batch(), mapping, "publisher", 0, now), /INVALID_SOURCE_BINDING/);
  assert.throws(() => buildPublicTrafficSnapshot(batch(), mapping, "publisher", 1, "2026-10-25T14:00:00.000Z"), /INVALID_SOURCE_BINDING/);
});
test("signed public bytes verify with explicit provider/graph/mapping scope / 기관·지도·대응표 범위의 서명 검증", async () => {
  const {trust, publication: p} = await fixture();
  const verified = await verifyPublicTraffic(p.jws, p.artifact, trust, mapping, catalog, now);
  assert.deepEqual(verified.snapshot, p.snapshot);
  assert.equal(verified.kind, "PUBLIC_AGENCY");
  assert.equal(verified.kid, "key");
  assert.equal(verified.manifest.traffic_snapshot_id, sha256(p.artifact));
});
test("signature, bytes, root revocation, mapping and real-time expiry are enforced / 서명·바이트·철회·대응·실제 시각 만료", async () => {
  const {trust, publication: p} = await fixture();
  const cases: Array<[string, Uint8Array, PublicTrafficTrust, PublicRoadMapping, string]> = [
    [p.jws.slice(0, -5) + "abcde", p.artifact, trust, mapping, now],
    [p.jws, canonical({...p.snapshot, source_class: "SYNTHETIC"}), trust, mapping, now],
    [p.jws, p.artifact, {...trust, revoked: true}, mapping, now],
    [p.jws, p.artifact, {...trust, publisher_id: "other"}, mapping, now],
    [p.jws, p.artifact, {...trust, graph_id: "d".repeat(64)}, mapping, now],
    [p.jws, p.artifact, trust, {...mapping, geometry_sha256: "e".repeat(64)}, now],
    [p.jws, p.artifact, trust, mapping, p.snapshot.valid_until],
    [p.jws, p.artifact, trust, mapping, "2026-10-25T14:01:09.999Z"],
  ];
  for (const [jws, artifact, root, map, at] of cases)
    await assert.rejects(verifyPublicTraffic(jws, artifact, root, map, catalog, at));
});
test("valid signature cannot authorize another link or direction / 올바른 서명이어도 다른 링크·방향 승인 금지", async () => {
  const {trust, private_jwk, publication: p} = await fixture();
  const wrong = {...p.snapshot, entries: [{...p.snapshot.entries[0]!, link_id: "1010000302"}]};
  const signed = await signPublicTraffic(wrong, "key", private_jwk, catalog);
  await assert.rejects(verifyPublicTraffic(signed.jws, signed.artifact, trust, mapping, catalog, now), /PUBLIC_MAPPING_MISMATCH/);
  const reverse = {...p.snapshot, entries: [{...p.snapshot.entries[0]!, forward: false}]};
  await assert.rejects(signPublicTraffic(reverse, "key", private_jwk, catalog), /INVALID_PUBLIC_ENTRY/);
});
test("canonical compiler gate rejects forged lifetimes, extra fields, coverage and speed / 변환 경계 수명·필드·적용률·속도 위조 거부", () => {
  const s = snapshot();
  const corrupt: unknown[] = [
    {...s, entries: [{...s.entries[0], valid_until: "2026-10-25T14:11:00.000Z"}]},
    {...s, valid_until: "2026-10-25T14:11:00.000Z"},
    {...s, coverage: {...s.coverage, unmapped_edges: 0}},
    {...s, entries: [{...s.entries[0], speed_mps: 0}]},
    {...s, entries: [{...s.entries[0], source_class: "SYNTHETIC"}]},
    {...s, sequence: -1}, {...s, policy: "seoul-window-median-v1"},
  ];
  for (const v of corrupt) {
    const bytes = canonical(v);
    assert.throws(() => readPublicTrafficArtifact(publicTrafficManifest(v as PublicTrafficSnapshot, bytes), bytes, catalog));
  }
  const bytes = Buffer.from(JSON.stringify(s, null, 2));
  assert.throws(() => readPublicTrafficArtifact(publicTrafficManifest(s, bytes), bytes, catalog), /NONCANONICAL_PUBLIC_ARTIFACT/);
});
test("noncanonical or extended JWS headers cannot broaden authority / 서명 헤더 확장으로 승인 확대 금지", async () => {
  const {trust, private_jwk, publication: p} = await fixture();
  const jws = await new CompactSign(canonical(p.manifest)).setProtectedHeader({alg: "EdDSA", kid: "key",
    typ: "routelens-public-traffic+jws", extra: true}).sign(await importJWK(private_jwk, "EdDSA"));
  await assert.rejects(verifyPublicTraffic(jws, p.artifact, trust, mapping, catalog, now), /PUBLIC_SIGNATURE_HEADER/);
});
