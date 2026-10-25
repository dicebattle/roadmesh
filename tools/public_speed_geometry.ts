/** Versioned official link geometry, read with upstream GIS libraries.
 * 상위 GIS 라이브러리로 읽은 버전 고정 공식 방향 도로 지형. */
import { createReadStream, lstatSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { open } from "shapefile";
import proj4 from "proj4";
import { geodesicSphere } from "./geodesy.js";
import { canonical, sha256 } from "./shared.js";
import { PublicSpeedError, validatePublicBounds, type PublicBounds, type PublicSpeedBatch } from "./public_speed_source.js";
import type { EdgeMapping } from "./graph_evidence.js";

export interface OfficialRoadLink {
  link_id: string;
  start_node_id: string;
  end_node_id: string;
  road_name: string;
  road_rank: string;
  road_type: string;
  updated_date: string;
  source_length_m: number;
  coordinates: number[][];
}
export interface OfficialRoadGeometry {
  schema_version: "kr-standard-links-0.1";
  provider: "kr-its";
  revision: string;
  bounds: PublicBounds;
  projection_wkt: string;
  source_files: Array<{name: string; byte_length: number; sha256: string}>;
  total_link_records: number;
  total_node_records: number;
  selected_link_records: number;
  rejected_geometry_records: number;
  rejected_node_records: number;
  links: OfficialRoadLink[];
}
/** Provider-published geometry has a retrieval identity, not an invented national revision.
 * 제공자 지도 지형에는 조회 식별을 사용하고 임의의 전국 원본 버전을 붙이지 않습니다. */
export interface ProviderMapRoadGeometry {
  schema_version: "kr-provider-map-0.1";
  provider: "kr-its";
  policy: "dual-official-layer-v1";
  retrieved_at: string;
  bounds: PublicBounds;
  numeric_source_sha256: string;
  graph_edges_sha256: string;
  source_files: Array<{url: string; layer: string; byte_length: number; sha256: string; retrieved_at: string}>;
  requested_points: number;
  failed_requests: number;
  failures: Array<{point: number[]; layer: string; reason: string}>;
  exclusions: Array<{link_id: string; reason: string}>;
  links: OfficialRoadLink[];
}
export type PublicRoadGeometry = OfficialRoadGeometry | ProviderMapRoadGeometry;
const names = ["MOCT_LINK.shp", "MOCT_LINK.dbf", "MOCT_LINK.prj",
  "MOCT_NODE.shp", "MOCT_NODE.dbf", "MOCT_NODE.prj"];
async function identity(directory: string): Promise<OfficialRoadGeometry["source_files"]> {
  const files: OfficialRoadGeometry["source_files"] = [];
  for (const name of names) {
    const path = join(directory, name), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 100 || stat.size > 400 * 1024 * 1024)
      throw new PublicSpeedError("INVALID_GEOMETRY_FILE");
    const h = createHash("sha256");
    for await (const bytes of createReadStream(path)) h.update(bytes);
    files.push({name, byte_length: stat.size, sha256: h.digest("hex")});
  }
  return files;
}
const id = (v: unknown): v is string => typeof v === "string" && /^\d{10}$/.test(v);
function coordinate(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
}
function boundsOf(line: number[][]): number[] {
  return [Math.min(...line.map(p => p[0]!)), Math.min(...line.map(p => p[1]!)),
    Math.max(...line.map(p => p[0]!)), Math.max(...line.map(p => p[1]!))];
}
function intersects(a: readonly number[], b: readonly number[]): boolean {
  return a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;
}
/** File hashes are checked again after streaming; no mixed-revision result escapes.
 * 스트리밍 뒤 원본 해시를 다시 확인해 수정 중인 서로 다른 버전을 섞지 않습니다. */
export async function importOfficialRoadGeometry(
  directory: string, revision: string, bounds: PublicBounds,
): Promise<OfficialRoadGeometry> {
  validatePublicBounds(bounds);
  if (!/^20\d\d-\d\d-\d\d$/.test(revision) || !Number.isFinite(Date.parse(revision)) ||
      new Date(revision).toISOString().slice(0, 10) !== revision)
    throw new PublicSpeedError("INVALID_GEOMETRY_REVISION");
  const root = resolve(directory), source_files = await identity(root);
  const projection_wkt = readFileSync(join(root, "MOCT_LINK.prj"), "utf8").trim();
  if (!projection_wkt || projection_wkt.length > 8192 ||
      projection_wkt !== readFileSync(join(root, "MOCT_NODE.prj"), "utf8").trim())
    throw new PublicSpeedError("PROJECTION_MISMATCH");
  let project: (p: number[]) => number[];
  try {
    const transform = proj4(projection_wkt, "EPSG:4326");
    project = p => transform.forward(p);
    const inverse = proj4("EPSG:4326", projection_wkt);
    const p = [127, 37.5], q = project(inverse.forward(p));
    if (!coordinate(q) || geodesicSphere.distance(p, q) > 0.01) throw Error();
  } catch { throw new PublicSpeedError("UNSUPPORTED_PROJECTION"); }
  const result: OfficialRoadGeometry = {
    schema_version: "kr-standard-links-0.1", provider: "kr-its", revision, bounds: [...bounds],
    projection_wkt, source_files, total_link_records: 0, total_node_records: 0,
    selected_link_records: 0, rejected_geometry_records: 0, rejected_node_records: 0, links: [],
  };
  const source = await open(join(root, "MOCT_LINK.shp"), join(root, "MOCT_LINK.dbf"), {encoding: "euc-kr"});
  const candidates: OfficialRoadLink[] = [], needed = new Set<string>(), seen = new Set<string>();
  // Project only envelopes near the requested region, then the original complete line.
  // 요청 영역 주변 지형만 원래의 전체 곡선으로 변환합니다.
  const inverse = proj4("EPSG:4326", projection_wkt);
  const xyBounds = boundsOf([[bounds[0], bounds[1]], [bounds[0], bounds[3]],
    [bounds[2], bounds[1]], [bounds[2], bounds[3]]].map(p => inverse.forward(p)));
  try {
    for (;;) {
      const {done, value} = await source.read();
      if (done) break;
      if (++result.total_link_records > 2_000_000) throw new PublicSpeedError("GEOMETRY_RECORD_LIMIT");
      const p = value.properties, g = value.geometry;
      if (!p || g?.type !== "LineString" || g.coordinates.length < 2 ||
          g.coordinates.length > 10000 || !g.coordinates.every(coordinate)) {
        result.rejected_geometry_records++; continue;
      }
      if (!intersects(boundsOf(g.coordinates), xyBounds)) continue;
      const coordinates = g.coordinates.map(project);
      if (!coordinates.every(c => coordinate(c) && Math.abs(c[0]!) <= 180 && Math.abs(c[1]!) <= 90))
        throw new PublicSpeedError("INVALID_PROJECTED_COORDINATE");
      if (!intersects(boundsOf(coordinates), bounds)) continue;
      result.selected_link_records++;
      if (p.MULTI_LINK !== "0") {
        result.rejected_geometry_records++; continue;
      }
      if (!id(p.LINK_ID) || !id(p.F_NODE) || !id(p.T_NODE) || p.F_NODE === p.T_NODE ||
          !Number.isFinite(p.LENGTH) || p.LENGTH <= 0 ||
          seen.has(p.LINK_ID)) throw new PublicSpeedError("INVALID_OR_DUPLICATE_LINK");
      seen.add(p.LINK_ID); needed.add(p.F_NODE); needed.add(p.T_NODE);
      candidates.push({link_id: p.LINK_ID, start_node_id: p.F_NODE, end_node_id: p.T_NODE,
        road_name: typeof p.ROAD_NAME === "string" ? p.ROAD_NAME : "",
        road_rank: String(p.ROAD_RANK ?? ""), road_type: String(p.ROAD_TYPE ?? ""),
        updated_date: String(p.UPDATEDATE ?? ""), source_length_m: p.LENGTH, coordinates});
    }
  } finally { await source.cancel(); }
  const nodes = new Map<string, number[]>();
  const nodeSource = await open(join(root, "MOCT_NODE.shp"), join(root, "MOCT_NODE.dbf"), {encoding: "euc-kr"});
  try {
    for (;;) {
      const {done, value} = await nodeSource.read();
      if (done) break;
      if (++result.total_node_records > 2_000_000) throw new PublicSpeedError("GEOMETRY_RECORD_LIMIT");
      const p = value.properties, g = value.geometry;
      if (!p || !needed.has(p.NODE_ID)) continue;
      if (!id(p.NODE_ID) || g?.type !== "Point" || !coordinate(g.coordinates) || nodes.has(p.NODE_ID))
        throw new PublicSpeedError("INVALID_OR_DUPLICATE_NODE");
      nodes.set(p.NODE_ID, project(g.coordinates));
    }
  } finally { await nodeSource.cancel(); }
  for (const link of candidates) {
    const from = nodes.get(link.start_node_id), to = nodes.get(link.end_node_id);
    if (!from || !to || geodesicSphere.distance(from, link.coordinates[0]!) > 2 ||
        geodesicSphere.distance(to, link.coordinates.at(-1)!) > 2) {
      result.rejected_node_records++; continue;
    }
    const measured = geodesicSphere.length(link.coordinates);
    if (Math.abs(measured - link.source_length_m) > Math.max(5, measured * 0.02)) {
      result.rejected_geometry_records++; continue;
    }
    result.links.push(link);
  }
  if (!canonical(await identity(root)).equals(canonical(source_files)))
    throw new PublicSpeedError("GEOMETRY_CHANGED_DURING_READ");
  result.links.sort((a, b) => a.link_id.localeCompare(b.link_id));
  return result;
}

export interface PublicRoadMapping {
  schema_version: "kr-directed-mapping-0.1";
  policy: "kr-directed-envelope-v1";
  graph_id: string;
  geometry_sha256: string;
  graph_edges_sha256: string;
  entries: Array<{edge_id: string; forward: boolean; link_id: string;
    start_node_id: string; end_node_id: string; max_distance_m: number;
    start_fraction: number; end_fraction: number}>;
  excluded: Array<{edge_id: string; reason: "NO_MATCH" | "AMBIGUOUS" | "UNSUPPORTED"}>;
  provider_node_bindings?: Array<{
    link_id: string;
    official_start_node_id: string;
    official_end_node_id: string;
    provider_start_node_id: string;
    provider_end_node_id: string;
    policy: "independent-provider-shape-v1";
    geometry_sha256: string;
    response_sha256: string;
    evidence_sha256: string;
    max_distance_m: number;
  }>;
}

/** A provider may retain legacy junction IDs while publishing the current link ID.
 * Require an independent official provider-map line with that exact ID and ordered
 * geometry; never infer equivalence by dropping ID digits or road name alone.
 * 제공자 노드 번호가 다르면 같은 공식 링크의 별도 지도 지형으로 확인합니다.
 * 식별자의 일부를 자르거나 도로명만으로 노드 동등성을 가정하지 않습니다. */
export function bindProviderNodeEvidence(
  mapping: PublicRoadMapping, geometry: OfficialRoadGeometry, batch: PublicSpeedBatch,
  proofs: Array<{link_id: string; response: unknown}>,
): PublicRoadMapping {
  if (mapping.geometry_sha256 !== sha256(canonical(geometry)) ||
      new Set(proofs.map(p => p.link_id)).size !== proofs.length)
    throw new PublicSpeedError("PROVIDER_GEOMETRY_SCOPE");
  const bindings: NonNullable<PublicRoadMapping["provider_node_bindings"]> = [];
  const observations = new Map(batch.observations.map(o => [o.link_id, o]));
  const official = new Map(geometry.links.map(l => [l.link_id, l]));
  const mapped = new Set(mapping.entries.map(e => e.link_id));
  for (const proof of proofs) {
    const link = official.get(proof.link_id), observed = observations.get(proof.link_id);
    if (!link || !mapped.has(proof.link_id) || !observed || !id(observed.start_node_id) ||
        !id(observed.end_node_id) || observed.start_node_id === observed.end_node_id)
      throw new PublicSpeedError("PROVIDER_GEOMETRY_SCOPE");
    const response = proof.response as {type?: unknown; features?: Array<{properties?: {link_id?: unknown; road_name?: unknown};
      geometry?: {type?: unknown; coordinates?: unknown}}>;
      crs?: {properties?: {name?: unknown}}};
    if (!response || response.type !== "FeatureCollection" || !Array.isArray(response.features) ||
        response.features.length > 20 || response.crs?.properties?.name !== "urn:ogc:def:crs:EPSG::4326")
      throw new PublicSpeedError("INVALID_PROVIDER_GEOMETRY");
    const matches = response.features.filter(f => f.properties?.link_id === proof.link_id);
    if (matches.length !== 1 || matches[0]!.properties?.road_name !== link.road_name ||
        observed.road_name !== link.road_name) throw new PublicSpeedError("AMBIGUOUS_PROVIDER_GEOMETRY");
    const g = matches[0]!.geometry;
    if (g?.type !== "MultiLineString" || !Array.isArray(g.coordinates) || g.coordinates.length !== 1 ||
        !Array.isArray(g.coordinates[0]) || g.coordinates[0].length < 2 || g.coordinates[0].length > 10000 ||
        !g.coordinates[0].every(coordinate)) throw new PublicSpeedError("INVALID_PROVIDER_GEOMETRY");
    const line = g.coordinates[0] as number[][];
    if (!line.every(p => Math.abs(p[0]!) <= 180 && Math.abs(p[1]!) <= 90))
      throw new PublicSpeedError("INVALID_PROVIDER_GEOMETRY");
    const length = geodesicSphere.length(line), original = geodesicSphere.length(link.coordinates);
    const endpoints = [geodesicSphere.distance(line[0]!, link.coordinates[0]!),
      geodesicSphere.distance(line.at(-1)!, link.coordinates.at(-1)!)];
    let max_distance_m = Math.max(...endpoints);
    if (length < 20 || original < 20 || Math.abs(length - original) > Math.max(10, original * 0.05) ||
        endpoints.some(d => d > 8) ||
        geodesicSphere.distance(line[0]!, link.coordinates.at(-1)!) <= 8 ||
        geodesicSphere.distance(line.at(-1)!, link.coordinates[0]!) <= 8)
      throw new PublicSpeedError("PROVIDER_GEOMETRY_MISMATCH");
    for (const [a, b] of [[line, link.coordinates], [link.coordinates, line]]) {
      const n = Math.ceil(geodesicSphere.length(a!) / 10);
      for (let i = 0; i <= n; i++) max_distance_m = Math.max(max_distance_m,
        geodesicSphere.project(geodesicSphere.position(a!, geodesicSphere.length(a!) * i / n), b!).distance_m);
    }
    if (max_distance_m > 8) throw new PublicSpeedError("PROVIDER_GEOMETRY_MISMATCH");
    bindings.push({link_id: proof.link_id, official_start_node_id: link.start_node_id,
      official_end_node_id: link.end_node_id, provider_start_node_id: observed.start_node_id,
      provider_end_node_id: observed.end_node_id, policy: "independent-provider-shape-v1",
      geometry_sha256: mapping.geometry_sha256, response_sha256: batch.raw_sha256,
      evidence_sha256: sha256(canonical(proof.response)), max_distance_m});
  }
  bindings.sort((a, b) => a.link_id.localeCompare(b.link_id));
  return {...mapping, provider_node_bindings: bindings};
}

export function matchesPublicMappingNodes(mapping: PublicRoadMapping,
  edge: PublicRoadMapping["entries"][number], start: string, end: string): boolean {
  if (edge.start_node_id === start && edge.end_node_id === end) return true;
  const bindings = mapping.provider_node_bindings?.filter(b => b.link_id === edge.link_id) ?? [];
  if (bindings.length !== 1) return false;
  const b = bindings[0]!;
  return b.policy === "independent-provider-shape-v1" && b.geometry_sha256 === mapping.geometry_sha256 &&
    /^[a-f0-9]{64}$/.test(b.evidence_sha256) && /^[a-f0-9]{64}$/.test(b.response_sha256) &&
    Number.isFinite(b.max_distance_m) && b.max_distance_m >= 0 && b.max_distance_m <= 8 &&
    b.official_start_node_id === edge.start_node_id && b.official_end_node_id === edge.end_node_id &&
    b.provider_start_node_id === start && b.provider_end_node_id === end;
}
/** Whole directed edges must be covered by one unique source link. A midpoint hit
 * is insufficient; do not copy a component link's speed onto a merged service road.
 * 구간 전체를 유일한 공식 방향 링크가 덮어야 하며 중점 하나로 적용하지 않습니다. */
export function mapPublicRoads(
  graph_id: string, edges: EdgeMapping[], geometry: PublicRoadGeometry,
): PublicRoadMapping {
  if (!/^[a-f0-9]{64}$/.test(graph_id) || !Array.isArray(edges) || edges.length > 200_000 ||
      new Set(edges.map(e => e.edge_id)).size !== edges.length)
    throw new PublicSpeedError("INVALID_MAPPING_GRAPH");
  if (geometry.schema_version === "kr-provider-map-0.1" &&
      (geometry.policy !== "dual-official-layer-v1" || geometry.graph_edges_sha256 !== sha256(canonical(edges))))
    throw new PublicSpeedError("PROVIDER_GEOMETRY_SCOPE");
  const result: PublicRoadMapping = {schema_version: "kr-directed-mapping-0.1", policy: "kr-directed-envelope-v1",
    graph_id, geometry_sha256: sha256(canonical(geometry)), graph_edges_sha256: sha256(canonical(edges)), entries: [], excluded: []};
  const linkBoxes = geometry.links.map(link => ({link, box: boundsOf(link.coordinates)}));
  for (const edge of edges) {
    const line = edge.directed_geometry;
    if (!edge.car_access || line.length < 2 || !line.every(coordinate) ||
        geodesicSphere.length(line) < 15) {
      result.excluded.push({edge_id: edge.edge_id, reason: "UNSUPPORTED"}); continue;
    }
    const length = geodesicSphere.length(line), box = boundsOf(line);
    const expanded = [box[0]! - 0.00015, box[1]! - 0.00012, box[2]! + 0.00015, box[3]! + 0.00012];
    const sampleCount = Math.ceil(length / 10) + 1;
    const samples = Array.from({length: sampleCount}, (_, i) =>
      geodesicSphere.position(line, length * i / (sampleCount - 1)));
    const candidates: PublicRoadMapping["entries"] = [];
    for (const {link, box: linkBox} of linkBoxes) {
      if (!intersects(expanded, linkBox)) continue;
      const projections = samples.map(point => geodesicSphere.project(point, link.coordinates));
      const max_distance_m = Math.max(...projections.map(p => p.distance_m));
      const start = projections[0]!, end = projections.at(-1)!;
      if (max_distance_m > 12 || end.fraction <= start.fraction ||
          Math.abs((end.fraction - start.fraction) * geodesicSphere.length(link.coordinates) - length) > Math.max(5, length * 0.05)) continue;
      if (projections.some((p, i) => i > 0 && p.fraction < projections[i - 1]!.fraction - 0.000001)) continue;
      // Local tangents reject reverse carriageways and crossing alignments.
      // 국소 방향은 반대 차도·교차 정렬을 거부합니다.
      if (samples.slice(0, -1).some((p, i) => {
        const direction = geodesicSphere.project(p, [p, samples[i + 1]!]).tangent_radians;
        return Math.cos(direction - projections[i]!.tangent_radians) < Math.cos(Math.PI / 9);
      })) continue;
      candidates.push({edge_id: edge.edge_id, forward: edge.forward, link_id: link.link_id,
        start_node_id: link.start_node_id, end_node_id: link.end_node_id, max_distance_m,
        start_fraction: start.fraction, end_fraction: end.fraction});
    }
    if (candidates.length === 1) result.entries.push(candidates[0]!);
    else result.excluded.push({edge_id: edge.edge_id, reason: candidates.length ? "AMBIGUOUS" : "NO_MATCH"});
  }
  result.entries.sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  result.excluded.sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  return result;
}
