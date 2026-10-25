/** Explicit local source commands; credentials are accepted only through the environment.
 * 명시적 로컬 수집 명령이며 인증키는 환경변수에서만 받습니다. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { isMain, parseJson } from "./shared.js";
import { durableNodeJSON } from "./node_engine.js";
import { ItsSpeedCollector, PublicSpeedError, type PublicBounds } from "./public_speed_source.js";
import { bindProviderNodeEvidence, importOfficialRoadGeometry, mapPublicRoads, type OfficialRoadGeometry, type PublicRoadMapping } from "./public_speed_geometry.js";
import type { PublicSpeedBatch } from "./public_speed_source.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { PublicSpeedRuntime } from "./public_speed_runtime.js";
import { collectProviderMapGeometry } from "./public_speed_map.js";
import type { PublicRoadGeometry } from "./public_speed_geometry.js";

export async function publicSpeedsMain(argv: string[]): Promise<void> {
  const operation = argv[0];
  if (!["collect", "import", "provider-map", "map", "bind-nodes", "serve"].includes(operation ?? ""))
    throw new PublicSpeedError("EXPECTED_PUBLIC_SOURCE_COMMAND");
  const options = new Map<string, string>();
  const allowed: Record<string, string[]> = {
    collect: ["--bounds", "--output"], import: ["--bounds", "--directory", "--revision", "--output"],
    map: ["--geometry", "--graph", "--output"],
    "provider-map": ["--graph", "--batch", "--output"],
    "bind-nodes": ["--geometry", "--mapping", "--batch", "--proofs", "--output"],
    serve: ["--graph", "--bundle", "--mapping", "--state", "--output", "--bounds", "--lifetime-ms", "--capture-evidence"],
  };
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i]!, v = argv[i + 1];
    if (!allowed[operation!]!.includes(k) || !v || v.startsWith("--") || options.has(k))
      throw new PublicSpeedError("INVALID_ARGUMENTS");
    options.set(k, v);
  }
  const required = (key: string): string => {
    const v = options.get(key); if (!v) throw new PublicSpeedError("MISSING_ARGUMENTS"); return v;
  };
  const output = resolve(required("--output"));
  const bounds = () => required("--bounds").split(",").map(Number) as unknown as PublicBounds;
  if (operation === "serve") {
    const abort = new AbortController();
    const stop = () => abort.abort();
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    let runtime: PublicSpeedRuntime | undefined;
    try {
      const evidence = options.get("--capture-evidence");
      if (evidence !== undefined && !["true", "false"].includes(evidence)) throw new PublicSpeedError("INVALID_ARGUMENTS");
      runtime = await PublicSpeedRuntime.start({graph_directory: resolve(required("--graph")), bundle_directory: resolve(required("--bundle")),
        mapping_path: resolve(required("--mapping")), state_directory: resolve(required("--state")), output_directory: output,
        assets_directory: resolve("dist/web/pilot"), bounds: bounds(),
        ...(options.has("--lifetime-ms") ? {lifetime_ms: Number(options.get("--lifetime-ms"))} : {}), capture_evidence: evidence === "true"}, {}, abort.signal);
      console.log(JSON.stringify({origin: runtime.origin, source_class: "PUBLIC_AGENCY", graph_id: runtime.bootstrap.graph_id,
        message_en: "Local public-speed navigation is ready; actual coverage and source times appear in the client.",
        message_ko: "로컬 공공 속도 경로 화면을 준비했습니다. 실제 적용률·관측 시각은 화면에서 확인하세요."}));
      if (!await runtime.ended) throw new PublicSpeedError("PUBLIC_RUNTIME_CLEANUP_FAILED");
    } finally {process.off("SIGINT", stop); process.off("SIGTERM", stop); await runtime?.close();}
  } else if (operation === "collect") {
    const result = await new ItsSpeedCollector(process.env.ROUTELENS_ITS_API_KEY ?? "", bounds()).collect();
    mkdirSync(output); // Never overwrite an original capture. / 원 수집 내용을 덮어쓰지 않습니다.
    writeFileSync(join(output, "response.json"), result.raw, {flag: "wx", mode: 0o600});
    durableNodeJSON(join(output, "batch.json"), result.batch);
    console.log(JSON.stringify({source_class: result.batch.source_class, received_rows: result.batch.received_rows,
      live_links: result.batch.observations.filter(o => o.status === "LIVE").length,
      message_en: "Public observations collected; graph mapping/routing acceptance is separate.",
      message_ko: "공공 관측을 수집했으며 지도 대응·경로 검증은 별도입니다."}));
  } else if (operation === "import") {
    const geometry = await importOfficialRoadGeometry(required("--directory"), required("--revision"), bounds());
    writeFileSync(output, JSON.stringify(geometry) + "\n", {flag: "wx"});
    console.log(JSON.stringify({links: geometry.links.length, rejected_nodes: geometry.rejected_node_records,
      message_en: "Official geometry imported with original projection and node checks.",
      message_ko: "원 좌표계·공식 노드 검사를 거쳐 지형을 가져왔습니다."}));
  } else if (operation === "provider-map") {
    const graph = loadSeoulGraph(required("--graph"));
    const batch = parseJson(readFileSync(required("--batch"))) as PublicSpeedBatch;
    const geometry = await collectProviderMapGeometry(graph.edges, batch, output);
    console.log(JSON.stringify({verified_links: geometry.links.length, failed_requests: geometry.failed_requests,
      message_en: "Two official map layers checked against exact numeric-source nodes; whole-edge mapping is still required.",
      message_ko: "두 공식 지도 레이어·수치 출처 노드를 대조했으며 전체 방향 구간 대응이 추가로 필요합니다."}));
  } else if (operation === "map") {
    const graph = loadSeoulGraph(required("--graph"));
    const geometry = parseJson(readFileSync(required("--geometry"))) as PublicRoadGeometry;
    const mapping = mapPublicRoads(graph.graphId, graph.edges, geometry);
    writeFileSync(output, JSON.stringify(mapping, null, 2) + "\n", {flag: "wx"});
    console.log(JSON.stringify({mapped_edges: mapping.entries.length, excluded_edges: mapping.excluded.length,
      message_en: "Directed geometry candidates checked; reviewed mapping and route proof remain separate.",
      message_ko: "방향 지형 대응 후보를 확인했으며 대응 검토·경로 증명은 별도입니다."}));
  } else {
    const read = (key: string) => parseJson(readFileSync(required(key)));
    const result = bindProviderNodeEvidence(read("--mapping") as PublicRoadMapping,
      read("--geometry") as OfficialRoadGeometry, read("--batch") as PublicSpeedBatch,
      read("--proofs") as Parameters<typeof bindProviderNodeEvidence>[3]);
    writeFileSync(output, JSON.stringify(result, null, 2) + "\n", {flag: "wx"});
    console.log(JSON.stringify({verified_link_bindings: result.provider_node_bindings!.length,
      message_en: "Provider node tuples bound to independent official geometry; no ID truncation was used.",
      message_ko: "별도 공식 지형으로 제공자 노드 쌍을 연결했으며 식별자 일부를 잘라 맞추지 않았습니다."}));
  }
}
if (isMain(import.meta.url)) {
  publicSpeedsMain(process.argv.slice(2)).catch(error => {
    console.error(error instanceof PublicSpeedError ? error.message :
      "Public traffic command failed; inspect local inputs without publishing credentials. / 공공 교통 명령 실패·키를 공개하지 않고 로컬 입력을 확인하세요.");
    process.exitCode = 2;
  });
}
