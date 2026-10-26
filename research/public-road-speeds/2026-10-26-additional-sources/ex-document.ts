/** Validate the complete rendered official demo JSON; not an HTTP-wire capture.
 * 공식 예제의 전체 JSON 화면 자료 검사이며 HTTP 전송 원문 캡처는 아닙니다. */
import fs from'node:fs';import{createHash}from'node:crypto';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
export function koreanMinute(date: unknown,hour: unknown): string|null {
  if(typeof date!=='string'||typeof hour!=='string'||!/^20\d{6}$/.test(date)||!/^\d{4}$/.test(hour))return null;
  const y=Number(date.slice(0,4)),m=Number(date.slice(4,6)),d=Number(date.slice(6,8)),h=Number(hour.slice(0,2)),min=Number(hour.slice(2));
  const local=Date.UTC(y,m-1,d,h,min),r=new Date(local);
  if(r.getUTCFullYear()!==y||r.getUTCMonth()!==m-1||r.getUTCDate()!==d||r.getUTCHours()!==h||r.getUTCMinutes()!==min)return null;
  return new Date(local-9*3600_000).toISOString();
}
export function parseExDocument(raw: Buffer, retrieved_at: string){
  if(raw.length>16*1024*1024||!Number.isFinite(Date.parse(retrieved_at)))throw Error('INPUT_LIMIT / 입력 제한');
  const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(doc.code!=='SUCCESS'||!Array.isArray(doc.list)||doc.count!==doc.list.length||doc.list.length>50_000)throw Error('INCOMPLETE_OR_ERROR_RESPONSE / 불완전·오류 응답');
  const sha256=createHash('sha256').update(raw).digest('hex');
  const numeric=(v:unknown):number|null=>{if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v))return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const observations=(doc.list as Record<string,unknown>[]).map((r)=>{
    if(!r||typeof r!=='object'||Array.isArray(r))throw Error('INVALID_ROW / 행 오류');
    const observed_at=koreanMinute(r.stdDate,r.stdHour),speed=numeric(r.speed),speed_kph=speed!==null&&speed>0&&speed<=252?speed:null;
    const age=observed_at?Date.parse(retrieved_at)-Date.parse(observed_at):null;
    return {provider:'korea-expressway-official-demo',source_class:'PUBLIC_AGENCY',access_method:'READ_ONLY_BROWSER_DOCUMENT_TEXT',
      credential_kind:'OFFICIAL_PUBLIC_TEST_KEY',vds_id:typeof r.vdsId==='string'?r.vdsId:null,
      conzone_id:typeof r.conzoneId==='string'?r.conzoneId:null,road_name:r.routeName,direction:r.updownTypeCode,
      observed_at,observation_precision:'MINUTE',retrieved_at,speed_kph,
      freshness:speed_kph===null?'NO_SPEED':age===null||age< -30_000?'INVALID_TIME':age>=600_000?'STALE':'WITHIN_600S',
      traffic_count:numeric(r.trafficAmout),share_ratio:numeric(r.shareRatio),travel_time_raw:numeric(r.timeAvg),
      routing_eligible:false,document_sha256:sha256};
  });
  return {sha256,count:observations.length,observations};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,receiptPath,output]=process.argv.slice(2);if(!input||!receiptPath||!output)throw Error('Usage: ex-document INPUT RECEIPT OUTPUT / 입력·영수증·출력 필요');
  const raw=fs.readFileSync(input),receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));const result=parseExDocument(raw,receipt.retrieved_at);
  if(receipt.sha256!==result.sha256||receipt.rows!==result.count||receipt.bytes!==raw.length)throw Error('DOCUMENT_RECEIPT_MISMATCH / 문서 근거 불일치');
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',records:result.count,sha256:result.sha256}));
}
