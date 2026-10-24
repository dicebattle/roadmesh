/** Real worker scheduling with an authored byte fixture; full graph/native proof remains main-owned.
 * 직접 작성한 바이트 자료의 실제 스레드 조정 검사이며 전체 지도·엔진 근거는 메인 담당입니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonical, sha256 } from "../tools/shared.js";
import { validateTrafficArchive } from "../tools/traffic_bundle.js";
import { GatewayCompilerAdapter } from "../tools/gateway_compiler.js";
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
/** The fixture loader is deliberately a unit double. P08 compilation/verification and Buffer restoration run unchanged in an actual thread.
 * 자료 로더만 단위 대역이며 P08 변환·검사·Buffer 복원은 실제 스레드의 기존 코드로 실행합니다. */
const threadSource = `
const {parentPort:port,workerData:d}=require('node:worker_threads');
const helpers=Promise.all([import(d.restore_url),import(d.compiler_url)]);
const pending=[];
async function run(job){try{const [restore,compiler]=await helpers;let result;
if(job.operation==='load')result=d.bundle;
else if(job.operation==='verify'){compiler.verifyTrafficGeneration(job.generation);result=null;}
else {const input=restore.restoreCompilerInput(job.input);if(input&&!Buffer.isBuffer(input.artifact))throw Error('BUFFER_NOT_RESTORED');result=await compiler.compileTrafficGeneration(d.bundle,input,d.root);if(input?.kid==='test-spin'){const until=Date.now()+100;while(Date.now()<until){}}}
port.postMessage({id:job.id,ok:true,result});}catch(e){port.postMessage({id:job.id,ok:false,reason:e.reason||e.code||'FIXTURE_FAILED'});}}
port.on('message',job=>{if(job.control==='release'){for(const item of pending.splice(0))void run(item);return;}
if(job.operation==='prepare'&&job.input?.kid==='test-crash')throw Error('Owned fixture crash');
if(job.operation==='prepare'&&job.input?.kid==='test-exit'){process.exit(7);return;}
if(job.operation==='prepare'&&job.input?.kid==='test-hang')return;
if(job.operation==='prepare'&&job.input?.kid!=='test-spin')pending.push(job);else void run(job);});
`;
async function adapterFixture() {
  const f = fixture();
  let worker!: Worker;
  const adapter = await GatewayCompilerAdapter.start(
    {
      bundle_directory: f.directory,
      graph_directory: f.directory,
      generation_root: f.root,
    },
    join(f.directory, "compiler"),
    () =>
      (worker = new Worker(threadSource, {
        eval: true,
        workerData: {
          bundle: f.bundle,
          root: f.root,
          restore_url: new URL(
            "../tools/gateway_compile_worker.js",
            import.meta.url,
          ).href,
          compiler_url: new URL("../tools/traffic_compiler.js", import.meta.url)
            .href,
        },
      })),
  );
  await adapter.loadBundle();
  return {
    ...f,
    adapter,
    worker,
    release: () => worker.postMessage({ control: "release" }),
    async dispose() {
      const cleanup = await adapter.close();
      assert.equal(cleanup.termination_verified, true);
      assert.equal(worker.threadId, -1);
      f.close();
    },
  };
}
test("Exact in-flight preparation is shared; settled and corrupt bytes are revalidated / 정확한 진행 준비만 공유하고 완료·손상 바이트를 재검증", async () => {
  const f = await adapterFixture();
  try {
    const jobs = Array.from({ length: 8 }, () => f.adapter.prepare(f.input));
    assert.ok(jobs.every((p) => p === jobs[0]));
    f.release();
    const values = await Promise.all(jobs);
    assert.ok(
      values.every((g) => g.generation_id === values[0]!.generation_id),
    );
    const first = values[0]!,
      original = readFileSync(first.traffic_path);
    await f.adapter.verify(first);
    await f.adapter.verify(first);
    const later = f.adapter.prepare(f.input);
    assert.notEqual(later, jobs[0]);
    f.release();
    assert.equal((await later).generation_id, first.generation_id);
    writeFileSync(first.traffic_path, Buffer.from("corrupt"));
    const corrupted = f.adapter.prepare(f.input),
      rejected = assert.rejects(corrupted, /GENERATION_CONFLICT/);
    f.release();
    await rejected;
    await assert.rejects(f.adapter.verify(first), /GENERATION_CONFLICT/);
    writeFileSync(first.traffic_path, original);
    const records = JSON.parse(
      readFileSync(join(f.adapter.directory, "jobs.json"), "utf8"),
    );
    assert.equal(
      records.filter((r: any) => r.operation === "prepare").length,
      3,
    );
    assert.equal(
      records.filter((r: any) => r.operation === "verify").length,
      3,
    );
  } finally {
    await f.dispose();
  }
});
test("Changed full input cannot borrow another input's successful in-flight preparation / 변경된 전체 입력은 다른 입력의 진행 성공을 빌리지 못함", async () => {
  const f = await adapterFixture();
  try {
    const good = f.adapter.prepare(f.input),
      badInput = structuredClone(f.input);
    badInput.snapshot.entries[0]!.speed_mps = 1;
    const bad = f.adapter.prepare(badInput),
      rejected = assert.rejects(bad, /PUBLICATION_BYTES_MISMATCH/);
    assert.notEqual(good, bad);
    f.release();
    await good;
    await rejected;
    const altered = { ...f.input, jws: f.input.jws + "-changed" };
    const a = f.adapter.prepare(f.input),
      b = f.adapter.prepare(altered);
    assert.notEqual(a, b);
    f.release();
    await Promise.all([a, b]);
  } finally {
    await f.dispose();
  }
});
test("CPU work in the owned thread does not block the parent's timer / 소유 스레드 CPU 작업은 부모 타이머를 막지 않음", async () => {
  const f = await adapterFixture();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let tick = false;
    timer = setTimeout(() => {
      tick = true;
    }, 10);
    await f.adapter.prepare({ ...f.input, kid: "test-spin" });
    assert.equal(tick, true);
  } finally {
    clearTimeout(timer);
    await f.dispose();
  }
});
for (const mode of ["test-crash", "test-exit"])
  test(`Owned worker ${mode} rejects pending jobs and stays closed until restart / 소유 작업자 ${mode}는 대기를 거부하고 재시작 전까지 실패 유지`, async () => {
    const f = await adapterFixture();
    try {
      const work = f.adapter.prepare({ ...f.input, kid: mode }),
        other = f.adapter.loadBundle(),
        results = await Promise.allSettled([work, other]);
      assert.ok(results.every((r) => r.status === "rejected"));
      await assert.rejects(f.adapter.prepare(f.input), /COMPILER_WORKER_/);
      const clean = await f.adapter.close();
      assert.equal(clean.termination_verified, true);
      assert.match(clean.failure_reason!, /COMPILER_WORKER_/);
    } finally {
      await f.dispose();
    }
  });
test("Sixteen distinct pending jobs and a twelve-second deadline fail closed and terminate / 서로 다른 대기16개·12초 기한은 실패를 닫고 종료", async (t) => {
  const f = await adapterFixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const work = Array.from({ length: 16 }, (_, i) =>
        f.adapter.prepare({ ...f.input, kid: "test-hang", jws: String(i) }),
      ),
      results = Promise.allSettled(work);
    await assert.rejects(
      f.adapter.prepare({ ...f.input, kid: "test-hang", jws: "seventeenth" }),
      /COMPILER_CAPACITY/,
    );
    t.mock.timers.tick(12001);
    assert.ok((await results).every((r) => r.status === "rejected"));
    await assert.rejects(f.adapter.loadBundle(), /COMPILER_JOB_DEADLINE/);
    assert.equal((await f.adapter.close()).termination_verified, true);
  } finally {
    t.mock.timers.reset();
    await f.dispose();
  }
});
test("Worker construction failure records no live resource and production startup failure terminates its thread / 작업자 생성 실패와 실제 준비 실패의 종료 기록", async () => {
  const f = fixture();
  try {
    const directory = join(f.directory, "failed-constructor");
    await assert.rejects(
      GatewayCompilerAdapter.start(
        {
          bundle_directory: f.directory,
          graph_directory: f.directory,
          generation_root: f.root,
        },
        directory,
        () => {
          throw Error("constructor fixture");
        },
      ),
      /constructor fixture/,
    );
    const record = JSON.parse(
      readFileSync(join(directory, "cleanup.json"), "utf8"),
    );
    assert.equal(record.started, false);
    assert.equal(record.termination_verified, true);
    const actual = await GatewayCompilerAdapter.start(
      {
        bundle_directory: join(f.directory, "missing-bundle"),
        graph_directory: f.directory,
        generation_root: f.root,
      },
      join(f.directory, "production-worker"),
    );
    try {
      await assert.rejects(actual.loadBundle());
    } finally {
      const result = await actual.close();
      assert.equal(result.termination_verified, true);
      assert.ok(result.thread_id > 0);
    }
  } finally {
    f.close();
  }
});
