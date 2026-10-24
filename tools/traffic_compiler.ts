/** Pure deterministic encoding and atomic immutable generations / 결정적 인코딩·불변 세대 원자 게시. */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { canonical, parseJson, sha256 } from "./shared.js";
import { verifyArtifact } from "./publication_crypto.js";
import { bundlePath } from "./graph_bundle.js";
import {
  boundedTrafficFile,
  trafficRecordOffset,
  trafficReject,
  validateTrafficArchive,
} from "./traffic_bundle.js";
import {
  COMPILER_POLICY,
  type EncodedTrafficEdge,
  type TrafficBundle,
  type TrafficGeneration,
  type TrafficHooks,
  type VerifiedTrafficInput,
} from "./traffic_types.js";
export function encodeTrafficSpeed(speed: number): {
  raw: number;
  bytes: Buffer;
  decoded_speed_mps: number;
  quantization_error_mps: number;
} {
  if (
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed <= 0 ||
    speed > 70
  )
    trafficReject("INVALID_SPEED");
  const raw = Math.max(1, Math.round((speed * 3.6) / 2));
  if (raw > 126) trafficReject("UNREPRESENTABLE_SPEED");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(raw) | (BigInt(raw) << 7n) | (255n << 28n));
  return {
    raw,
    bytes,
    decoded_speed_mps: (raw * 2) / 3.6,
    quantization_error_mps: (raw * 2) / 3.6 - speed,
  };
}
function checkedInput(
  bundle: TrafficBundle,
  input: VerifiedTrafficInput,
): void {
  if (!input) return;
  const { manifest, snapshot, artifact } = input;
  if (
    manifest.graph_id !== bundle.graph_id ||
    snapshot.graph_id !== bundle.graph_id ||
    manifest.byte_length !== artifact.byteLength ||
    sha256(artifact) !== manifest.traffic_snapshot_id ||
    !canonical(parseJson(artifact)).equals(canonical(snapshot))
  )
    trafficReject("PUBLICATION_BYTES_MISMATCH");
  // Reuse the strict P07 artifact/catalog parser; signature authorization stays at the consumer boundary.
  // P07의 엄격한 파일·목록 검사를 재사용하며 서명 승인은 실제 수신 저장소 경계에서 수행합니다.
  const verified = verifyArtifact(manifest, artifact, {
    catalogs: [{ graph_id: bundle.graph_id, edges: bundle.catalog }],
  } as Parameters<typeof verifyArtifact>[2]);
  if (!canonical(verified).equals(canonical(snapshot)))
    trafficReject("PUBLICATION_BYTES_MISMATCH");
}
function content(
  bundle: TrafficBundle,
  input: VerifiedTrafficInput,
): {
  bytes: Buffer;
  live_edges: EncodedTrafficEdge[];
} {
  checkedInput(bundle, input);
  const skeleton = boundedTrafficFile(bundle.skeleton_path);
  if (
    sha256(skeleton) !== bundle.skeleton_sha256 ||
    skeleton.length !== bundle.skeleton_byte_length
  )
    trafficReject("SKELETON_CONFLICT");
  const actualMembers = validateTrafficArchive(
    skeleton,
    bundle.tile_paths,
    bundle.catalog,
  );
  if (!canonical(actualMembers).equals(canonical(bundle.members)))
    trafficReject("BUNDLE_LAYOUT_CONFLICT");
  const bytes = Buffer.from(skeleton),
    live_edges: EncodedTrafficEdge[] = [],
    seen = new Set<number>();
  for (const entry of input?.snapshot.entries ?? []) {
    const offset = trafficRecordOffset(bundle.members, entry.edge_id);
    if (seen.has(offset)) trafficReject("DUPLICATE_EDGE_RECORD");
    seen.add(offset);
    if (entry.status !== "LIVE") {
      if (entry.speed_mps !== null) trafficReject("INVALID_STATUS_SPEED");
      continue;
    }
    if (entry.speed_mps === null) trafficReject("INVALID_STATUS_SPEED");
    const encoded = encodeTrafficSpeed(entry.speed_mps);
    encoded.bytes.copy(bytes, offset);
    live_edges.push({
      edge_id: entry.edge_id,
      forward: entry.forward,
      offset,
      input_speed_mps: entry.speed_mps,
      raw_speed: encoded.raw,
      decoded_speed_mps: encoded.decoded_speed_mps,
      quantization_error_mps: encoded.quantization_error_mps,
    });
  }
  const allowed = new Set(
    live_edges.flatMap((e) =>
      Array.from({ length: 8 }, (_, i) => e.offset + i),
    ),
  );
  for (let i = 0; i < bytes.length; i++)
    if (bytes[i] !== skeleton[i] && !allowed.has(i))
      trafficReject("UNEXPECTED_BYTE_CHANGE");
  return { bytes, live_edges };
}
function syncDirectory(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function durableWrite(path: string, bytes: Uint8Array): void {
  const fd = openSync(path, "wx", 0o644);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
type GenerationManifest = Omit<
  TrafficGeneration,
  "directory" | "traffic_path" | "manifest_path"
>;
function descriptor(
  directory: string,
  manifest: GenerationManifest,
): TrafficGeneration {
  return {
    ...manifest,
    directory,
    traffic_path: join(directory, "traffic.tar"),
    manifest_path: join(directory, "manifest.json"),
  };
}
function verifyReadyContent(
  directory: string,
  expected: GenerationManifest,
  bytes: Buffer,
): TrafficGeneration {
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink() ||
    !canonical(readdirSync(directory).sort()).equals(
      canonical(["manifest.json", "traffic.tar"]),
    )
  )
    trafficReject("GENERATION_CONFLICT");
  const manifest = readFileSync(bundlePath(directory, "manifest.json"));
  const traffic = boundedTrafficFile(bundlePath(directory, "traffic.tar"));
  if (
    !manifest.equals(canonical(expected)) ||
    !traffic.equals(bytes) ||
    sha256(traffic) !== expected.traffic_sha256
  )
    trafficReject("GENERATION_CONFLICT");
  return descriptor(directory, expected);
}
function verifyReady(
  directory: string,
  expected: GenerationManifest,
  bytes: Buffer,
): TrafficGeneration {
  try {
    return verifyReadyContent(directory, expected, bytes);
  } catch {
    trafficReject("GENERATION_CONFLICT");
  }
}
export function verifyTrafficGeneration(generation: TrafficGeneration): void {
  const {
    directory,
    traffic_path: _,
    manifest_path: __,
    ...manifest
  } = generation;
  let bytes: Buffer;
  try {
    bytes = boundedTrafficFile(bundlePath(directory, "traffic.tar"));
  } catch {
    trafficReject("GENERATION_CONFLICT");
  }
  if (
    bytes.length !== manifest.traffic_byte_length ||
    sha256(bytes) !== manifest.traffic_sha256
  )
    trafficReject("GENERATION_CONFLICT");
  verifyReady(directory, manifest, bytes);
}
export async function compileTrafficGeneration(
  bundle: TrafficBundle,
  input: VerifiedTrafficInput,
  generationRoot: string,
  hooks: TrafficHooks = {},
): Promise<TrafficGeneration> {
  const { bytes, live_edges } = content(bundle, input);
  const identity = {
    graph_id: bundle.graph_id,
    skeleton_sha256: bundle.skeleton_sha256,
    traffic_snapshot_id: input?.manifest.traffic_snapshot_id ?? null,
    compiler_policy: COMPILER_POLICY,
  };
  const generation_id = sha256(canonical(identity));
  const manifest: GenerationManifest = {
    ...identity,
    generation_id,
    sequence: input?.manifest.sequence ?? null,
    valid_until: input?.manifest.valid_until ?? null,
    traffic_sha256: sha256(bytes),
    traffic_byte_length: bytes.length,
    live_edges,
  };
  const root = resolve(generationRoot);
  mkdirSync(root, { recursive: true });
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    trafficReject("UNSAFE_GENERATION_ROOT");
  const ready = join(root, generation_id);
  if (existsSync(ready)) {
    const reused = verifyReady(ready, manifest, bytes);
    await hooks.phase?.("AFTER_TRAFFIC_COMMIT");
    return reused;
  }
  const stage = join(root, ".staging-" + generation_id + "-" + randomUUID());
  mkdirSync(stage);
  try {
    durableWrite(join(stage, "traffic.tar"), bytes);
    durableWrite(join(stage, "manifest.json"), canonical(manifest));
    syncDirectory(stage);
    verifyReady(stage, manifest, bytes);
    await hooks.phase?.("AFTER_TRAFFIC_WRITE");
    try {
      renameSync(stage, ready);
      syncDirectory(root);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      verifyReady(ready, manifest, bytes);
    }
    const completed = verifyReady(ready, manifest, bytes);
    await hooks.phase?.("AFTER_TRAFFIC_COMMIT");
    return completed;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
