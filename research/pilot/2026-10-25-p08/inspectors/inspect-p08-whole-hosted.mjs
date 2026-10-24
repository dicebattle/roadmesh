import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const root = process.argv[2];
const runUrl = process.argv[3];
assert.ok(
  root && runUrl,
  "Usage / 사용법: node data/inspect-p08-whole-hosted.mjs ROOT RUN_URL",
);
assert.match(
  runUrl,
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+\/?$/,
);
const local = JSON.parse(
  fs.readFileSync("data/p08-main-20261025/manifest.json"),
);
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p)));
const sha = (p) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, p)))
    .digest("hex");
const m = read("manifest.json");
assert.equal(m.status, "PASS");
assert.equal(m.source.dirty, false);
assert.equal(m.cleanup_verified, true);
assert.equal(m.implementation_sha256, local.implementation_sha256);
const missingAllowed = new Map(),
  omitted = [];
const allowMissing = (file, hash, declaredBy, reason) => {
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.ok(!file.split("/").includes(".."));
  missingAllowed.set(file, {
    path: file,
    sha256: hash,
    declared_by: declaredBy,
    reason,
  });
};
const graphManifest = read("seoul/graph/manifest.json");
assert.equal(Object.keys(graphManifest.tile_sha256).length, 14);
allowMissing(
  "seoul/graph/seoul.osm.pbf",
  graphManifest.pbf_sha256,
  "seoul/graph/manifest.json",
  "Hosted artifact excludes pinned graph source bytes / 원격 압축에서 고정 지도 원본 바이트 제외",
);
for (const [tile, hash] of Object.entries(graphManifest.tile_sha256))
  allowMissing(
    "seoul/graph/tiles/" + tile,
    hash,
    "seoul/graph/manifest.json",
    "Hosted artifact excludes exact declared graph tiles / 원격 압축에서 정확히 선언한 지도 타일 제외",
  );
for (const directory of ["traffic/bundle", "traffic/negative/corrupt-bundle"]) {
  const manifest = read(directory + "/manifest.json");
  allowMissing(
    directory + "/graph.tar",
    manifest.graph_extract_sha256,
    directory + "/manifest.json",
    "Graph extract omitted; traffic bytes remain required / 지도 추출물 제외, 교통 바이트는 필수",
  );
}
// These exact tiny-city binaries are optional only if a selected inventory names them.
// 선택한 해시목록에 이 정확한 작은 지도 경로가 있을 때만 누락을 허용합니다.
const tinyGraphManifest = read("seoul/tiny/graph/manifest.json");
allowMissing(
  "seoul/tiny/graph/tiny-city.osm.pbf",
  tinyGraphManifest.pbf_sha256,
  "seoul/tiny/graph/manifest.json",
  "Exact tiny-city source binary, if inventoried / 목록에 포함된 경우의 정확한 작은 지도 원본",
);
for (const [tile, hash] of Object.entries(tinyGraphManifest.tile_sha256))
  allowMissing(
    "seoul/tiny/graph/tiles/" + tile,
    hash,
    "seoul/tiny/graph/manifest.json",
    "Exact tiny-city tile, if inventoried / 목록에 포함된 경우의 정확한 작은 지도 타일",
  );
const checked = new Set(),
  inventories = {};
for (const name of [
  "manifest.json",
  "seoul/manifest.json",
  "seoul/tiny/manifest.json",
  "seoul/graph/manifest.json",
  "seoul/workload/manifest.json",
  "ingestion/manifest.json",
  "aggregation/manifest.json",
  "publication/manifest.json",
  "traffic/manifest.json",
]) {
  const v = read(name);
  assert.equal(v.status, "PASS");
  assert.deepEqual(v.source, m.source);
  const entries = v.output_sha256 ?? v.files_sha256;
  assert.ok(entries && Object.keys(entries).length);
  inventories[name] = Object.keys(entries).length;
  for (const [p, h] of Object.entries(entries)) {
    assert.ok(
      !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."),
      "Unsafe inventory path / 안전하지 않은 해시목록 경로: " + p,
    );
    const full = path.join(path.dirname(name), p);
    if (!fs.existsSync(path.join(root, full))) {
      const allowed = missingAllowed.get(full);
      assert.ok(
        allowed,
        "Missing required original evidence / 필수 원문 누락: " + full,
      );
      assert.equal(
        h,
        allowed.sha256,
        "Omission hash differs from declaring manifest / 제외 해시와 선언 명세 불일치: " +
          full,
      );
      omitted.push({ ...allowed, inventory: name });
      continue;
    }
    assert.equal(sha(full), h, full);
    checked.add(full);
  }
}
const tiny = read("seoul/tiny/assertions.json"),
  regional = read("seoul/assertions.json"),
  ingest = read("ingestion/assertions.json");
assert.equal(tiny.length, 48);
assert.equal(regional.length, 35);
assert.equal(ingest.length, 34);
const aggregation = read("aggregation/assertions.json");
assert.equal(aggregation.length, 34);
const publication = read("publication/assertions.json");
assert.equal(publication.length, 55);
const traffic = read("traffic/assertions.json");
const trafficRequiredIds = [
  "authored-source",
  "http-matched-timing",
  "no-neighbor-contributions",
  "three-live-medians",
  "signed-http-acceptance",
  "blank-bundle",
  "exact-compiled-bytes",
  "identical-retry",
  "generation-concurrency",
  "generation-precommit-kill",
  "generation-postcommit-kill",
  "corrupt-bundle",
  "truncated-cache",
  "baseline-route",
  "live-detour",
  "restart-cache",
  "publisher-outage",
  "accepted-key-revoked",
  "database-outage",
  "database-restart",
  "engine-unavailable",
  "superseded-compile",
  "http-revoked-correction",
  "offline-ttl",
  "new-empty-window",
  "before-expiry",
  "exact-expiry",
  "route-result-expiry",
  "compile-selection-expiry",
  "clock-only-baseline",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p08-" + id);
assert.equal(trafficRequiredIds.length, 32);
assert.equal(traffic.length, 32);
assert.equal(new Set(traffic.map((a) => a.assertion_id)).size, 32);
assert.deepEqual(
  traffic.map((a) => a.assertion_id).sort(),
  [...trafficRequiredIds].sort(),
);
const combined = read("assertions.json");
assert.equal(combined.length, 238);
assert.equal(new Set(combined.map((a) => a.assertion_id)).size, 238);
assert.equal(read("report-data.json").summary.assertions_total, 238);
assert.equal(read("report-data.json").summary.assertions_passed, 238);
assert.deepEqual(
  combined
    .filter((a) => a.assertion_id.startsWith("p08-"))
    .map((a) => a.assertion_id)
    .sort(),
  [...trafficRequiredIds].sort(),
);
for (const a of [
  ...tiny,
  ...regional,
  ...ingest,
  ...aggregation,
  ...publication,
  ...traffic,
  ...combined,
])
  assert.equal(a.status, "PASS");
const source = read("seoul/graph/source-verification.json");
assert.equal(
  source.sha256,
  "282d012b7629c643695f286d4424d7f6d88548d99edb5577ca5b678906f13c17",
);
assert.equal(source.size_bytes, 289916859);
const db = read("ingestion/readbacks/baseline-succeeded.json"),
  ref = read("seoul/workload/matching/result.json"),
  spec = read("seoul/workload/spec.json"),
  truth = read("seoul/workload/truth.json"),
  edges = read("seoul/graph/edge-map.json");
assert.equal(db.trips.length, 9);
assert.ok(
  db.trips.every((t) => t.state === "SUCCEEDED" && t.raw_payload_count === 0),
);
assert.equal(db.counts.raw_payloads, 0);
assert.equal(
  db.traversals.length,
  ref.traversals.filter((t) => t.status === "ACCEPTED").length,
);
assert.equal(
  new Set(db.traversals.map((t) => t.observation_id)).size,
  db.traversals.length,
);
assert.equal(ref.policy_id, "seoul-observed-v3");
for (const name of ["split-only", "split-overlap"])
  assert.equal(
    sha("seoul/workload/matching/result.json"),
    sha("seoul/workload/" + name + "/result.json"),
  );
const vehicles = new Map(db.trips.map((t) => [t.trip_id, t.vehicle_id])),
  base = Date.parse(spec.start_time_utc),
  order = (a, b) =>
    a.vehicle_id.localeCompare(b.vehicle_id) ||
    a.entry - b.entry ||
    a.edge_id.localeCompare(b.edge_id);
const actual = db.traversals
  .map((t) => ({
    vehicle_id: vehicles.get(t.trip_id),
    edge_id: t.edge_id,
    forward: t.forward,
    entry: Date.parse(t.entered_at_utc),
    exit: Date.parse(t.exited_at_utc),
  }))
  .sort(order);
const expected = ref.traversals
  .filter((t) => t.status === "ACCEPTED")
  .map((t) => ({
    vehicle_id: t.vehicle_id,
    edge_id: t.edge_id,
    forward: t.forward,
    entry: base + t.entered_at_ms,
    exit: base + t.exited_at_ms,
  }))
  .sort(order);
assert.deepEqual(actual, expected);
function independentLength(points) {
  let length = 0;
  const r = Math.PI / 180;
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1],
      b = points[i],
      h =
        Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
        Math.cos(a[1] * r) *
          Math.cos(b[1] * r) *
          Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    length += 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return length;
}
let maxDistance = 0,
  maxError = 0;
for (const t of db.traversals) {
  const edge = edges.find(
    (e) => e.edge_id === t.edge_id && e.forward === t.forward,
  );
  assert.ok(edge);
  const delta = Math.abs(
    independentLength(edge.directed_geometry) - t.distance_m,
  );
  maxDistance = Math.max(maxDistance, delta);
  assert.ok(delta < 1e-6);
  assert.equal(
    (Date.parse(t.exited_at_utc) - Date.parse(t.entered_at_utc)) / 1000,
    t.duration_s,
  );
  const vehicle = vehicles.get(t.trip_id),
    entry = Date.parse(t.entered_at_utc) - base,
    exit = Date.parse(t.exited_at_utc) - base;
  const candidates = truth.traversals.filter(
    (x) =>
      x.vehicle_id === vehicle &&
      x.edge_id === t.edge_id &&
      x.forward === t.forward &&
      Math.abs(x.entered_at_ms - entry) <= 1000 &&
      Math.abs(x.exited_at_ms - exit) <= 1000,
  );
  assert.equal(candidates.length, 1);
  const error = Math.max(
    Math.abs(candidates[0].entered_at_ms - entry),
    Math.abs(candidates[0].exited_at_ms - exit),
  );
  assert.ok(error <= (vehicle.endsWith("-clean") ? 100 : 1000));
  maxError = Math.max(maxError, error);
}
const attempts = read("ingestion/attempt-links.json"),
  parity = [];
for (const a of attempts.filter((a) => a.interrupted_attempts.length)) {
  assert.notEqual(a.interrupted_pid, a.recovered_pid);
  const p = "ingestion/" + a.interrupted_attempts[0] + "/result.json",
    q = "ingestion/" + a.recovered_attempts[0] + "/result.json";
  assert.equal(sha(p), sha(q));
  parity.push({
    phase: a.phase,
    interrupted_pid: a.interrupted_pid,
    recovered_pid: a.recovered_pid,
    sha256: sha(p),
    byte_identical: true,
  });
}
const before = read("ingestion/readbacks/api-before-response.json"),
  after = read("ingestion/readbacks/api-durable-restart.json");
assert.equal(before.trips[0].sample_count, 2);
assert.deepEqual(before.trips, after.trips);
const restart = read("ingestion/runtime/database-restart.json");
assert.equal(restart.same_container_id, true);
assert.equal(restart.host_tcp_ready, true);
const failed = read("ingestion/readbacks/engine-terminal.json");
assert.equal(failed.trips[0].state, "FAILED");
assert.equal(failed.trips[0].attempt, 3);
assert.equal(failed.trips[0].raw_payload_count, 0);
assert.equal(failed.traversals.length, 0);
const beforeSweep = read(
  "ingestion/readbacks/pending-expiry-before-sweep.json",
);
assert.equal(beforeSweep.trips[0].state, "LEASED");
assert.equal(beforeSweep.trips[0].raw_payload_count, 4);
assert.equal(beforeSweep.traversals.length, 0);
assert.equal(
  ingest.find((a) => a.assertion_id === "p05-event-clock-without-sweep").actual,
  "LEASE_LOST",
);
for (const [p, state] of [
  ["pending-expiry", "EXPIRED"],
  ["pending-revoke", "REVOKED"],
  ["revoked-before-final", "REVOKED"],
  ["raw-expired", "EXPIRED"],
]) {
  const d = read("ingestion/readbacks/" + p + ".json");
  assert.ok(
    d.trips.every((t) => t.state === state && t.raw_payload_count === 0),
  );
  assert.equal(d.traversals.length, 0);
}
const retained = read("ingestion/readbacks/retention-24h.json");
for (const key of [
  "trips",
  "batches",
  "samples",
  "traversals",
  "events",
  "raw_payloads",
])
  assert.equal(retained.counts[key], 0);
const stopped = read("ingestion/engine-abort-stopped-process.json"),
  orphan = read("ingestion/engine-abort-before-cleanup.json"),
  removed = read("ingestion/engine-abort-after-cleanup.json");
assert.equal(stopped.state, "T");
assert.ok(["locate", "trace_attributes"].includes(stopped.action));
assert.equal(orphan.worker_exit.signal, "SIGKILL");
assert.equal(orphan.engine_paused, true);
assert.equal(removed.engine_id, orphan.engine_id);
assert.equal(removed.absent, true);
for (const p of [
  "ingestion/runtime/cleanup.json",
  "traffic/runtime/cleanup.json",
  "lifecycle/cleanup.json",
]) {
  const c = read(p);
  assert.equal(c.cleanup_verified, true);
  assert.equal(c.processes_exited, true);
  assert.equal(c.private_files_removed, true);
}
const owner = read("ingestion/runtime/ownership.json");
assert.ok(
  owner.processes.every((p) => p.spawn_recorded_before_start && p.exited),
);
const trafficOwner = read("traffic/runtime/ownership.json");
assert.equal(trafficOwner.planned_before_creation, true);
assert.ok(
  trafficOwner.processes.every(
    (p) => p.spawn_recorded_before_start && p.exited,
  ),
);
const trafficContainers = new Set([trafficOwner.container]),
  trafficVolumes = new Set([trafficOwner.volume]),
  trafficCleanupFiles = [];
function trafficWalk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), {
    withFileTypes: true,
  })) {
    assert.ok(!entry.isSymbolicLink(), "No symlink traversal: " + entry.name);
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) trafficWalk(relative);
    else if (entry.isFile()) {
      if (entry.name === "cleanup.json") {
        assert.equal(read(relative).cleanup_verified, true, relative);
        trafficCleanupFiles.push(relative);
      }
      if (entry.name === "ownership.json") {
        const o = read(relative);
        if (o.run_id && o.container?.startsWith("routelens-p02-")) {
          assert.match(o.run_id, /^[a-f0-9-]{36}$/);
          assert.equal(o.container, "routelens-p02-" + o.run_id);
          assert.equal(o.planned_before_creation, true);
          trafficContainers.add(o.container);
        }
      }
      if (entry.name === "commands.json") {
        for (const c of read(relative)) {
          if (c.args?.[0] !== "create") continue;
          const nameIndex = c.args.indexOf("--name"),
            label = c.args.find(
              (a) =>
                typeof a === "string" && a.startsWith("io.routelens.run_id="),
            );
          if (nameIndex < 0 || !label) continue;
          const name = c.args[nameIndex + 1],
            runId = label.slice("io.routelens.run_id=".length);
          assert.match(runId, /^[a-f0-9-]{36}$/);
          assert.equal(name, "routelens-p02-" + runId);
          trafficContainers.add(name);
        }
      }
    }
  }
}
trafficWalk("traffic");
assert.ok(trafficCleanupFiles.includes("traffic/bundle/cleanup.json"));
assert.ok(trafficCleanupFiles.includes("traffic/runtime/cleanup.json"));
// Hosted process/resource records are evidence; no local ps/docker query can prove remote absence.
// 원격 프로세스·자원 기록만 검사하며 로컬 ps/docker 조회로 원격 부재를 주장하지 않습니다.
const stagingEntries = Object.keys(
  read("traffic/manifest.json").output_sha256,
).filter((p) => p.split("/").some((part) => part.startsWith(".staging-")));
assert.ok(
  stagingEntries.some((p) => p.endsWith("/manifest.json")),
  "Precommit staging manifest is required / 커밋 전 임시 명세 필수",
);
assert.ok(
  stagingEntries.some((p) => p.endsWith("/traffic.tar")),
  "Precommit staging traffic bytes are required / 커밋 전 임시 교통 바이트 필수",
);
for (const file of stagingEntries)
  assert.ok(
    checked.has(path.join("traffic", file)),
    "Staging bytes cannot be omitted / 임시 바이트 제외 불가: " + file,
  );
const recordedOwnedPids = [
  ...new Set(
    [
      ...owner.processes.map((p) => p.pid),
      ...trafficOwner.processes.map((p) => p.pid),
      read("seoul-process.json").pid,
    ].filter(Number.isInteger),
  ),
];
const proof = {
  run_url: runUrl,
  recorded_owned_pid_count: recordedOwnedPids.length,
  recorded_cleanup_only: true,
  local_live_process_queries_executed: false,
  omitted_inventory_paths: omitted,
  selected_inventory_scope_en:
    "Byte hashes cover the listed whole-system inventories and every present entry. Tiny-city graph originals outside those inventories are not claimed byte-verified. Only exact declared graph binary paths may be absent; all traffic and hidden staging bytes are required.",
  selected_inventory_scope_ko:
    "선택한 전체 실행 해시목록과 존재하는 모든 항목의 바이트 해시를 검사합니다. 목록 밖 작은 지도 원본의 바이트 검증은 주장하지 않습니다. 정확히 선언한 지도 이진 경로만 누락을 허용하며 모든 교통·숨김 임시 바이트는 필수입니다.",
  status: "PASS",
  source: m.source,
  graph_id: m.graph_id,
  implementation_sha256: m.implementation_sha256,
  assertions: {
    tiny: 48,
    seoul: 35,
    ingestion: 34,
    aggregation: 34,
    publication: 55,
    traffic: 32,
    total: 238,
  },
  unique_file_hashes_checked: checked.size,
  inventories,
  source_sha256: source.sha256,
  matching_policy: ref.policy_id,
  stored_reference_traversals: db.traversals.length,
  unique_stored_ids: new Set(db.traversals.map((t) => t.observation_id)).size,
  successful_trips: 9,
  raw_after_success: 0,
  independent_geometry_max_difference_m: maxDistance,
  independent_boundary_error_max_ms: maxError,
  recovery_attempt_byte_parity: parity,
  database_restart: restart,
  api_durable_samples: 2,
  engine_failure_attempts: 3,
  clock_only_expiry_refused_before_sweep: true,
  retention_readback: retained.counts,
  stopped_engine: stopped,
  killed_worker_pid: orphan.worker_pid,
  orphan_engine_id: orphan.engine_id,
  recorded_db_volume_engine_cleanup_verified: true,
  traffic_recorded_owned_containers: [...trafficContainers].sort(),
  traffic_recorded_owned_volumes: [...trafficVolumes].sort(),
  traffic_cleanup_files_verified: trafficCleanupFiles.sort(),
  message_en:
    "Main independently checked artifact bytes, all stored traversal contents and geometry/timing, retry result bytes, durable restart/expiry/revocation read-backs and recorded hosted cleanup (without live remote process queries). This proves the bounded synthetic local pilot, not production authentication or real-driving accuracy.",
  message_ko:
    "메인이 원문 해시·저장 통과 전체의 지형/시간·재시도 결과 바이트·재시작/만료/철회 재조회·원격 정리 기록(실시간 원격 프로세스 조회 아님)를 독립 검사했습니다. 제한된 합성 로컬 파일럿 증거이며 운영 인증·실주행 정확도는 별도입니다.",
};
fs.writeFileSync(
  path.join(root, "main-verification.json"),
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(JSON.stringify(proof, null, 2));
