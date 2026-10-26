/** Same graph, captured observations and resolved native departure for every comparison.
 * 같은 지도·보존 관측·엔진에서 확인한 출발시각으로 비교합니다. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateKeyPair, exportJWK } from "jose";
import { canonical, parseJson, sha256 } from "./shared.js";
import { loadSeoulGraph, seoulSceneInputs, inventory } from "./seoul_bundle.js";
import { GraphCommands, OwnedGraphContainer, engineJson } from "./test_graph.js";
import { loadTrafficBundle, boundedTrafficFile } from "./traffic_bundle.js";
import { compileTrafficGeneration, verifyTrafficGeneration } from "./traffic_compiler.js";
import { nativeRouteRequest } from "./route_contract.js";
import { validateNativeFixedDepartureResult } from "./gateway_controller.js";
import { buildPublicTrafficSnapshot, signPublicTraffic, verifyPublicTraffic, type PublicTrafficPublication } from "./public_speed_publication.js";
import { normalizeRegionalResponse } from "./regional_speed_source.js";
import { validateRegionalMapping } from "./regional_speed_geometry.js";
import { PublicSpeedError, type PublicSpeedBatch } from "./public_speed_source.js";
import type { PublicRoadMapping } from "./public_speed_geometry.js";
import type { GatewayRequest } from "./gateway_public_types.js";
import { geodesicSphere } from "./geodesy.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";

type Mode="baseline"|"gits"|"ex"|"combined";
function selectedMapping(mapping: PublicRoadMapping, mode: Mode): PublicRoadMapping {
  const alternatives=mapping.regional_alternatives!.filter(e=>mode==="combined" ||
    e.link_id.startsWith(mode==="gits"?"gits:":"ex:"));
  const used=new Set<string>(),entries=alternatives.filter(e=>{if(used.has(e.edge_id))return false;used.add(e.edge_id);return true;});
  const all=[...mapping.entries,...mapping.excluded].map(e=>e.edge_id).sort();
  return {...mapping,entries,regional_alternatives:alternatives,
    excluded:all.filter(id=>!used.has(id)).map(edge_id=>({edge_id,reason:"NO_MATCH"}))};
}
export interface RegionalComparisonConfig {
  graph: string; bundle: string; mapping: string; response: string; batch: string; output: string;
}
export async function compareRegionalTraffic(c: RegionalComparisonConfig): Promise<void> {
  const output=resolve(c.output);mkdirSync(output,{mode:0o700});
  const source=sourceIdentity(),fingerprint=implementationFingerprint(),graph=loadSeoulGraph(c.graph),bundle=loadTrafficBundle(c.bundle,c.graph);
  const mapping=parseJson(readFileSync(c.mapping)) as PublicRoadMapping;
  validateRegionalMapping(mapping,bundle.catalog);
  if(mapping.graph_id!==graph.graphId || mapping.graph_edges_sha256!==sha256(canonical(graph.edges)))throw new PublicSpeedError("MAPPING_GRAPH_MISMATCH");
  const raw=readFileSync(c.response),claimed=parseJson(readFileSync(c.batch)) as PublicSpeedBatch;
  const batch=normalizeRegionalResponse(raw,claimed.retrieved_at,claimed.bounds,mapping);
  if(!canonical(batch).equals(canonical(claimed)))throw new PublicSpeedError("REGIONAL_BATCH_BYTES_MISMATCH");
  // Regional acceptance uses the twelve predeclared corridor trials. Historical urban scenes
  // remain in the graph and whole integration, with their original endpoint policies.
  // 지역 수용은 사전 고정한 열두 간선 시험이며 기존 도심 시험은 전체 통합에서 유지합니다.
  const scenes=(seoulSceneInputs(graph.directory) as Array<{route_id:string;name_en:string;name_ko:string;locations:[{lon:number;lat:number},{lon:number;lat:number}]}>)
    .filter(s=>s.route_id.startsWith("regional-"));
  if(scenes.length!==12)throw new PublicSpeedError("REGIONAL_COMPARISON_TRIALS_REQUIRED");
  const keys=await generateKeyPair("EdDSA",{extractable:true}),private_jwk=await exportJWK(keys.privateKey),public_jwk=await exportJWK(keys.publicKey);
  const now=()=>new Date().toISOString(),save=(path:string,v:unknown)=>writeFileSync(path,JSON.stringify(v,null,2)+"\n",{flag:"wx",mode:0o600});
  const outcomes:Array<Record<string,unknown>>=[],nativeResults=new Map<string,ReturnType<typeof validateNativeFixedDepartureResult>>();
  let departure:string|undefined;const cleaned:string[]=[];
  for(const mode of ["baseline","gits","ex","combined"] as const){
    const root=join(output,mode);mkdirSync(root);
    let publication:PublicTrafficPublication|null=null;
    const selected=mode==="baseline"?mapping:selectedMapping(mapping,mode);
    const trust={kid:"comparison-key",public_jwk,publisher_id:"regional-comparison",graph_id:graph.graphId,
      mapping_sha256:sha256(canonical(selected)),valid_from:new Date(Date.now()-60000).toISOString(),
      valid_until:new Date(Date.now()+3600000).toISOString(),revoked:false};
    if(mode!=="baseline"){
      const snapshot=buildPublicTrafficSnapshot(batch,selected,trust.publisher_id,1,now());
      if(snapshot){
        const signed=await signPublicTraffic(snapshot,trust.kid,private_jwk,bundle.catalog);
        publication=await verifyPublicTraffic(signed.jws,signed.artifact,trust,selected,bundle.catalog,now());
        writeFileSync(join(root,"source.artifact.json"),publication.artifact,{flag:"wx"});
        writeFileSync(join(root,"source.jws"),publication.jws,{flag:"wx"});
        save(join(root,"trust.json"),trust);save(join(root,"mapping.json"),selected);
      }
    }
    const generation=await compileTrafficGeneration(bundle,publication,join(root,"generations"));
    verifyTrafficGeneration(generation);
    writeFileSync(join(root,"traffic.tar"),boundedTrafficFile(generation.traffic_path),{flag:"wx"});
    const config=parseJson(readFileSync(join(graph.directory,"config.json"))) as {mjolnir:Record<string,unknown>};
    Object.assign(config.mjolnir,{tile_dir:"/graph/tiles",tile_extract:"",traffic_extract:"/work/traffic.tar",
      admin:"/graph/no-admin.sqlite",timezone:"/graph/no-timezone.sqlite"});
    save(join(root,"config.json"),config);
    const commands=new GraphCommands(root),container=new OwnedGraphContainer(commands);
    const execute=(id:string,action:string,request:unknown)=>{
      save(join(root,id+".request.json"),request);
      const result=engineJson(container.exec(["valhalla_service","/work/config.json",action,"/work/"+id+".request.json"],60000).stdout);
      save(join(root,id+".response.json"),result);return result as Record<string,unknown>;
    };
    const stop=()=>{try{container.cleanup();}finally{process.exit(130);}};
    process.once("SIGINT",stop);process.once("SIGTERM",stop);
    try{
      container.start(bundle.image_id,root,bundle.graph_directory,{memory:"4g"});
      if(!departure){
        const probe=execute("clock-probe","route",nativeRouteRequest({locations:scenes[0]!.locations}));
        const trip=probe.trip as {locations?:Array<{date_time?:unknown}>};
        const resolved=trip.locations?.[0]?.date_time;
        if(typeof resolved!=="string" || !/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(resolved) ||
           Math.abs(Date.now()-Date.parse(resolved+":00.000Z"))>120000)throw new PublicSpeedError("UNVERIFIED_NATIVE_COMPARISON_CLOCK");
        departure=resolved;
      }
      const selectedById=new Map(publication?.snapshot.entries.map(e=>[e.edge_id,e])??[]);
      for(const scene of scenes){
        if(publication)await verifyPublicTraffic(publication.jws,publication.artifact,trust,selected,bundle.catalog,now());
        const request:GatewayRequest={schema_version:"0.1",request_id:scene.route_id,origin:{longitude:scene.locations[0].lon,latitude:scene.locations[0].lat},
          destination:{longitude:scene.locations[1].lon,latitude:scene.locations[1].lat},profile:"car",traffic_policy:"prefer_live"};
        const native={...nativeRouteRequest({locations:scene.locations}),date_time:{type:1,value:departure}};
        const route=execute(scene.route_id+"-route","route",native) as {trip:{legs:Array<{shape:string}>}};
        const trace=execute(scene.route_id+"-trace","trace_attributes",{encoded_polyline:route.trip.legs[0]!.shape,shape_match:"edge_walk",costing:"auto",
          date_time:{type:1,value:departure},filters:{action:"include",attributes:["edge.id","edge.length","edge.speed","shape"]}});
        const result=validateNativeFixedDepartureResult({request:native,route,trace},request,"regional-comparison",bundle,generation,departure);
        if(publication)await verifyPublicTraffic(publication.jws,publication.artifact,trust,selected,bundle.catalog,now());
        const bySource={gits:0,ex:0};
        for(const edge of trace.edges as Array<{id:number;length:number}>){const entry=selectedById.get(String(edge.id));
          if(entry)bySource[entry.link_id.startsWith("ex:")?"ex":"gits"]+=edge.length*1000;}
        const baseline=nativeResults.get("baseline:"+scene.route_id);
        nativeResults.set(mode+":"+scene.route_id,result);
        outcomes.push({mode,route_id:scene.route_id,name_en:scene.name_en,name_ko:scene.name_ko,departure_native_clock:departure,
          checked_at_utc:now(),distance_m:result.distance_m,duration_s:result.duration_s,
          live_coverage_ratio:result.live_coverage_ratio,covered_m_by_source:bySource,
          same_geometry_as_baseline:baseline?canonical(result.geometry).equals(canonical(baseline.geometry)):true,
          baseline_s:baseline?.duration_s??result.duration_s,delta_s:baseline?result.duration_s-baseline.duration_s:0,
          route_geometry_sha256:sha256(canonical(result.geometry)),request_sha256:sha256(canonical(native)),
          source_entries:publication?.snapshot.entries.length??0,generation_id:generation.generation_id});
        save(join(root,scene.route_id+"-validated.json"),result);
        writeFileSync(join(output,"outcomes.json"),JSON.stringify(outcomes,null,2)+"\n");
      }
    }finally{
      process.off("SIGINT",stop);process.off("SIGTERM",stop);
      const clean=container.cleanup();save(join(root,"cleanup.json"),{cleanup_verified:clean,container:container.name});
      if(!clean)throw new PublicSpeedError("REGIONAL_COMPARISON_CLEANUP");cleaned.push(container.name);
    }
  }
  if(!canonical(sourceIdentity()).equals(canonical(source)) || implementationFingerprint()!==fingerprint)
    throw new PublicSpeedError("SOURCE_CHANGED_DURING_REGIONAL_COMPARISON");
  const influenced=(mode:string)=>outcomes.some(r=>r.mode===mode && (Number(r.live_coverage_ratio)>0) && Math.abs(Number(r.delta_s))>0.001);
  const accepted=influenced("gits")&&influenced("ex")&&influenced("combined");
  save(join(output,"manifest.json"),{status:accepted?"PASS":"INCOMPLETE_INFLUENCE",source,implementation_sha256:fingerprint,
    graph_id:graph.graphId,graph_manifest_sha256:graph.manifestSha256,raw_response_sha256:batch.raw_sha256,
    mapping_sha256:sha256(canonical(mapping)),departure_native_clock:departure,native_clock_basis:"UTC_NO_TIMEZONE_DATABASE_VERIFIED_BY_CURRENT_PROBE",
    trial_ids:scenes.map(s=>s.route_id),comparison_scope:"TWELVE_PINNED_REGIONAL_CORRIDORS",
    graph_catalog_edges:bundle.catalog.length,graph_catalog_length_m:graph.edges.reduce((n,e)=>n+geodesicSphere.length(e.directed_geometry),0),
    mapping_edges:mapping.entries.length,mapping_length_m:graph.edges.filter(e=>mapping.entries.some(m=>m.edge_id===e.edge_id))
      .reduce((n,e)=>n+geodesicSphere.length(e.directed_geometry),0),native_cases:outcomes.length,cleaned_containers:cleaned,
    message_en:"Captured actual agency observations affected real native routes. Compare identical resolved departure times; ETA accuracy and metropolitan completeness are not measured. Government originals/traffic bytes stay local pending source-specific reuse review.",
    message_ko:"실제 공공 관측의 엔진 경로 영향을 동일한 확인 출발시각으로 비교합니다. 도착시간 정확도·수도권 전체 적용률은 측정하지 않으며 기관 원문·교통 바이트는 별도 이용 조건 확인 전 로컬에 둡니다.",output_sha256:inventory(output)});
  if(!accepted)throw new PublicSpeedError("REGIONAL_SOURCE_INFLUENCE_NOT_PROVEN");
}
