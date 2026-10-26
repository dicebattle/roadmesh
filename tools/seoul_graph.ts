import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { canonical, fail, parseJson, ROOT, sha256 } from "./shared.js";
import { items, object, type EdgeMapping } from "./graph_evidence.js";
import {
  BASE_IMAGE,
  engineJson,
  GraphCommands,
  GraphError,
  OwnedGraphContainer,
  prepareImage,
} from "./test_graph.js";
import { sourceIdentity } from "./pilot_runner.js";
import {
  deriveScene,
  fileSha256,
  inventory,
  loadSeoulGraph,
  SCENES,
  seoulSceneInputs,
  regionalTraceRequest,
  regionalLocateRequest,
  selectContext,
  seoulGraphIdentity,
  SOURCE_LOCK,
  verifySource,
} from "./seoul_bundle.js";
import type { SeoulGraphBundle } from "./seoul_types.js";

function write(output: string, name: string, value: unknown): void {
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n");
}
export function sourceCachePath(): string {
  const lock = object(parseJson(readFileSync(SOURCE_LOCK)));
  return join(
    resolve(
      process.env.ROUTELENS_SOURCE_CACHE ??
        join(ROOT, "data/seoul-source-cache"),
    ),
    String(lock.sha256),
    String(lock.file_name),
  );
}
export function acquireSeoulSource(sourcePath?: string): string {
  if (sourcePath) {
    const path = resolve(sourcePath);
    verifySource(path);
    return path;
  }
  const path = sourceCachePath(),
    lock = object(parseJson(readFileSync(SOURCE_LOCK)));
  if (existsSync(path)) {
    verifySource(path);
    return path;
  }
  mkdirSync(resolve(path, ".."), { recursive: true });
  const partial = `${path}.partial-${randomUUID()}`;
  try {
    const result = spawnSync(
      "curl",
      [
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--max-time",
        "600",
        "--max-filesize",
        String(lock.size_bytes),
        "--output",
        partial,
        String(lock.url),
      ],
      { encoding: "utf8", timeout: 610000, maxBuffer: 1024 * 1024 },
    );
    if (result.error || result.status !== 0)
      throw new GraphError(
        `Pinned map download failed; use --source with the same SHA256. / 고정 지도 다운로드에 실패했습니다. 동일 SHA256 원본을 --source로 지정하세요. ${result.stderr ?? result.error}`,
        2,
      );
    verifySource(partial);
    renameSync(partial, path);
  } finally {
    rmSync(partial, { force: true });
  }
  return path;
}
export function seoulNativeRequest(
  container: OwnedGraphContainer,
  output: string,
  name: string,
  action: string,
  body: unknown,
): unknown {
  write(output, `${name}.request.json`, body);
  const result = container.exec(
    [
      "valhalla_service",
      "/work/config.json",
      action,
      `/work/${name}.request.json`,
    ],
    60000,
  );
  const value = engineJson(result.stdout);
  write(output, `${name}.response.json`, value);
  return value;
}
export function runSeoulGraph(
  output: string,
  sourcePath?: string,
): SeoulGraphBundle {
  output = resolve(output);
  mkdirSync(output);
  const started = performance.now(),
    commands = new GraphCommands(output),
    container = new OwnedGraphContainer(commands);
  let failure: unknown,
    cleanup = false,
    manifest: Record<string, unknown> | undefined;
  try {
    const source = acquireSeoulSource(sourcePath),
      sourceVerifiedBefore = new Date().toISOString(),
      lock = object(parseJson(readFileSync(SOURCE_LOCK)));
    copyFileSync(SOURCE_LOCK, join(output, "source.lock.json"));
    copyFileSync(SCENES, join(output, "scenes.json"));
    const image = prepareImage(commands);
    container.start(image.id, output, undefined, {
      memory: "4g",
      sourcePath: source,
    });
    const valhalla = container
        .exec(["valhalla_service", "--version"])
        .stdout.trim(),
      osmium = container.exec(["osmium", "--version"]).stdout.trim();
    if (
      !/(?:^|\s)(?:valhalla\s+)?3\.9\.1(?:\s|$)/i.test(valhalla) ||
      !/osmium version 1\.16\.0(?:\s|$)/i.test(osmium)
    )
      throw new GraphError(
        "Unexpected executable versions. / 실행 파일 버전이 예상과 다릅니다.",
      );
    const engine = { valhalla, osmium };
    container.exec(
      [
        "osmium",
        "extract",
        "--bbox",
        "126.7,37.4,127.25,37.75",
        "--strategy",
        "smart",
        "-S",
        "types=restriction",
        "/source/source.osm.pbf",
        "--output",
        "/work/seoul.osm.pbf",
      ],
      180000,
    );
    const info = container.exec(
      ["osmium", "fileinfo", "-e", "-j", "/work/seoul.osm.pbf"],
      60000,
    );
    write(output, "fileinfo.json", engineJson(info.stdout));
    const config = object(
        engineJson(
          container.exec([
            "valhalla_build_config",
            "--mjolnir-tile-dir",
            "/work/tiles",
            "--mjolnir-tile-extract",
            "/work/unused.tar",
          ]).stdout,
        ),
      ),
      mjolnir = object(config.mjolnir);
    Object.assign(mjolnir, {
      tile_dir: "/work/tiles",
      tile_extract: "",
      admin: "/work/no-admin.sqlite",
      timezone: "/work/no-timezone.sqlite",
      concurrency: 2,
      id_table_size: 1000000,
      max_cache_size: 268435456,
    });
    object(mjolnir.data_processing).use_admin_db = false;
    for (const key of ["mjolnir", "loki", "thor", "odin", "meili"])
      object(config[key]).logging = { type: "std_err", color: false };
    write(output, "config.json", config);
    container.exec(
      [
        "valhalla_build_tiles",
        "-c",
        "/work/config.json",
        "/work/seoul.osm.pbf",
      ],
      600000,
    );
    const tile_sha256 = Object.fromEntries(
      Object.entries(inventory(output, "tiles")).map(([name, hash]) => [
        name.slice(6),
        hash,
      ]),
    );
    if (!Object.keys(tile_sha256).some((name) => name.endsWith(".gph")))
      throw new GraphError(
        "No Seoul graph tiles. / 서울 그래프 타일이 없습니다.",
      );
    const routes: SeoulGraphBundle["routes"] = [],
      edgeMap = new Map<string, EdgeMapping>();
    for (const raw of seoulSceneInputs(output)) {
      const scene = object(raw),
        id = String(scene.route_id),
        route = seoulNativeRequest(container, output, `route-${id}`, "route", {
          locations: scene.locations,
          costing: "auto",
          units: "kilometers",
          language: "en-US",
        });
      const shape = object(items(object(object(route).trip).legs)[0]).shape;
      const trace = seoulNativeRequest(
        container,
        output,
        `trace-${id}`,
        "trace_attributes",
        regionalTraceRequest(shape),
      );
      const locate = seoulNativeRequest(
        container,
        output,
        `locate-${id}`,
        "locate",
        regionalLocateRequest(trace,scene.inventory_policy === "regional-native-full-edges-v1"),
      );
      const derived = deriveScene(
        scene,
        route,
        trace,
        locate,
        `locate-${id}.response.json`,
      );
      routes.push(derived.route);
      for (const edge of derived.edges) {
        const previous = edgeMap.get(edge.edge_id);
        if (
          previous &&
          !canonical({ ...previous, evidence_path: "" }).equals(
            canonical({ ...edge, evidence_path: "" }),
          )
        )
          fail(
            "scene edges",
            "conflicting actual edge geometry",
            "실제 구간 지형이 다릅니다",
          );
        if (!previous) edgeMap.set(edge.edge_id, edge);
      }
    }
    write(output, "routes.json", routes);
    write(output, "edge-map.json", [...edgeMap.values()]);
    const exported = container.exec(
      ["valhalla_export_edges", "-c", "/work/config.json", "-u", "-x", "\t"],
      180000,
    );
    writeFileSync(join(output, "context-edges.tsv"), exported.stdout);
    const context = selectContext(exported.stdout, routes);
    write(output, "context-roads.json", context.roads);
    verifySource(source);
    write(output, "source-verification.json", {
      source_id: lock.source_id,
      size_bytes: lock.size_bytes,
      sha256: lock.sha256,
      verified_before_extract_utc: sourceVerifiedBefore,
      verified_after_build_utc: new Date().toISOString(),
      description_en:
        "Original source bytes passed size and SHA256 checks before extraction and after graph construction.",
      description_ko:
        "원본 바이트의 크기·SHA256을 추출 전과 그래프 생성 후 검증했습니다.",
    });
    const source_lock_sha256 = fileSha256(SOURCE_LOCK),
      pbf_sha256 = fileSha256(join(output, "seoul.osm.pbf")),
      config_sha256 = fileSha256(join(output, "config.json"));
    const graph_id = seoulGraphIdentity({
      source_lock_sha256,
      source_sha256: lock.sha256,
      pbf_sha256,
      config_sha256,
      image,
      engine,
      tile_sha256,
    });
    manifest = {
      schema_version: "seoul-0.1",
      fixture_id: "seoul-osm-20261023-v1",
      geometry_policy: "geodesic-sphere-v1",
      direction_basis: "engine_forward",
      scene_inventory_is_matcher_whitelist: false,
      source: sourceIdentity(),
      source_lock_sha256,
      map_source: {
        source_id: lock.source_id,
        file_name: lock.file_name,
        sha256: lock.sha256,
        size_bytes: statSync(source).size,
        url: lock.url,
      },
      source_verified_at_build: true,
      pbf_sha256,
      config_sha256,
      graph_id,
      engine,
      image,
      base_image: BASE_IMAGE,
      tile_sha256,
      engine_executed: true,
      graph_loaded: true,
      status: "PASS",
      context_full_count: context.full_count,
      context_selected_count: context.roads.length,
      context_skipped_log_lines: context.skipped_log_lines,
      context_scope_en:
        "Unfiltered exported graph geometry around route corridors; car access is not asserted.",
      context_scope_ko:
        "경로 주변의 필터 없는 실제 그래프 지형이며 자동차 접근을 주장하지 않습니다.",
      discarded_partial_edges_per_route: 2,
      resource_limits: { cpus: 2, memory_bytes: 4294967296, network: "none" },
      license: {
        attribution: lock.attribution,
        url: lock.license_url,
        source_url: lock.source_url,
      },
      evidence: {
        routes: "routes.json",
        edge_map: "edge-map.json",
        context: "context-roads.json",
        raw_export: "context-edges.tsv",
        commands: "commands.json",
      },
    };
  } catch (error) {
    failure = error;
  } finally {
    try {
      cleanup = container.cleanup();
    } catch (error) {
      failure = error;
    }
  }
  write(output, "cleanup.json", {
    cleanup_verified: cleanup,
    container: container.name,
    run_id: container.runId,
  });
  if (failure || !manifest || !cleanup) {
    write(output, "failure.json", {
      status: "FAIL",
      message_en: String(failure ?? "Incomplete graph evidence"),
      message_ko: "서울 그래프 생성·증거 검사가 완료되지 않았습니다.",
      cleanup_verified: cleanup,
    });
    throw (
      failure ??
      new GraphError(
        "Incomplete Seoul graph. / 서울 그래프가 완료되지 않았습니다.",
      )
    );
  }
  manifest.cleanup_verified = cleanup;
  manifest.elapsed_ms = performance.now() - started;
  manifest.completed_at_utc = new Date().toISOString();
  manifest.files_sha256 = inventory(output);
  write(output, "manifest.json.tmp", manifest);
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  try {
    return loadSeoulGraph(output);
  } catch (error) {
    renameSync(
      join(output, "manifest.json"),
      join(output, "rejected-manifest.json"),
    );
    write(output, "failure.json", {
      status: "FAIL",
      message_en: `Final bundle verification failed: ${String(error)}`,
      message_ko: "최종 묶음 검증에 실패하여 완료 목록을 철회했습니다.",
      cleanup_verified: cleanup,
    });
    throw error;
  }
}
