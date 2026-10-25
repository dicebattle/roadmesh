import test from "node:test";
import assert from "node:assert/strict";
import { nativeRouteGuidance, validateRouteGuidance, validateRequestedGuidance } from "../tools/guidance.js";
import { nativeRouteRequest } from "../tools/route_contract.js";
import { validateGatewayRequest } from "../tools/gateway_controller.js";
import { validateNodeRequest } from "../tools/node_controller.js";
import { validateTrafficRequest } from "../tools/traffic_runtime.js";
const trip = () => ({ status: 0, language: "ko-KR", units: "kilometers", legs: [{ maneuvers: [
  { type: 1, instruction: "동쪽으로 주행하세요.", length: .1, time: 10, begin_shape_index: 0, end_shape_index: 1, travel_mode: "drive", travel_type: "car", street_names: ["not published"] },
  { type: 4, instruction: "목적지에 도착했습니다.", length: 0, time: 0, begin_shape_index: 1, end_shape_index: 1, travel_mode: "drive", travel_type: "car" },
] }] });
const guidance = () => nativeRouteGuidance(trip(), "ko-KR", 2, 100, 10);
test("native guidance projects only bounded original fields / 엔진 안내 원 필드만 제한 공개", () => {
  assert.equal(guidance().maneuvers[0]!.instruction, "동쪽으로 주행하세요.");
  assert.equal(guidance().maneuvers[0]!.distance_m, 100);
  assert.equal(Object.hasOwn(guidance().maneuvers[0]!, "street_names"), false);
});
test("reject missing locale units mode and oversized native input / 누락·언어·단위·수단·크기 거부", () => {
  for (const mutate of [
    (v:any) => delete v.legs[0].maneuvers,
    (v:any) => v.language = "en-US",
    (v:any) => v.units = "miles",
    (v:any) => v.legs.push(v.legs[0]),
    (v:any) => v.legs[0].maneuvers[0].travel_mode = "pedestrian",
    (v:any) => v.legs[0].maneuvers = Array(513).fill(v.legs[0].maneuvers[0]),
  ]) { const v=trip(); mutate(v); assert.throws(() => nativeRouteGuidance(v,"ko-KR",2,100,10)); }
});
test("reject invalid shape order types text and metrics / 지형 순서·종류·문장·수치 오류 거부", () => {
  for (const mutate of [
    (g:any) => g.maneuvers[0].begin_shape_index = 1,
    (g:any) => g.maneuvers[0].end_shape_index = 2,
    (g:any) => g.maneuvers[1].begin_shape_index = 0,
    (g:any) => g.maneuvers[1].end_shape_index = .5,
    (g:any) => g.maneuvers[1].native_type = 10,
    (g:any) => g.maneuvers[0].native_type = 28,
    (g:any) => g.maneuvers[0].native_type = 100,
    (g:any) => g.maneuvers[0].instruction = "<img src=x onerror=x>",
    (g:any) => g.maneuvers[0].instruction = "bad\u202e text",
    (g:any) => g.maneuvers[0].instruction = " ",
    (g:any) => g.maneuvers[0].instruction = "x".repeat(1025),
    (g:any) => g.maneuvers[0].distance_m = NaN,
    (g:any) => g.maneuvers[0].duration_s = -1,
    (g:any) => g.maneuvers[1].distance_m = 1,
    (g:any) => g.maneuvers[0].duration_s = 20,
    (g:any) => g.maneuvers[0].distance_m = 150,
    (g:any) => g.maneuvers[0].extra = true,
  ]) { const g=guidance(); mutate(g); assert.throws(() => validateRouteGuidance(g,"ko-KR",2,100,10)); }
});
test("native serialization tolerances are explicit and bounded / 직렬화 오차의 명시한 한계", () => {
  const g=guidance(); g.maneuvers[0]!.distance_m=101.5; g.maneuvers[0]!.duration_s=10.0015;
  validateRouteGuidance(g,"ko-KR",2,100,10);
  g.maneuvers[0]!.distance_m=101.501;
  assert.throws(() => validateRouteGuidance(g,"ko-KR",2,100,10));
});
test("all request validators preserve optional locale and legacy native wire / 모든 요청 경계의 언어·기존 전송 호환", () => {
  const graph="a".repeat(64), locations=[{lon:127,lat:37.5},{lon:127.01,lat:37.5}] as [{lon:number;lat:number},{lon:number;lat:number}];
  const publicRequest={schema_version:"0.1",request_id:"locale-unit",origin:{longitude:127,latitude:37.5},destination:{longitude:127.01,latitude:37.5},profile:"car",traffic_policy:"prefer_live"};
  for (const guidance_language of ["en-US","ko-KR"]) {
    validateGatewayRequest({...publicRequest,guidance_language});
    validateNodeRequest({request_id:"locale-unit",graph_id:graph,locations,guidance_language},graph);
    validateTrafficRequest({graph_id:graph,locations,guidance_language} as any,graph);
    assert.equal(nativeRouteRequest({locations,guidance_language} as any).language,guidance_language);
  }
  assert.deepEqual(nativeRouteRequest({locations}), {locations,costing:"auto",units:"kilometers",language:"en-US",date_time:{type:0}});
  for(const value of [undefined,null,"en","ja-JP",42]) {
    assert.throws(()=>validateGatewayRequest({...publicRequest,guidance_language:value}));
    assert.throws(()=>validateNodeRequest({request_id:"locale-unit",graph_id:graph,locations,guidance_language:value},graph));
    assert.throws(()=>validateTrafficRequest({graph_id:graph,locations,guidance_language:value} as any,graph));
  }
});
test("guided request requires same locale and legacy cannot acquire guidance / 요청한 언어 필수·기존 응답에 안내 삽입 거부", () => {
  const r={geometry:{coordinates:[[127,37.5],[127.01,37.5]]},distance_m:100,duration_s:10};
  validateRequestedGuidance(r);
  assert.throws(()=>validateRequestedGuidance(r,"ko-KR"));
  validateRequestedGuidance({...r,guidance:guidance()},"ko-KR");
  assert.throws(()=>validateRequestedGuidance({...r,guidance:guidance()},"en-US"));
  assert.throws(()=>validateRequestedGuidance({...r,guidance:guidance()}));
});
