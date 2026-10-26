import test from'node:test';import assert from'node:assert/strict';import{koreanMinute,parseExDocument}from'./ex-document.js';
const row={stdDate:'20261026',stdHour:'1217',vdsId:'0010VDE00100',speed:'83',conzoneId:'0010CZE010'},at='2026-10-26T03:21:00.000Z';
const doc=(list:unknown[],count=list.length)=>Buffer.from(JSON.stringify({code:'SUCCESS',count,list}));
test('Korean minute conversion and invalid calendar / 한국 분 단위·잘못된 달력',()=>{
 assert.equal(koreanMinute('20261026','1217'),'2026-10-26T03:17:00.000Z');
 assert.equal(koreanMinute('20260230','1217'),null);assert.equal(koreanMinute('20261026','2460'),null);
});
test('Do not count demo error or truncated result as data / 예제 오류·잘림 거부',()=>{
 assert.throws(()=>parseExDocument(Buffer.from('{"code":"ERROR","count":0,"list":[]}'),at));
 assert.throws(()=>parseExDocument(doc([row],2),at));assert.throws(()=>parseExDocument(Buffer.from('{"list":['),at));
});
test('Retain detector identity, original time and public demo label / 검지기·원시각·공개 시험키 구분',()=>{
 const o=parseExDocument(doc([row]),at).observations[0]!;assert.equal(o.vds_id,row.vdsId);assert.equal(o.conzone_id,row.conzoneId);
 assert.equal(o.observed_at,'2026-10-26T03:17:00.000Z');assert.equal(o.credential_kind,'OFFICIAL_PUBLIC_TEST_KEY');assert.equal(o.routing_eligible,false);
});
test('Negative sentinel and missing/old time never become current / 음수 표식·누락·과거 시각 미확인',()=>{
 const a=parseExDocument(doc([{...row,speed:'-1'},{...row,stdHour:'1000'},{...row,stdHour:''}]),at).observations;
 assert.deepEqual(a.map(x=>x.freshness),['NO_SPEED','STALE','INVALID_TIME']);assert.equal(a[0]!.speed_kph,null);
});
