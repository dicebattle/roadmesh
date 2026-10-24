import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const args = process.argv.slice(2);
assert.ok(
  args.length === 5 &&
    args[1] === "--expected-source" &&
    args[3] === "--output",
  "Usage / 사용법: node data/inspect-p09-whole-hosted.mjs ROOT --expected-source EXPECTED_SHA --output NEW_FILE_OUTSIDE_ROOT",
);
const root = fs.realpathSync(args[0]),
  output = path.resolve(args[4]);
const expectedSource = args[2];
assert.match(
  expectedSource,
  /^[a-f0-9]{40}$/,
  "Expected source must be a 40-character lowercase hexadecimal commit SHA / 기대 소스는 소문자 40자리 커밋 SHA여야 합니다",
);
assert.ok(
  output !== root && !output.startsWith(root + path.sep),
  "Output must be outside evidence root / 출력은 증거 폴더 밖이어야 합니다",
);
assert.ok(
  !fs.existsSync(output),
  "Output must be new / 새 출력 파일이어야 합니다",
);
const resolvedOutputParent = fs.realpathSync(path.dirname(output));
assert.ok(
  resolvedOutputParent !== root &&
    !resolvedOutputParent.startsWith(root + path.sep),
);
const inputPath = (p) => {
  assert.ok(
    typeof p === "string" &&
      !path.isAbsolute(p) &&
      !p.split(/[\\/]/).includes(".."),
  );
  const full = fs.realpathSync(path.resolve(root, p));
  assert.ok(full === root || full.startsWith(root + path.sep));
  return full;
};
const read = (p) => JSON.parse(fs.readFileSync(inputPath(p)));
const sha = (p) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(inputPath(p)))
    .digest("hex");
const m = read("manifest.json");
assert.equal(m.status, "PASS");
assert.equal(m.source.dirty, false);
assert.equal(m.cleanup_verified, true);

// Only exact manifest-declared map binaries may be absent. Present bytes always require SHA-256 parity.
// 정확히 선언된 지도 바이너리만 누락 가능하며 존재하는 바이트는 항상 해시를 검사합니다.
const allowedMissing = new Map(),
  omitted = new Map();
const allow = (key, sha256, declared_by) => {
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.ok(!path.isAbsolute(key) && !key.split(/[\\/]/).includes(".."));
  allowedMissing.set(key, { path: key, sha256, declared_by });
};
const verifyBytes = (base, relative, expected, key) => {
  assert.ok(
    !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."),
  );
  const full = path.resolve(base, relative);
  assert.ok(full.startsWith(base + path.sep));
  if (!fs.existsSync(full)) {
    const entry = allowedMissing.get(key);
    assert.ok(entry, "Required artifact absent / 필수 원문 누락: " + key);
    assert.equal(entry.sha256, expected, key);
    omitted.set(key, entry);
    return false;
  }
  const resolved = fs.realpathSync(full);
  assert.ok(resolved.startsWith(base + path.sep));
  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(resolved)).digest("hex"),
    expected,
    key,
  );
  return true;
};

const local = JSON.parse(
  fs.readFileSync("data/p09-responsive-main-20261025/manifest.json"),
);
assert.equal(m.implementation_sha256, local.implementation_sha256);
assert.equal(m.source.commit, expectedSource);
const graphManifest = read("seoul/graph/manifest.json");
assert.equal(Object.keys(graphManifest.tile_sha256).length, 14);
allow(
  "seoul/graph/seoul.osm.pbf",
  graphManifest.pbf_sha256,
  "seoul/graph/manifest.json",
);
for (const [tile, hash] of Object.entries(graphManifest.tile_sha256))
  allow("seoul/graph/tiles/" + tile, hash, "seoul/graph/manifest.json");
for (const directory of [
  "traffic/bundle",
  "traffic/negative/corrupt-bundle",
  "nodes/bundle",
]) {
  allow(
    directory + "/graph.tar",
    read(directory + "/manifest.json").graph_extract_sha256,
    directory + "/manifest.json",
  );
}
assert.equal(allowedMissing.size, 18);
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
  "nodes/manifest.json",
]) {
  const v = read(name);
  assert.equal(v.status, "PASS");
  assert.deepEqual(v.source, m.source);
  const entries = v.output_sha256 ?? v.files_sha256;
  assert.ok(entries && Object.keys(entries).length);
  inventories[name] = Object.keys(entries).length;
  for (const [p, h] of Object.entries(entries)) {
    const full = path.join(path.dirname(name), p);
    if (verifyBytes(root, full, h, full)) checked.add(full);
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
const nodeRequiredIds = [
  "fresh-source",
  "independent-nodes",
  "baseline-same-daemon",
  "native-readiness",
  "unauthorized",
  "invalid-input",
  "body-limit",
  "generation-mismatch",
  "capacity-eight",
  "signed-http-pull",
  "two-node-live-detour",
  "held-old-lease",
  "activation-new-request",
  "obsolete-result-rejected",
  "last-lease-cleanup",
  "expired-candidate",
  "before-expiry",
  "automatic-baseline-expiry",
  "offline-node-expiry",
  "publisher-outage",
  "store-outage",
  "corrupt-generation",
  "engine-kill",
  "node-kill",
  "parent-reaping",
  "durable-restart",
  "two-slot-coalescing",
  "non-live-correction",
  "accepted-key-revoked",
  "deadline-drain-bound",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p09-" + id);
const nodes = read("nodes/assertions.json");
assert.equal(nodes.length, 32);
assert.equal(new Set(nodes.map((a) => a.assertion_id)).size, 32);
assert.deepEqual(
  nodes.map((a) => a.assertion_id).sort(),
  [...nodeRequiredIds].sort(),
);
for (const a of nodes) assert.equal(a.status, "PASS");
const combined = read("assertions.json");
assert.equal(combined.length, 270);
assert.equal(new Set(combined.map((a) => a.assertion_id)).size, 270);
assert.equal(read("report-data.json").summary.assertions_total, 270);
assert.equal(read("report-data.json").summary.assertions_passed, 270);
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
assert.deepEqual(
  combined
    .filter((a) => a.assertion_id.startsWith("p09-"))
    .map((a) => a.assertion_id)
    .sort(),
  [...nodeRequiredIds].sort(),
);
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
  "nodes/runtime/cleanup.json",
  "lifecycle/cleanup.json",
]) {
  const c = read(p);
  assert.equal(c.cleanup_verified, true);
  assert.equal(c.processes_exited, true);
  assert.equal(c.private_files_removed, true);
}
const owner = read("ingestion/runtime/ownership.json");
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
const nodeOwner = read("nodes/runtime/ownership.json"),
  nodeContainers = new Set([nodeOwner.container]),
  nodeVolumes = new Set([nodeOwner.volume]),
  nodeCleanupFiles = [];
assert.ok(
  nodeOwner.processes.every((p) => p.spawn_recorded_before_start && p.exited),
);
function scanNodes(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), {
    withFileTypes: true,
  })) {
    assert.ok(!entry.isSymbolicLink());
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scanNodes(file);
    else if (entry.name === "cleanup.json") {
      assert.equal(read(file).cleanup_verified, true, file);
      nodeCleanupFiles.push(file);
    } else if (entry.name === "ownership.json") {
      const o = read(file);
      if (o.schema_version === "p09-engine-0.1") {
        assert.equal(o.container_name, "routelens-p02-" + o.owner_id);
        assert.equal(o.owner_label, "io.routelens.run_id=" + o.owner_id);
        nodeContainers.add(o.container_name);
      }
    } else if (entry.name === "commands.json") {
      for (const c of read(file)) {
        if (c.args?.[0] !== "create") continue;
        const label = c.args.find(
            (v) =>
              typeof v === "string" && v.startsWith("io.routelens.run_id="),
          ),
          index = c.args.indexOf("--name");
        if (!label || index < 0) continue;
        const id = label.slice("io.routelens.run_id=".length);
        assert.match(id, /^[a-f0-9-]{36}$/);
        assert.equal(c.args[index + 1], "routelens-p02-" + id);
        nodeContainers.add(c.args[index + 1]);
      }
    }
  }
}
scanNodes("nodes");
assert.ok(nodeCleanupFiles.includes("nodes/runtime/cleanup.json"));
assert.ok(nodeCleanupFiles.includes("nodes/bundle/cleanup.json"));
const ownedPids = [
  ...new Set(
    [
      ...owner.processes.map((p) => p.pid),
      ...trafficOwner.processes.map((p) => p.pid),
      ...nodeOwner.processes.map((p) => p.pid),
      read("seoul-process.json").pid,
    ].filter(Number.isInteger),
  ),
];
const proof = {
  expected_source: expectedSource,
  scope:
    "Hosted selected artifact inventory; uninventoried tiny-city original binaries are not byte-verified. / 원격 선별 원문 목록 검사이며 목록 밖 작은 지도 원본 바이트 검증을 주장하지 않습니다.",
  omitted_map_bytes: [...omitted.values()],
  allowed_map_omissions: [...allowedMissing.values()],
  live_resource_queries_performed: false,
  cleanup_limitations:
    "Recorded cleanup only; no remote-host PID, container, volume or port absence can be established from this host. / 기록된 정리만 검사하며 이 호스트에서 원격 자원 부재를 확인할 수 없습니다.",
  recorded_owned_pids: ownedPids.length,
  status: "PASS",
  recorded_node_owned_containers: [...nodeContainers].sort(),
  recorded_node_owned_volumes: [...nodeVolumes].sort(),
  node_cleanup_files_verified: nodeCleanupFiles.sort(),
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
    nodes: 32,
    total: 270,
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
  current_db_volume_engine_absence_verified: false,
  recorded_traffic_owned_containers: [...trafficContainers].sort(),
  recorded_traffic_owned_volumes: [...trafficVolumes].sort(),
  traffic_cleanup_files_verified: trafficCleanupFiles.sort(),
  message_en:
    "Independent hosted selected-artifact hashes and P01–P09 raw evidence; recorded cleanup only. Excluded map binaries are individually enumerated, never prefix-skipped.",
  message_ko:
    "원격 선별 원문 해시와 P01–P09 근거·기록된 정리를 독립 검사합니다. 제외 지도 바이너리는 개별 열거하며 접두사로 일괄 생략하지 않습니다.",
};
fs.writeFileSync(output, JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(proof, null, 2));
