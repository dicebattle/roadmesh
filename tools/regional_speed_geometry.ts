/** Reviewed service curves and conservative detector-supported native edges.
 * 검토 서비스 곡선과 보수적인 검지점 지원 엔진 구간입니다. */
import proj4 from "proj4";
import { canonical, sha256 } from "./shared.js";
import { geodesicSphere } from "./geodesy.js";
import { PublicSpeedError } from "./public_speed_source.js";
import { matchDirectedPublicCurve, type PublicMappingEntry, type PublicRoadMapping } from "./public_speed_geometry.js";
import type { EdgeMapping } from "./graph_evidence.js";
import type { CatalogEdge } from "./aggregation_types.js";

export interface GitsCurve {
  source_id: string;
  road_name: string;
  start_name: string;
  end_name: string;
  source_length_m: number;
  coordinates: number[][];
  wfs_sha256: string;
  wms_sha256: string | null;
  coordinate_policy: "reviewed-degree-tuples-despite-epsg5181-label-v1";
}
export interface VdsInstallation {
  source_id: string;
  route_no: string;
  road_name: string;
  direction: "S" | "E";
  conzone_id: string;
  position: number[];
  shift_m: number;
  zone_start_m: number;
  zone_end_m: number;
  zone_length_m: number;
  original_sha256: string;
  projection_policy: "scope-reviewed-grs80-central-2010-v1";
}
function fail(code: string): never {throw new PublicSpeedError(code);}
const coordinate = (p: number[]): boolean => p.length === 2 && p.every(Number.isFinite) &&
  p[0]! >= 123 && p[0]! <= 133 && p[1]! >= 32 && p[1]! <= 40;
const decode = (v: string): string => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function xml(raw: Uint8Array): string {
  if (raw.length < 2 || raw.length > 16 * 1024 * 1024) fail("REGIONAL_GEOMETRY_LIMIT");
  const value = new TextDecoder("utf-8", {fatal:true}).decode(raw);
  if (/<!DOCTYPE|<!ENTITY|<[^>]*Exception/i.test(value)) fail("REGIONAL_GEOMETRY_XML_REFUSED");
  return value;
}
function field(block: string, name: string, prefix = "ms:"): string {
  const matches = [...block.matchAll(new RegExp(`<${prefix}${name}(?:\\s[^>]*)?>([^<]*)<\\/${prefix}${name}>`, "g"))];
  if (matches.length > 1) fail("AMBIGUOUS_REGIONAL_FIELD");
  return matches[0] ? decode(matches[0][1]!.trim()) : "";
}
function validLength(line: number[][], expected: number): boolean {
  return Number.isFinite(expected) && expected > 0 && Math.abs(geodesicSphere.length(line) - expected) <= Math.max(10, expected * 0.05);
}
/** This compatibility parser preserves the provider's contradictory CRS label. WMS review is
 * mandatory before these degree tuples may authorize a mapping.
 * 모순된 좌표계 표기를 보존하고 WMS 검토 전에는 경로 대응을 승인하지 않습니다. */
export function parseGitsWfs(raw: Uint8Array, expectedCount: number): {
  curves: GitsCurve[]; excluded: Array<{source_id:string;reason:string}>; raw_feature_count: number;
} {
  const text = xml(raw);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0 || expectedCount > 10000 ||
      !text.includes('xmlns:gml="http://www.opengis.net/gml"') || !text.includes('<wfs:FeatureCollection'))
    fail("INVALID_GITS_WFS");
  const members = [...text.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)];
  if (members.length !== expectedCount) fail("INCOMPLETE_GITS_GEOMETRY");
  const curves: GitsCurve[] = [], ids = new Set<string>(), excluded: Array<{source_id:string;reason:string}> = [];
  const originalHash=sha256(raw);
  for (const member of members) {
    const block = member[1]!, id = field(block, "LINK_ID"), lists = [...block.matchAll(/<gml:posList srsDimension="2">([^<]+)<\/gml:posList>/g)];
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || ids.has(id)) fail("INVALID_GITS_GEOMETRY_IDENTITY");
    ids.add(id);
    if (lists.length !== 1 || !block.includes('<gml:LineString srsName="EPSG:5181">')) {
      excluded.push({source_id:id,reason:"UNSUPPORTED_GEOMETRY"}); continue;
    }
    const values = lists[0]![1]!.trim().split(/\s+/).map(Number);
    if (values.length < 4 || values.length > 20_000 || values.length % 2) fail("INVALID_GITS_CURVE");
    const coordinates = Array.from({length:values.length / 2}, (_, i) => [values[i * 2 + 1]!, values[i * 2]!]);
    if (!coordinates.every(coordinate)) fail("GITS_COORDINATE_INTERPRETATION_REFUSED");
    curves.push({source_id:id, road_name:field(block, "ROUTE_KORNM"), start_name:field(block, "START_NODE_NM"),
      end_name:field(block, "END_NODE_NM"), source_length_m:Number(field(block, "LINK_LENGTH")), coordinates,
      wfs_sha256:originalHash, wms_sha256:null, coordinate_policy:"reviewed-degree-tuples-despite-epsg5181-label-v1"});
  }
  return {curves,excluded,raw_feature_count:members.length};
}
function sameCurve(a: number[][], b: number[][]): boolean {
  if (geodesicSphere.distance(a[0]!, b[0]!) > 1 || geodesicSphere.distance(a.at(-1)!, b.at(-1)!) > 1) return false;
  for (const [from, to] of [[a,b],[b,a]]) {
    const length = geodesicSphere.length(from!), count = Math.max(1, Math.ceil(length / 10));
    for (let i = 0; i <= count; i++)
      if (geodesicSphere.project(geodesicSphere.position(from!, length * i / count), to!).distance_m > 1) return false;
  }
  return true;
}
export function reviewGitsWms(curve: GitsCurve, raw: Uint8Array): GitsCurve {
  const text = xml(raw), matches = [...text.matchAll(/<ATTRLV10_feature>([\s\S]*?)<\/ATTRLV10_feature>/g)]
    .map(m => m[1]!).filter(b => field(b, "LINK_ID", "") === curve.source_id);
  if (matches.length !== 1) fail("GITS_WMS_IDENTITY_NOT_UNIQUE");
  const b = matches[0]!, lines = [...b.matchAll(/<gml:LineString srsName="EPSG:5181">\s*<gml:coordinates>([^<]+)<\/gml:coordinates>/g)];
  if (lines.length !== 1 || field(b, "ROUTE_KORNM", "") !== curve.road_name ||
      field(b, "START_NODE_NM", "") !== curve.start_name || field(b, "END_NODE_NM", "") !== curve.end_name)
    fail("GITS_WMS_ATTRIBUTES_CHANGED");
  const coordinates = lines[0]![1]!.trim().split(/\s+/).map(p => p.split(",").map(Number));
  if (coordinates.length < 2 || !coordinates.every(coordinate) || !validLength(curve.coordinates, curve.source_length_m) ||
      !validLength(coordinates, Number(field(b, "LINK_LENGTH", ""))) || !sameCurve(curve.coordinates, coordinates))
    fail("GITS_WMS_CURVE_DISAGREEMENT");
  return {...curve, wms_sha256:sha256(raw)};
}

/** GRS80 alone is insufficient to choose a projection. This explicit scoped interpretation
 * still needs per-detector corroboration against an independent official curve below.
 * GRS80 이름만으로 좌표계를 확정하지 않으며 아래 기관 곡선과 검지점별로 대조합니다. */
export const REVIEWED_VDS_PROJECTION = "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs";
export function parseVdsInstallations(pages: Uint8Array[]): VdsInstallation[] {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 506) fail("INCOMPLETE_VDS_INSTALLATIONS");
  const ids = new Set<string>(), out: VdsInstallation[] = [];
  let expected = 0, pageCount = 0;
  for (let i = 0; i < pages.length; i++) {
    const raw = pages[i]!;
    const originalHash=sha256(raw);
    if (raw.length > 1024 * 1024) fail("VDS_INSTALLATION_BODY_LIMIT");
    const doc = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(raw));
    if (doc.code !== "SUCCESS" || doc.pageNo !== i + 1 || !Array.isArray(doc.list) ||
        !Number.isSafeInteger(doc.count) || doc.count < 1 || doc.count > 50_000 ||
        doc.numOfRows !== 99 || !Number.isSafeInteger(doc.pageSize) || doc.pageSize < 1 ||
        doc.pageSize > 506 || (i && (doc.count !== expected || doc.pageSize !== pageCount)))
      fail("INVALID_VDS_INSTALLATION_PAGE");
    expected = doc.count; pageCount = doc.pageSize;
    if (doc.list.length !== Math.min(99, expected - i * 99)) fail("INCOMPLETE_VDS_INSTALLATION_PAGE");
    for (const r of doc.list) {
      if (!r || typeof r !== "object" || typeof r.vdsId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(r.vdsId) || ids.has(r.vdsId))
        fail("VDS_INSTALLATION_IDENTITY");
      ids.add(r.vdsId);
      // Mainline geometry cannot be corroborated with a ramp detector or ramp neighbour.
      // 본선 지형의 확인에 진출입로 검지기·이웃을 사용하지 않습니다.
      if(r.equipmentBelongingCode!=="00" || r.roadgradeCode!=="101")continue;
      const distance = (v: unknown, unit: string): number => typeof v === "string" &&
        new RegExp(`^\\d+(?:\\.\\d+)?${unit}$`).test(v) ? Number(v.slice(0, -unit.length)) : NaN;
      const shift_m = distance(r.shift, "km") * 1000, rawStart = distance(r.vdsStartShift, "km") * 1000,
        rawEnd = distance(r.vdsEndShift, "km") * 1000, zone_length_m = distance(r.vdsLength, "m");
      // S-facing source zones run from larger to smaller chainage. Preserve the raw bytes and
      // keep a canonical lower/upper interval only after checking this directional convention.
      // S 방향의 원 이정은 감소합니다. 방향 관례 확인 뒤에만 하한·상한 범위로 정규화합니다.
      const zone_start_m = Math.min(rawStart,rawEnd), zone_end_m = Math.max(rawStart,rawEnd);
      if (![r.grs80x,r.grs80y].every(v => typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v)) ||
          ![shift_m,zone_start_m,zone_end_m,zone_length_m].every(Number.isFinite) || zone_length_m <= 0 ||
          zone_start_m >= zone_end_m || shift_m < zone_start_m || shift_m > zone_end_m ||
          Math.abs(zone_end_m - zone_start_m - zone_length_m) > Math.max(20, zone_length_m * 0.05) ||
          !["S","E"].includes(r.directionCode) || (r.directionCode === "S" ? rawStart <= rawEnd : rawStart >= rawEnd) ||
          typeof r.czId !== "string" || typeof r.routeNo !== "string" || typeof r.routeName !== "string") continue;
      const position = proj4(REVIEWED_VDS_PROJECTION, "EPSG:4326", [Number(r.grs80x),Number(r.grs80y)]);
      if (!coordinate(position)) continue;
      out.push({source_id:r.vdsId, route_no:r.routeNo, road_name:r.routeName, direction:r.directionCode,
        conzone_id:r.czId, position, shift_m, zone_start_m, zone_end_m, zone_length_m,
        original_sha256:originalHash, projection_policy:"scope-reviewed-grs80-central-2010-v1"});
    }
  }
  if (pages.length !== pageCount || ids.size !== expected) fail("INCOMPLETE_VDS_INSTALLATIONS");
  return out;
}

const roadFamily = (name: string): string => name.replace(/\s/g, "")
  .replace(/고속도로|고속국도|선$/g, "").replace(/서울외곽순환/, "수도권제1순환");
const anchor = (hash: string, end: "start" | "end"): string => `geometry:${hash}:${end}`;
export function validateRegionalMapping(mapping: PublicRoadMapping, catalog: CatalogEdge[]): void {
  if (mapping.schema_version!=="kr-directed-mapping-0.2" || mapping.policy!=="kr-regional-envelope-v1" ||
      !Array.isArray(mapping.regional_references) || !Array.isArray(mapping.regional_alternatives) ||
      mapping.regional_references.length>50_000 || mapping.regional_alternatives.length>100_000)
    fail("INVALID_REGIONAL_MAPPING");
  const references=new Map(mapping.regional_references.map(r=>[r.link_id,r])),byEdge=new Map(catalog.map(e=>[e.edge_id,e]));
  if(references.size!==mapping.regional_references.length)fail("DUPLICATE_REGIONAL_REFERENCE");
  for(const r of references.values()){
    if(!/^[a-f0-9]{64}$/.test(r.evidence_sha256) || r.start_anchor!==anchor(r.evidence_sha256,"start") ||
       r.end_anchor!==anchor(r.evidence_sha256,"end") || !/^[A-Za-z0-9_-]{1,64}$/.test(r.source_id) ||
       !["kr-gits","kr-ex"].includes(r.provider) || r.link_id!==(r.provider==="kr-gits"?"gits:":"ex:")+r.source_id)
      fail("REGIONAL_ANCHOR_MISMATCH");
  }
  const seen=new Set<string>(),groups=new Map<string,PublicMappingEntry[]>();
  for(const e of mapping.regional_alternatives){
    const key=e.edge_id+"|"+e.link_id,r=references.get(e.link_id),native=byEdge.get(e.edge_id);
    if(!r || !native || native.forward!==e.forward || seen.has(key) || r.start_anchor!==e.start_node_id ||
       r.end_anchor!==e.end_node_id || !Number.isFinite(e.max_distance_m) || e.max_distance_m<0 || e.max_distance_m>12 ||
       !Number.isFinite(e.start_fraction) || !Number.isFinite(e.end_fraction) || e.start_fraction<0 ||
       e.end_fraction>1 || e.start_fraction>=e.end_fraction)fail("INVALID_REGIONAL_ALTERNATIVE");
    seen.add(key);const group=groups.get(e.edge_id)??[];group.push(e);groups.set(e.edge_id,group);
  }
  if(groups.size!==mapping.entries.length)fail("REGIONAL_PRIMARY_MISMATCH");
  for(const e of mapping.entries){
    const group=groups.get(e.edge_id)!;
    if(!group || group.length>2 || new Set(group.map(c=>references.get(c.link_id)!.provider)).size!==group.length ||
       (group.length===2 && !group[0]!.link_id.startsWith("ex:")) || !canonical(e).equals(canonical(group[0])))
      fail("REGIONAL_PRIMARY_MISMATCH");
  }
}
function nearby(a: number[][], p: number[], margin = 0.0002): boolean {
  return a.some(c => Math.abs(c[0]! - p[0]!) < margin && Math.abs(c[1]! - p[1]!) < margin) ||
    (p[0]! >= Math.min(...a.map(c => c[0]!)) - margin && p[0]! <= Math.max(...a.map(c => c[0]!)) + margin &&
     p[1]! >= Math.min(...a.map(c => c[1]!)) - margin && p[1]! <= Math.max(...a.map(c => c[1]!)) + margin);
}

export function mapRegionalRoads(graph_id: string, edges: EdgeMapping[], curves: GitsCurve[], installations: VdsInstallation[]): PublicRoadMapping {
  if (!/^[a-f0-9]{64}$/.test(graph_id) || edges.length > 200_000 || new Set(edges.map(e => e.edge_id)).size !== edges.length ||
      curves.length > 10000 || new Set(curves.map(c => c.source_id)).size !== curves.length) fail("INVALID_REGIONAL_MAPPING_INPUT");
  const reviewed = curves.filter(c => c.wms_sha256 && validLength(c.coordinates, c.source_length_m));
  const references: NonNullable<PublicRoadMapping["regional_references"]> = [], candidates: PublicMappingEntry[] = [];
  const gitsMatches = new Map<string, Array<{curve:GitsCurve;entry:PublicMappingEntry}>>();
  for (const c of reviewed) {
    const evidence_sha256 = sha256(canonical(c)), link_id = "gits:" + c.source_id;
    const start_anchor = anchor(evidence_sha256,"start"), end_anchor = anchor(evidence_sha256,"end");
    references.push({link_id,provider:"kr-gits",source_id:c.source_id,road_name:c.road_name,evidence_sha256,
      start_anchor,end_anchor,source_start_name:c.start_name,source_end_name:c.end_name,source_length_m:c.source_length_m});
    for (const e of edges) {
      if (!nearby(c.coordinates,e.directed_geometry[0] ?? [])) continue;
      const match = matchDirectedPublicCurve(e,c.coordinates);
      if (!match) continue;
      const entry = {edge_id:e.edge_id,forward:e.forward,link_id,start_node_id:start_anchor,end_node_id:end_anchor,...match};
      const group = gitsMatches.get(e.edge_id) ?? []; group.push({curve:c,entry}); gitsMatches.set(e.edge_id,group);
    }
  }
  // Multiple service curves over the same native direction are ambiguous, never a last-row choice.
  // 같은 방향에 서비스 곡선이 겹치면 임의 선택하지 않습니다.
  for (const group of gitsMatches.values()) if (group.length === 1) candidates.push(group[0]!.entry);
  for (const v of installations) {
    const group = installations.filter(n => n.route_no === v.route_no && n.direction === v.direction && n.source_id !== v.source_id);
    const lower = group.filter(n => n.shift_m < v.shift_m).sort((a,b) => b.shift_m-a.shift_m)[0];
    const upper = group.filter(n => n.shift_m > v.shift_m).sort((a,b) => a.shift_m-b.shift_m)[0];
    if (!lower || !upper || v.shift_m-lower.shift_m > 5000 || upper.shift_m-v.shift_m > 5000) continue;
    const bearing = geodesicSphere.project(v.position, v.direction === "E" ? [lower.position,upper.position] : [upper.position,lower.position]).tangent_radians;
    const compatible = reviewed.filter(c => roadFamily(c.road_name) === roadFamily(v.road_name) && nearby(c.coordinates,v.position))
      .map(c => ({curve:c, projection:geodesicSphere.project(v.position,c.coordinates)}))
      .filter(({projection:p}) => p.distance_m <= 12 && Math.cos(p.tangent_radians-bearing) >= Math.cos(Math.PI/9));
    if (compatible.length !== 1) continue;
    const {curve,projection:p} = compatible[0]!, curveLength = geodesicSphere.length(curve.coordinates);
    const before = v.direction === "E" ? v.shift_m-v.zone_start_m : v.zone_end_m-v.shift_m;
    const after = v.direction === "E" ? v.zone_end_m-v.shift_m : v.shift_m-v.zone_start_m;
    const matched: PublicMappingEntry[] = [];
    const evidence_sha256 = sha256(canonical({installation:v,lower,upper,curve,detector_distance_m:p.distance_m,
      policy:"containing-edge-within-vds-zone-v1"}));
    for (const e of edges) {
      if (!nearby(e.directed_geometry,v.position)) continue;
      const point = geodesicSphere.project(v.position,e.directed_geometry), length = geodesicSphere.length(e.directed_geometry);
      // A strict interior point avoids ambiguous endpoint assignment. The whole edge must fit the zone.
      // 끝점 중복 배정을 피하고 구간 전체가 담당 이정 범위 안에 있어야 합니다.
      if (point.distance_m > 12 || point.fraction <= 0.001 || point.fraction >= 0.999 || length > v.zone_length_m) continue;
      const match = matchDirectedPublicCurve(e,curve.coordinates);
      if (!match || (p.fraction-match.start_fraction)*curveLength > before ||
          (match.end_fraction-p.fraction)*curveLength > after ||
          p.fraction < match.start_fraction || p.fraction > match.end_fraction) continue;
      matched.push({edge_id:e.edge_id,forward:e.forward,link_id:"ex:"+v.source_id,start_node_id:anchor(evidence_sha256,"start"),
        end_node_id:anchor(evidence_sha256,"end"),...match});
    }
    if (matched.length !== 1) continue;
    candidates.push(matched[0]!);
    references.push({link_id:"ex:"+v.source_id,provider:"kr-ex",source_id:v.source_id,road_name:v.road_name,
      evidence_sha256,start_anchor:anchor(evidence_sha256,"start"),end_anchor:anchor(evidence_sha256,"end"),
      route_no:v.route_no,direction:v.direction,conzone_id:v.conzone_id});
  }
  const entries: PublicMappingEntry[] = [], excluded: PublicRoadMapping["excluded"] = [];
  const alternatives: PublicMappingEntry[] = [];
  for (const e of edges) {
    const all = candidates.filter(c => c.edge_id === e.edge_id), detectors = all.filter(c => c.link_id.startsWith("ex:"));
    const service = all.filter(c => c.link_id.startsWith("gits:"));
    // Several detectors on one native edge have no proven aggregation rule; retain service fallback only.
    // 한 엔진 구간의 여러 검지기를 임의 집계하지 않고 서비스 대안만 유지합니다.
    const usable = [...(detectors.length === 1 ? detectors : []),...service];
    if (!usable.length) excluded.push({edge_id:e.edge_id,reason:gitsMatches.get(e.edge_id)?.length ? "AMBIGUOUS" : "NO_MATCH"});
    else {entries.push(usable[0]!);alternatives.push(...usable);}
  }
  const used = new Set(alternatives.map(a => a.link_id));
  entries.sort((a,b) => a.edge_id.localeCompare(b.edge_id)); excluded.sort((a,b) => a.edge_id.localeCompare(b.edge_id));
  alternatives.sort((a,b) => a.edge_id.localeCompare(b.edge_id) || Number(b.link_id.startsWith("ex:"))-Number(a.link_id.startsWith("ex:")) || a.link_id.localeCompare(b.link_id));
  return {schema_version:"kr-directed-mapping-0.2",policy:"kr-regional-envelope-v1",graph_id,
    geometry_sha256:sha256(canonical({curves:reviewed,installations})),graph_edges_sha256:sha256(canonical(edges)),entries,excluded,
    regional_alternatives:alternatives,regional_references:references.filter(r => used.has(r.link_id)).sort((a,b) => a.link_id.localeCompare(b.link_id))};
}
