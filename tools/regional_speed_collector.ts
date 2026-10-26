/** Operator-controlled public reads. EX is an explicit captured demo document, never hidden browser access.
 * 운영자 공개 조회이며 도로공사는 명시 보존 예제 문서만 읽고 숨은 브라우저 접근은 하지 않습니다. */
import { spawn } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseJson, record, sha256 } from "./shared.js";
import { ITS_MIN_POLL_MS, PublicSpeedError, publicTime, type ItsRead, type PublicBounds } from "./public_speed_source.js";
import { encodeRegionalEnvelope, normalizeRegionalResponse, regionalReceipt, validateRegionalBounds } from "./regional_speed_source.js";
import type { PublicRoadMapping } from "./public_speed_geometry.js";

interface RegionalCollectorInput {
  schema_version: "regional-collector-0.1";
  gits_route_ids: string[];
  expressway_document: string | null;
  expressway_receipt: string | null;
}
function fail(code: string): never {throw new PublicSpeedError(code);}
function boundedFile(path: string, max: number): Buffer {
  const s=lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size < 2 || s.size > max) fail("REGIONAL_INPUT_FILE_REFUSED");
  const b=readFileSync(path);if (b.length!==s.size) fail("REGIONAL_INPUT_CHANGED");return b;
}
export async function readRegionalPublicUrl(url: string, signal?: AbortSignal, limit=8*1024*1024,
  mime="application/json"): Promise<Buffer> {
  const parsed=new URL(url);
  if(parsed.protocol!=="https:" || !["gits.gg.go.kr","gitsmap.gg.go.kr"].includes(parsed.hostname) || parsed.port ||
    parsed.username || parsed.password || parsed.hash || [...parsed.searchParams.keys()].some(k=>/key|token|auth|secret/i.test(k)) ||
    !Number.isSafeInteger(limit) || limit<2 || limit>16*1024*1024 || !/^[a-zA-Z0-9./+-]+$/.test(mime))fail("REGIONAL_PUBLIC_URL_REFUSED");
  const p=spawn("curl",["-q","--http1.1","--silent","--show-error","--proto","=https","--connect-timeout","8",
    "--max-time","20","--max-filesize",String(limit),"--write-out","%{stderr}__STATUS__%{http_code}|%{content_type}",url],
    {stdio:["ignore","pipe","pipe"]});
  const chunks:Buffer[]=[];let size=0,stderr="",limited=false;
  const abort=()=>p.kill("SIGTERM");signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted)abort();
  const watchdog=setTimeout(abort,25000);
  p.stdout.on("data",(b:Buffer)=>{size+=b.length;if(size>limit){limited=true;abort();}else chunks.push(b);});
  p.stderr.on("data",(b:Buffer)=>{if(stderr.length<8192)stderr+=b.toString();});
  const exit=await new Promise<number|null>(done=>{p.once("error",()=>done(null));p.once("close",done);});
  clearTimeout(watchdog);signal?.removeEventListener("abort",abort);
  const expected="__STATUS__200|"+mime;
  const actual=stderr.slice(stderr.indexOf("__STATUS__")).trim();
  if(signal?.aborted || limited || exit!==0 || (actual!==expected && !actual.startsWith(expected+";")))
    fail("GITS_TRANSPORT_UNAVAILABLE");
  return Buffer.concat(chunks);
}

export class RegionalSpeedCollector {
  private inFlight?: Promise<ItsRead>;
  private nextAttempt=-Infinity;
  private readonly input: RegionalCollectorInput;
  private readonly root: string;
  constructor(inputPath: string, private readonly bounds: PublicBounds, private readonly mapping: PublicRoadMapping,
    private readonly options: {clock?:()=>number;signal?:AbortSignal} = {}) {
    validateRegionalBounds(bounds);this.root=dirname(resolve(inputPath));
    const value=parseJson(boundedFile(inputPath,65536));
    record(value,"regional collector",["schema_version","gits_route_ids","expressway_document","expressway_receipt"]);
    if(value.schema_version!=="regional-collector-0.1" || !Array.isArray(value.gits_route_ids) ||
      value.gits_route_ids.length<1 || value.gits_route_ids.length>32 ||
      value.gits_route_ids.some(id=>typeof id!=="string" || !/^\d{10}$/.test(id)) ||
      new Set(value.gits_route_ids).size!==value.gits_route_ids.length ||
      ((value.expressway_document===null)!==(value.expressway_receipt===null)) ||
      (value.expressway_document!==null && (typeof value.expressway_document!=="string" || typeof value.expressway_receipt!=="string")))
      fail("INVALID_REGIONAL_COLLECTOR_INPUT");
    this.input=value as unknown as RegionalCollectorInput;
  }
  collect(): Promise<ItsRead> {
    if(this.inFlight)return this.inFlight;
    const now=(this.options.clock??Date.now)();
    if(now<this.nextAttempt)return Promise.reject(new PublicSpeedError("POLL_INTERVAL"));
    this.nextAttempt=now+ITS_MIN_POLL_MS;
    const work=this.read();this.inFlight=work;
    void work.finally(()=>{if(this.inFlight===work)this.inFlight=undefined;}).catch(()=>{});return work;
  }
  private async read(): Promise<ItsRead> {
    const sources=[];
    for(const route of this.input.gits_route_ids){
      const started=Date.now(),raw=await readRegionalPublicUrl("https://gits.gg.go.kr/web/map/webMapApi.do?API=V_API2_SPD_API&ROUTE_ID="+route,this.options.signal);
      sources.push(regionalReceipt("kr-gits",raw,new Date((this.options.clock??Date.now)()).toISOString()));
      await delay(Math.max(0,500-(Date.now()-started)),undefined,{signal:this.options.signal});
    }
    if(this.input.expressway_document!==null){
      const raw=boundedFile(resolve(this.root,this.input.expressway_document),8*1024*1024);
      const receipt=parseJson(boundedFile(resolve(this.root,this.input.expressway_receipt!),65536)) as Record<string,unknown>;
      if(receipt.access_method!=="READ_ONLY_BROWSER_DOCUMENT_TEXT" ||
        receipt.url!=="https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=test&type=json" ||
        receipt.sha256!==sha256(raw) || receipt.bytes!==raw.length || receipt.code!=="SUCCESS" ||
        typeof receipt.retrieved_at!=="string" || publicTime(receipt.retrieved_at)>(this.options.clock??Date.now)())
        fail("REGIONAL_EX_CAPTURE_RECEIPT_MISMATCH");
      const doc=parseJson(raw) as {count?:unknown;list?:unknown};
      if(!Array.isArray(doc.list) || doc.count!==doc.list.length || receipt.rows!==doc.count)
        fail("REGIONAL_EX_CAPTURE_INCOMPLETE");
      sources.push(regionalReceipt("kr-ex",raw,receipt.retrieved_at));
    }
    const raw=encodeRegionalEnvelope(sources),retrieved_at=new Date((this.options.clock??Date.now)()).toISOString();
    return {raw,batch:normalizeRegionalResponse(raw,retrieved_at,this.bounds,this.mapping)};
  }
}
