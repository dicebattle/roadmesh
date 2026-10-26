import test from "node:test";
import assert from "node:assert/strict";
import { parseGitsWfs, reviewGitsWms, mapRegionalRoads, parseVdsInstallations, type GitsCurve, type VdsInstallation } from "../tools/regional_speed_geometry.js";
import { geodesicSphere } from "../tools/geodesy.js";
import type { EdgeMapping } from "../tools/graph_evidence.js";
const line = [[127,37.5],[127.01,37.5]], length = geodesicSphere.length(line);
const curve = (): GitsCurve => ({source_id:"G1",road_name:"경부고속도로",start_name:"A",end_name:"B",source_length_m:length,
  coordinates:structuredClone(line),wfs_sha256:"a".repeat(64),wms_sha256:"b".repeat(64),coordinate_policy:"reviewed-degree-tuples-despite-epsg5181-label-v1"});
const edge = (): EdgeMapping => ({label:"east",edge_id:"10",osm_way_id:1,forward:true,engine_forward:true,car_access:true,
  source_geometry:structuredClone(line),directed_geometry:structuredClone(line),evidence_path:"locate.json"});
function wfs(extra = "") {return Buffer.from(`<wfs:FeatureCollection xmlns:gml="http://www.opengis.net/gml"><gml:featureMember><ms:ATTRLV10>
<ms:LINK_ID>G1</ms:LINK_ID><ms:ROUTE_KORNM>경부고속도로</ms:ROUTE_KORNM><ms:START_NODE_NM>A</ms:START_NODE_NM><ms:END_NODE_NM>B</ms:END_NODE_NM><ms:LINK_LENGTH>${length}</ms:LINK_LENGTH>
<gml:LineString srsName="EPSG:5181"><gml:posList srsDimension="2">37.5 127 37.5 127.01</gml:posList></gml:LineString>${extra}
</ms:ATTRLV10></gml:featureMember></wfs:FeatureCollection>`);}
function wms(points = "127,37.5 127.01,37.5") {return Buffer.from(`<msGMLOutput><ATTRLV10_feature><LINK_ID>G1</LINK_ID><ROUTE_KORNM>경부고속도로</ROUTE_KORNM><START_NODE_NM>A</START_NODE_NM><END_NODE_NM>B</END_NODE_NM><LINK_LENGTH>${length}</LINK_LENGTH><gml:LineString srsName="EPSG:5181"><gml:coordinates>${points}</gml:coordinates></gml:LineString></ATTRLV10_feature></msGMLOutput>`);}
function detectors(): VdsInstallation[] {return [-1,0,1].map((i) => ({source_id:"V"+(i+1),route_no:"0010",road_name:"경부선",direction:"E",conzone_id:"CZ",
  position:[127.005+i*0.01,37.5],shift_m:1000+i*500,zone_start_m:0,zone_end_m:2000,zone_length_m:2000,
  original_sha256:"c".repeat(64),projection_policy:"scope-reviewed-grs80-central-2010-v1"}));}
test("WFS tuple interpretation needs WMS review / WFS 도 단위 해석은 WMS 검토 필요", () => {
  const c=parseGitsWfs(wfs(),1).curves[0]!;assert.deepEqual(c.coordinates,line);assert.equal(c.wms_sha256,null);
  assert.equal(mapRegionalRoads("a".repeat(64),[edge()],[c],[]).entries.length,0);
  assert.equal(mapRegionalRoads("a".repeat(64),[edge()],[reviewGitsWms(c,wms())],[]).entries.length,1);
});
test("Count truncation and XML entities refused / 개수 잘림·XML 엔터티 거부", () => {
  assert.throws(()=>parseGitsWfs(wfs(),2));assert.throws(()=>parseGitsWfs(Buffer.from('<!DOCTYPE x>'+wfs().toString()),1));
});
test("Multipart curve is explicitly excluded, never chosen partly / 다중 곡선을 일부 선택하지 않고 명시 제외", () => {
  const p=parseGitsWfs(wfs('<gml:posList srsDimension="2">37.5 127 37.5 127.01</gml:posList>'),1);
  assert.equal(p.curves.length,0);assert.deepEqual(p.excluded,[{source_id:"G1",reason:"UNSUPPORTED_GEOMETRY"}]);assert.equal(p.raw_feature_count,1);
});
test("Reversed or displaced WMS cannot corroborate / 역방향·다른 WMS 지형 거부", () => {
  const c=parseGitsWfs(wfs(),1).curves[0]!;
  assert.throws(()=>reviewGitsWms(c,wms("127.01,37.5 127,37.5")));
  assert.throws(()=>reviewGitsWms(c,wms("127,37.501 127.01,37.501")));
});
test("Complete directed edge and ambiguity retain existing tolerance / 전체 방향·모호함에 기존 기준 유지", () => {
  const e=edge();e.directed_geometry.reverse();assert.equal(mapRegionalRoads("a".repeat(64),[e],[curve()],[]).entries.length,0);
  const duplicate={...curve(),source_id:"G2"};assert.equal(mapRegionalRoads("a".repeat(64),[edge()],[curve(),duplicate],[]).entries.length,0);
});
test("Detector only supports its containing edge and verified direction / 검지점 포함 구간·확인 방향만 지원", () => {
  const m=mapRegionalRoads("a".repeat(64),[edge()],[curve()],detectors());
  assert.equal(m.entries[0]!.link_id,"ex:V1");assert.equal(m.regional_alternatives!.length,2);
  const reversed=detectors().map(v=>({...v,direction:"S" as const}));
  assert.ok(mapRegionalRoads("a".repeat(64),[edge()],[curve()],reversed).regional_alternatives!.every(a=>a.link_id.startsWith("gits:")));
});
test("Edge outside detector zone cannot inherit point speed / 담당 범위 밖 구간에 점 속도 확산 금지", () => {
  const d=detectors();d[1]={...d[1]!,zone_start_m:990,zone_end_m:1010,zone_length_m:20};
  assert.ok(mapRegionalRoads("a".repeat(64),[edge()],[curve()],d).regional_alternatives!.every(a=>a.link_id.startsWith("gits:")));
});
test("Multiple detectors on one edge need a real aggregation policy / 같은 구간 여러 검지기 임의 평균 금지", () => {
  const d=detectors();d.push({...d[1]!,source_id:"other",position:[127.006,37.5],shift_m:1050});
  const m=mapRegionalRoads("a".repeat(64),[edge()],[curve()],d);
  assert.ok(m.regional_alternatives!.every(a=>a.link_id.startsWith("gits:")));
});
test("Reverse chainage is directional, not a negative-length zone / 감소 이정의 반대 방향 구간 보존", () => {
  const row={vdsId:"TEST-S",routeNo:"0010",routeName:"경부선",directionCode:"S",czId:"CZ",shift:"1.40km",
    equipmentBelongingCode:"00",roadgradeCode:"101",
    vdsStartShift:"2.02km",vdsEndShift:"0.20km",vdsLength:"1820.00m",grs80x:"391265.168637",grs80y:"297630.018235"};
  const raw=Buffer.from(JSON.stringify({code:"SUCCESS",count:1,pageNo:1,numOfRows:99,pageSize:1,list:[row]}));
  const parsed=parseVdsInstallations([raw]);assert.equal(parsed.length,1);assert.equal(parsed[0]!.direction,"S");
  assert.equal(parsed[0]!.zone_start_m,200);assert.equal(parsed[0]!.zone_end_m,2020);
  assert.throws(()=>parseVdsInstallations([]));
});
