/** Explicit public-agency attestation. RouteLens signs its ingestion, not the agency.
 * 공공 수집에 대한 RouteLens 서명이며 기관 자체 서명으로 주장하지 않습니다. */
import { CompactSign, compactVerify, importJWK, type JWK } from "jose";
import { canonical, parseJson, record, sha256 } from "./shared.js";
import { PublicSpeedError, PUBLIC_SPEED_MAX_AGE_MS, PUBLIC_SPEED_POLICY, publicTime,
  type PublicSpeedBatch } from "./public_speed_source.js";
import { matchesPublicMappingNodes, type PublicRoadMapping } from "./public_speed_geometry.js";
import type { CatalogEdge } from "./aggregation_types.js";

export interface PublicTrafficEntry {
  edge_id: string;
  forward: boolean;
  link_id: string;
  start_node_id: string;
  end_node_id: string;
  status: "LIVE";
  speed_mps: number;
  observed_at: string;
  valid_until: string;
}
export interface PublicTrafficSnapshot {
  schema_version: "public-traffic-0.1";
  source_class: "PUBLIC_AGENCY";
  provider: "kr-its";
  policy: typeof PUBLIC_SPEED_POLICY;
  publisher_id: string;
  graph_id: string;
  mapping_sha256: string;
  geometry_sha256: string;
  raw_sha256: string;
  sequence: number;
  retrieved_at: string;
  published_at: string;
  valid_until: string;
  coverage: {
    graph_edges: number;
    mapped_edges: number;
    unmapped_edges: number;
    live_edges: number;
    missing_observations: number;
    expired_observations: number;
    invalid_observations: number;
    node_mismatches: number;
  };
  entries: PublicTrafficEntry[];
}
export interface PublicTrafficManifest {
  schema_version: "public-traffic-0.1";
  source_class: "PUBLIC_AGENCY";
  provider: "kr-its";
  publisher_id: string;
  graph_id: string;
  mapping_sha256: string;
  sequence: number;
  published_at: string;
  valid_until: string;
  traffic_snapshot_id: string;
  byte_length: number;
}
export interface PublicTrafficPublication {
  kind: "PUBLIC_AGENCY";
  manifest: PublicTrafficManifest;
  snapshot: PublicTrafficSnapshot;
  artifact: Uint8Array;
  jws: string;
  kid: string;
}
export interface PublicTrafficTrust {
  kid: string;
  public_jwk: JWK;
  publisher_id: string;
  graph_id: string;
  mapping_sha256: string;
  valid_from: string;
  valid_until: string;
  revoked: boolean;
}
function reject(code: string): never { throw new PublicSpeedError(code); }
const hash = (v: unknown): void => { if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) reject("INVALID_HASH"); };
const identifier = (v: unknown): void => { if (typeof v !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(v)) reject("INVALID_IDENTIFIER"); };
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const sourceId = (v: unknown): boolean => typeof v === "string" && /^\d{10}$/.test(v);

export function buildPublicTrafficSnapshot(
  batch: PublicSpeedBatch,
  mapping: PublicRoadMapping,
  publisher_id: string,
  sequence: number,
  now_utc: string,
): PublicTrafficSnapshot | null {
  identifier(publisher_id);
  const now = publicTime(now_utc), retrieved = publicTime(batch.retrieved_at);
  if (batch.provider !== "kr-its" || batch.source_class !== "PUBLIC_AGENCY" || batch.policy !== PUBLIC_SPEED_POLICY ||
      batch.schema_version !== "public-source-0.1" || retrieved > now || !nonnegative(sequence) || sequence < 1 ||
      mapping.schema_version !== "kr-directed-mapping-0.1" || mapping.policy !== "kr-directed-envelope-v1") reject("INVALID_SOURCE_BINDING");
  hash(mapping.graph_id); hash(mapping.geometry_sha256); hash(batch.raw_sha256);
  const entries: PublicTrafficEntry[] = [];
  const coverage: PublicTrafficSnapshot["coverage"] = {
    graph_edges: mapping.entries.length + mapping.excluded.length, mapped_edges: mapping.entries.length,
    unmapped_edges: mapping.excluded.length, live_edges: 0, missing_observations: 0,
    expired_observations: 0, invalid_observations: 0, node_mismatches: 0,
  };
  const observations = new Map(batch.observations.map(o => [o.link_id, o]));
  if (observations.size !== batch.observations.length ||
      new Set(mapping.entries.map(e => e.edge_id)).size !== mapping.entries.length) reject("DUPLICATE_PUBLIC_EDGE");
  for (const edge of mapping.entries) {
    const o = observations.get(edge.link_id);
    if (!o) { coverage.missing_observations++; continue; }
    if (!matchesPublicMappingNodes(mapping, edge, o.start_node_id, o.end_node_id)) {
      coverage.node_mismatches++; continue;
    }
    if (o.valid_until !== null && now >= publicTime(o.valid_until)) { coverage.expired_observations++; continue; }
    if (o.status !== "LIVE" || o.speed_mps === null || o.observed_at === null || o.valid_until === null ||
        !Number.isFinite(o.speed_mps) || o.speed_mps <= 0 || o.speed_mps > 70 ||
        publicTime(o.observed_at) > retrieved + 30_000 ||
        publicTime(o.valid_until) !== publicTime(o.observed_at) + PUBLIC_SPEED_MAX_AGE_MS) {
      coverage.invalid_observations++; continue;
    }
    entries.push({edge_id: edge.edge_id, forward: edge.forward, link_id: o.link_id,
      start_node_id: o.start_node_id, end_node_id: o.end_node_id, status: "LIVE", speed_mps: o.speed_mps,
      observed_at: o.observed_at, valid_until: o.valid_until});
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  coverage.live_edges = entries.length;
  return {schema_version: "public-traffic-0.1", source_class: "PUBLIC_AGENCY", provider: "kr-its",
    policy: PUBLIC_SPEED_POLICY, publisher_id, graph_id: mapping.graph_id,
    mapping_sha256: sha256(canonical(mapping)), geometry_sha256: mapping.geometry_sha256, raw_sha256: batch.raw_sha256,
    sequence, retrieved_at: batch.retrieved_at, published_at: now_utc,
    valid_until: new Date(Math.min(...entries.map(e => publicTime(e.valid_until)))).toISOString(), coverage, entries};
}

export function publicTrafficManifest(snapshot: PublicTrafficSnapshot, artifact: Uint8Array): PublicTrafficManifest {
  return {schema_version: snapshot.schema_version, source_class: snapshot.source_class, provider: snapshot.provider,
    publisher_id: snapshot.publisher_id, graph_id: snapshot.graph_id, mapping_sha256: snapshot.mapping_sha256,
    sequence: snapshot.sequence, published_at: snapshot.published_at, valid_until: snapshot.valid_until,
    traffic_snapshot_id: sha256(artifact), byte_length: artifact.byteLength};
}
/** Reused at signature and byte-compiler boundaries. It does not assert key authorization.
 * 서명·파일 변환 양쪽에서 재사용하며 이 함수만으로 키 승인을 주장하지 않습니다. */
export function readPublicTrafficArtifact(
  manifest: PublicTrafficManifest, artifact: Uint8Array, catalog: CatalogEdge[],
): PublicTrafficSnapshot {
  if (artifact.byteLength < 2 || artifact.byteLength > 8 * 1024 * 1024) reject("PUBLIC_ARTIFACT_LIMIT");
  let parsed: unknown;
  try { parsed = parseJson(artifact); } catch { reject("INVALID_PUBLIC_JSON"); }
  record(parsed, "public traffic", ["schema_version", "source_class", "provider", "policy", "publisher_id", "graph_id",
    "mapping_sha256", "geometry_sha256", "raw_sha256", "sequence", "retrieved_at", "published_at", "valid_until", "coverage", "entries"]);
  if (parsed.schema_version !== "public-traffic-0.1" || parsed.source_class !== "PUBLIC_AGENCY" ||
      parsed.provider !== "kr-its" || parsed.policy !== PUBLIC_SPEED_POLICY) reject("PUBLIC_SOURCE_MISMATCH");
  identifier(parsed.publisher_id);
  for (const h of [parsed.graph_id, parsed.mapping_sha256, parsed.geometry_sha256, parsed.raw_sha256]) hash(h);
  if (!nonnegative(parsed.sequence) || parsed.sequence < 1) reject("INVALID_PUBLIC_SEQUENCE");
  for (const key of ["retrieved_at", "published_at", "valid_until"]) if (typeof parsed[key] !== "string") reject("INVALID_PUBLIC_TIME");
  const retrieved = publicTime(parsed.retrieved_at as string), published = publicTime(parsed.published_at as string),
    until = publicTime(parsed.valid_until as string);
  if (retrieved > published || until <= published || published - retrieved >= PUBLIC_SPEED_MAX_AGE_MS + 30_000)
    reject("INVALID_PUBLIC_TIME");
  const counts = ["graph_edges", "mapped_edges", "unmapped_edges", "live_edges", "missing_observations", "expired_observations", "invalid_observations", "node_mismatches"];
  record(parsed.coverage, "public coverage", counts);
  const c = parsed.coverage;
  if (counts.some(k => !nonnegative(c[k])) ||
      Number(c.graph_edges) !== Number(c.mapped_edges) + Number(c.unmapped_edges) ||
      Number(c.mapped_edges) !== ["live_edges", "missing_observations", "expired_observations", "invalid_observations", "node_mismatches"].reduce((n, k) => n + Number(c[k]), 0) ||
      !Array.isArray(parsed.entries) || !parsed.entries.length || parsed.entries.length > 50_000 ||
      parsed.entries.length !== c.live_edges || Number(c.graph_edges) !== catalog.length) reject("INVALID_PUBLIC_COVERAGE");
  const byId = new Map(catalog.map(e => [e.edge_id, e]));
  const seen = new Set<string>();
  let earliest = Infinity, previous = "";
  for (const e of parsed.entries) {
    record(e, "public entry", ["edge_id", "forward", "link_id", "start_node_id", "end_node_id", "status", "speed_mps", "observed_at", "valid_until"]);
    if (typeof e.edge_id !== "string" || !/^\d+$/.test(e.edge_id) || !byId.has(e.edge_id) ||
        seen.has(e.edge_id) || (previous && previous.localeCompare(e.edge_id) >= 0) ||
        typeof e.forward !== "boolean" || byId.get(e.edge_id)!.forward !== e.forward ||
        !sourceId(e.link_id) || !sourceId(e.start_node_id) || !sourceId(e.end_node_id) || e.start_node_id === e.end_node_id ||
        e.status !== "LIVE" || typeof e.speed_mps !== "number" || !Number.isFinite(e.speed_mps) ||
        e.speed_mps <= 0 || e.speed_mps > 70 || typeof e.observed_at !== "string" || typeof e.valid_until !== "string") reject("INVALID_PUBLIC_ENTRY");
    seen.add(e.edge_id); previous = e.edge_id;
    const observed = publicTime(e.observed_at), expiry = publicTime(e.valid_until);
    if (observed > retrieved + 30_000 || expiry !== observed + PUBLIC_SPEED_MAX_AGE_MS || published >= expiry)
      reject("INVALID_PUBLIC_TIME");
    earliest = Math.min(earliest, expiry);
  }
  if (until !== earliest || !canonical(parsed).equals(Buffer.from(artifact))) reject("NONCANONICAL_PUBLIC_ARTIFACT");
  const snapshot = parsed as unknown as PublicTrafficSnapshot;
  if (!canonical(manifest).equals(canonical(publicTrafficManifest(snapshot, artifact)))) reject("PUBLIC_MANIFEST_MISMATCH");
  return snapshot;
}

export async function signPublicTraffic(
  snapshot: PublicTrafficSnapshot, kid: string, private_jwk: JWK, catalog: CatalogEdge[],
): Promise<PublicTrafficPublication> {
  identifier(kid);
  if (private_jwk.kty !== "OKP" || private_jwk.crv !== "Ed25519" || !private_jwk.d) reject("INVALID_SIGNING_KEY");
  const artifact = canonical(snapshot), manifest = publicTrafficManifest(snapshot, artifact);
  readPublicTrafficArtifact(manifest, artifact, catalog);
  const jws = await new CompactSign(canonical(manifest)).setProtectedHeader({alg: "EdDSA", kid, typ: "routelens-public-traffic+jws"})
    .sign(await importJWK(private_jwk, "EdDSA"));
  return {kind: "PUBLIC_AGENCY", manifest, snapshot, artifact, jws, kid};
}

export async function verifyPublicTraffic(
  jws: string, artifact: Uint8Array, trust: PublicTrafficTrust,
  mapping: PublicRoadMapping, catalog: CatalogEdge[], now_utc: string,
): Promise<PublicTrafficPublication> {
  const now = publicTime(now_utc);
  identifier(trust.kid); identifier(trust.publisher_id);
  if (trust.revoked || typeof trust.revoked !== "boolean" || trust.public_jwk.kty !== "OKP" ||
      trust.public_jwk.crv !== "Ed25519" || "d" in trust.public_jwk || !trust.public_jwk.x ||
      now < publicTime(trust.valid_from) || now >= publicTime(trust.valid_until) ||
      trust.mapping_sha256 !== sha256(canonical(mapping)) || trust.graph_id !== mapping.graph_id ||
      typeof jws !== "string" || jws.length > 8192) reject("PUBLIC_TRUST_MISMATCH");
  let payload: Uint8Array, manifest: PublicTrafficManifest;
  try {
    const verified = await compactVerify(jws, await importJWK(trust.public_jwk, "EdDSA"), {algorithms: ["EdDSA"]});
    if (verified.protectedHeader.kid !== trust.kid || verified.protectedHeader.typ !== "routelens-public-traffic+jws" ||
        Object.keys(verified.protectedHeader).sort().join(",") !== "alg,kid,typ") reject("PUBLIC_SIGNATURE_HEADER");
    payload = verified.payload;
    manifest = parseJson(payload) as PublicTrafficManifest;
    if (!canonical(manifest).equals(Buffer.from(payload))) reject("PUBLIC_MANIFEST_MISMATCH");
  } catch (error) {
    if (error instanceof PublicSpeedError) throw error;
    reject("PUBLIC_SIGNATURE_INVALID");
  }
  const snapshot = readPublicTrafficArtifact(manifest, artifact, catalog);
  if (snapshot.publisher_id !== trust.publisher_id || snapshot.graph_id !== trust.graph_id ||
      snapshot.mapping_sha256 !== trust.mapping_sha256 || snapshot.geometry_sha256 !== mapping.geometry_sha256 ||
      publicTime(snapshot.published_at) > now || now >= publicTime(snapshot.valid_until)) reject("PUBLIC_SCOPE_OR_TIME");
  const mapped = new Map(mapping.entries.map(e => [e.edge_id, e]));
  for (const e of snapshot.entries) {
    const m = mapped.get(e.edge_id);
    if (!m || e.forward !== m.forward || e.link_id !== m.link_id ||
        !matchesPublicMappingNodes(mapping, m, e.start_node_id, e.end_node_id)) reject("PUBLIC_MAPPING_MISMATCH");
  }
  return {kind: "PUBLIC_AGENCY", manifest, snapshot, artifact, jws, kid: trust.kid};
}

export function isPublicTraffic(input: unknown): input is PublicTrafficPublication {
  return !!input && typeof input === "object" && "kind" in input && input.kind === "PUBLIC_AGENCY";
}
