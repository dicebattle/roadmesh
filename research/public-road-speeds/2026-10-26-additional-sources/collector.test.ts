import test from'node:test';
import assert from'node:assert/strict';
import{publicUrl,jsonRows,normalize,uticRows,uticRoads}from'./collector.js';
const at='2026-10-26T03:00:00.000Z',sha='a'.repeat(64);
test('Refuse non-HTTPS and unknown hosts / 비HTTPS·다른 호스트 거부',()=>{
  for(const u of ['http://gits.gg.go.kr/','https://attacker.example/','https://gits.gg.go.kr.attacker.example/','https://user:pass@gits.gg.go.kr/','https://gits.gg.go.kr:8443/']) assert.throws(()=>publicUrl(u));
});
test('Refuse credential parameters including encoded names / 인코딩한 이름을 포함해 키 전달 거부',()=>{
  for(const q of ['serviceKey=private','%61piKey=private','token=private'])assert.throws(()=>publicUrl('https://gits.gg.go.kr/?'+q));
  assert.equal(publicUrl('https://gits.gg.go.kr/?API=V_API2_SPD_API&ROUTE_ID=1010000011').hostname,'gits.gg.go.kr');
});
test('HTTP200 HTML and error objects are not numeric rows / HTML·오류 객체는 수치 성공 아님',()=>{
  for(const v of ['<html>blocked</html>','{"error":"denied"}','null','[null]','[1]','{"rows":{}}'])assert.throws(()=>jsonRows(Buffer.from(v),'rows'));
  assert.deepEqual(jsonRows(Buffer.from('{"rows":[]}'),'rows'),[]);
});
test('Retain agency identity but never grant routing authority / 기관 식별 유지·경로 승인 미부여',()=>{
  const [o]=normalize('gyeonggi-website',[{SVC_LINK_ID:'2850050A00',ROUTE_KORNM:'경부고속도로',ROUTE_WAY:'1',SPD:90,PROC_DATE:Date.parse(at)}],at,sha);
  assert.equal(o!.record_id,'2850050A00');assert.equal(o!.source_class,'PUBLIC_AGENCY');assert.equal(o!.routing_eligible,false);assert.equal(o!.speed_kph,90);
});
test('Gyeonggi epoch time is preserved, not retrieval time / 경기 원 epoch 보존',()=>{
  const observed=Date.parse(at)-90_000;const [o]=normalize('gyeonggi-website',[{SPD:50,PROC_DATE:observed}],at,sha);
  assert.equal(o!.observed_at,new Date(observed).toISOString());assert.equal(o!.freshness,'WITHIN_600S');assert.notEqual(o!.observed_at,o!.retrieved_at);
});
test('Expire at exactly600s and reject excessive future time / 정확한600초 만료·미래 거부',()=>{
  const rows=[{SPD:50,PROC_DATE:Date.parse(at)-600_000},{SPD:50,PROC_DATE:Date.parse(at)+30_001}];
  assert.deepEqual(normalize('gyeonggi-website',rows,at,sha).map(x=>x.freshness),['STALE','INVALID_TIME']);
});
test('Missing observation time stays unknown across providers / 원시각 없으면 미확인 유지',()=>{
  for(const [p,r]of [['seoul-topis-website',{speed:30}],['utic-website',{speed:30}],['daegu-website',{linkSpeed:30}]] as const){
    const [o]=normalize(p,[r],at,sha);assert.equal(o!.observed_at,null);assert.equal(o!.freshness,'UNKNOWN_TIME');
  }
  assert.equal(normalize('gyeonggi-website',[{SPD:30}],at,sha)[0]!.freshness,'INVALID_TIME');
});
test('Zero/null/negative/out-of-range is no speed, not closure /0·누락·범위 밖은 미확인',()=>{
  const values=[0,null,-1,253,'NaN','',Infinity];
  assert.ok(normalize('seoul-topis-website',values.map(speed=>({speed})),at,sha).every(o=>o.speed_kph===null&&o.freshness==='NO_SPEED'));
});
test('UTIC pairs only real link rows, not duplicate terminal nodes / UTIC 끝점 중복 제외',()=>{
  const row="linkid.push('1007063800');\n node.push({dir:'1', x:127.0, y:37.5, name:'한남IC', speed: 31, len: 3735, ttime: 434});";
  const end="node.push({dir:'1', x:127.1, y:37.4, name:'서초IC', speed: 31, len: 3735, ttime: 434});";
  const a=uticRows(row+end,'경부고속도로');assert.equal(a.length,1);assert.equal(a[0]!.id,'1007063800');
  assert.equal(normalize('utic-website',a,at,sha)[0]!.freshness,'UNKNOWN_TIME');
});
test('UTIC unsupported executable fields are refused without execution / 실행 문법 거부·코드 미실행',()=>{
  const s="linkid.push('1'); node.push({dir:'1', x:127, y:37, name:'a', speed: process.exit(99), len: 1, ttime: 1});";
  assert.throws(()=>uticRows(s,'a'));assert.equal(uticRows('<script>throw Error()</script>','a').length,0);
});
test('UTIC public catalogue is parsed as literals only / UTIC 목록 리터럴만 해석',()=>{
  const s=`<a href="javascript:onClickRoadName('','','','경부고속도로','101','');">road</a>`;
  assert.deepEqual(uticRoads(s),[{name:'경부고속도로',rank:'101'}]);assert.deepEqual(uticRoads('<script>throw Error()</script>'),[]);
});
test('Malformed UTF8 and provenance are refused / 잘못된UTF8·근거 거부',()=>{
  assert.throws(()=>jsonRows(Uint8Array.from([0xff,0xff])));
  assert.throws(()=>normalize('utic-website',[],at,'not-a-hash'));
  assert.throws(()=>normalize('utic-website',[],'invalid',sha));
});
