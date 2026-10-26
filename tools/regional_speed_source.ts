/** Regional raw observations retain provider namespaces, original clocks and reviewed geometry.
 * 지역 원 관측은 출처 식별·원시각·검토 지형을 보존합니다. */
import { canonical, parseJson, record, sha256 } from "./shared.js";
import { parseItsKoreanTime, publicTime, PublicSpeedError, PUBLIC_SPEED_MAX_AGE_MS,
  type PublicBounds, type PublicSpeedBatch, type PublicSpeedObservation } from "./public_speed_source.js";
import type { PublicRoadMapping } from "./public_speed_geometry.js";

export interface RegionalReadReceipt {
  provider: "kr-gits" | "kr-ex";
  access: "ANONYMOUS_WEBSITE" | "OFFICIAL_PUBLIC_DEMO_BROWSER_DOCUMENT";
  retrieved_at: string;
  raw_sha256: string;
  raw_base64: string;
}
export interface RegionalEnvelope {
  schema_version: "regional-raw-0.1";
  sources: RegionalReadReceipt[];
}
function fail(code: string): never {throw new PublicSpeedError(code);}
type Row = Record<string, unknown>;
const decimal = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !/^\d+(?:\.\d+)?$/.test(v)) return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
const sourceId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export function validateRegionalBounds(b: PublicBounds): void {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || b[0] < 123 || b[2] > 133 ||
      b[1] < 32 || b[3] > 40 || b[2] <= b[0] || b[3] <= b[1] || b[2] - b[0] > 1 || b[3] - b[1] > 1)
    fail("INVALID_REGIONAL_BOUNDS");
}
export function regionalReceipt(provider: RegionalReadReceipt["provider"], raw: Uint8Array,
  retrieved_at: string): RegionalReadReceipt {
  publicTime(retrieved_at);
  return {provider, access: provider === "kr-gits" ? "ANONYMOUS_WEBSITE" : "OFFICIAL_PUBLIC_DEMO_BROWSER_DOCUMENT",
    retrieved_at, raw_sha256: sha256(raw), raw_base64: Buffer.from(raw).toString("base64")};
}
export function encodeRegionalEnvelope(sources: RegionalReadReceipt[]): Buffer {
  return canonical({schema_version: "regional-raw-0.1", sources});
}

/** Exact source receipts are checked again at feed/cache boundaries; normalized claims are not authority.
 * 수집·캐시 경계에서 원문 근거를 다시 확인하며 정규화 객체만으로 승인하지 않습니다. */
export function normalizeRegionalResponse(raw: Uint8Array, retrieved_at: string, bounds: PublicBounds,
  mapping: PublicRoadMapping): PublicSpeedBatch {
  validateRegionalBounds(bounds);
  const now = publicTime(retrieved_at);
  if (raw.length < 2 || raw.length > 8 * 1024 * 1024) fail("REGIONAL_BODY_LIMIT");
  if (mapping.schema_version !== "kr-directed-mapping-0.2" || mapping.policy !== "kr-regional-envelope-v1" ||
      !Array.isArray(mapping.regional_references)) fail("REGIONAL_MAPPING_REQUIRED");
  const root = parseJson(raw);
  record(root, "regional sources", ["schema_version", "sources"]);
  if (root.schema_version !== "regional-raw-0.1" || !Array.isArray(root.sources) ||
      !root.sources.length || root.sources.length > 128) fail("REGIONAL_SOURCE_LIMIT");
  const references = new Map(mapping.regional_references.map(r => [r.link_id, r]));
  if (references.size !== mapping.regional_references.length) fail("DUPLICATE_REGIONAL_REFERENCE");
  const groups = new Map<string, PublicSpeedObservation[]>();
  let received_rows = 0, invalid_id_rows = 0, duplicate_rows = 0;
  const receipts = new Set<string>();
  for (const input of root.sources) {
    record(input, "regional source receipt", ["provider", "access", "retrieved_at", "raw_sha256", "raw_base64"]);
    if ((input.provider !== "kr-gits" && input.provider !== "kr-ex") || typeof input.retrieved_at !== "string" ||
        typeof input.raw_base64 !== "string" || typeof input.raw_sha256 !== "string" ||
        input.access !== (input.provider === "kr-gits" ? "ANONYMOUS_WEBSITE" : "OFFICIAL_PUBLIC_DEMO_BROWSER_DOCUMENT") ||
        publicTime(input.retrieved_at) > now) fail("INVALID_REGIONAL_RECEIPT");
    const original = Buffer.from(input.raw_base64, "base64");
    if (original.toString("base64") !== input.raw_base64 || sha256(original) !== input.raw_sha256 ||
        original.length > 8 * 1024 * 1024) fail("REGIONAL_ORIGINAL_MISMATCH");
    const receiptId = input.provider + ":" + input.raw_sha256;
    if (receipts.has(receiptId)) fail("DUPLICATE_REGIONAL_RECEIPT");
    receipts.add(receiptId);
    const parsed = parseJson(new TextDecoder("utf-8", {fatal: true}).decode(original));
    let rows: unknown[];
    const gits = input.provider === "kr-gits";
    if (gits) {
      if (!Array.isArray(parsed)) fail("INVALID_GITS_ROWS");
      rows = parsed;
    } else {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("INVALID_EX_RESPONSE");
      const p = parsed as Row;
      if (p.code !== "SUCCESS" || !Array.isArray(p.list) || p.count !== p.list.length)
        fail("INCOMPLETE_EX_RESPONSE");
      rows = p.list;
    }
    received_rows += rows.length;
    if (received_rows > 50_000) fail("REGIONAL_ROW_LIMIT");
    for (const value of rows) {
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_REGIONAL_ROW");
      const r = value as Row, id = gits ? r.SVC_LINK_ID : r.vdsId;
      if (!sourceId(id)) {invalid_id_rows++; continue;}
      const link_id = (gits ? "gits:" : "ex:") + id, ref = references.get(link_id);
      const epoch = gits ? decimal(r.PROC_DATE) : null;
      const observed_at = gits
        ? epoch !== null && Number.isSafeInteger(epoch) && epoch >= 946684800000 && epoch <= 4102444800000
          ? new Date(epoch).toISOString() : null
        : typeof r.stdDate === "string" && typeof r.stdHour === "string"
          ? parseItsKoreanTime(r.stdDate + r.stdHour + "00") : null;
      const observed = observed_at === null ? null : publicTime(observed_at), speed = decimal(gits ? r.SPD : r.speed);
      const locationValid = ref !== undefined && ref.provider === input.provider && ref.source_id === id && (gits
        ? typeof r.ROUTE_KORNM === "string" && r.ROUTE_KORNM.replace(/\s/g, "") === ref.road_name.replace(/\s/g, "") &&
          r.START_NODE_NM === ref.source_start_name && r.END_NODE_NM === ref.source_end_name &&
          decimal(r.LINK_LENGTH) !== null && ref.source_length_m !== undefined &&
          Math.abs(decimal(r.LINK_LENGTH)! - ref.source_length_m) <= Math.max(10, ref.source_length_m * 0.05)
        : r.routeNo === ref.route_no && r.updownTypeCode === ref.direction && r.conzoneId === ref.conzone_id);
      const reason: PublicSpeedObservation["reason"] = !locationValid ? "INVALID_NODES" : observed === null ? "INVALID_TIME" :
        observed > publicTime(input.retrieved_at) + 30_000 ? "FUTURE" : now >= observed + PUBLIC_SPEED_MAX_AGE_MS ? "EXPIRED" :
        speed === null || speed <= 0 || speed > 252 ? "INVALID_SPEED" : "VALID";
      const o: PublicSpeedObservation = {link_id, start_node_id: locationValid ? ref!.start_anchor : "",
        end_node_id: locationValid ? ref!.end_anchor : "", road_name: String(gits ? r.ROUTE_KORNM ?? "" : r.routeName ?? "").slice(0, 200),
        observed_at, valid_until: observed === null ? null : new Date(observed + PUBLIC_SPEED_MAX_AGE_MS).toISOString(),
        speed_mps: reason === "VALID" ? speed! / 3.6 : null, travel_time_s: null,
        status: reason === "VALID" ? "LIVE" : reason === "EXPIRED" ? "STALE" : "UNKNOWN", reason};
      const group = groups.get(link_id) ?? [];
      if (group.length) duplicate_rows++;
      group.push(o); groups.set(link_id, group);
    }
  }
  const observations: PublicSpeedObservation[] = [];
  for (const group of groups.values()) {
    const invalidTime = group.find(o => o.observed_at === null);
    group.sort((a, b) => (b.observed_at ?? "").localeCompare(a.observed_at ?? ""));
    const latest = invalidTime ?? group[0]!;
    const fingerprint = (o: PublicSpeedObservation) => canonical({start:o.start_node_id, end:o.end_node_id,
      speed:o.speed_mps, reason:o.reason}).toString();
    observations.push(group.some(o => o.observed_at === latest.observed_at && fingerprint(o) !== fingerprint(latest))
      ? {...latest, status:"UNKNOWN", reason:"CONFLICT", speed_mps:null} : latest);
  }
  observations.sort((a, b) => a.link_id.localeCompare(b.link_id));
  return {schema_version:"public-source-0.2", source_class:"PUBLIC_AGENCY", provider:"kr-regional",
    policy:"kr-regional-v1", endpoint:"regional-captured-sources-v1", bounds:[...bounds], retrieved_at,
    raw_sha256:sha256(raw), raw_byte_length:raw.length, received_rows, invalid_id_rows, duplicate_rows, observations};
}
