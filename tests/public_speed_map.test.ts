import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {canonical} from "../tools/shared.js";
import {geodesicSphere} from "../tools/geodesy.js";
import {normalizeItsResponse} from "../tools/public_speed_source.js";
import {collectProviderMapGeometry, verifyProviderMapPair} from "../tools/public_speed_map.js";
import {mapPublicRoads} from "../tools/public_speed_geometry.js";
import type {EdgeMapping} from "../tools/graph_evidence.js";

const bounds = [126.98,37.46,127.1,37.56] as const, coordinates = [[127,37.5],[127.001,37.5]];
const batch = normalizeItsResponse(canonical({header:{resultCode:0,resultMsg:"SUCCESS"},body:{totalCount:1,items:[{
  linkId:"1010000001",startNodeId:"1010000010",endNodeId:"1010000020",roadName:"Authored / 자체",speed:"30",travelTime:"10",createdDate:"20261025230000"}]}}),
  "2026-10-25T14:01:00.000Z",bounds);
function fixture() {
  const standard = {type:"FeatureCollection",crs:{properties:{name:"urn:ogc:def:crs:EPSG::4326"}},features:[{
    type:"Feature",id:"T_COB_MOCT_LINK_M.1010000001",properties:{F_NODE:"1010000010",T_NODE:"1010000020",ROAD_NAME:"Authored / 자체",
      ROAD_RANK:"104",ROAD_TYPE:"000",MULTI_LINK:"0",ROAD_USE:"0",LENGTH:geodesicSphere.length(coordinates)},
    geometry:{type:"LineString",coordinates}}]};
  const display={type:"FeatureCollection",crs:standard.crs,features:[{type:"Feature",properties:{link_id:"1010000001",road_name:"Authored / 자체"},
    geometry:{type:"MultiLineString",coordinates:[coordinates]}}]};
  return {standard:structuredClone(standard),display:structuredClone(display)};
}
const edge: EdgeMapping={label:"authored",osm_way_id:1,edge_id:"100",forward:true,engine_forward:true,car_access:true,
  source_geometry:coordinates,directed_geometry:coordinates,evidence_path:"fixture"};
test("two official layers must agree on exact link, nodes, road and ordered whole curve / 두 공식 레이어 식별·방향·전체 곡선",()=>{
  const {standard,display}=fixture(); const v=verifyProviderMapPair(canonical(standard),canonical(display),batch);
  assert.equal(v.links.length,1);assert.equal(v.links[0]!.start_node_id,batch.observations[0]!.start_node_id);assert.deepEqual(v.exclusions,[]);
  assert.equal(v.links[0]!.updated_date,"");
});
test("reversed, shifted, extended and duplicate map features never establish compatibility / 역방향·오프셋·확장·중복 거부",()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.display.features[0]!.geometry.coordinates[0]!.reverse();},
    (f:ReturnType<typeof fixture>)=>{f.display.features[0]!.geometry.coordinates[0]![0]![1]!+=0.001;},
    (f:ReturnType<typeof fixture>)=>{f.display.features[0]!.geometry.coordinates[0]!.push([127.002,37.5]);},
    (f:ReturnType<typeof fixture>)=>{f.standard.features.push(f.standard.features[0]!);},
    (f:ReturnType<typeof fixture>)=>{f.display.features.push(f.display.features[0]!);},
  ]) {const f=fixture();mutate(f);assert.equal(verifyProviderMapPair(canonical(f.standard),canonical(f.display),batch).links.length,0);}
});
test("different nodes, a reused ID, unsupported merged roads and declared-length mismatch are excluded / 노드·재사용 식별·다중 링크·길이 차이 거부",()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.standard.features[0]!.properties.F_NODE="1010000099";},
    (f:ReturnType<typeof fixture>)=>{f.display.features[0]!.properties.road_name="Other / 다른 길";},
    (f:ReturnType<typeof fixture>)=>{f.standard.features[0]!.properties.MULTI_LINK="1";},
    (f:ReturnType<typeof fixture>)=>{f.standard.features[0]!.properties.LENGTH=999;},
    (f:ReturnType<typeof fixture>)=>{f.standard.features[0]!.geometry.coordinates[0]![0]=126;},
  ]) {const f=fixture();mutate(f);assert.equal(verifyProviderMapPair(canonical(f.standard),canonical(f.display),batch).links.length,0);}
});
test("wrong CRS, unknown feature identity and full result limit fail closed / 좌표계·식별 오류·결과 한도 거부",()=>{
  const f=fixture();f.standard.crs.properties.name="EPSG:3857";
  assert.throws(()=>verifyProviderMapPair(canonical(f.standard),canonical(f.display),batch),/INVALID_OR_TRUNCATED/);
  const unknown=fixture();unknown.standard.features[0]!.id="other.1010000001";
  assert.throws(()=>verifyProviderMapPair(canonical(unknown.standard),canonical(unknown.display),batch),/INVALID_PROVIDER_FEATURE_ID/);
  const truncated=fixture();truncated.display.features=Array(20).fill(truncated.display.features[0]);
  assert.throws(()=>verifyProviderMapPair(canonical(truncated.standard),canonical(truncated.display),batch),/INVALID_OR_TRUNCATED/);
});
test("bounded read preserves originals, uses fixed endpoint and binds mapping to actual graph edges / 제한 조회·원문·고정 주소·지도 원문 연결",async()=>{
  const root=mkdtempSync(join(tmpdir(),"routelens-provider-map-")); const {standard,display}=fixture(); const urls:string[]=[];
  try {
    const geometry=await collectProviderMapGeometry([edge,{...edge,edge_id:"101",forward:false,engine_forward:false,directed_geometry:[...coordinates].reverse()}],batch,join(root,"capture"),{
      clock:()=>Date.parse(batch.retrieved_at), fetch:async(input,options)=>{const u=new URL(String(input));urls.push(u.href);
        assert.equal(u.origin,"https://its.go.kr:9443");assert.equal(u.searchParams.get("feature_count"),"20");assert.equal(options?.redirect,"error");
        return new Response(canonical(u.searchParams.get("layers")?.includes("T_COB")?standard:display).toString("utf8"),{status:200});}});
    assert.equal(urls.length,2); assert.equal(geometry.requested_points,1); assert.equal(geometry.links.length,1); assert.equal(geometry.failed_requests,0);
    assert.equal(readFileSync(join(root,"capture/001.json")).equals(canonical(standard)),true);
    const edges=[edge,{...edge,edge_id:"101",forward:false,engine_forward:false,directed_geometry:[...coordinates].reverse()}];
    const mapping=mapPublicRoads("a".repeat(64),edges,geometry); assert.equal(mapping.entries.length,1);assert.equal(mapping.excluded.length,1);
    assert.throws(()=>mapPublicRoads("a".repeat(64),[edge],geometry),/PROVIDER_GEOMETRY_SCOPE/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test("provider HTTP failure and oversized bodies are counted without accepting shapes / 기관 HTTP 장애·본문 한도에서 지형 사용 금지",async()=>{
  const root=mkdtempSync(join(tmpdir(),"routelens-provider-map-"));
  try {for(const [name,response] of [["http",new Response("no",{status:503})],["body",new Response(new Uint8Array(1024*1024+1))]] as const){
    const g=await collectProviderMapGeometry([edge],batch,join(root,name),{fetch:async()=>response});
    assert.equal(g.failed_requests,1);assert.equal(g.links.length,0);
  }} finally {rmSync(root,{recursive:true,force:true});}
});
