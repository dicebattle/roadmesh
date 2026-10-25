import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonical, sha256 } from "../tools/shared.js";
import {
  validateTrafficArchive,
  trafficRecordOffset,
  tileBaseFromPath,
} from "../tools/traffic_bundle.js";
import {
  compileTrafficGeneration,
  encodeTrafficSpeed,
  verifyTrafficGeneration,
} from "../tools/traffic_compiler.js";
import { validateTrafficRequest } from "../tools/traffic_runtime.js";
import type { TrafficBundle } from "../tools/traffic_types.js";
import type { VerifiedPublication } from "../tools/publication_types.js";
import type { CatalogEdge } from "../tools/aggregation_types.js";
const graphId = "a".repeat(64),
  tilePath = "2/000/001.gph",
  base = 10;
const ids = Array.from({ length: 4 }, (_, i) =>
  String((BigInt(i) << 25n) | BigInt(base)),
);
const catalog: CatalogEdge[] = ids.map((edge_id) => ({
  edge_id,
  forward: true,
  distance_m: 75,
}));
function header(
  bytes: Buffer,
  offset: number,
  name: string,
  size: number,
): void {
  bytes.write(name, offset);
  bytes.write(size.toString(8).padStart(11, "0") + "\0", offset + 124);
  bytes.fill(32, offset + 148, offset + 156);
  bytes[offset + 156] = 48;
  bytes.write("ustar\0", offset + 257);
  bytes.write("00", offset + 263);
  const checksum = bytes
    .subarray(offset, offset + 512)
    .reduce((s, v) => s + v, 0);
  bytes.write(checksum.toString(8).padStart(6, "0") + "\0 ", offset + 148);
}
/** Authored format fixture, never a C++ ABI claim / 직접 작성한 형식 시험자료이며 C++ ABI 증거가 아님. */
function skeleton(): Buffer {
  const b = Buffer.alloc(3072);
  header(b, 0, "index.bin", 16);
  header(b, 1024, tilePath, 64);
  b.writeBigUInt64LE(1536n, 512);
  b.writeUInt32LE(base, 520);
  b.writeUInt32LE(64, 524);
  b.writeBigUInt64LE(BigInt(base), 1536);
  b.writeUInt32LE(4, 1552);
  b.writeUInt32LE(3, 1556);
  return b;
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "routelens-traffic-test-")),
    bytes = skeleton(),
    path = join(directory, "traffic.tar");
  writeFileSync(path, bytes);
  const bundle: TrafficBundle = {
    directory,
    graph_directory: directory,
    graph_id: graphId,
    graph_manifest_sha256: "b".repeat(64),
    coverage_bounds: [126.7, 37.4, 127.25, 37.75],
    image_id: "sha256:" + "c".repeat(64),
    skeleton_path: path,
    skeleton_sha256: sha256(bytes),
    skeleton_byte_length: bytes.length,
    graph_extract_path: join(directory, "graph.tar"),
    graph_extract_sha256: "d".repeat(64),
    catalog,
    tile_paths: [tilePath],
    members: validateTrafficArchive(bytes, [tilePath], catalog),
  };
  const snapshot = {
    schema_version: "0.1" as const,
    graph_id: graphId,
    region_id: "seoul-pilot-corridors-v1" as const,
    aggregation_policy: "seoul-window-median-v1" as const,
    window_start: "2026-10-25T00:00:00.000Z",
    window_end: "2026-10-25T00:01:00.000Z",
    published_at: "2026-10-25T00:01:30.000Z",
    valid_until: "2026-10-25T00:04:00.000Z",
    simulation_namespace: "test",
    publisher_id: "publisher",
    sequence: 1,
    entries: ids
      .map((edge_id, i) => ({
        edge_id,
        forward: true,
        source_class: "SYNTHETIC" as const,
        status: (["LIVE", "UNKNOWN", "INSUFFICIENT", "STALE"] as const)[i]!,
        speed_mps: i === 0 ? 0.5 : null,
        sample_bucket: i === 0 ? ("5-9" as const) : null,
      }))
      .sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
  };
  const artifact = canonical(snapshot);
  const manifest = {
    ...snapshot,
    traffic_snapshot_id: sha256(artifact),
    byte_length: artifact.length,
    media_type: "application/json" as const,
  };
  const { entries: _, ...cleanManifest } = manifest;
  const input: VerifiedPublication = {
    manifest: cleanManifest,
    snapshot,
    artifact,
    jws: "codec-fixture-not-an-authorized-controller-input",
    kid: "test",
  };
  return {
    directory,
    bundle,
    input,
    bytes,
    root: join(directory, "generations"),
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}
test("Strict TAR layout binds index, members and every catalog edge / 엄격 TAR 배치는 목록·멤버·전체 구간을 연결", () => {
  const b = skeleton(),
    members = validateTrafficArchive(b, [tilePath], catalog);
  assert.equal(tileBaseFromPath(tilePath), 10);
  assert.equal(members.length, 1);
  assert.equal(trafficRecordOffset(members, ids[3]!), 1592);
  assert.throws(
    () => trafficRecordOffset(members, String((4n << 25n) | 10n)),
    /EDGE_OUT_OF_RANGE/,
  );
  assert.throws(() => trafficRecordOffset(members, "010"), /INVALID_GRAPH_ID/);
  for (const mutate of [
    (x: Buffer) => {
      x[0] = 120;
    },
    (x: Buffer) => {
      x.writeBigUInt64LE(512n, 512);
    },
    (x: Buffer) => {
      x.writeUInt32LE(8, 520);
    },
    (x: Buffer) => {
      x.writeUInt32LE(4, 1556);
    },
    (x: Buffer) => {
      x.writeUInt32LE(5, 1552);
    },
    (x: Buffer) => {
      x[1568] = 1;
    },
  ]) {
    const bad = Buffer.from(b);
    mutate(bad);
    assert.throws(() => validateTrafficArchive(bad, [tilePath], catalog));
  }
  assert.throws(() =>
    validateTrafficArchive(b.subarray(0, 2048), [tilePath], catalog),
  );
  assert.throws(
    () => validateTrafficArchive(b, [tilePath, "2/000/002.gph"], catalog),
    /TILE_MEMBERSHIP/,
  );
  assert.throws(
    () => validateTrafficArchive(b, [], catalog),
    /TILE_MEMBERSHIP/,
  );
});
test("Positive speeds never encode closure or unknown and reject malformed values / 양수 속도는 폐쇄·미확인으로 변환하지 않고 잘못된 값 거부", () => {
  for (const speed of [Number.MIN_VALUE, 0.4, 0.5, 0.6, 1, 10, 70]) {
    const e = encodeTrafficSpeed(speed),
      bits = e.bytes.readBigUInt64LE();
    assert.ok(e.raw >= 1 && e.raw <= 126);
    assert.equal(Number(bits & 127n), e.raw);
    assert.equal(Number((bits >> 7n) & 127n), e.raw);
    assert.equal(Number((bits >> 28n) & 255n), 255);
    assert.equal(bits >> 36n, 0n);
    assert.ok(
      Math.abs(e.decoded_speed_mps - speed - e.quantization_error_mps) < 1e-12,
    );
  }
  assert.equal(encodeTrafficSpeed(0.5).raw, 1);
  assert.equal(encodeTrafficSpeed(70).raw, 126);
  for (const value of [0, -1, NaN, Infinity, 70.00001])
    assert.throws(() => encodeTrafficSpeed(value));
});
test("Compiler preserves non-live/index/header bytes and publishes reproducibly / 변환기는 비LIVE·목록·헤더 바이트를 보존하고 재현 가능한 세대 게시", async () => {
  const f = fixture();
  try {
    const g = await compileTrafficGeneration(f.bundle, f.input, f.root),
      bytes = readFileSync(g.traffic_path);
    assert.equal(g.live_edges.length, 1);
    assert.equal(g.traffic_snapshot_id, f.input.manifest.traffic_snapshot_id);
    assert.equal(g.live_edges[0]!.raw_speed, 1);
    for (let i = 0; i < bytes.length; i++)
      if (bytes[i] !== f.bytes[i]) assert.ok(i >= 1568 && i < 1576);
    assert.deepEqual(bytes.subarray(1576, 1600), Buffer.alloc(24));
    assert.deepEqual(
      await compileTrafficGeneration(f.bundle, f.input, f.root),
      g,
    );
    verifyTrafficGeneration(g);
    const blank = await compileTrafficGeneration(f.bundle, null, f.root);
    assert.equal(blank.traffic_snapshot_id, null);
    assert.deepEqual(readFileSync(blank.traffic_path), f.bytes);
  } finally {
    f.close();
  }
});
test("Compiler rejects altered publication and status/speed pairs before writing / 변환기는 바뀐 게시자료·상태속도쌍을 쓰기 전에 거부", async () => {
  const f = fixture();
  try {
    const changed = structuredClone(f.input);
    changed.snapshot.entries[0]!.speed_mps = 2;
    await assert.rejects(
      compileTrafficGeneration(f.bundle, changed, f.root),
      /PUBLICATION_BYTES_MISMATCH/,
    );
    const bad = structuredClone(f.input);
    bad.snapshot.entries.find((e) => e.status === "UNKNOWN")!.speed_mps = 1;
    bad.artifact = canonical(bad.snapshot);
    bad.manifest.traffic_snapshot_id = sha256(bad.artifact);
    bad.manifest.byte_length = bad.artifact.length;
    await assert.rejects(compileTrafficGeneration(f.bundle, bad, f.root));
    const wrong = structuredClone(f.input);
    wrong.manifest.byte_length++;
    await assert.rejects(compileTrafficGeneration(f.bundle, wrong, f.root));
  } finally {
    f.close();
  }
});
test("Concurrent identical writers reuse only fully matching immutable content / 동시 동일 작성자는 완전히 일치하는 불변 내용만 재사용", async () => {
  const f = fixture();
  try {
    let arrived = 0,
      release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const hooks = {
      phase: async (p: string) => {
        if (p === "AFTER_TRAFFIC_WRITE") {
          arrived++;
          if (arrived === 2) release();
          await gate;
        }
      },
    };
    const [a, b] = await Promise.all([
      compileTrafficGeneration(f.bundle, f.input, f.root, hooks),
      compileTrafficGeneration(f.bundle, f.input, f.root, hooks),
    ]);
    assert.deepEqual(a, b);
    const original = readFileSync(a.traffic_path);
    writeFileSync(a.traffic_path, original.subarray(0, 2048));
    await assert.rejects(
      compileTrafficGeneration(f.bundle, f.input, f.root),
      /GENERATION_CONFLICT/,
    );
    assert.equal(readFileSync(a.traffic_path).length, 2048);
    assert.throws(() => verifyTrafficGeneration(a), /GENERATION_CONFLICT/);
  } finally {
    f.close();
  }
});
test("Traffic request validates two global coordinates and pinned graph; coverage is checked from the bundle / 교통정보 요청의 지구 좌표 두 개·고정 지도 검사, 범위는 묶음 기준", () => {
  const request = {
    graph_id: graphId,
    locations: [
      { lon: 127.029, lat: 37.4984 },
      { lon: 127.049, lat: 37.5045 },
    ],
  } as const;
  validateTrafficRequest(request as never, graphId);
  for (const bad of [
    { ...request, graph_id: "b".repeat(64) },
    { ...request, exclude_locations: [] },
    { ...request, locations: [request.locations[0]] },
    { ...request, locations: [{ lon: NaN, lat: 37.5 }, request.locations[1]] },
    { ...request, locations: [{ lon: 181, lat: 0 }, request.locations[1]] },
  ])
    assert.throws(() => validateTrafficRequest(bad as never, graphId));
});
