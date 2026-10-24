/** Validate upstream TAR bytes without extracting archive paths / 경로 추출 없이 상위 TAR 바이트 검사. */
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonical, parseJson, sha256 } from "./shared.js";
import { bundlePath } from "./graph_bundle.js";
import { loadSeoulGraph, fileSha256 } from "./seoul_bundle.js";
import { geodesicSphere } from "./geodesy.js";
import { normalizedCatalog } from "./traffic_aggregation.js";
import { GraphCommands, OwnedGraphContainer } from "./test_graph.js";
import type { CatalogEdge } from "./aggregation_types.js";
import type { TrafficBundle, TrafficMember } from "./traffic_types.js";
export const MAX_TRAFFIC_BYTES = 512 * 1024 * 1024;
export class TrafficError extends Error {
  constructor(readonly reason: string) {
    super(
      `Traffic operation rejected: ${reason} / 교통정보 작업 거부: ${reason}`,
    );
  }
}
export function trafficReject(reason: string): never {
  throw new TrafficError(reason);
}
export function boundedTrafficFile(path: string): Buffer {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_TRAFFIC_BYTES ||
    stat.size < 1024
  )
    trafficReject("INVALID_ARCHIVE");
  const bytes = readFileSync(path);
  if (bytes.length !== stat.size) trafficReject("CHANGED_ARCHIVE");
  return bytes;
}
function octal(bytes: Buffer): number {
  const value = bytes.toString("ascii").replace(/\0.*$/s, "").trim();
  if (!/^[0-7]+$/.test(value)) trafficReject("INVALID_TAR_NUMBER");
  const n = parseInt(value, 8);
  if (!Number.isSafeInteger(n)) trafficReject("INVALID_TAR_NUMBER");
  return n;
}
export function tileBaseFromPath(path: string): number {
  if (!/^[0-2]\/(?:\d{3}\/)*\d{3}\.gph$/.test(path))
    trafficReject("INVALID_TILE_PATH");
  const parts = path.split("/");
  const level = Number(parts.shift());
  const tile = Number(parts.join("").replace(/\.gph$/, ""));
  const value = tile * 8 + level;
  if (!Number.isSafeInteger(value) || value >= 2 ** 25)
    trafficReject("INVALID_TILE_ID");
  return value;
}
export function validateTrafficArchive(
  bytes: Buffer,
  tilePaths: string[],
  catalog: CatalogEdge[],
  requireBlank = true,
): TrafficMember[] {
  if (
    bytes.length > MAX_TRAFFIC_BYTES ||
    bytes.length < 1024 ||
    bytes.length % 512
  )
    trafficReject("INVALID_ARCHIVE");
  const tar: Array<{
    name: string;
    offset: number;
    size: number;
  }> = [];
  let cursor = 0;
  while (cursor + 512 <= bytes.length) {
    const h = bytes.subarray(cursor, cursor + 512);
    if (h.every((v) => v === 0)) break;
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : h[i]!;
    if (
      octal(h.subarray(148, 156)) !== checksum ||
      h[156] !== 48 ||
      h.subarray(257, 263).toString() !== "ustar\0" ||
      h.subarray(345, 500).some((v) => v !== 0)
    )
      trafficReject("INVALID_TAR_HEADER");
    const name = h.subarray(0, 100).toString("ascii").replace(/\0.*$/s, "");
    const size = octal(h.subarray(124, 136)),
      offset = cursor + 512;
    if (!name || offset + size > bytes.length)
      trafficReject("INVALID_TAR_BOUNDS");
    tar.push({ name, offset, size });
    cursor = offset + Math.ceil(size / 512) * 512;
  }
  if (
    bytes.length - cursor < 1024 ||
    bytes.subarray(cursor).some((v) => v !== 0)
  )
    trafficReject("INVALID_TAR_END");
  const first = tar.shift();
  if (
    !first ||
    first.name !== "index.bin" ||
    first.offset !== 512 ||
    first.size % 16 ||
    !first.size
  )
    trafficReject("INVALID_INDEX");
  const expected = [...tilePaths].sort();
  if (
    new Set(expected).size !== expected.length ||
    tar.length !== expected.length ||
    !canonical(tar.map((t) => t.name).sort()).equals(canonical(expected)) ||
    first.size !== tar.length * 16
  )
    trafficReject("TILE_MEMBERSHIP");
  const expectedBases = new Set(expected.map(tileBaseFromPath));
  if (expectedBases.size !== expected.length) trafficReject("DUPLICATE_TILE");
  const members: TrafficMember[] = [],
    seen = new Set<number>();
  for (let p = first.offset; p < first.offset + first.size; p += 16) {
    const bigOffset = bytes.readBigUInt64LE(p);
    if (bigOffset > BigInt(Number.MAX_SAFE_INTEGER))
      trafficReject("INVALID_MEMBER_OFFSET");
    const offset = Number(bigOffset),
      tile_base = bytes.readUInt32LE(p + 8),
      byte_length = bytes.readUInt32LE(p + 12);
    const entry = tar.find((t) => t.offset === offset);
    if (
      !entry ||
      entry.size !== byte_length ||
      !expectedBases.has(tile_base) ||
      seen.has(tile_base) ||
      tileBaseFromPath(entry.name) !== tile_base ||
      byte_length < 32 ||
      offset + byte_length > bytes.length
    )
      trafficReject("INVALID_MEMBER");
    seen.add(tile_base);
    if (
      bytes.readBigUInt64LE(offset) !== BigInt(tile_base) ||
      bytes.readBigUInt64LE(offset + 8) !== 0n ||
      bytes.readUInt32LE(offset + 20) !== 3 ||
      bytes.readUInt32LE(offset + 24) ||
      bytes.readUInt32LE(offset + 28)
    )
      trafficReject("INVALID_TRAFFIC_HEADER");
    const directed_edge_count = bytes.readUInt32LE(offset + 16);
    if (byte_length !== 32 + directed_edge_count * 8)
      trafficReject("INVALID_EDGE_COUNT");
    if (
      requireBlank &&
      bytes.subarray(offset + 32, offset + byte_length).some((v) => v !== 0)
    )
      trafficReject("NONBLANK_SKELETON");
    members.push({ tile_base, offset, byte_length, directed_edge_count });
  }
  members.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < members.length; i++)
    if (
      members[i]!.offset <
      members[i - 1]!.offset + members[i - 1]!.byte_length
    )
      trafficReject("OVERLAPPING_MEMBERS");
  for (const edge of normalizedCatalog(catalog))
    trafficRecordOffset(members, edge.edge_id);
  return members;
}
export function trafficRecordOffset(
  members: TrafficMember[],
  id: string,
): number {
  if (!/^(0|[1-9]\d*)$/.test(id)) trafficReject("INVALID_GRAPH_ID");
  const value = BigInt(id),
    base = Number(value & ((1n << 25n) - 1n)),
    index = value >> 25n;
  const member = members.find((m) => m.tile_base === base);
  if (!member || index >= BigInt(member.directed_edge_count))
    trafficReject("EDGE_OUT_OF_RANGE");
  return member.offset + 32 + Number(index) * 8;
}
export async function prepareTrafficBundle(
  graphDirectory: string,
  outputDirectory: string,
): Promise<TrafficBundle> {
  const graph = loadSeoulGraph(graphDirectory),
    output = resolve(outputDirectory);
  mkdirSync(output);
  const commands = new GraphCommands(output),
    container = new OwnedGraphContainer(commands);
  const image = graph.manifest.image as {
    id: string;
  };
  const config = parseJson(
    readFileSync(bundlePath(graph.directory, "config.json")),
  ) as {
    mjolnir: Record<string, unknown>;
  };
  Object.assign(config.mjolnir, {
    tile_dir: "/graph/tiles",
    tile_extract: "/work/graph.tar",
    traffic_extract: "/work/traffic.tar",
    admin: "/work/no-admin.sqlite",
    timezone: "/work/no-timezone.sqlite",
  });
  writeFileSync(
    join(output, "build-config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  let cleaned = false;
  try {
    container.start(image.id, output, graph.directory, { memory: "4g" });
    container.exec(
      [
        "valhalla_build_extract",
        "-c",
        "/work/build-config.json",
        "--with-traffic",
      ],
      120000,
    );
    const catalog = normalizedCatalog(
      graph.edges.map((e) => ({
        edge_id: e.edge_id,
        forward: e.forward,
        distance_m: geodesicSphere.length(e.directed_geometry),
      })),
    );
    const skeleton = boundedTrafficFile(join(output, "traffic.tar"));
    const members = validateTrafficArchive(
      skeleton,
      Object.keys(graph.manifest.tile_sha256 as Record<string, string>),
      catalog,
    );
    const manifest = {
      schema_version: "p08-0.1",
      graph_id: graph.graphId,
      graph_manifest_sha256: graph.manifestSha256,
      image_id: image.id,
      skeleton_sha256: sha256(skeleton),
      skeleton_byte_length: skeleton.length,
      graph_extract_sha256: fileSha256(join(output, "graph.tar")),
      catalog,
      members,
    };
    writeFileSync(join(output, "manifest.json"), canonical(manifest), {
      flag: "wx",
    });
  } finally {
    cleaned = container.cleanup();
    writeFileSync(
      join(output, "cleanup.json"),
      JSON.stringify({ cleanup_verified: cleaned }) + "\n",
    );
    if (!cleaned) trafficReject("BUNDLE_CLEANUP");
  }
  return loadTrafficBundle(output, graph.directory);
}
function loadValidatedTrafficBundle(
  directory: string,
  graphDirectory: string,
): TrafficBundle {
  directory = resolve(directory);
  const graph = loadSeoulGraph(graphDirectory);
  // loadSeoulGraph already binds these bytes to the pinned source lock.
  // loadSeoulGraph가 이 바이트를 고정 원본 잠금 파일과 대조했습니다.
  const source = parseJson(readFileSync(join(graph.directory, "source.lock.json"))) as {
    extract: { bounds: [number, number, number, number] };
  };
  const bounds = source.extract.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) trafficReject("BUNDLE_CONFLICT");
  const manifestPath = bundlePath(directory, "manifest.json");
  if (lstatSync(manifestPath).size > 1024 * 1024)
    trafficReject("BUNDLE_MANIFEST_LIMIT");
  const m = parseJson(readFileSync(manifestPath)) as Record<string, unknown>;
  const image = graph.manifest.image as {
    id: string;
  };
  const catalog = normalizedCatalog(
    graph.edges.map((e) => ({
      edge_id: e.edge_id,
      forward: e.forward,
      distance_m: geodesicSphere.length(e.directed_geometry),
    })),
  );
  const skeleton_path = bundlePath(directory, "traffic.tar"),
    graph_extract_path = bundlePath(directory, "graph.tar");
  if (lstatSync(graph_extract_path).size > MAX_TRAFFIC_BYTES)
    trafficReject("GRAPH_EXTRACT_LIMIT");
  const skeleton = boundedTrafficFile(skeleton_path);
  const members = validateTrafficArchive(
    skeleton,
    Object.keys(graph.manifest.tile_sha256 as Record<string, string>),
    catalog,
  );
  if (
    m.schema_version !== "p08-0.1" ||
    m.graph_id !== graph.graphId ||
    m.graph_manifest_sha256 !== graph.manifestSha256 ||
    m.image_id !== image.id ||
    m.skeleton_sha256 !== sha256(skeleton) ||
    m.skeleton_byte_length !== skeleton.length ||
    m.graph_extract_sha256 !== fileSha256(graph_extract_path) ||
    !canonical(m.catalog).equals(canonical(catalog)) ||
    !canonical(m.members).equals(canonical(members))
  )
    trafficReject("BUNDLE_CONFLICT");
  return {
    directory,
    graph_directory: graph.directory,
    graph_id: graph.graphId,
    graph_manifest_sha256: graph.manifestSha256,
    coverage_bounds: Object.freeze([...bounds]) as readonly [number, number, number, number],
    image_id: image.id,
    skeleton_path,
    skeleton_sha256: sha256(skeleton),
    skeleton_byte_length: skeleton.length,
    graph_extract_path,
    graph_extract_sha256: String(m.graph_extract_sha256),
    catalog,
    tile_paths: Object.keys(
      graph.manifest.tile_sha256 as Record<string, string>,
    ),
    members,
  };
}
export function loadTrafficBundle(
  directory: string,
  graphDirectory: string,
): TrafficBundle {
  try {
    return loadValidatedTrafficBundle(directory, graphDirectory);
  } catch (error) {
    if (error instanceof TrafficError) throw error;
    trafficReject("BUNDLE_INVALID");
  }
}
