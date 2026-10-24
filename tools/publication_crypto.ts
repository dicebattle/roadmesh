import { CompactSign, compactVerify, importJWK, type JWK } from "jose";
import {
  canonical,
  parseJson,
  record,
  identifier,
  integer,
  number,
  sha256,
} from "./shared.js";
import { utc } from "./ingestion_validation.js";
import {
  normalizedCatalog,
  edgeCompare,
  windowTimes,
} from "./traffic_aggregation.js";
import type { CatalogEdge, AggregationDraft } from "./aggregation_types.js";
import type {
  TrafficManifest,
  TrafficSnapshot,
  TrustRoot,
  PublicationSigner,
  ConsumerConfig,
  VerifiedPublication,
} from "./publication_types.js";
export const MANIFEST_LIMIT = 65536,
  ARTIFACT_LIMIT = 2097152;
export class PublicationError extends Error {
  constructor(readonly code: string) {
    super(
      `Publication rejected: ${code} / 게시 자료가 거부되었습니다: ${code}`,
    );
  }
}
export function reject(code: string): never {
  throw new PublicationError(code);
}
export function strictJson(bytes: Uint8Array, limit: number): unknown {
  if (bytes.byteLength > limit) reject("OVERSIZE");
  try {
    return parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    reject("INVALID_JSON");
  }
}
export function bytes64(value: unknown, size?: number): Uint8Array {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9_-]+$/.test(value))
    reject("INVALID_KEY");
  const bytes = Buffer.from(value, "base64url");
  if (
    bytes.toString("base64url") !== value ||
    (size !== undefined && bytes.length !== size)
  )
    reject("INVALID_KEY");
  return bytes;
}
const hash = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    reject("INVALID_HASH");
};
function milliseconds(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    reject("INVALID_TIME");
  try {
    return utc(value);
  } catch {
    reject("INVALID_TIME");
  }
}
function times(
  value: {
    window_start: string;
    window_end: string;
    published_at: string;
    valid_until: string;
  },
  now: string,
): void {
  const start = milliseconds(value.window_start),
    end = milliseconds(value.window_end),
    published = milliseconds(value.published_at),
    until = milliseconds(value.valid_until),
    current = milliseconds(now);
  if (
    start % 60000 ||
    end !== start + 60000 ||
    published < end + 30000 ||
    published > current ||
    until !== end + 180000
  )
    reject("INVALID_TIME");
  if (current >= until) reject("EXPIRED");
}
export function validateRoots(roots: TrustRoot[]): void {
  if (!Array.isArray(roots) || !roots.length || roots.length > 100)
    reject("INVALID_TRUST");
  const kids = new Set<string>();
  for (const root of roots) {
    record(root, "trust root", [
      "kid",
      "public_jwk",
      "publisher_id",
      "simulation_namespace",
      "region_id",
      "allowed_graph_ids",
      "source_class",
      "valid_from",
      "valid_until",
      "revoked",
    ]);
    identifier(root.kid, "kid");
    identifier(root.publisher_id, "publisher_id");
    identifier(root.simulation_namespace, "simulation_namespace");
    if (
      kids.has(root.kid) ||
      root.region_id !== "seoul-pilot-corridors-v1" ||
      root.source_class !== "SYNTHETIC" ||
      typeof root.revoked !== "boolean" ||
      !Array.isArray(root.allowed_graph_ids) ||
      !root.allowed_graph_ids.length ||
      new Set(root.allowed_graph_ids).size !== root.allowed_graph_ids.length
    )
      reject("INVALID_TRUST");
    kids.add(root.kid);
    root.allowed_graph_ids.forEach(hash);
    if (milliseconds(root.valid_from) >= milliseconds(root.valid_until))
      reject("INVALID_TRUST");
    const jwk = root.public_jwk;
    record(
      jwk,
      "public key",
      ["kty", "crv", "x"],
      ["alg", "use", "key_ops", "kid", "ext"],
    );
    if (
      jwk.kty !== "OKP" ||
      jwk.crv !== "Ed25519" ||
      (jwk.alg !== undefined && jwk.alg !== "EdDSA") ||
      (jwk.use !== undefined && jwk.use !== "sig") ||
      (jwk.kid !== undefined && jwk.kid !== root.kid) ||
      (jwk.key_ops !== undefined &&
        (!Array.isArray(jwk.key_ops) ||
          jwk.key_ops.length !== 1 ||
          jwk.key_ops[0] !== "verify"))
    )
      reject("INVALID_KEY");
    bytes64(jwk.x, 32);
  }
}
export function validateDraft(
  value: unknown,
  catalog: CatalogEdge[],
  graphId: string,
): AggregationDraft {
  record(value, "draft", [
    "schema_version",
    "graph_id",
    "region_id",
    "aggregation_policy",
    "window_start",
    "window_end",
    "valid_until",
    "entries",
  ]);
  if (
    value.schema_version !== "0.1" ||
    value.graph_id !== graphId ||
    value.region_id !== "seoul-pilot-corridors-v1" ||
    value.aggregation_policy !== "seoul-window-median-v1"
  )
    reject("WRONG_SCOPE");
  hash(value.graph_id);
  const expected = normalizedCatalog(catalog);
  if (
    !Array.isArray(value.entries) ||
    value.entries.length !== expected.length ||
    value.entries.length > 10000
  )
    reject("CATALOG_MISMATCH");
  for (let i = 0; i < expected.length; i++) {
    const entry = value.entries[i];
    record(entry, "entry", [
      "edge_id",
      "forward",
      "source_class",
      "status",
      "speed_mps",
      "sample_bucket",
    ]);
    const edge = expected[i]!;
    if (
      entry.edge_id !== edge.edge_id ||
      entry.forward !== edge.forward ||
      entry.source_class !== "SYNTHETIC"
    )
      reject("CATALOG_MISMATCH");
    if (entry.status === "LIVE") {
      number(entry.speed_mps, "speed_mps", Number.MIN_VALUE, Number.MAX_VALUE);
      if (!["5-9", "10-19", "20+"].includes(entry.sample_bucket as string))
        reject("INVALID_ENTRY");
    } else if (
      !["INSUFFICIENT", "UNKNOWN", "STALE"].includes(entry.status as string) ||
      entry.speed_mps !== null ||
      entry.sample_bucket !== null
    )
      reject("INVALID_ENTRY");
  }
  const t = windowTimes(value.window_start as string);
  if (
    milliseconds(value.window_end) !== t.end ||
    milliseconds(value.valid_until) !== t.validUntil
  )
    reject("INVALID_TIME");
  milliseconds(value.window_start);
  return value as unknown as AggregationDraft;
}
export function validateManifest(value: unknown, now: string): TrafficManifest {
  record(value, "manifest", [
    "schema_version",
    "simulation_namespace",
    "publisher_id",
    "graph_id",
    "region_id",
    "sequence",
    "window_start",
    "window_end",
    "published_at",
    "valid_until",
    "aggregation_policy",
    "traffic_snapshot_id",
    "byte_length",
    "media_type",
  ]);
  if (
    value.schema_version !== "0.1" ||
    value.region_id !== "seoul-pilot-corridors-v1" ||
    value.aggregation_policy !== "seoul-window-median-v1" ||
    value.media_type !== "application/json"
  )
    reject("WRONG_SCOPE");
  identifier(value.simulation_namespace, "namespace");
  identifier(value.publisher_id, "publisher_id");
  hash(value.graph_id);
  hash(value.traffic_snapshot_id);
  integer(value.sequence, "sequence", 1, Number.MAX_SAFE_INTEGER);
  integer(value.byte_length, "byte_length", 1, ARTIFACT_LIMIT);
  times(value as unknown as TrafficManifest, now);
  return value as unknown as TrafficManifest;
}
export function scopeAndTrust(
  manifest: TrafficManifest,
  kid: string,
  config: ConsumerConfig,
  now: string,
): TrustRoot {
  validateRoots(config.trust_roots);
  if (
    manifest.simulation_namespace !== config.store.namespace ||
    manifest.publisher_id !== config.publisher_id ||
    manifest.region_id !== config.region_id ||
    !config.allowed_graph_ids.includes(manifest.graph_id)
  )
    reject("WRONG_SCOPE");
  const root = config.trust_roots.find((root) => root.kid === kid);
  if (!root) reject("UNKNOWN_KEY");
  if (root.revoked) reject("REVOKED_KEY");
  if (
    root.publisher_id !== manifest.publisher_id ||
    root.simulation_namespace !== manifest.simulation_namespace ||
    root.region_id !== manifest.region_id ||
    !root.allowed_graph_ids.includes(manifest.graph_id)
  )
    reject("WRONG_KEY_SCOPE");
  for (const value of [manifest.published_at, now])
    if (
      milliseconds(value) < milliseconds(root.valid_from) ||
      milliseconds(value) >= milliseconds(root.valid_until)
    )
      reject("KEY_TIME_INVALID");
  return root;
}
export async function signManifest(
  manifest: TrafficManifest,
  signer: PublicationSigner,
): Promise<string> {
  identifier(signer.kid, "kid");
  const jwk = signer.private_jwk;
  record(
    jwk,
    "private key",
    ["kty", "crv", "x", "d"],
    ["alg", "use", "key_ops", "kid", "ext"],
  );
  if (
    jwk.kty !== "OKP" ||
    jwk.crv !== "Ed25519" ||
    (jwk.alg !== undefined && jwk.alg !== "EdDSA") ||
    (jwk.kid !== undefined && jwk.kid !== signer.kid)
  )
    reject("INVALID_KEY");
  bytes64(jwk.x, 32);
  bytes64(jwk.d, 32);
  const key = await importJWK(jwk, "EdDSA");
  return new CompactSign(canonical(manifest))
    .setProtectedHeader({
      alg: "EdDSA",
      kid: signer.kid,
      typ: "routelens-traffic-manifest+jws",
    })
    .sign(key);
}
export async function verifyManifest(
  jws: string,
  config: ConsumerConfig,
  now: string,
): Promise<{ manifest: TrafficManifest; kid: string }> {
  try {
    if (typeof jws !== "string" || Buffer.byteLength(jws) > MANIFEST_LIMIT)
      reject("OVERSIZE");
    const parts = jws.split(".");
    if (parts.length !== 3) reject("INVALID_JWS");
    bytes64(parts[1]);
    bytes64(parts[2], 64);
    const header = strictJson(bytes64(parts[0]), MANIFEST_LIMIT);
    record(header, "protected header", ["alg", "kid", "typ"]);
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "routelens-traffic-manifest+jws" ||
      typeof header.kid !== "string"
    )
      reject("INVALID_HEADER");
    validateRoots(config.trust_roots);
    const root = config.trust_roots.find((root) => root.kid === header.kid);
    if (!root) reject("UNKNOWN_KEY");
    const key = await importJWK(root.public_jwk, "EdDSA");
    const verified = await compactVerify(jws, key, {
      algorithms: ["EdDSA"],
    });
    const manifest = validateManifest(
      strictJson(verified.payload, MANIFEST_LIMIT),
      now,
    );
    scopeAndTrust(manifest, header.kid, config, now);
    return { manifest, kid: header.kid };
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    reject("INVALID_SIGNATURE_OR_METADATA");
  }
}
export function verifyArtifact(
  manifest: TrafficManifest,
  artifact: Uint8Array,
  config: ConsumerConfig,
): TrafficSnapshot {
  if (artifact.byteLength > ARTIFACT_LIMIT) reject("OVERSIZE");
  if (artifact.byteLength !== manifest.byte_length) reject("LENGTH_MISMATCH");
  if (sha256(artifact) !== manifest.traffic_snapshot_id)
    reject("HASH_MISMATCH");
  const value = strictJson(artifact, ARTIFACT_LIMIT);
  record(value, "snapshot", [
    "schema_version",
    "graph_id",
    "region_id",
    "aggregation_policy",
    "window_start",
    "window_end",
    "valid_until",
    "entries",
    "simulation_namespace",
    "publisher_id",
    "sequence",
    "published_at",
  ]);
  const {
    simulation_namespace,
    publisher_id,
    sequence,
    published_at,
    ...draft
  } = value;
  const catalog = config.catalogs.find(
    (value) => value.graph_id === manifest.graph_id,
  );
  if (!catalog) reject("CATALOG_MISMATCH");
  validateDraft(draft, catalog.edges, manifest.graph_id);
  for (const key of [
    "schema_version",
    "graph_id",
    "region_id",
    "aggregation_policy",
    "window_start",
    "window_end",
    "valid_until",
    "simulation_namespace",
    "publisher_id",
    "sequence",
    "published_at",
  ] as const)
    if (value[key] !== manifest[key]) reject("MANIFEST_MISMATCH");
  return value as unknown as TrafficSnapshot;
}
export async function verifyPublication(
  jws: string,
  artifact: Uint8Array,
  config: ConsumerConfig,
  now: string,
): Promise<VerifiedPublication> {
  const { manifest, kid } = await verifyManifest(jws, config, now);
  const snapshot = verifyArtifact(manifest, artifact, config);
  return { manifest, snapshot, artifact: Uint8Array.from(artifact), jws, kid };
}
