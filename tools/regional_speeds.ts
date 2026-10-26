/** Explicit local regional acquisition/mapping commands / 명시 로컬 지역 수집·대응 명령 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain, parseJson, sha256 } from "./shared.js";
import { extendRegionalSceneGraph } from "./regional_speed_graph.js";
import { parseGitsWfs, reviewGitsWms, parseVdsInstallations, mapRegionalRoads } from "./regional_speed_geometry.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { RegionalSpeedCollector } from "./regional_speed_collector.js";
import { PublicSpeedError, type PublicBounds } from "./public_speed_source.js";
import type { PublicRoadMapping } from "./public_speed_geometry.js";
import { collectRegionalMapEvidence } from "./regional_speed_map.js";
import { compareRegionalTraffic } from "./regional_speed_comparison.js";

function file(path: string, max=16*1024*1024): Buffer {
  const s=lstatSync(path);if(!s.isFile() || s.isSymbolicLink() || s.size>max)throw new PublicSpeedError("REGIONAL_INPUT_FILE_REFUSED");
  return readFileSync(path);
}
export async function regionalSpeedsMain(argv: string[]): Promise<void> {
  const operation=argv[0],allowed:Record<string,string[]>={
    graph:["--base","--output"],geometry:["--bounds","--output"],map:["--graph","--wfs","--hits","--wms","--vds","--output"],
    collect:["--mapping","--inputs","--bounds","--output"]};
  allowed.compare=["--graph","--bundle","--mapping","--response","--batch","--output"];
  if(!operation || !Object.hasOwn(allowed,operation))throw new PublicSpeedError("EXPECTED_REGIONAL_COMMAND_GRAPH_MAP_COLLECT");
  const opts=new Map<string,string>();
  for(let i=1;i<argv.length;i+=2){const k=argv[i]!,v=argv[i+1];
    if(!allowed[operation]!.includes(k) || !v || v.startsWith("--") || opts.has(k))throw new PublicSpeedError("INVALID_ARGUMENTS");
    opts.set(k,v);}
  const required=(key:string)=>{const v=opts.get(key);if(!v)throw new PublicSpeedError("MISSING_ARGUMENTS");return v;};
  const output=resolve(required("--output"));
  if(operation==="compare"){
    try {
      await compareRegionalTraffic({graph:required("--graph"),bundle:required("--bundle"),mapping:required("--mapping"),
        response:required("--response"),batch:required("--batch"),output});
    } catch(error) {
      if(existsSync(output))writeFileSync(join(output,"failure.json"),JSON.stringify({
        status:"FAIL",reason:error instanceof Error?error.message:"UNKNOWN_ERROR",
        message_en:"Comparison stopped; original requests, responses and cleanup receipts remain local.",
        message_ko:"비교 중단·원래 요청과 응답 및 정리 기록을 로컬에 보존합니다."},null,2)+"\n",{flag:"wx"});
      throw error;
    }
    console.log("Regional native comparison passed; inspect outcomes.json. / 지역 엔진 비교 통과·상세 결과를 확인하세요.");return;
  }
  if(operation==="geometry"){
    await collectRegionalMapEvidence(required("--bounds").split(",").map(Number) as unknown as PublicBounds,output);
    console.log("Regional geometry originals retained; inspect review-outcomes.json. / 지역 지형 원문 보존·검토 결과를 확인하세요.");return;
  }
  if(operation==="graph"){
    const graph=extendRegionalSceneGraph(required("--base"),output);
    console.log(JSON.stringify({graph_id:graph.graphId,routes:graph.routes.length,edges:graph.edges.length,
      message_en:"Exact tiles reused; complete regional native inventory revalidated.",message_ko:"타일 재사용·전체 지역 엔진 목록 재검증을 마쳤습니다."}));return;
  }
  mkdirSync(output,{mode:0o700});
  const save=(name:string,value:unknown)=>writeFileSync(join(output,name),JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
  if(operation==="collect"){
    const mapping=parseJson(file(required("--mapping"))) as PublicRoadMapping;
    const bounds=required("--bounds").split(",").map(Number) as unknown as PublicBounds;
    const read=await new RegionalSpeedCollector(required("--inputs"),bounds,mapping).collect();
    writeFileSync(join(output,"response.json"),read.raw,{flag:"wx",mode:0o600});save("batch.json",read.batch);
    console.log(JSON.stringify({received_rows:read.batch.received_rows,live_references:read.batch.observations.filter(o=>o.status==="LIVE").length,
      message_en:"Regional originals acquired with unchanged observation times.",message_ko:"원 관측시각을 유지한 지역 원문을 수집했습니다."}));return;
  }
  const graph=loadSeoulGraph(required("--graph")),raw=file(required("--wfs"));
  const hits=file(required("--hits")).toString("utf8");
  if(/<!ENTITY|<!DOCTYPE|Exception/i.test(hits))throw new PublicSpeedError("INVALID_GITS_HITS");
  const count=hits.match(/\bnumberOfFeatures="(\d+)"/)?.[1];if(!count)throw new PublicSpeedError("INVALID_GITS_HITS");
  const parsed=parseGitsWfs(raw,Number(count)),reviewed=[],excluded=[...parsed.excluded];
  for(const curve of parsed.curves){
    const path=join(resolve(required("--wms")),"link-"+curve.source_id+".body");
    if(!existsSync(path)){excluded.push({source_id:curve.source_id,reason:"WMS_NOT_REVIEWED"});continue;}
    try{reviewed.push(reviewGitsWms(curve,file(path)));}
    catch(e){excluded.push({source_id:curve.source_id,reason:e instanceof PublicSpeedError?e.code:"WMS_READ_FAILED"});}
  }
  const directory=resolve(required("--vds")),names=readdirSync(directory).filter(n=>/^ex-vds-page\d{3}\.json$/.test(n)).sort();
  const pages=names.map(n=>file(join(directory,n),1024*1024)),installations=parseVdsInstallations(pages);
  const mapping=mapRegionalRoads(graph.graphId,graph.edges,reviewed,installations);
  save("reviewed-curves.json",reviewed);save("installations.json",installations);save("mapping.json",mapping);
  const review={raw_wfs_features:parsed.raw_feature_count,reviewed_service_curves:reviewed.length,exclusions:excluded,
    vds_pages:names.length,parsed_installations:installations.length,mapped_edges:mapping.entries.length,
    alternative_counts:{gits:mapping.regional_alternatives!.filter(a=>a.link_id.startsWith("gits:")).length,
      ex:mapping.regional_alternatives!.filter(a=>a.link_id.startsWith("ex:")).length},
    original_wfs_sha256:sha256(raw),message_en:"Counts cover the declared native trial catalog; unreviewed and ambiguous geometry remains excluded.",
    message_ko:"명시 시험 목록의 개수이며 미검토·모호한 지형은 제외합니다."};
  save("geometry-review.json",review);console.log(JSON.stringify({...review,exclusions:excluded.length}));
}
if(isMain(import.meta.url))regionalSpeedsMain(process.argv.slice(2)).catch(e=>{
  console.error(e instanceof PublicSpeedError?e.message:"Regional operation failed; retain local originals. / 지역 작업 실패·로컬 원문을 보존하세요.");
  process.exitCode=2;
});
