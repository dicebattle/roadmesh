/** Deterministic protocol faults on the actual native Seoul graph; not live agency observations.
 * 실제 서울 엔진 위 통제 규격 장애 검사이며 실제 기관 관측이 아닙니다. */
import {copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {compactVerify, importJWK} from "jose";
import {canonical, isMain, parseJson, sha256} from "./shared.js";
import {sourceIdentity} from "./pilot_runner.js";
import {implementationFingerprint} from "./media_manifest.js";
import {inventory, loadSeoulGraph} from "./seoul_bundle.js";
import {geodesicSphere} from "./geodesy.js";
import {PublicSpeedRuntime} from "./public_speed_runtime.js";
import {normalizeItsResponse, type ItsRead} from "./public_speed_source.js";
import {encodeRegionalEnvelope,normalizeRegionalResponse,regionalReceipt} from "./regional_speed_source.js";
import type {PublicRoadMapping} from "./public_speed_geometry.js";
import type {GatewayRequest, GatewaySuccess} from "./gateway_public_types.js";
import type {SimulationAssertion} from "./vehicle_simulator.js";

export const PUBLIC_SPEED_CASE_IDS = ["bootstrap","current","source-identity","full-denominator","session-required","origin-required",
  "malformed-input","native-speed","native-guidance","slow-refresh","provider-outage","partial-expiry","partial-route-coverage",
  "exact-expiry","native-fallback","recovery-order","native-recovery","zero-withdrawal","restart-order","restart-baseline",
  "deadline","input-scope","original-evidence","cleanup"].map(id=>"public-speed-"+id);
export const REGIONAL_PUBLIC_SPEED_CASE_IDS=PUBLIC_SPEED_CASE_IDS.map(id=>id.replace(/^public-speed-/,"regional-public-speed-"));
export function requirePublicSpeedCases(assertions: SimulationAssertion[],regional=false): void {
  const required=regional?REGIONAL_PUBLIC_SPEED_CASE_IDS:PUBLIC_SPEED_CASE_IDS;
  if (assertions.length !== required.length || assertions.some(a=>a.status!=="PASS") ||
      new Set(assertions.map(a=>a.assertion_id)).size!==required.length ||
      required.some(id=>!assertions.some(a=>a.assertion_id===id)))
    throw Error("All24 public-speed runtime cases are required / 공공 실행24개 전체 통과 필요");
}
async function waitFor<T>(read:()=>Promise<T>, accept:(v:T)=>boolean):Promise<T> {
  const until=performance.now()+30000;
  for (;;) {const v=await read();if(accept(v))return v;if(performance.now()>=until)throw Error("Public runtime wait expired / 공공 실행 대기 만료");
    await new Promise(done=>setTimeout(done,100));}
}
export async function runPublicSpeedChecks(graphDirectory:string,bundleDirectory:string,outputPath:string,regional=false):Promise<{assertions:SimulationAssertion[]}> {
  const output=resolve(outputPath);mkdirSync(output);
  const graph=loadSeoulGraph(graphDirectory), source=sourceIdentity(), fingerprint=implementationFingerprint();
  const chosen=graph.edges.filter(e=>e.car_access&&geodesicSphere.length(e.directed_geometry)>75).slice(0,2);
  if(chosen.length!==2)throw Error("Two usable authored-fixture edges required / 자체 규격용 실제 구간 두 개 필요");
  const privateRoot=mkdtempSync(join(tmpdir(),"routelens-public-runtime-"));
  const mapping:PublicRoadMapping={schema_version:"kr-directed-mapping-0.1",policy:"kr-directed-envelope-v1",graph_id:graph.graphId,
    geometry_sha256:sha256(canonical({fixture_kind:"AUTHORED_PROVIDER_PROTOCOL",edges:chosen})),graph_edges_sha256:sha256(canonical(graph.edges)),
    entries:chosen.map((e,i)=>({edge_id:e.edge_id,forward:e.forward,link_id:"900000000"+(i+2),start_node_id:"9000000000",end_node_id:"9000000001",
      max_distance_m:0,start_fraction:0,end_fraction:1})),excluded:graph.edges.filter(e=>!chosen.some(c=>c.edge_id===e.edge_id)).map(e=>({edge_id:e.edge_id,reason:"NO_MATCH"}))};
  if(regional){
    mapping.schema_version="kr-directed-mapping-0.2";mapping.policy="kr-regional-envelope-v1";
    mapping.regional_references=mapping.entries.map((e,i)=>{
      const proof=sha256(canonical({fixture_kind:"AUTHORED_PROVIDER_PROTOCOL",edge:chosen[i]}));
      e.link_id="gits:"+e.link_id;e.start_node_id=`geometry:${proof}:start`;e.end_node_id=`geometry:${proof}:end`;
      return {link_id:e.link_id,provider:"kr-gits",source_id:e.link_id.slice(5),road_name:"Authored provider protocol / 자체 제공자 규격",
        evidence_sha256:proof,start_anchor:e.start_node_id,end_anchor:e.end_node_id,source_start_name:"Authored start",source_end_name:"Authored end",
        source_length_m:geodesicSphere.length(chosen[i]!.directed_geometry)};
    });
    mapping.regional_alternatives=structuredClone(mapping.entries);
    writeFileSync(join(output,"authored-input.json"),JSON.stringify({schema_version:"regional-collector-0.1",gits_route_ids:["1010000011"],
      expressway_document:null,expressway_receipt:null}));
  }
  const mappingPath=join(output,"authored-mapping.json");writeFileSync(mappingPath,JSON.stringify(mapping,null,2));
  const bounds=[126.98,37.46,127.10,37.56] as const, base=Math.floor(Date.now()/1000)*1000;
  let now=base, mode:"initial"|"outage"|"recovery"|"zero"|"pending"="initial", calls=0, releasePending:(()=>void)|undefined;
  const assertions:SimulationAssertion[]=[];
  function check(id:string,condition:boolean,actual:unknown,message_en:string,message_ko:string,path="readbacks.json"):void {
    const a:SimulationAssertion={assertion_id:(regional?"regional-public-speed-":"public-speed-")+id,status:condition?"PASS":"FAIL",expected:true,actual,message_en,message_ko,evidence_path:path};
    assertions.push(a);writeFileSync(join(output,"assertions.json"),JSON.stringify(assertions,null,2));
    if(!condition)throw Error(message_en+" / "+message_ko);
  }
  const captures:Record<string,unknown>={fixture_kind:"AUTHORED_PROVIDER_PROTOCOL_NOT_ACTUAL_AGENCY_SPEED",clock_basis:"CONTROLLED_TEST_CLOCK"};
  const save=(id:string,value:unknown)=>{captures[id]=value;writeFileSync(join(output,"readbacks.json"),JSON.stringify(captures,null,2));};
  function raw():ItsRead {
    const at=(t:number)=>new Date(t+9*3600000).toISOString().slice(0,19).replace(/[-:T]/g,"");
    if(regional){
      const original=canonical(mapping.regional_references!.map((r,i)=>({SVC_LINK_ID:r.source_id,ROUTE_KORNM:r.road_name,
        START_NODE_NM:r.source_start_name,END_NODE_NM:r.source_end_name,LINK_LENGTH:r.source_length_m,
        SPD:mode==="zero"?"0":mode==="initial"?"12":"36",PROC_DATE:mode==="initial"?base-(i===0?60000:0):now})));
      const raw=encodeRegionalEnvelope([regionalReceipt("kr-gits",original,new Date(now).toISOString())]);
      return {raw,batch:normalizeRegionalResponse(raw,new Date(now).toISOString(),bounds,mapping)};
    }
    const bytes=canonical({header:{resultCode:0,resultMsg:"SUCCESS"},body:{totalCount:2,items:chosen.map((_,i)=>({
      linkId:"900000000"+(i+2),startNodeId:"9000000000",endNodeId:"9000000001",roadName:"Authored provider protocol / 자체 제공자 규격",
      speed:mode==="zero"?"0":mode==="initial"?"12":"36",travelTime:"10",createdDate:at(mode==="initial"?base-(i===0?60000:0):now)}))}});
    return {raw:bytes,batch:normalizeItsResponse(bytes,new Date(now).toISOString(),bounds)};
  }
  const collect=async()=>{calls++;if(mode==="pending")await new Promise<void>(done=>{releasePending=done;});
    if(mode==="outage"||mode==="pending")throw Error("Authored provider outage / 자체 제공자 장애");return raw();};
  let runtime:PublicSpeedRuntime|undefined, restarted:PublicSpeedRuntime|undefined, clean=false;
  const config={graph_directory:resolve(graphDirectory),bundle_directory:resolve(bundleDirectory),mapping_path:mappingPath,
    ...(regional?{source:"kr-regional" as const,regional_input_path:join(output,"authored-input.json")} : {}),
    state_directory:privateRoot,assets_directory:resolve("dist/web/pilot"),bounds,lifetime_ms:180000,capture_evidence:true};
  const dependencies={clock:()=>now,collect};
  try {
    runtime=await PublicSpeedRuntime.start({...config,output_directory:join(output,"runtime-1")},dependencies);
    const first=await runtime.context();save("initial",first);
    check("bootstrap",runtime.bootstrap.schema_version==="public-route-0.1"&&runtime.bootstrap.source_class==="PUBLIC_AGENCY",runtime.bootstrap.schema_version,
      "Public client uses the distinct public schema.","공공 화면의 별도 규격을 확인했습니다.");
    check("current",first.public_traffic?.source_state==="CURRENT"&&first.public_traffic.live_edges===2,first,
      "Two authored provider entries are currently accepted.","자체 규격 응답 두 구간의 유효 수용을 확인했습니다.");
    check("source-identity",first.source_class==="PUBLIC_AGENCY"&&first.clock_basis==="WALL_CLOCK_UTC"&&first.public_traffic?.provider===(regional?"kr-regional":"kr-its"),first,
      "Source and clock are explicit; these test responses remain labeled authored.","출처·시계가 명시되며 검사 응답은 자체 규격으로 구분합니다.");
    check("full-denominator",first.public_traffic?.graph_edges===graph.edges.length&&first.public_traffic.mapped_edges===2,first.public_traffic,
      "Unmapped roads remain in the full graph denominator.","미대응 도로를 전체 분모에 유지합니다.");
    const forbidden=await fetch(runtime.origin+"/api/route-context");await forbidden.arrayBuffer();
    check("session-required",forbidden.status===403,forbidden.status,"Public client requires its loopback session.","로컬 세션이 필요합니다.");
    const home=await fetch(runtime.origin+"/");await home.arrayBuffer();const cookie=home.headers.get("set-cookie")!.split(";")[0]!;
    const request=(id:string):GatewayRequest=>({schema_version:"0.1",request_id:id,origin:runtime!.bootstrap.presets.short.origin,
      destination:runtime!.bootstrap.presets.short.destination,profile:"car",traffic_policy:"prefer_live",guidance_language:"ko-KR"});
    const cross=await fetch(runtime.origin+"/api/routes",{method:"POST",headers:{cookie,origin:"https://example.invalid","content-type":"application/json"},body:JSON.stringify(request("cross"))});await cross.arrayBuffer();
    check("origin-required",cross.status===403,cross.status,"Cross-origin route submissions are rejected.","다른 출처의 경로 제출을 거부합니다.");
    const malformed=await fetch(runtime.origin+"/api/routes",{method:"POST",headers:{cookie,origin:runtime.origin,"content-type":"application/json"},body:"{"});await malformed.arrayBuffer();
    check("malformed-input",malformed.status===422,malformed.status,"Malformed client input cannot reach native routing.","잘못된 입력을 엔진에 전달하지 않습니다.");
    const actual=await fetch(runtime.origin+"/api/routes",{method:"POST",headers:{cookie,origin:runtime.origin,"content-type":"application/json"},body:JSON.stringify(request("initial-http"))});
    const initial=await actual.json() as GatewaySuccess;save("native-initial",{status:actual.status,body:initial});
    check("native-speed",actual.status===200&&initial.traffic_mode==="LIVE_MIXED"&&initial.live_coverage_ratio>0.99,initial,
      "Authored provider speed reaches actual native routing through both HTTP servers.","자체 규격 속도가 두 HTTP 서버를 거쳐 실제 엔진에 반영됩니다.");
    check("native-guidance",initial.guidance?.language==="ko-KR"&&initial.guidance.maneuvers.length>=2,initial.guidance,
      "Native Korean guidance remains bound to the public route.","공공 경로에 엔진 한국어 안내가 연결됩니다.");
    mode="pending";now=base+120000;await waitFor(async()=>calls,n=>n>=2);
    const began=performance.now(),slow=await runtime.context();save("slow-refresh",slow);
    check("slow-refresh",performance.now()-began<1000&&slow.traffic_snapshot_id===first.traffic_snapshot_id,{duration_ms:performance.now()-began,context:slow},
      "A pending provider call does not block current context.","느린 기관 응답이 현재 문맥 조회를 막지 않습니다.");
    releasePending!();releasePending=undefined;mode="outage";
    const outage=await waitFor(()=>runtime!.context(),v=>v.public_traffic?.refresh_state==="FAILED");save("outage",outage);
    check("provider-outage",outage.traffic_valid_until===first.traffic_valid_until&&outage.traffic_snapshot_id===first.traffic_snapshot_id,outage,
      "Provider failure retains original validity without renewing observations.","기관 장애에서도 원래 만료 시각을 연장하지 않습니다.");
    now=base+540000;const partial=await runtime.context();save("partial",partial);
    check("partial-expiry",partial.public_traffic?.live_edges===1&&partial.high_water>first.high_water&&partial.traffic_valid_until===new Date(base+600000).toISOString(),partial,
      "Exact first expiry removes only expired edges, preserving the remaining original deadline.","첫 만료 때 해당 구간만 빼고 남은 원 만료를 유지합니다.");
    const partialRoute=await runtime.route(request("partial"),new AbortController().signal);save("native-partial",partialRoute);
    check("partial-route-coverage",partialRoute.public_traffic?.live_edges===1&&partialRoute.live_coverage_ratio===0,partialRoute,
      "Graph-level current data does not imply coverage on this particular route.","전체에 유효 자료가 있어도 해당 경로 적용률은 별도로 계산합니다.");
    now=base+600000;const expired=await runtime.context();save("expired",expired);
    check("exact-expiry",expired.traffic_snapshot_id===null&&expired.public_traffic?.source_state==="EXPIRED"&&expired.high_water===partial.high_water,expired,
      "The exact final expiry clears authority without resetting order.","마지막 정확한 만료에서 순서를 유지하고 사용을 중단합니다.");
    const baseline=await runtime.route(request("baseline"),new AbortController().signal);save("native-baseline",baseline);
    check("native-fallback",baseline.traffic_mode==="BASE_ONLY"&&baseline.snapshot_id===null&&baseline.live_coverage_ratio===0&&
      baseline.duration_s<initial.duration_s&&canonical(baseline.geometry).equals(canonical(initial.geometry)),baseline,
      "Actual native routing returns to unchanged base speeds and geometry after expiry.","만료 뒤 실제 엔진이 같은 경로의 기본 속도로 복귀합니다.");
    mode="recovery";now=base+720000;
    const recovery=await waitFor(()=>runtime!.context(),v=>v.public_traffic?.refresh_state==="OK"&&v.high_water>partial.high_water);save("recovery",recovery);
    check("recovery-order",recovery.public_traffic?.live_edges===2&&recovery.high_water>partial.high_water,recovery,
      "Fresh recovery uses a higher signed sequence.","새 관측 복구에서 높은 서명 순번을 사용합니다.");
    const recovered=await runtime.route(request("recovered"),new AbortController().signal);save("native-recovered",recovered);
    check("native-recovery",recovered.live_coverage_ratio>0.99&&recovered.duration_s<initial.duration_s&&recovered.generation_id!==initial.generation_id,recovered,
      "New public speed produces a new native generation and changed travel duration.","새 속도에 새 엔진 자료와 달라진 소요시간을 확인했습니다.");
    mode="zero";now=base+840000;
    const zero=await waitFor(()=>runtime!.context(),v=>v.public_traffic?.source_state==="NO_MAPPED_SPEEDS"&&v.traffic_snapshot_id===null);save("zero",zero);
    check("zero-withdrawal",zero.high_water===recovery.high_water&&zero.public_traffic?.live_edges===0,zero,
      "New zero values withdraw old positive speed rather than declaring a road closure.","새0값은 폐쇄로 바꾸지 않고 이전 양수 속도를 철회합니다.");
    await runtime.close();mode="outage";
    restarted=await PublicSpeedRuntime.start({...config,output_directory:join(output,"runtime-2")},dependencies);
    const resumed=await restarted.context();save("restarted",resumed);
    check("restart-order",resumed.high_water===recovery.high_water&&resumed.traffic_snapshot_id===null,resumed,
      "Restart preserves the durable sequence and prior withdrawal during provider failure.","기관 장애 재시작에서 순번과 철회 상태를 유지합니다.");
    const restartRequest={...request("restarted"),origin:restarted.bootstrap.presets.short.origin,destination:restarted.bootstrap.presets.short.destination};
    const resumedRoute=await restarted.route(restartRequest,new AbortController().signal);save("native-restarted",resumedRoute);
    check("restart-baseline",resumedRoute.traffic_mode==="BASE_ONLY"&&resumedRoute.live_coverage_ratio===0&&resumedRoute.duration_s===baseline.duration_s,resumedRoute,
      "Restarted native routing cannot resurrect the withdrawn positive speed.","재시작한 엔진이 철회된 속도를 되살리지 않습니다.");
    let deadline=false;try {await restarted.route({...restartRequest,request_id:"deadline"},new AbortController().signal,performance.now()-1);}catch {deadline=true;}
    check("deadline",deadline,deadline,"Expired request deadlines cannot start a route.","기한이 지난 요청을 실행하지 않습니다.");
    let outside=false;try {await restarted.route({...restartRequest,request_id:"outside",origin:{latitude:0,longitude:0}},new AbortController().signal);}catch {outside=true;}
    check("input-scope",outside,outside,"Out-of-graph coordinates cannot request public routing.","지도 범위 밖 입력을 거부합니다.");
    const trust=parseJson(readFileSync(join(output,"runtime-1/trust-public.json"))) as {public_jwk:Parameters<typeof importJWK>[0]};
    const key=await importJWK(trust.public_jwk,"EdDSA");let signatures=0;
    const publicRoot=join(output,"runtime-1/public-source");
    for(const name of readdirSync(publicRoot).filter(n=>n.endsWith(".jws"))){
      const jws=readFileSync(join(publicRoot,name),"utf8"),verified=await compactVerify(jws,key);
      const manifest=JSON.parse(Buffer.from(verified.payload).toString("utf8")),artifact=readFileSync(join(publicRoot,name.replace(/\.jws$/,".artifact.json")));
      if(manifest.traffic_snapshot_id!==sha256(artifact)||manifest.byte_length!==artifact.length)
        throw Error("Signed original hash mismatch / 서명 원문 해시 불일치");signatures++;
    }
    save("independent-signatures",{signatures});
    check("original-evidence",signatures>=3,signatures,"Original artifact hashes and standard Ed25519 signatures verify independently.","표준 서명 검사로 원 파일 해시를 독립 확인했습니다.");
  } catch(e) {
    writeFileSync(join(output,"failure.json"),JSON.stringify({name:e instanceof Error?e.name:"Unknown",
      detail:e instanceof Error?e.message:"Public runtime rejected / 공공 실행 거부",completed_cases:assertions.length},null,2));
    throw e;
  } finally {
    releasePending?.();
    const results=await Promise.allSettled([runtime?.close(),restarted?.close()]);clean=results.every(r=>r.status==="fulfilled"&&r.value!==false);
    const containers:unknown[]=[];
    for(const name of ["runtime-1","runtime-2"]){const root=join(output,name,"engines/engines");
      let dirs:string[]=[];try{dirs=readdirSync(root);}catch{continue;}
      for(const dir of dirs){const ownership=JSON.parse(readFileSync(join(root,dir,"ownership.json"),"utf8"));let absent=false;
        try{execFileSync("docker",["inspect",ownership.container_name],{stdio:"pipe"});}catch(e){absent=/no such object|no such container/i.test((e as {stderr?:Buffer}).stderr?.toString()??"");}
        clean&&=absent&&ownership.cleanup_verified===true;containers.push({container_name:ownership.container_name,receipt:ownership.cleanup_verified,independently_absent:absent});}}
    save("cleanup",{clean,containers});
    for(const stream of readdirSync(privateRoot)){const path=join(privateRoot,stream,"accepted.sqlite");try{copyFileSync(path,join(output,"accepted.sqlite"));}catch{clean=false;}}
    rmSync(privateRoot,{recursive:true,force:true});
  }
  check("cleanup",clean,captures.cleanup,"Owned native daemons, compiler, loopback servers and SQLite closed.","소유 엔진·변환·로컬 서버·SQLite를 종료했습니다.");
  requirePublicSpeedCases(assertions,regional);
  if(!canonical(sourceIdentity()).equals(canonical(source))||implementationFingerprint()!==fingerprint)
    throw Error("Source changed during public runtime checks / 공공 실행 검사 중 소스 변경");
  writeFileSync(join(output,"manifest.json"),JSON.stringify({status:"PASS",source,graph_id:graph.graphId,implementation_sha256:fingerprint,
    fixture_kind:captures.fixture_kind,provider_contract:regional?"kr-regional-v1":"kr-its-v1",scope_en:"Actual native Seoul routing with authored provider faults; actual live acquisition is separate.",
    scope_ko:"서울 실제 엔진·자체 제공자 장애 검사이며 실제 공공 수집은 별도입니다.",assertions:assertions.length,cleanup_verified:clean,
    output_sha256:inventory(output)},null,2));
  return {assertions};
}
if(isMain(import.meta.url)) {
  const args=process.argv.slice(2),options=new Map<string,string>();
  for(let i=0;i<args.length;i+=2){if(!["--graph","--bundle","--output"].includes(args[i]!)||!args[i+1]||options.has(args[i]!))throw Error("Invalid arguments / 인수 오류");options.set(args[i]!,args[i+1]!);}
  if(options.size!==3)throw Error("Graph, bundle and output required / 지도·변환 묶음·출력 필요");
  runPublicSpeedChecks(options.get("--graph")!,options.get("--bundle")!,options.get("--output")!).then(v=>console.log(JSON.stringify({passed:v.assertions.length})))
    .catch(()=>{console.error("Public runtime checks failed; inspect preserved originals. / 공공 실행 검사 실패·보존 원문 확인");process.exitCode=1;});
}
