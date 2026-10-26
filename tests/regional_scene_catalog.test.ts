import test from "node:test";
import assert from "node:assert/strict";
import { deriveScene, regionalLocateRequest } from "../tools/seoul_bundle.js";
function encode(points:number[][]):string {
  let lat=0,lon=0,out="";
  for(const p of points){const y=Math.round(p[1]!*1e6),x=Math.round(p[0]!*1e6);
    for(const diff of [y-lat,x-lon]){let v=diff<0?-2*diff-1:2*diff;while(v>=32){out+=String.fromCharCode(v%32+95);v=Math.floor(v/32);}out+=String.fromCharCode(v+63);}
    lat=y;lon=x;}
  return out;
}
const full=[[127,37.5],[127.001,37.5],[127.002,37.5]],clipped=[[127.0005,37.5],[127.0015,37.5]];
function fixture(points=clipped,forward=true){
  const shape=encode(points),trace={shape,edges:[{id:10,way_id:1,forward:true,begin_shape_index:0,end_shape_index:1}]};
  return {trace,route:{trip:{status:0,legs:[{shape}]}},locate:[{edges:[{edge_id:{value:10},edge_info:{way_id:1,shape:encode(full)},edge:{forward,access:{car:true}}}]}]};
}
const scene={route_id:"regional-one",name_en:"Authored subcurve",name_ko:"자체 부분 곡선",inventory_policy:"regional-native-full-edges-v1"};
test("Partial endpoint uses independently located full native edge / 부분 끝점의 별도 조회 전체 구간 사용",()=>{
  const f=fixture();assert.equal((regionalLocateRequest(f.trace) as {locations:unknown[]}).locations.length,0);
  assert.equal((regionalLocateRequest(f.trace,true) as {locations:unknown[]}).locations.length,1);
  const d=deriveScene(scene,f.route,f.trace,f.locate,"locate.json");assert.deepEqual(d.edges[0]!.directed_geometry,full);
});
test("Legacy interior-only contract is unchanged / 기존 내부 구간 전용 규칙 유지",()=>{
  const f=fixture();assert.throws(()=>deriveScene({...scene,inventory_policy:undefined},f.route,f.trace,f.locate,"locate.json"));
});
test("Wrong native direction or displaced subcurve is refused / 다른 방향·벗어난 부분 곡선 거부",()=>{
  const f=fixture(clipped,false);assert.throws(()=>deriveScene(scene,f.route,f.trace,f.locate,"locate.json"));
  const displaced=fixture(clipped.map(p=>[p[0]!,p[1]!+.0001]));
  assert.throws(()=>deriveScene(scene,displaced.route,displaced.trace,displaced.locate,"locate.json"));
});
test("Backtracking subcurve cannot authorize a forward full edge / 역행 부분 곡선으로 정방향 구간 승인 금지",()=>{
  const f=fixture([...clipped].reverse());assert.throws(()=>deriveScene(scene,f.route,f.trace,f.locate,"locate.json"));
});
