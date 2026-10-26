/** Reuse exact validated tiles, add actual native evidence, then revalidate the complete inventory.
 * 검증한 타일을 재사용하고 실제 엔진 원문을 추가한 뒤 전체 목록을 다시 검사합니다. */
import { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonical, parseJson, sha256 } from "./shared.js";
import { object, items } from "./graph_evidence.js";
import { GraphCommands, OwnedGraphContainer } from "./test_graph.js";
import { sourceIdentity } from "./pilot_runner.js";
import { seoulNativeRequest } from "./seoul_graph.js";
import { deriveScene, inventory, loadSeoulGraph, REGIONAL_SCENES, regionalLocateRequest,
  regionalTraceRequest, selectContext, seoulSceneInputs } from "./seoul_bundle.js";
import { PublicSpeedError } from "./public_speed_source.js";

export function extendRegionalSceneGraph(baseDirectory: string, outputDirectory: string) {
  const base = loadSeoulGraph(baseDirectory), output = resolve(outputDirectory);
  if (base.manifest.files_sha256 && Object.hasOwn(base.manifest.files_sha256 as object,"regional-scenes.json"))
    throw new PublicSpeedError("REGIONAL_GRAPH_ALREADY_EXTENDED");
  mkdirSync(output);
  cpSync(base.directory, output, {recursive:true,errorOnExist:true,force:false});
  copyFileSync(REGIONAL_SCENES,join(output,"regional-scenes.json"));
  writeFileSync(join(output,"regional-base-manifest.json"),readFileSync(join(base.directory,"manifest.json")),{flag:"wx"});
  const nativeRoot = join(output,"regional-native");mkdirSync(nativeRoot);
  const commands = new GraphCommands(nativeRoot), container = new OwnedGraphContainer(commands);
  const routes = [...base.routes], edges = new Map(base.edges.map(e => [e.edge_id,e]));
  let cleaned = false;
  try {
    container.start((base.manifest.image as {id:string}).id,output,undefined,{memory:"4g"});
    for (const raw of seoulSceneInputs(output).slice(base.routes.length)) {
      const scene = object(raw), id = String(scene.route_id);
      const route = seoulNativeRequest(container,output,`route-${id}`,"route",{
        locations:scene.locations,costing:"auto",units:"kilometers",language:"en-US"});
      const shape = object(items(object(object(route).trip).legs)[0]).shape;
      const trace = seoulNativeRequest(container,output,`trace-${id}`,"trace_attributes",regionalTraceRequest(shape));
      const locate = seoulNativeRequest(container,output,`locate-${id}`,"locate",regionalLocateRequest(trace,true));
      const derived = deriveScene(scene,route,trace,locate,`locate-${id}.response.json`);
      routes.push(derived.route);
      for (const e of derived.edges) {
        const old = edges.get(e.edge_id);
        if (old && !canonical({...old,evidence_path:""}).equals(canonical({...e,evidence_path:""})))
          throw new PublicSpeedError("REGIONAL_GRAPH_EDGE_CONFLICT");
        if (!old) edges.set(e.edge_id,e);
      }
    }
  } catch (error) {
    writeFileSync(join(nativeRoot,"failure.json"),JSON.stringify({
      message_en:"Regional scene derivation failed; originals remain unchanged.",message_ko:"지역 장면 재구성 실패·원문을 유지합니다.",
      diagnostic:error instanceof Error?error.message:String(error)},null,2)+"\n");
    throw error;
  } finally {
    cleaned = container.cleanup();
    writeFileSync(join(nativeRoot,"cleanup.json"),JSON.stringify({cleanup_verified:cleaned})+"\n");
    if (!cleaned) throw new PublicSpeedError("REGIONAL_GRAPH_CLEANUP_FAILED");
  }
  const context = selectContext(readFileSync(join(output,"context-edges.tsv"),"utf8"),routes);
  const save = (name: string,value: unknown) => writeFileSync(join(output,name),JSON.stringify(value,null,2)+"\n");
  save("routes.json",routes);save("edge-map.json",[...edges.values()]);save("context-roads.json",context.roads);
  const manifest = {...base.manifest,source:sourceIdentity(),cleanup_verified:cleaned,
    regional_extension:{base_manifest_sha256:base.manifestSha256,scene_lock_sha256:sha256(readFileSync(REGIONAL_SCENES)),
      reused_exact_tiles:true,source_en:"Exact base graph reused; additional native route/trace/locate requests executed.",
      source_ko:"정확한 기존 지도를 재사용하고 추가 실제 경로·추적·조회 요청을 실행했습니다."},
    context_full_count:context.full_count,context_selected_count:context.roads.length,context_skipped_log_lines:context.skipped_log_lines,
    files_sha256:inventory(output)};
  delete manifest.files_sha256["manifest.json"];
  save("manifest.json",manifest);
  return loadSeoulGraph(output);
}
