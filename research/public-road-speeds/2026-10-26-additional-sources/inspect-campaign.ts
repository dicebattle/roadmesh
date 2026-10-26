/** Original-byte recount independent of collector normalization.
 * 수집 정규화 함수를 재사용하지 않고 원문 바이트를 직접 다시 검사합니다. */
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Usage: inspect-campaign ROOT OUTPUT / 원문·출력 필요');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
type R=Record<string,unknown>;const summaries:Record<string,unknown>[]=[];
let hashes=0,rowsChecked=0;const originals:{path:string;bytes:number;sha256:string}[]=[];
for(const source of ['topis','gyeonggi','utic','daegu']){
 const dir=path.join(root,'campaign01',source),files=fs.readdirSync(dir),campaign=JSON.parse(fs.readFileSync(path.join(dir,'campaign.json'),'utf8'));
 const normalized=files.filter(n=>n.endsWith('.normalized.json'));let rows=0,positive=0,missingId=0,empty=0;const identities=new Set<string>(),roadNames=new Set<string>(),freshness:Record<string,number>={},perRoad=new Map<string,number>();const observedTimes:string[]=[];const errors:unknown[]=[];
 for(const name of files.filter(n=>n.endsWith('.receipt.json'))){const receipt=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));const bodyPath=path.join(dir,receipt.id+'.body');if(receipt.bytes){const raw=fs.readFileSync(bodyPath);assert.equal(raw.length,receipt.bytes);assert.equal(sha(raw),receipt.sha256);hashes++;}if(receipt.status!==200||receipt.result!=='RECEIVED')errors.push({id:receipt.id,status:receipt.status,result:receipt.result});}
 for(const name of normalized){const base=name.replace('.normalized.json',''),raw=fs.readFileSync(path.join(dir,base+'.body')),receipt=JSON.parse(fs.readFileSync(path.join(dir,base+'.receipt.json'),'utf8')),n=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')) as R[];
  assert.equal(receipt.status,200);assert.equal(receipt.result,'RECEIVED');let original:R[]=[];
  if(source==='utic'){
   const text=raw.toString();const starts=[...text.matchAll(/linkid\.push\('([0-9A-Za-z_-]+)'\);/g)];
   for(let i=0;i<starts.length;i++){const start=starts[i]!,next=starts[i+1]?.index??text.length;const block=text.slice(start.index!+start[0].length,next);const match=block.match(/node\.push\(\{dir:'([01])',[\s\S]*?speed:\s*(null|[\d.]+),\s*len:/);assert.ok(match,'UTIC unsupported source data');original.push({id:start[1],dir:match[1],speed:match[2]==='null'?null:Number(match[2])});}
  }else{const p=JSON.parse(raw.toString());original=(source==='gyeonggi'?p:source==='topis'?p.rows:p.result) as R[];}
  assert.equal(n.length,original.length);if(!n.length)empty++;
  for(let i=0;i<n.length;i++){const a=n[i]!,r=original[i]!;assert.equal(a.routing_eligible,false);assert.equal(a.source_class,'PUBLIC_AGENCY');assert.equal(a.raw_response_sha256,receipt.sha256);assert.equal(a.retrieved_at,receipt.retrieved_at);
   const v=source==='gyeonggi'?r.SPD:source==='daegu'?r.linkSpeed:r.speed;
   const num=typeof v==='number'?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;
   assert.equal(a.speed_kph,Number.isFinite(num)&&num>0&&num<=252?num:null);
   const id=String(source==='gyeonggi'?r.SVC_LINK_ID:source==='topis'?r.linkId:source==='utic'?r.id:r.dsrcLinkSn);
   assert.equal(a.record_id,id==='undefined'?'':id);
   if(source==='gyeonggi'){
    const epoch=typeof r.PROC_DATE==='number'?r.PROC_DATE:Number(r.PROC_DATE),time=Number.isSafeInteger(epoch)&&epoch>=946684800000&&epoch<=4102444800000?new Date(epoch).toISOString():null;assert.equal(a.observed_at,time);
    const age=time?Date.parse(receipt.retrieved_at)-epoch:null;assert.equal(a.freshness,a.speed_kph===null?'NO_SPEED':!time||age!< -30_000?'INVALID_TIME':age!>=600_000?'STALE':'WITHIN_600S');
   }else{assert.equal(a.observed_at,null);assert.equal(a.freshness,a.speed_kph===null?'NO_SPEED':'UNKNOWN_TIME');}
   if(a.observed_at)observedTimes.push(String(a.observed_at));
   rows++;rowsChecked++;if(a.speed_kph!==null)positive++;if(!a.record_id)missingId++;identities.add(String(a.record_id)+'|'+a.direction);roadNames.add(String(a.road_name));perRoad.set(String(a.road_name),(perRoad.get(String(a.road_name))??0)+1);freshness[String(a.freshness)]=(freshness[String(a.freshness)]??0)+1;
  }
 }
 assert.equal(normalized.length,campaign.planned-campaign.skipped-errors.filter((e:any)=>e.id!=='road-list'&&e.id!=='highway-list').length);
 summaries.push({source,planned_details:campaign.planned,skipped:campaign.skipped,detail_responses_normalized:normalized.length,empty_details:empty,errors,rows,positive_speed_rows:positive,distinct_source_id_direction_pairs:identities.size,missing_record_ids:missingId,distinct_road_names:roadNames.size,freshness_at_retrieval:freshness,original_observed_min:observedTimes.sort()[0]??null,original_observed_max:observedTimes.at(-1)??null,road_row_counts:[...perRoad].sort((a,b)=>b[1]-a[1]).map(([road_name,count])=>({road_name,count}))});
}
const exRaw=fs.readFileSync(path.join(root,'ex-browser-document.json')),ex=JSON.parse(exRaw.toString()),exReceipt=JSON.parse(fs.readFileSync(path.join(root,'ex-browser-document.receipt.json'),'utf8')),exNorm=JSON.parse(fs.readFileSync(path.join(root,'ex-normalized.json'),'utf8'));
assert.equal(ex.code,'SUCCESS');assert.equal(ex.list.length,ex.count);assert.equal(sha(exRaw),exReceipt.sha256);assert.equal(exRaw.length,exReceipt.bytes);assert.equal(exNorm.observations.length,ex.count);
const exRoads:Record<string,number>={},exTimes=new Set<string>(),exVds=new Set<string>(),conzones=new Set<string>();let positive=0,exNoTime=0;const exFresh:Record<string,number>={};
for(let i=0;i<ex.list.length;i++){const r=ex.list[i],n=exNorm.observations[i];assert.equal(n.vds_id,r.vdsId);assert.equal(n.conzone_id,r.conzoneId);assert.equal(n.routing_eligible,false);assert.equal(n.credential_kind,'OFFICIAL_PUBLIC_TEST_KEY');const positiveSpeed=/^\d+(?:\.\d+)?$/.test(r.speed)&&Number(r.speed)>0&&Number(r.speed)<=252?Number(r.speed):null;assert.equal(n.speed_kph,positiveSpeed);if(positiveSpeed!==null)positive++;exRoads[r.routeName]=(exRoads[r.routeName]??0)+1;exTimes.add(r.stdDate+' '+r.stdHour);exVds.add(r.vdsId);conzones.add(r.conzoneId);exFresh[n.freshness]=(exFresh[n.freshness]??0)+1;if(!n.observed_at)exNoTime++;}
summaries.push({source:'korea-expressway-official-demo',records:ex.count,positive_speed_rows:positive,distinct_vds_ids:exVds.size,distinct_conzone_ids:conzones.size,raw_korean_minute_timestamps:[...exTimes].sort(),freshness_at_retrieval:exFresh,missing_original_time:exNoTime,access_method:exReceipt.access_method,credential_kind:exReceipt.credential_kind,road_row_counts:Object.entries(exRoads).map(([road_name,count])=>({road_name,count}))});
function walk(dir:string){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(['compiled','test-compiled','ex-compiled'].includes(e.name))continue;walk(p);}else if(/\.(?:body|html|json|xlsx|txt|tap|log)$/.test(e.name)){const b=fs.readFileSync(p);originals.push({path:path.relative(root!,p),bytes:b.length,sha256:sha(b)});}}}walk(root);
const history=JSON.parse(fs.readFileSync(path.join(root,'seoul-history-verification.json'),'utf8'));assert.equal(history.rows_including_header-1,Object.values(history.date_counts).reduce((a:any,b:any)=>a+b,0));
const result={status:'PASS',original_response_hashes_checked:hashes,normalized_rows_checked:rowsChecked,expressway_records_checked:ex.count,sources:summaries,historical:{bytes:history.bytes,sha256:history.sha256,data_rows:history.rows_including_header-1,days:Object.keys(history.date_counts).length,hourly_columns:24,source_period:'2026-09',live_traffic:false},message_en:'Original source values/counts/hashes were independently recounted; no newly acquired source is authorized for routing. Missing timestamps and public-demo access remain explicit.',message_ko:'원 출처 값·개수·해시를 독립 재검사했으며 새 자료의 경로 적용은 승인하지 않습니다. 시각 누락과 공개 시험키 접근을 구분합니다.'};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');fs.writeFileSync(out.replace('.json','-local-originals.json'),JSON.stringify({root,files:originals},null,2)+'\n');console.log(JSON.stringify({status:result.status,source_hashes:hashes,normalized_rows:rowsChecked,ex_rows:ex.count,sources:summaries.map(({road_row_counts,...x})=>x),history:result.historical},null,2));
