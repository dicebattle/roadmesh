/** Anonymous public-site acquisition, outside the navigation runtime.
 * 내비게이션 실행과 분리된 익명 공개 사이트 자료 수집. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const HOSTS = new Set(['topis.seoul.go.kr', 'gits.gg.go.kr', 'www.utic.go.kr', 'car.daegu.go.kr']);
const MAX_BYTES = 16 * 1024 * 1024;
export type Row = Record<string, unknown>;
export interface Receipt {
  id: string; url: string; method: 'GET'|'POST'; request_body: string|null;
  started_at: string; retrieved_at: string; status: number|null;
  content_type: string|null; bytes: number; sha256: string|null;
  result: 'RECEIVED'|'TRANSPORT_FAILED'|'BODY_LIMIT';
}
export interface Observation {
  provider: 'seoul-topis-website'|'gyeonggi-website'|'utic-website'|'daegu-website';
  source_class: 'PUBLIC_AGENCY'; access_method: 'ANONYMOUS_WEBSITE';
  record_id: string; road_name: string; direction: string|null;
  speed_kph: number|null; travel_time_raw: number|null;
  observed_at: string|null; retrieved_at: string;
  freshness: 'WITHIN_600S'|'UNKNOWN_TIME'|'STALE'|'INVALID_TIME'|'NO_SPEED';
  routing_eligible: false; raw_response_sha256: string;
}
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function fail(code: string): never {throw Error(`${code} / 공개 자료 수집 입력 또는 형식 오류`);}
export function publicUrl(value: string): URL {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || u.port || u.username || u.password || u.hash)
    fail('PUBLIC_URL_REFUSED');
  if ([...u.searchParams.keys()].some(k => /key|token|auth|secret|password/i.test(k)))
    fail('CREDENTIAL_PARAMETER_REFUSED');
  return u;
}
/** curl uses normal TLS verification. URL/body go through stdin, never a shell.
 * curl의 정상 TLS 검증을 사용하고 URL·본문은 셸 대신 표준입력으로 넘깁니다. */
export async function request(id: string, url: string, body?: string): Promise<{receipt: Receipt; raw: Buffer}> {
  publicUrl(url);
  if (!/^[a-z0-9-]{1,100}$/.test(id) || /[\r\n]/.test(url) || (body?.length??0)>8192)
    fail('REQUEST_LIMIT');
  if (body && /(?:^|&)(?:[^=]*(?:key|token|auth|secret|password)[^=]*)=/i.test(body))
    fail('CREDENTIAL_PARAMETER_REFUSED');
  const started_at = new Date().toISOString();
  const quote = (v: string) => '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';
  const args = ['--http1.1','--silent','--show-error','--connect-timeout','8','--max-time','20',
    '--max-filesize',String(MAX_BYTES),'--proto','=https','--config','-',
    '--write-out','%{stderr}\n__STATUS__%{http_code}|%{content_type}'];
  const child = spawn('curl', args, {stdio:['pipe','pipe','pipe']});
  let size=0, limited=false, stderr='', raw=Buffer.alloc(0);
  const chunks: Buffer[]=[];
  child.stdout.on('data',(chunk: Buffer)=>{size+=chunk.length;if(size>MAX_BYTES){limited=true;child.kill('SIGTERM');}else chunks.push(chunk);});
  child.stderr.on('data',(chunk: Buffer)=>{if(stderr.length<8192)stderr+=chunk.toString();});
  const done = new Promise<number|null>(done=>{child.once('error',()=>done(null));child.once('close',done);});
  child.stdin.on('error',()=>{});
  child.stdin.end('url = '+quote(url)+'\n'+(body===undefined?'':'data = '+quote(body)+'\n'));
  const watchdog=setTimeout(()=>child.kill('SIGTERM'),25_000);
  const exit=await done; clearTimeout(watchdog);
  raw=Buffer.concat(chunks);
  const meta=stderr.match(/__STATUS__(\d{3})\|([^\r\n]*)/);
  const result: Receipt['result']=limited||exit===63?'BODY_LIMIT':exit===0?'RECEIVED':'TRANSPORT_FAILED';
  const receipt: Receipt={id,url,method:body===undefined?'GET':'POST',request_body:body??null,
    started_at,retrieved_at:new Date().toISOString(),status:meta?Number(meta[1]):null,
    content_type:meta?.[2]??null,bytes:raw.length,sha256:raw.length?hash(raw):null,result};
  return {receipt,raw};
}
export function jsonRows(raw: Uint8Array, field?: string): Row[] {
  let parsed: unknown;
  try {parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch {fail('INVALID_JSON');}
  const rows=field ? (parsed as Row)?.[field] : parsed;
  if (!Array.isArray(rows) || rows.length>50_000 || rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))
    fail('INVALID_ROWS');
  return rows as Row[];
}
function number(v: unknown): number|null {
  if (typeof v==='number') return Number.isFinite(v)?v:null;
  if (typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v)) return null;
  return Number(v);
}
function text(v: unknown): string {return typeof v==='string'||typeof v==='number'?String(v):'';}
function observation(provider: Observation['provider'], r: Row, at: string, rawHash: string): Observation {
  const g=provider==='gyeonggi-website',s=provider==='seoul-topis-website',u=provider==='utic-website';
  const speed=number(g?r.SPD:s?r.speed:u?r.speed:r.linkSpeed);
  const positive=speed!==null&&speed>0&&speed<=252 ? speed:null;
  const epoch=g?number(r.PROC_DATE):null;
  const validEpoch=epoch!==null&&Number.isSafeInteger(epoch)&&epoch>=946684800000&&epoch<=4102444800000;
  const observed_at=validEpoch?new Date(epoch).toISOString():null;
  const age=observed_at?Date.parse(at)-Date.parse(observed_at):null;
  const freshness: Observation['freshness']=positive===null?'NO_SPEED':g&&!validEpoch?'INVALID_TIME':
    age===null?'UNKNOWN_TIME':age< -30_000?'INVALID_TIME':age>=600_000?'STALE':'WITHIN_600S';
  return {provider,source_class:'PUBLIC_AGENCY',access_method:'ANONYMOUS_WEBSITE',
    record_id:text(g?r.SVC_LINK_ID:s?r.linkId:u?r.id:r.dsrcLinkSn),
    road_name:text(g?r.ROUTE_KORNM:s?r.axisName:u?r.road_name:r.roadNm),
    direction:text(g?r.ROUTE_WAY:s?r.axisDirDivCd:u?r.dir:r.direTyp)||null,
    speed_kph:positive,travel_time_raw:number(g?r.TRVL_TIME:u?r.ttime:null),
    observed_at,retrieved_at:at,freshness,routing_eligible:false,raw_response_sha256:rawHash};
}
export function normalize(provider: Observation['provider'], rows: Row[], at: string, rawHash: string): Observation[] {
  if(!Number.isFinite(Date.parse(at))||!/^[a-f0-9]{64}$/.test(rawHash))fail('INVALID_PROVENANCE');
  return rows.map(r=>observation(provider,r,at,rawHash));
}
/** Only matches the site's fixed literal data grammar. No eval/Function/script execution.
 * 사이트의 고정 리터럴 자료 문법만 읽으며 스크립트는 실행하지 않습니다. */
export function uticRows(html: string, road_name: string): Row[] {
  const pairs=/linkid\.push\('([0-9A-Za-z_-]+)'\);\s*node\.push\(\{dir:'([01])',\s*x:([\d.-]+),\s*y:([\d.-]+),\s*name:'((?:[^'\\]|\\.)*)',\s*speed:\s*(null|[\d.]+),\s*len:\s*(null|[\d.]+),\s*ttime:\s*(null|[\d.]+)\}\);/g;
  const rows: Row[]=[];
  for(const m of html.matchAll(pairs)) rows.push({id:m[1],dir:m[2],x:Number(m[3]),y:Number(m[4]),name:m[5],speed:m[6]==='null'?null:Number(m[6]),len:m[7]==='null'?null:Number(m[7]),ttime:m[8]==='null'?null:Number(m[8]),road_name});
  const declared=(html.match(/linkid\.push\(/g)??[]).length;
  if(rows.length!==declared||rows.length>50_000)fail('UNSUPPORTED_UTIC_LITERAL');
  return rows;
}
export function uticRoads(html: string): {name: string; rank: string}[] {
  const re=/href="javascript:onClickRoadName\('[^']*','[^']*','[^']*','([^']*)','(101|102)','[^']*'\);"/g;
  const rows=[...html.matchAll(re)].map(m=>({name:m[1]!,rank:m[2]!}));
  if(rows.length>3000)fail('ROAD_LIMIT');
  return rows;
}
interface Job {id: string; url: string; body?: string; road?: string; provider?: Observation['provider']; field?: string}
async function save(root: string, job: Job): Promise<{receipt: Receipt; rows?: Row[]}> {
  const {receipt,raw}=await request(job.id,job.url,job.body);
  await writeFile(resolve(root,job.id+'.receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(raw.length)await writeFile(resolve(root,job.id+'.body'),raw,{flag:'wx'});
  if(receipt.result!=='RECEIVED'||receipt.status!==200) return {receipt};
  try {
    const rows=job.provider==='utic-website'?uticRows(raw.toString('utf8'),job.road!):jsonRows(raw,job.field);
    if(job.provider){const observations=normalize(job.provider,rows,receipt.retrieved_at,receipt.sha256!);
      await writeFile(resolve(root,job.id+'.normalized.json'),JSON.stringify(observations,null,2)+'\n',{flag:'wx'});}
    return {receipt,rows};
  } catch {
    await writeFile(resolve(root,job.id+'.rejection.json'),JSON.stringify({code:'SCHEMA_NOT_ACCEPTED',message_en:'Raw response retained; not counted as numeric acquisition.',message_ko:'원 응답을 보존하고 수치 수집으로 세지 않습니다.'},null,2)+'\n',{flag:'wx'});
    return {receipt};
  }
}
async function serial(root: string, jobs: Job[]): Promise<void> {
  if(jobs.length>1000)fail('CAMPAIGN_LIMIT');
  let consecutive=0,skipped=0;
  for(let i=0;i<jobs.length;i++){
    if(consecutive>=5){skipped=jobs.length-i;break;}
    const started=Date.now();const got=await save(root,jobs[i]!);
    consecutive=got.receipt.status===200&&got.rows!==undefined?0:consecutive+1;
    if(got.receipt.status===403||got.receipt.status===429){skipped=jobs.length-i-1;break;}
    if(i%25===0||i===jobs.length-1)console.log(JSON.stringify({source:jobs[i]!.provider,completed:i+1,total:jobs.length}));
    await delay(Math.max(0,500-(Date.now()-started)));
  }
  await writeFile(resolve(root,'campaign.json'),JSON.stringify({planned:jobs.length,skipped,message_en:'At most two sequential requests per second; stop on403/429 or five consecutive transport/schema failures. No automatic retries.',message_ko:'초당 최대2개 순차 요청이며403/429·연속5실패에서 중지하고 자동 재시도하지 않습니다.'},null,2)+'\n',{flag:'wx'});
}
export async function collect(root: string): Promise<void> {
  await mkdir(root,{recursive:false});
  for(const name of ['topis','gyeonggi','utic','daegu'])await mkdir(resolve(root,name));
  const t=resolve(root,'topis'),g=resolve(root,'gyeonggi'),u=resolve(root,'utic'),d=resolve(root,'daegu');
  const [topis,gyeonggi,utic,daegu]=await Promise.all([
    save(t,{id:'road-list',url:'https://topis.seoul.go.kr/map/trafficMap/selectRoadList.do',body:'',field:'rows'}),
    save(g,{id:'road-list',url:'https://gits.gg.go.kr/web/map/webMapApi.do?API=V_API2_ROADRANK_API&ROUTE_ID='}),
    save(u,{id:'highway-list',url:'https://www.utic.go.kr/traffic/trafficRoad.do?list=highway&msg=highway'}),
    save(d,{id:'road-list',url:'https://car.daegu.go.kr/map/ajax/getTrafficInfoForRoadForMap',body:'fac_sn=',field:'result'})]);
  const uticBody=await readFile(resolve(u,'highway-list.body'),'utf8');
  const roads=utic.receipt.status===200?uticRoads(uticBody):[];
  const topisJobs: Job[]=(topis.rows??[]).map(r=>{const id=text(r.axisCd);if(!/^\d{1,12}$/.test(id))fail('ROAD_ID');return {id:'axis-'+id,url:'https://topis.seoul.go.kr/map/trafficMap/selectRoadDetailList.do',body:new URLSearchParams({axisCd:id}).toString(),provider:'seoul-topis-website',field:'rows'};});
  const gitsJobs: Job[]=(gyeonggi.rows??[]).map(r=>{const id=text(r.ROUTE_ID);if(!/^\d{10}$/.test(id))fail('ROAD_ID');return{id:'route-'+id,url:'https://gits.gg.go.kr/web/map/webMapApi.do?'+new URLSearchParams({API:'V_API2_SPD_API',ROUTE_ID:id}).toString(),provider:'gyeonggi-website'};});
  const uticJobs: Job[]=roads.map((r,i)=>({id:'highway-'+String(i).padStart(3,'0'),url:'https://www.utic.go.kr/traffic/traffichighway.do',body:new URLSearchParams({roadName:r.name,area:'',roadrank:r.rank,gubn:'simple',roadType:''}).toString(),road:r.name,provider:'utic-website'}));
  uticJobs.push({id:'seoul-teheran',url:'https://www.utic.go.kr/traffic/traffic.do?'+new URLSearchParams({roadName:'테헤란로',area:'100',roadrank:'107'}).toString(),road:'테헤란로',provider:'utic-website'});
  const daeguJobs: Job[]=(daegu.rows??[]).map(r=>{const id=text(r.roadSn);if(!/^\d{1,10}$/.test(id))fail('ROAD_ID');return{id:'road-'+id,url:'https://car.daegu.go.kr/map/ajax/getTrafficInfoForRoadForMapLv2',body:new URLSearchParams({fac_sn:id}).toString(),provider:'daegu-website',field:'result'};});
  await Promise.all([serial(t,topisJobs),serial(g,gitsJobs),serial(u,uticJobs),serial(d,daeguJobs)]);
  console.log('Acquisition finished; inspect originals before acceptance. / 수집 종료 후 원문을 검토해야 수용할 수 있습니다.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==3)fail('USAGE: collector OUTPUT_DIRECTORY');
  await collect(resolve(process.argv[2]!));
}
