import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK } from "jose";
import { canonical, sha256 } from "../tools/shared.js";
import { encodeRegionalEnvelope, normalizeRegionalResponse, regionalReceipt } from "../tools/regional_speed_source.js";
import { buildPublicTrafficSnapshot, signPublicTraffic, verifyPublicTraffic, readPublicTrafficArtifact } from "../tools/public_speed_publication.js";
import type { PublicRoadMapping } from "../tools/public_speed_geometry.js";

const at = "2026-10-26T03:21:00.000Z", bounds = [126.7,37.4,127.25,37.75] as const;
const anchor = (v: string, end: string) => "geometry:" + v.repeat(64) + ":" + end;
function mapping(): PublicRoadMapping {
  const entry = (link_id: string, v: string) => ({edge_id:"10", forward:true, link_id,
    start_node_id:anchor(v,"start"),end_node_id:anchor(v,"end"),max_distance_m:1,start_fraction:0.1,end_fraction:0.2});
  const ex = entry("ex:VDS1","b"), gits = entry("gits:2850050A00","a");
  return {schema_version:"kr-directed-mapping-0.2",policy:"kr-regional-envelope-v1",graph_id:"c".repeat(64),
    geometry_sha256:"d".repeat(64),graph_edges_sha256:"e".repeat(64),entries:[ex],excluded:[],regional_alternatives:[ex,gits],
    regional_references:[{link_id:gits.link_id,provider:"kr-gits",source_id:"2850050A00",road_name:"경부고속도로",
      evidence_sha256:"a".repeat(64),start_anchor:gits.start_node_id,end_anchor:gits.end_node_id,
      source_start_name:"양재",source_end_name:"서초",source_length_m:1000},
    {link_id:ex.link_id,provider:"kr-ex",source_id:"VDS1",road_name:"경부선",evidence_sha256:"b".repeat(64),
      start_anchor:ex.start_node_id,end_anchor:ex.end_node_id,route_no:"0010",direction:"S",conzone_id:"CZ1"}]};
}
const gits = {SVC_LINK_ID:"2850050A00",ROUTE_KORNM:"경부고속도로",START_NODE_NM:"양재",END_NODE_NM:"서초",
  LINK_LENGTH:1000,SPD:45,PROC_DATE:Date.parse(at)-60_000};
const ex = {vdsId:"VDS1",routeName:"경부선",routeNo:"0010",updownTypeCode:"S",conzoneId:"CZ1",
  stdDate:"20261026",stdHour:"1217",speed:"80"};
function batch(gs: unknown[] = [gits], es: unknown[] = [ex], clock = at) {
  const raw = encodeRegionalEnvelope([regionalReceipt("kr-gits",canonical(gs),at),
    regionalReceipt("kr-ex",canonical({code:"SUCCESS",count:es.length,list:es}),at)]);
  return normalizeRegionalResponse(raw,clock,bounds,mapping());
}
test("Regional IDs and original clocks remain explicit / 지역 식별·원시각 보존", () => {
  const b = batch();assert.equal(b.provider,"kr-regional");assert.equal(b.schema_version,"public-source-0.2");
  assert.equal(b.observations.find(o => o.link_id.startsWith("gits:"))!.observed_at,"2026-10-26T03:20:00.000Z");
  assert.equal(b.observations.find(o => o.link_id.startsWith("ex:"))!.observed_at,"2026-10-26T03:17:00.000Z");
  assert.ok(b.observations.every(o => o.status === "LIVE" && o.start_node_id.startsWith("geometry:")));
});
test("Unreviewed ID, changed direction or conzone cannot authorize / 미검토·방향·콘존 변경 거부", () => {
  for (const row of [{...ex,vdsId:"other"},{...ex,updownTypeCode:"E"},{...ex,conzoneId:"CZ2"}])
    assert.equal(batch([], [row]).observations[0]!.status,"UNKNOWN");
  assert.equal(batch([{...gits,START_NODE_NM:"서초",END_NODE_NM:"양재"}],[]).observations[0]!.status,"UNKNOWN");
});
test("Missing/future/calendar-invalid original clocks stay invalid / 누락·미래·잘못된 달력 거부", () => {
  for (const row of [{...gits,PROC_DATE:null},{...gits,PROC_DATE:Date.parse(at)+30_001}])
    assert.equal(batch([row],[]).observations[0]!.status,"UNKNOWN");
  assert.equal(batch([],[{...ex,stdDate:"20260230"}]).observations[0]!.observed_at,null);
});
test("Receipt tampering and incomplete EX lists fail / 근거 변조·잘린 목록 거부", () => {
  const r = regionalReceipt("kr-gits",canonical([gits]),at);r.raw_sha256="f".repeat(64);
  assert.throws(() => normalizeRegionalResponse(encodeRegionalEnvelope([r]),at,bounds,mapping()));
  const r2 = regionalReceipt("kr-ex",canonical({code:"SUCCESS",count:2,list:[ex]}),at);
  assert.throws(() => normalizeRegionalResponse(encodeRegionalEnvelope([r2]),at,bounds,mapping()));
});
test("Latest conflict and zero never revive an older positive / 최신 충돌·0 뒤 옛 양수 부활 금지", () => {
  assert.equal(batch([gits,{...gits,SPD:46}],[]).observations[0]!.reason,"CONFLICT");
  const o = batch([{...gits,PROC_DATE:Date.parse(at)-120_000},{...gits,SPD:0}],[]).observations[0]!;
  assert.equal(o.speed_mps,null);assert.equal(o.reason,"INVALID_SPEED");
});
test("Same provider raw receipt cannot be replayed twice / 같은 원문 중복 접수 거부", () => {
  const r = regionalReceipt("kr-gits",canonical([gits]),at);
  assert.throws(() => normalizeRegionalResponse(encodeRegionalEnvelope([r,r]),at,bounds,mapping()));
});
test("Exact original expiry cannot be renewed by retrieval / 조회로 원시각 만료 연장 금지", () => {
  const b = batch([], [ex],"2026-10-26T03:27:00.000Z");
  assert.equal(b.observations[0]!.reason,"EXPIRED");assert.equal(b.observations[0]!.valid_until,"2026-10-26T03:27:00.000Z");
});
test("Verified detector preferred; original expiry falls back to valid service / 검지기 우선·만료 후 서비스 복귀", () => {
  const b = batch(), m = mapping();
  const first = buildPublicTrafficSnapshot(b,m,"regional-test",1,at)!;
  assert.equal(first.entries[0]!.link_id,"ex:VDS1");assert.equal(first.provider,"kr-regional");
  const next = buildPublicTrafficSnapshot(b,m,"regional-test",2,"2026-10-26T03:27:00.000Z")!;
  assert.equal(next.entries[0]!.link_id,"gits:2850050A00");assert.equal(next.entries[0]!.observed_at,"2026-10-26T03:20:00.000Z");
  assert.equal(buildPublicTrafficSnapshot(b,m,"regional-test",3,"2026-10-26T03:30:00.000Z"),null);
});
test("Legacy version cannot smuggle regional identifiers / 기존 버전에 지역 식별자 위장 금지", () => {
  const b = batch(), m = mapping();
  assert.throws(() => buildPublicTrafficSnapshot({...b,schema_version:"public-source-0.1"},m,"regional-test",1,at));
});
test("Signature binds regional alternatives and exact bytes / 서명·지역 대안·원 바이트 결합", async () => {
  const m = mapping(), b = batch(), keys = await generateKeyPair("EdDSA",{extractable:true}),
    private_jwk = await exportJWK(keys.privateKey), public_jwk = await exportJWK(keys.publicKey),
    catalog = [{edge_id:"10",forward:true,distance_m:100}];
  const signed = await signPublicTraffic(buildPublicTrafficSnapshot(b,m,"regional-test",1,at)!,"regional-key",private_jwk,catalog);
  const trust = {kid:"regional-key",public_jwk,publisher_id:"regional-test",graph_id:m.graph_id,
    mapping_sha256:sha256(canonical(m)),valid_from:"2026-10-26T00:00:00.000Z",valid_until:"2026-10-27T00:00:00.000Z",revoked:false};
  assert.equal((await verifyPublicTraffic(signed.jws,signed.artifact,trust,m,catalog,at)).snapshot.entries[0]!.link_id,"ex:VDS1");
  const modified = structuredClone(m);modified.regional_alternatives!.shift();
  await assert.rejects(verifyPublicTraffic(signed.jws,signed.artifact,{...trust,mapping_sha256:sha256(canonical(modified))},modified,catalog,at));
  const legacy = {...signed.snapshot,schema_version:"public-traffic-0.1",provider:"kr-its",policy:"kr-its-v1"};
  assert.throws(() => readPublicTrafficArtifact(signed.manifest,canonical(legacy),catalog));
});
