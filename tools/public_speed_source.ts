/** Bounded government-feed reads; no crowd or simulated provenance.
 * 제한된 공공 자료 수집이며 제보·합성 출처로 바꾸지 않습니다. */
import { createHash } from "node:crypto";
import { parseJson } from "./shared.js";

export const ITS_ENDPOINT = "https://openapi.its.go.kr:9443/trafficInfo";
export const PUBLIC_SPEED_POLICY = "kr-its-v1" as const;
export const PUBLIC_SPEED_MAX_AGE_MS = 600_000;
export const ITS_MIN_POLL_MS = 120_000;
export const ITS_BODY_LIMIT = 8 * 1024 * 1024;
const ROW_LIMIT = 50_000;
export type PublicBounds = readonly [number, number, number, number];
export type PublicSpeedStatus = "LIVE" | "UNKNOWN" | "STALE";
export interface PublicSpeedObservation {
  link_id: string;
  start_node_id: string;
  end_node_id: string;
  road_name: string;
  observed_at: string | null;
  valid_until: string | null;
  speed_mps: number | null;
  travel_time_s: number | null;
  status: PublicSpeedStatus;
  reason: "VALID" | "INVALID_TIME" | "FUTURE" | "EXPIRED" |
    "INVALID_SPEED" | "INVALID_NODES" | "CONFLICT";
}
export interface PublicSpeedBatch {
  schema_version: "public-source-0.1" | "public-source-0.2";
  source_class: "PUBLIC_AGENCY";
  provider: "kr-its" | "kr-regional";
  policy: typeof PUBLIC_SPEED_POLICY | "kr-regional-v1";
  endpoint: typeof ITS_ENDPOINT | "regional-captured-sources-v1";
  bounds: PublicBounds;
  retrieved_at: string;
  raw_sha256: string;
  raw_byte_length: number;
  received_rows: number;
  invalid_id_rows: number;
  duplicate_rows: number;
  observations: PublicSpeedObservation[];
}
export class PublicSpeedError extends Error {
  constructor(readonly code: string) {
    super(`Public traffic unavailable: ${code} / 공공 교통정보 사용 불가: ${code}`);
  }
}
function reject(code: string): never { throw new PublicSpeedError(code); }
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) reject("INVALID_RESPONSE");
  return v as Record<string, unknown>;
}
export function publicTime(v: string): number {
  const n = Date.parse(v);
  if (!Number.isFinite(n) || new Date(n).toISOString() !== v) reject("INVALID_UTC_TIME");
  return n;
}
export function validatePublicBounds(bounds: PublicBounds): void {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite))
    reject("INVALID_BOUNDS");
  const [west, south, east, north] = bounds;
  if (west < 123 || east > 133 || south < 32 || north > 40 ||
      east <= west || north <= south || east - west > 0.250000001 || north - south > 0.250000001)
    reject("INVALID_BOUNDS");
}
/** Never let Date normalize February30 or interpret a Korean clock in the host zone.
 * 잘못된 달력일 보정·호스트 시간대 해석을 허용하지 않습니다. */
export function parseItsKoreanTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^20\d{12}$/.test(value)) return null;
  const parts = [value.slice(0, 4), value.slice(4, 6), value.slice(6, 8),
    value.slice(8, 10), value.slice(10, 12), value.slice(12, 14)].map(Number);
  const [year, month, day, hour, minute, second] = parts as [number, number, number, number, number, number];
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const round = new Date(local);
  if (round.getUTCFullYear() !== year || round.getUTCMonth() !== month - 1 ||
      round.getUTCDate() !== day || round.getUTCHours() !== hour ||
      round.getUTCMinutes() !== minute || round.getUTCSeconds() !== second) return null;
  return new Date(local - 9 * 3600_000).toISOString();
}
function decimal(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !/^\d+(?:\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const nodeId = (v: unknown): v is string => typeof v === "string" && /^\d{10}$/.test(v);
function observation(row: Record<string, unknown>, now: number): PublicSpeedObservation {
  const observed_at = parseItsKoreanTime(row.createdDate);
  const observed = observed_at === null ? null : Date.parse(observed_at);
  const speed = decimal(row.speed), travel = decimal(row.travelTime);
  const reason: PublicSpeedObservation["reason"] =
    !nodeId(row.startNodeId) || !nodeId(row.endNodeId) || row.startNodeId === row.endNodeId
      ? "INVALID_NODES" : observed === null ? "INVALID_TIME" :
    observed > now + 30_000 ? "FUTURE" : now >= observed + PUBLIC_SPEED_MAX_AGE_MS ? "EXPIRED" :
    speed === null || speed <= 0 || speed > 252 ? "INVALID_SPEED" : "VALID";
  return {
    link_id: row.linkId as string,
    start_node_id: nodeId(row.startNodeId) ? row.startNodeId : "",
    end_node_id: nodeId(row.endNodeId) ? row.endNodeId : "",
    road_name: typeof row.roadName === "string" ? row.roadName.slice(0, 200) : "",
    observed_at,
    valid_until: observed === null ? null : new Date(observed + PUBLIC_SPEED_MAX_AGE_MS).toISOString(),
    speed_mps: reason === "VALID" ? speed! / 3.6 : null,
    travel_time_s: travel !== null && travel > 0 && travel <= 86400 ? travel : null,
    status: reason === "VALID" ? "LIVE" : reason === "EXPIRED" ? "STALE" : "UNKNOWN",
    reason,
  };
}
export function normalizeItsResponse(
  raw: Uint8Array,
  retrieved_at: string,
  bounds: PublicBounds,
): PublicSpeedBatch {
  validatePublicBounds(bounds);
  const now = publicTime(retrieved_at);
  if (raw.byteLength < 2 || raw.byteLength > ITS_BODY_LIMIT) reject("BODY_LIMIT");
  let parsed: unknown;
  try { parsed = parseJson(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
  catch { reject("INVALID_JSON"); }
  const root = object(parsed), header = object(root.header);
  if (String(header.resultCode) !== "0" || header.resultMsg !== "SUCCESS") reject("PROVIDER_FAILURE");
  const body = object(root.body), count = decimal(body.totalCount);
  if (!Array.isArray(body.items) || body.items.length > ROW_LIMIT ||
      count !== body.items.length || !Number.isSafeInteger(count)) reject("INCOMPLETE_RESPONSE");
  const groups = new Map<string, PublicSpeedObservation[]>();
  let invalid_id_rows = 0, duplicate_rows = 0;
  for (const value of body.items) {
    const row = object(value);
    if (!nodeId(row.linkId)) { invalid_id_rows++; continue; }
    const rows = groups.get(row.linkId) ?? [];
    if (rows.length) duplicate_rows++;
    rows.push(observation(row, now));
    groups.set(row.linkId, rows);
  }
  const observations: PublicSpeedObservation[] = [];
  for (const rows of groups.values()) {
    // Missing timestamps can hide a newer invalidation; do not silently reuse older values.
    // 시각 없는 최신 무효화 가능성을 숨긴 채 옛 양수를 재사용하지 않습니다.
    const invalid = rows.find(r => r.observed_at === null);
    rows.sort((a, b) => (b.observed_at ?? "").localeCompare(a.observed_at ?? ""));
    const latest = invalid ?? rows[0]!;
    const peers = rows.filter(r => r.observed_at === latest.observed_at);
    const signature = (r: PublicSpeedObservation) => JSON.stringify([
      r.start_node_id, r.end_node_id, r.status, r.reason, r.speed_mps, r.travel_time_s]);
    const conflict = peers.some(r => signature(r) !== signature(latest));
    observations.push(conflict ? { ...latest, status: "UNKNOWN", reason: "CONFLICT", speed_mps: null } : latest);
  }
  observations.sort((a, b) => a.link_id.localeCompare(b.link_id));
  return {
    schema_version: "public-source-0.1", source_class: "PUBLIC_AGENCY", provider: "kr-its",
    policy: PUBLIC_SPEED_POLICY, endpoint: ITS_ENDPOINT, bounds: [...bounds], retrieved_at,
    raw_sha256: createHash("sha256").update(raw).digest("hex"), raw_byte_length: raw.byteLength,
    received_rows: body.items.length, invalid_id_rows, duplicate_rows, observations,
  };
}

export interface ItsRead { raw: Uint8Array; batch: PublicSpeedBatch }
type Fetch = typeof globalThis.fetch;
/** Injectable transport/clock for failure tests; the production URL is immutable.
 * 장애 검사를 위한 전송·시계 주입이며 운영 URL은 고정합니다. */
export async function readItsSpeeds(
  apiKey: string,
  bounds: PublicBounds,
  options: { fetch?: Fetch; clock?: () => number; signal?: AbortSignal } = {},
): Promise<ItsRead> {
  validatePublicBounds(bounds);
  if (typeof apiKey !== "string" || !/^[A-Za-z0-9_+\/=.-]{8,256}$/.test(apiKey)) reject("MISSING_CREDENTIAL");
  const url = new URL(ITS_ENDPOINT);
  for (const [key, value] of Object.entries({apiKey, type: "all", getType: "json",
    minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3]})) url.searchParams.set(key, String(value));
  let response: Response;
  const signal = AbortSignal.any([AbortSignal.timeout(10_000), ...(options.signal ? [options.signal] : [])]);
  try { response = await (options.fetch ?? fetch)(url, { redirect: "error", signal, headers: {accept: "application/json"} }); }
  catch { reject("TRANSPORT_FAILURE"); } // Upstream errors may contain a credential-bearing URL.
  // 상위 오류는 키 포함 URL을 담을 수 있으므로 원문을 공개하지 않습니다.
  if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    try { await response.body?.cancel(); } catch {}
    reject("HTTP_RESPONSE");
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > ITS_BODY_LIMIT)) {
    try { await response.body?.cancel(); } catch {}
    reject("BODY_LIMIT");
  }
  const reader = response.body?.getReader();
  if (!reader) reject("EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ITS_BODY_LIMIT) reject("BODY_LIMIT");
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    if (error instanceof PublicSpeedError) throw error;
    reject("TRANSPORT_FAILURE");
  } finally { reader.releaseLock(); }
  if (length !== null && !response.headers.has("content-encoding") && Number(length) !== size)
    reject("INCOMPLETE_RESPONSE");
  const raw = Buffer.concat(chunks, size);
  // Never persist an authentication failure echo, including its URL-encoded representation.
  // 인증 실패 응답이 키 원문·URL 표현을 되돌려주면 저장하지 않습니다.
  if ([apiKey, encodeURIComponent(apiKey), JSON.stringify(apiKey).slice(1, -1)]
    .some(secret => raw.includes(Buffer.from(secret)))) reject("CREDENTIAL_ECHO");
  const batch = normalizeItsResponse(raw, new Date((options.clock ?? Date.now)()).toISOString(), bounds);
  return {raw, batch};
}

export class ItsSpeedCollector {
  private inFlight?: Promise<ItsRead>;
  private nextAttempt = -Infinity;
  constructor(private readonly apiKey: string, readonly bounds: PublicBounds,
    private readonly options: Parameters<typeof readItsSpeeds>[2] = {}) {
    validatePublicBounds(bounds);
    this.bounds = [...bounds];
  }
  collect(): Promise<ItsRead> {
    if (this.inFlight) return this.inFlight;
    const now = (this.options?.clock ?? Date.now)();
    if (now < this.nextAttempt) return Promise.reject(new PublicSpeedError("POLL_INTERVAL"));
    this.nextAttempt = now + ITS_MIN_POLL_MS;
    const work = readItsSpeeds(this.apiKey, this.bounds, this.options);
    this.inFlight = work;
    void work.finally(() => { if (this.inFlight === work) this.inFlight = undefined; }).catch(() => {});
    return work;
  }
}
