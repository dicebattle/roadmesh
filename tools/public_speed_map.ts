/** Bounded reads from two advertised official WMS layers, with exact provider nodes.
 * 공개된 두 공식 WMS 레이어의 제한 조회·정확한 제공자 노드 대응. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonical, parseJson, sha256 } from "./shared.js";
import { geodesicSphere } from "./geodesy.js";
import { PublicSpeedError, publicTime, validatePublicBounds, type PublicBounds, type PublicSpeedBatch } from "./public_speed_source.js";
import type { EdgeMapping } from "./graph_evidence.js";
import type { OfficialRoadLink, ProviderMapRoadGeometry } from "./public_speed_geometry.js";

const ENDPOINT = "https://its.go.kr:9443/geoserver/ntic/wms";
const STANDARD = "ntic:T_COB_MOCT_LINK_M", DISPLAY = "ntic:N_LEVEL_15";
interface Feature {id?: unknown; properties?: Record<string, unknown>; geometry?: {type?: unknown; coordinates?: unknown}}
export interface ProviderMapRead {url: string; layer: string; retrieved_at: string; raw: Uint8Array}
export interface ProviderMapDependencies {fetch?: typeof fetch; clock?: () => number; signal?: AbortSignal}
const fail = (code: string): never => {throw new PublicSpeedError(code);};
const id = (v: unknown): v is string => typeof v === "string" && /^\d{10}$/.test(v);
function line(value: unknown, bounds: PublicBounds): number[][] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10000 ||
      !value.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
        p[0] >= bounds[0] && p[0] <= bounds[2] && p[1] >= bounds[1] && p[1] <= bounds[3]))
    fail("INVALID_PROVIDER_GEOMETRY");
  return value as number[][];
}
function features(raw: Uint8Array): Feature[] {
  if (raw.length > 1024 * 1024) fail("PROVIDER_MAP_BODY_LIMIT");
  let r: {type?: unknown; features?: unknown; crs?: {properties?: {name?: unknown}}};
  try {r = parseJson(raw) as typeof r;} catch {return fail("INVALID_PROVIDER_MAP_JSON");}
  if (!r || r.type !== "FeatureCollection" || r.crs?.properties?.name !== "urn:ogc:def:crs:EPSG::4326" ||
      !Array.isArray(r.features) || r.features.length >= 20 ||
      r.features.some(f => !f || typeof f !== "object" || !f.properties || !f.geometry))
    fail("INVALID_OR_TRUNCATED_PROVIDER_MAP");
  return r.features as Feature[];
}
function sameDirectedCurve(a: number[][], b: number[][]): boolean {
  if (geodesicSphere.distance(a[0]!, b[0]!) > 1 || geodesicSphere.distance(a.at(-1)!, b.at(-1)!) > 1) return false;
  for (const [first, second] of [[a, b], [b, a]]) {
    const length = geodesicSphere.length(first!), n = Math.ceil(length / 10);
    for (let i = 0; i <= n; i++) if (geodesicSphere.project(geodesicSphere.position(first!, length * i / n), second!).distance_m > 1) return false;
  }
  return true;
}
/** Whole feature identity and direction must agree across official layers and the numeric feed.
 * 두 공식 레이어·수치 API 사이에서 전체 도로 식별과 방향을 확인합니다. */
export function verifyProviderMapPair(standard: Uint8Array, display: Uint8Array, batch: PublicSpeedBatch): {
  links: OfficialRoadLink[]; exclusions: ProviderMapRoadGeometry["exclusions"];
} {
  validatePublicBounds(batch.bounds);
  const s = features(standard), d = features(display), links: OfficialRoadLink[] = [], exclusions: ProviderMapRoadGeometry["exclusions"] = [];
  for (const f of s) {
    const match = typeof f.id === "string" ? /^T_COB_MOCT_LINK_M\.(\d{10})$/.exec(f.id) : null;
    const link_id = match?.[1] ?? fail("INVALID_PROVIDER_FEATURE_ID");
    try {
      const p = f.properties!, o = batch.observations.find(v => v.link_id === link_id);
      const other = d.filter(v => v.properties?.link_id === link_id);
      if (s.filter(v => v.id === f.id).length !== 1 || other.length !== 1) fail("AMBIGUOUS_PROVIDER_GEOMETRY");
      if (!o || !id(p.F_NODE) || !id(p.T_NODE) || p.F_NODE === p.T_NODE ||
          p.F_NODE !== o.start_node_id || p.T_NODE !== o.end_node_id || typeof p.ROAD_NAME !== "string" ||
          !p.ROAD_NAME || p.ROAD_NAME !== o.road_name || other[0]!.properties?.road_name !== p.ROAD_NAME ||
          String(p.MULTI_LINK) !== "0" || String(p.ROAD_USE) !== "0") fail("PROVIDER_NODES_OR_NAME_MISMATCH");
      if (f.geometry?.type !== "LineString" || other[0]!.geometry?.type !== "MultiLineString" ||
          !Array.isArray(other[0]!.geometry?.coordinates) || other[0]!.geometry!.coordinates.length !== 1)
        fail("INVALID_PROVIDER_GEOMETRY");
      const coordinates = line(f.geometry!.coordinates, batch.bounds);
      const otherLine = line((other[0]!.geometry!.coordinates as unknown[])[0], batch.bounds);
      const measured = geodesicSphere.length(coordinates), otherLength = geodesicSphere.length(otherLine);
      if (measured < 20 || measured > 20000 || otherLength > 20000 || Math.abs(measured-otherLength)>Math.max(2,measured*0.01) ||
          typeof p.LENGTH !== "number" || !Number.isFinite(p.LENGTH) || p.LENGTH <= 0 ||
          Math.abs(measured - p.LENGTH) > Math.max(10, measured * 0.05) || !sameDirectedCurve(coordinates, otherLine))
        fail("PROVIDER_GEOMETRY_MISMATCH");
      links.push({link_id, start_node_id: p.F_NODE as string, end_node_id: p.T_NODE as string,
        road_name: p.ROAD_NAME as string, road_rank: String(p.ROAD_RANK ?? ""), road_type: String(p.ROAD_TYPE ?? ""),
        updated_date: "", source_length_m: p.LENGTH as number, coordinates});
    } catch (e) {exclusions.push({link_id, reason: e instanceof PublicSpeedError ? e.code : "INVALID_PROVIDER_GEOMETRY"});}
  }
  return {links, exclusions};
}
function query(point: number[], layer: string): URL {
  const u = new URL(ENDPOINT);
  for (const [k, v] of Object.entries({service: "WMS", version: "1.1.1", request: "GetFeatureInfo", layers: layer, query_layers: layer,
    styles: "", format: "image/png", info_format: "application/json", srs: "EPSG:4326",
    bbox: [point[0]! - 0.001, point[1]! - 0.001, point[0]! + 0.001, point[1]! + 0.001].join(","),
    width: 200, height: 200, x: 100, y: 100, feature_count: 20, buffer: 12})) u.searchParams.set(k, String(v));
  return u;
}
async function read(url: URL, layer: string, dependencies: ProviderMapDependencies): Promise<ProviderMapRead> {
  const signal = AbortSignal.any([AbortSignal.timeout(10000), ...(dependencies.signal ? [dependencies.signal] : [])]);
  const response = await (dependencies.fetch ?? fetch)(url, {redirect: "error", signal});
  if (response.status !== 200 || !response.body) {await response.body?.cancel(); return fail("PROVIDER_MAP_HTTP_FAILURE");}
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {for (;;) {const v = await reader.read(); if (v.done) break; bytes += v.value.length;
    if (bytes > 1024 * 1024) fail("PROVIDER_MAP_BODY_LIMIT"); chunks.push(v.value);}}
  finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
  return {url: url.href, layer, retrieved_at: new Date((dependencies.clock ?? Date.now)()).toISOString(), raw: Buffer.concat(chunks)};
}
export async function collectProviderMapGeometry(edges: EdgeMapping[], batch: PublicSpeedBatch, output: string,
  dependencies: ProviderMapDependencies = {}): Promise<ProviderMapRoadGeometry> {
  validatePublicBounds(batch.bounds);
  if (!Array.isArray(edges) || !edges.length || edges.length > 200 || new Set(edges.map(e => e.edge_id)).size !== edges.length)
    fail("PROVIDER_MAP_GRAPH_LIMIT");
  publicTime(batch.retrieved_at);
  mkdirSync(output); // Preserve originals; a retry needs a new path. / 재시도 원문은 새 경로에 남깁니다.
  const points = new Map<string, number[]>();
  for (const edge of edges) {
    if (!edge.car_access || geodesicSphere.length(edge.directed_geometry) < 15) continue;
    const point = geodesicSphere.position(edge.directed_geometry, geodesicSphere.length(edge.directed_geometry) / 2);
    if (point[0]! < batch.bounds[0] || point[0]! > batch.bounds[2] || point[1]! < batch.bounds[1] || point[1]! > batch.bounds[3]) continue;
    points.set(point.map(p => p.toFixed(6)).join(","), point);
  }
  if (points.size > 100) fail("PROVIDER_MAP_QUERY_LIMIT");
  const result: ProviderMapRoadGeometry = {schema_version: "kr-provider-map-0.1", provider: "kr-its", policy: "dual-official-layer-v1",
    retrieved_at: new Date((dependencies.clock ?? Date.now)()).toISOString(), bounds: [...batch.bounds],
    numeric_source_sha256: batch.raw_sha256, graph_edges_sha256: sha256(canonical(edges)), source_files: [], requested_points: points.size,
    failed_requests: 0, failures: [], exclusions: [], links: []};
  const links = new Map<string, OfficialRoadLink>(), conflicts = new Set<string>();
  let sequence = 0;
  for (const point of points.values()) {
    if (dependencies.signal?.aborted) fail("PROVIDER_MAP_ABORTED");
    let currentLayer = STANDARD;
    try {
      const pair: Uint8Array[] = [];
      for (const layer of [STANDARD, DISPLAY]) {
        currentLayer = layer;
        const r = await read(query(point, layer), layer, dependencies);
        writeFileSync(join(output, String(++sequence).padStart(3, "0") + ".json"), r.raw, {flag: "wx"});
        result.source_files.push({url: r.url, layer, retrieved_at: r.retrieved_at, byte_length: r.raw.length, sha256: sha256(r.raw)});
        pair.push(r.raw);
      }
      currentLayer = "paired-layer-validation";
      const verified = verifyProviderMapPair(pair[0]!, pair[1]!, batch);
      result.exclusions.push(...verified.exclusions);
      for (const link of verified.links) {
        if (links.has(link.link_id) && !canonical(links.get(link.link_id)).equals(canonical(link))) conflicts.add(link.link_id);
        links.set(link.link_id, link);
      }
    } catch (e) {result.failed_requests++; result.failures.push({point, layer: currentLayer,
      reason: e instanceof PublicSpeedError ? e.code : "PROVIDER_MAP_UNAVAILABLE"});}
  }
  for (const link_id of conflicts) result.exclusions.push({link_id, reason: "CONFLICTING_PROVIDER_GEOMETRY"});
  result.links = [...links.values()].filter(l => !conflicts.has(l.link_id)).sort((a, b) => a.link_id.localeCompare(b.link_id));
  result.exclusions = [...new Map(result.exclusions.map(e => [e.link_id + ":" + e.reason, e])).values()]
    .sort((a, b) => (a.link_id + a.reason).localeCompare(b.link_id + b.reason));
  writeFileSync(join(output, "geometry.json"), JSON.stringify(result, null, 2) + "\n", {flag: "wx"});
  return result;
}
