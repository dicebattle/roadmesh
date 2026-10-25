import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const args = process.argv.slice(2);
assert.ok(
  args.length === 5 &&
    args[1] === "--output" &&
    args[3] === "--expected-source",
  "Usage / 사용법: node data/inspect-p10-whole-hosted.mjs ROOT --output NEW_FILE_OUTSIDE_ROOT --expected-source EXPECTED_SHA",
);
const root = fs.realpathSync(args[0]),
  output = path.resolve(args[2]);
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
const expectedSource = args[4];
assert.match(expectedSource, /^[a-f0-9]{40}$/);
const m = read("manifest.json");
assert.equal(m.source.commit, expectedSource);
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

const expectedRuntime =
  "70af32dc05269aee3a739e234e8db66718bfd1ee86c70b4d84c776be2c5a1db4";
const local = JSON.parse(
  fs.readFileSync("research/pilot/2026-10-25-nav02-clock/manifest.json"),
);
assert.equal(local.implementation_sha256, expectedRuntime);
assert.equal(m.implementation_sha256, expectedRuntime);
const hostedGraph = read("seoul/graph/manifest.json");
assert.equal(Object.keys(hostedGraph.tile_sha256).length, 14);
allow(
  "seoul/graph/seoul.osm.pbf",
  hostedGraph.pbf_sha256,
  "seoul/graph/manifest.json",
);
for (const [tile, hash] of Object.entries(hostedGraph.tile_sha256))
  allow("seoul/graph/tiles/" + tile, hash, "seoul/graph/manifest.json");
for (const dir of [
  "traffic/bundle",
  "traffic/negative/corrupt-bundle",
  "nodes/bundle",
  "gateway/bundle",
  "client/fixture/bundle",
 "scenarios/bundle",
 "scenarios/supervisors/abort/client/bundle",
 "scenarios/supervisors/failure/client/bundle",
])
  allow(
    dir + "/graph.tar",
    read(dir + "/manifest.json").graph_extract_sha256,
    dir + "/manifest.json",
  );
for(const dir of ['seoul/tiny/graph','seoul/tiny/matching/tampered-graph','seoul/tiny/replay/tampered-graph']){const v=read(dir+'/manifest.json');assert.deepEqual(v.source,m.source);assert.equal(v.graph_id,read('seoul/tiny/manifest.json').graph_id);assert.equal(v.status,'PASS');allow(dir+'/tiny-city.osm.pbf',v.pbf_sha256,dir+'/manifest.json');for(const[tile,h]of Object.entries(v.tile_sha256))allow(dir+'/tiles/'+tile,h,dir+'/manifest.json');}
assert.equal(allowedMissing.size,32);
const checked = new Set(),
  inventories = {};
for (const name of [
  "manifest.json",
  "seoul/manifest.json",
  "seoul/tiny/manifest.json",
 "seoul/tiny/matching/manifest.json",
  "seoul/graph/manifest.json",
  "seoul/workload/manifest.json",
  "ingestion/manifest.json",
  "aggregation/manifest.json",
  "publication/manifest.json",
  "traffic/manifest.json",
  "nodes/manifest.json",
  "gateway/manifest.json",
  "client/manifest.json",
 "scenarios/manifest.json",
 "cloudflare/manifest.json",
]) {
  const v = read(name);
  assert.equal(v.status, "PASS");
  assert.deepEqual(v.source, m.source);
  if (!name.startsWith("seoul/tiny/"))
    assert.equal(v.graph_id, m.graph_id, name);
  if (v.implementation_sha256 !== undefined)
    assert.equal(v.implementation_sha256, m.implementation_sha256, name);
  const entries = v.output_sha256 ?? v.files_sha256;
  assert.ok(entries && Object.keys(entries).length, name);
  inventories[name] = Object.keys(entries).length;
  for (const [p, h] of Object.entries(entries)) {
    const full = path.join(path.dirname(name), p);
    if (verifyBytes(root, full, h, full)) checked.add(full);
  }
}
const runtimeManifest=read('scenarios/runtime-manifest.json');assert.equal(runtimeManifest.status,'PASS');assert.equal(runtimeManifest.cleanup_verified,true);assert.deepEqual(runtimeManifest.source,m.source);assert.equal(runtimeManifest.implementation_sha256,m.implementation_sha256);assert.equal(runtimeManifest.graph_id,m.graph_id);assert.ok(checked.has('scenarios/runtime-manifest.json'));
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
// P10 whole linkage only; detailed native/crypto/deadline auditing is a separate inspector.
// P10 전체 연결을 검사하며 상세 지속엔진·암호·기한 감사는 별도 검사기에서 수행합니다.
const gatewayRequiredIds = [
  "fresh-source",
  "authenticated-api",
  "invalid-input",
  "body-limit",
  "unsupported-policy",
  "configured-origins",
  "independent-consumer",
  "baseline",
  "live-primary",
  "route-local-coverage",
  "primary-kill-failover",
  "primary-unavailable-retry",
  "wrong-generation-rejected",
  "wrong-request-rejected",
  "malformed-route-rejected",
  "oversized-response-rejected",
  "redirect-rejected",
  "stale-node-excluded",
  "no-matching-node",
  "both-down",
  "retry-once",
  "shared-deadline",
  "propagated-node-deadline",
  "client-disconnect",
  "admission-eight",
  "result-version-change",
  "exact-expiry",
  "non-live-correction",
  "publisher-outage",
  "store-outage",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p10-" + id);
const gatewayAssertions = read("gateway/assertions.json");
assert.equal(gatewayRequiredIds.length, 32);
assert.equal(gatewayAssertions.length, 32);
assert.equal(new Set(gatewayAssertions.map((a) => a.assertion_id)).size, 32);
assert.deepEqual(
  gatewayAssertions.map((a) => a.assertion_id).sort(),
  [...gatewayRequiredIds].sort(),
);
const gatewayManifest = read("gateway/manifest.json"),
  graphManifest = read("seoul/graph/manifest.json"),
  gatewayReport = read("gateway/report-gateway.json"),
  wholeReport = read("report-data.json");
assert.equal(
  gatewayManifest.graph_manifest_sha256,
  sha("seoul/graph/manifest.json"),
);
assert.equal(gatewayManifest.graph_id, graphManifest.graph_id);
assert.equal(gatewayReport.assertions_total, 32);
assert.equal(gatewayReport.assertions_passed, 32);
assert.equal(gatewayReport.cleanup_verified, true);
assert.deepEqual(
  gatewayReport.cases.map((c) => c.case_id).sort(),
  [...gatewayRequiredIds].sort(),
);
assert.ok(gatewayReport.cases.every((c) => c.status === "PASS"));
assert.deepEqual(wholeReport.source, m.source);
assert.equal(wholeReport.graph_id, m.graph_id);
assert.equal(wholeReport.implementation_sha256, m.implementation_sha256);
assert.equal(wholeReport.gateway.assertions_total, 32);
assert.equal(wholeReport.gateway.assertions_passed, 32);
assert.equal(wholeReport.gateway.cleanup_verified, true);
assert.deepEqual(
  wholeReport.gateway.cases.map((c) => c.case_id).sort(),
  [...gatewayRequiredIds].sort(),
);
for (const a of gatewayAssertions) {
  assert.equal(a.status, "PASS");
  assert.ok(checked.has("gateway/" + a.evidence_path), a.evidence_path);
}
for (const r of gatewayReport.routes) {
  assert.equal(r.response.graph_id, m.graph_id);
  assert.ok(checked.has("gateway/" + r.evidence_path));
}
const publicKeys = [
  "request_id",
  "request_sha256",
  "graph_id",
  "snapshot_id",
  "sequence",
  "generation_id",
  "traffic_sha256",
  "engine_version",
  "image_id",
  "costing_config_id",
  "node_id",
  "calculated_at",
  "traffic_mode",
  "distance_m",
  "duration_s",
  "geometry",
  "live_coverage_ratio",
  "warnings",
  "high_water", "checked_at_event_time", "traffic_published_at", "traffic_valid_until", "source_class", "clock_basis",
].sort();
let publicResponses = 0;
for (const entry of fs.readdirSync(inputPath("gateway/requests"), {
  withFileTypes: true,
})) {
  assert.ok(entry.isFile() && !entry.isSymbolicLink());
  const file = "gateway/requests/" + entry.name;
  assert.ok(checked.has(file));
  const r = read(file);
  if (r.status !== 200) continue;
  assert.deepEqual(Object.keys(r.body).sort(), publicKeys, file);
  assert.equal(r.body.graph_id, m.graph_id);
  assert.ok(["LIVE_MIXED", "BASE_ONLY"].includes(r.body.traffic_mode));
  assert.ok(
    Number.isFinite(r.body.live_coverage_ratio) &&
      r.body.live_coverage_ratio >= 0 &&
      r.body.live_coverage_ratio <= 1,
  );
  for (const warning of r.body.warnings)
    assert.deepEqual(Object.keys(warning).sort(), [
      "code",
      "message_en",
      "message_ko",
    ]);
  publicResponses++;
}
assert.ok(
  publicResponses >= gatewayReport.routes.length && publicResponses > 0,
);
assert.ok(gatewayReport.routes.some((r) => r.label === "baseline"));
assert.ok(gatewayReport.routes.some((r) => r.label === "live-primary"));
assert.ok(gatewayReport.routes.some((r) => r.label === "exact-expiry"));
const clientRequiredIds='fresh-source bundled-offline loopback-session unauthenticated-api origin-rejected path-traversal bootstrap-privacy authority-clock map-ready baseline-request live-request route-coverage primary-kill-failover unavailable-clears-route deadline-clears-route changed-version-rejected authority-change-invalidates exact-expiry input-change-cancels late-response-ignored older-authority-ignored invalid-input keyboard-submit english korean mobile390 no-external-requests no-geolocation reload-state public-privacy browser-cleanup owned-cleanup'.split(' ').map(x=>'p11-'+x);
const clientAssertions=read('client/assertions.json');
assert.deepEqual(clientAssertions.map(a=>a.assertion_id).sort(),clientRequiredIds.sort());
for(const a of clientAssertions){assert.equal(a.status,'PASS');assert.ok(checked.has('client/'+a.evidence_path));}
assert.equal(wholeReport.client.assertions_total,32);assert.equal(wholeReport.client.assertions_passed,32);assert.equal(wholeReport.client.cleanup_verified,true);
assert.equal(read('client/browser/cleanup.json').cleanup_verified,true);
assert.equal(read('client/fixture/cleanup.json').cleanup_verified,true);

const combined = read("assertions.json");
for(const [directory,prefix,count,names]of [
 ['guidance','nav01-',16,'native-baseline-en native-baseline-ko native-traffic-en native-traffic-ko exact-native-binding legacy-wire unknown-locale missing-guidance wrong-locale invalid-index broken-continuity inconsistent-metrics unsafe-text language-reset input-clears mobile-readable'],
 ['progress','nav02-',32,'route-binding geometry-distance exact-start next-turn turn-advance remaining-distance bounded-noise stationary-jitter backward impossible-jump bad-accuracy malformed-fix stale-sample future-sample out-of-order duplicate parallel-road-ambiguous route-self-ambiguity offroute-pending offroute-confirmed one-outlier-not-offroute bad-fix-breaks-streak rejoin-hysteresis rejoin-confirmed arrival-hysteresis arrival-confirmed destination-shortcut-blocked replay-deterministic replay-ui-step replay-ui-play-pause replay-ui-invalidation replay-ui-mobile']
]){const required=names.split(' ').map(x=>prefix+x),actual=read('client/'+directory+'/assertions.json');assert.equal(actual.length,count);assert.deepEqual(actual.map(a=>a.assertion_id).sort(),required.sort());assert.ok(actual.every(a=>a.status==='PASS'));for(const a of actual)assert.ok(checked.has('client/'+a.evidence_path));assert.deepEqual(combined.filter(a=>a.assertion_id.startsWith(prefix)).map(a=>a.assertion_id).sort(),required.sort());}

assert.deepEqual(combined.filter(a=>a.assertion_id.startsWith("p11-")).map(a=>a.assertion_id).sort(),clientRequiredIds.sort());
assert.equal(combined.length, 438);
assert.equal(new Set(combined.map((a) => a.assertion_id)).size, 438);
assert.equal(read("report-data.json").summary.assertions_total, 438);
assert.equal(read("report-data.json").summary.assertions_passed, 438);
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
  ...gatewayAssertions,
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
assert.deepEqual(
  combined
    .filter((a) => a.assertion_id.startsWith("p10-"))
    .map((a) => a.assertion_id)
    .sort(),
  [...gatewayRequiredIds].sort(),
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
const gatewayOwner = read("gateway/runtime/ownership.json"),
  gatewayContainers = new Set([gatewayOwner.container]),
  gatewayVolumes = new Set([gatewayOwner.volume]),
  gatewayCleanupFiles = [];
assert.equal(gatewayOwner.planned_before_creation, true);
assert.ok(
  gatewayOwner.processes.every(
    (p) => p.spawn_recorded_before_start && p.exited,
  ),
);
const gatewayInventory = gatewayManifest.output_sha256;
function scanGateway(directory) {
  for (const entry of fs.readdirSync(inputPath(directory), {
    withFileTypes: true,
  })) {
    assert.ok(!entry.isSymbolicLink());
    const file = directory + "/" + entry.name;
    if (entry.isDirectory()) {
      scanGateway(file);
      continue;
    }
    assert.ok(entry.isFile());
    assert.ok(
      file === "gateway/manifest.json"
        ? checked.has(file)
        : Object.hasOwn(gatewayInventory, file.slice("gateway/".length)),
      "Uninventoried gateway file / 중계목록밖파일: " + file,
    );
    if (entry.name === "cleanup.json") {
      assert.equal(read(file).cleanup_verified, true, file);
      gatewayCleanupFiles.push(file);
    }
    if (entry.name === "ownership.json") {
      const o = read(file);
      if (o.schema_version === "p09-engine-0.1") {
        assert.equal(o.container_name, "routelens-p02-" + o.owner_id);
        assert.equal(o.owner_label, "io.routelens.run_id=" + o.owner_id);
        gatewayContainers.add(o.container_name);
      }
    }
    if (entry.name === "commands.json") {
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
        gatewayContainers.add(c.args[index + 1]);
      }
    }
  }
}
scanGateway("gateway");
for (const required of [
  "gateway/runtime/cleanup.json",
  "gateway/bundle/cleanup.json",
  "gateway/gateway/runtime/cleanup.json",
])
  assert.ok(gatewayCleanupFiles.includes(required), required);
const gatewayControllerCleanup = read("gateway/gateway/runtime/cleanup.json");
assert.equal(gatewayControllerCleanup.in_flight, 0);
const gatewayControllerOwner = read(
  "gateway/gateway/runtime/gateway-ownership.json",
);
assert.equal(gatewayControllerOwner.graph_id, m.graph_id);
assert.equal(gatewayControllerOwner.consumer_id, "p10-gateway");
assert.ok(
  gatewayOwner.processes.some((p) => p.pid === gatewayControllerOwner.pid),
);
const gatewayPorts = read("gateway/readbacks/ports-after-cleanup.json");
assert.ok(gatewayPorts.length > 0);
for (const item of gatewayPorts) {
  assert.equal(item.open, false);
  assert.ok(Number.isInteger(item.port) && item.port > 0 && item.port < 65536);
}
const ownedPids = [
  ...new Set(
    [
      ...owner.processes.map((p) => p.pid),
      ...trafficOwner.processes.map((p) => p.pid),
      ...nodeOwner.processes.map((p) => p.pid),
      ...gatewayOwner.processes.map((p) => p.pid),
      read("seoul-process.json").pid,
    ].filter(Number.isInteger),
  ),
];
const scenarioRequired='fresh-source bounded-native-success no-suitable-road no-path outside-coverage domain-version-change malformed-domain-response excluded-node-healthy excluded-node-not-selected both-excluded transport-reset transport-blackhole publisher-reset partition-expiry non-car-http non-car-body-spoof car-retry-preserved namespace-isolation same-run-matrix matrix-missing-rejected matrix-forged-success-rejected supervisor-abort supervisor-failure owned-cleanup'.split(' ').map(x=>'p12-'+x);
const scenarioAssertions=read('scenarios/assertions.json');assert.equal(scenarioAssertions.length,24);assert.deepEqual(scenarioAssertions.map(a=>a.assertion_id).sort(),scenarioRequired.sort());
for(const a of scenarioAssertions){assert.equal(a.status,'PASS');assert.ok(checked.has('scenarios/'+a.evidence_path));}
assert.equal(wholeReport.scenarios.assertions_total,24);assert.equal(wholeReport.scenarios.assertions_passed,24);assert.equal(wholeReport.scenarios.cleanup_verified,true);
const matrix=read('scenarios/matrix.json'),inputs=read('scenarios/matrix-inputs.json');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const canonical=v=>Buffer.from(JSON.stringify(ordered(v)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
const digest=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
assert.equal(read('scenarios/runtime-manifest.json').assertions_sha256,digest(scenarioAssertions.slice(0,20)));assert.equal(matrix.assertions_sha256,digest(inputs.assertions));assert.equal(inputs.assertions.length,354);assert.deepEqual(inputs.assertions,combined.slice(0,354),'Matrix inputs must equal this whole run assertion prefix / 행렬 입력은 이번 전체 실행의 판정 접두와 같아야 합니다');
for(const x of [matrix,inputs]){assert.deepEqual(x.source,m.source);assert.equal(x.graph_id,m.graph_id);assert.equal(x.implementation_sha256,m.implementation_sha256);}
assert.equal(matrix.cleanup_verified,true);assert.deepEqual(matrix.rows.map(r=>r.scenario_id),Array.from({length:15},(_,i)=>'S'+String(i+1).padStart(2,'0')));
assert.equal(matrix.modules.length,9);
for(const item of matrix.modules){assert.equal(sha(item.path),item.sha256);const child=read(item.path);assert.equal(child.cleanup_verified,true);assert.equal(child.status,'PASS');assert.deepEqual(child.source,m.source);assert.equal(child.graph_id,m.graph_id);assert.equal(child.implementation_sha256,m.implementation_sha256);}
const byId=new Map(inputs.assertions.map(a=>[a.assertion_id,a]));assert.equal(byId.size,354);
for(const row of matrix.rows){assert.equal(row.basis,'ACTUAL_SEOUL_WITH_EXPLICIT_TINY_REGRESSIONS');assert.ok(row.references.length>0);for(const ref of row.references){const a=byId.get(ref.assertion_id);assert.ok(a);assert.equal(a.status,'PASS');assert.equal(digest(a),ref.assertion_sha256);assert.equal(a.evidence_path,ref.evidence_path);assert.equal(sha(ref.evidence_path),ref.evidence_sha256);assert.ok(checked.has(ref.evidence_path));}}
for(const mode of ['abort','failure']){
 const prefix='scenarios/supervisors/'+mode;
 const proof=read('scenarios/readbacks/supervisor-'+mode+'-after.json');assert.equal(proof.exit.code,mode==='abort'?130:1);assert.equal(proof.exit.signal,null);assert.equal(proof.port_closed,true);assert.equal(proof.remaining.length,0);
 for(const p of ['browser/cleanup.json','client/cleanup.json','outer/cleanup.json'])assert.equal(read(prefix+'/'+p).cleanup_verified,true);
 const baseline=read(prefix+'/baseline.json');assert.deepEqual(baseline.source,m.source);assert.equal(baseline.graph_id,m.graph_id);assert.equal(baseline.implementation_sha256,m.implementation_sha256);assert.deepEqual(baseline.proof.response.geometry,baseline.proof.map_source_geometry);assert.equal(sha(prefix+'/screenshots/baseline.png').length,64);assert.ok(fs.statSync(inputPath(prefix+'/browser/baseline.webm')).size>0);
 const ownership=read(prefix+'/browser/ownership.json');assert.ok(ownership.processes.length>0);assert.equal(proof.remaining.length,0); // Recorded host identities only / 원격 기록의 식별자만 검사

}

const cfRequired='fresh-source shared-core actual-queue count-0 count-1 count-4 count-5 batch-duplicate repeated-contributor parked window-open late-before late-exact late-after exact-expiry revoke-invalidates retention-no-revival batch-conflict wrong-graph wrong-source namespace-isolation unknown-fields concurrent-duplicate queue-ack-retry queue-hash-rejected durable-outbox restart-persistence recovered-dispatch immutable-catalog public-privacy canonical-parity owned-cleanup'.split(' ').map(x=>'p13-'+x);
const cf=read('cloudflare/assertions.json'),cfManifest=read('cloudflare/manifest.json');assert.equal(cf.length,32);assert.deepEqual(cf.map(a=>a.assertion_id).sort(),cfRequired.sort());assert.ok(cf.every(a=>a.status==='PASS'));assert.deepEqual(cfManifest.original_postgresql_source,m.source);assert.equal(cfManifest.original_postgresql_implementation_sha256,m.implementation_sha256);assert.equal(wholeReport.cloudflare.assertions_total,32);assert.equal(wholeReport.cloudflare.assertions_passed,32);assert.equal(wholeReport.cloudflare.cleanup_verified,true);
for(const a of cf)assert.ok(checked.has('cloudflare/'+a.evidence_path));
const pgCases=['count-0','count-1','count-4','count-5','late-just-before','late-exact','late-after','revoked','expired','new-empty-window','window-open'];
for(const id of pgCases){const pgPath='aggregation/parity-inputs/'+id+'.json',copy=read('cloudflare/parity/'+id+'-postgresql.json'),original=read(pgPath),worker=read('cloudflare/parity/'+id+'-worker.json');assert.equal(sha(pgPath),copy.source_sha256);const{source_path,source_sha256,...copiedOriginal}=copy;assert.equal(source_path,'parity-inputs/'+id+'.json');assert.deepEqual(copiedOriginal,original);assert.deepEqual(original.source,m.source);assert.equal(original.graph_id,m.graph_id);assert.equal(original.implementation_sha256,m.implementation_sha256);assert.deepEqual(worker,original.result);if(worker.code==='FINALIZED')assert.equal(digest(worker.draft),worker.canonical_sha256);assert.ok(checked.has(pgPath));}
const cfCleanup=read('cloudflare/runtime/cleanup.json');assert.equal(cfCleanup.cleanup_verified,true);assert.equal(cfCleanup.private_configuration_removed,true);assert.equal(cfCleanup.diagnostic_secret_rejected,false);assert.ok(cfCleanup.credential_scan_files>0);assert.deepEqual(cfCleanup.credential_files_quarantined,[]);assert.equal(cfCleanup.sessions.length,4);assert.ok(cfCleanup.sessions.every(x=>x.cleanup_verified&&x.exit.code===143));

const proof = {
 p13_cases:32,p13_postgresql_worker_pairs:pgCases.length,p13_actual_sqlite_inspected_separately:true,
 p12_matrix_rows:matrix.rows.length,
  omitted_map_bytes: [...omitted.values()],
  allowed_map_omissions: [...allowedMissing.values()],
  live_resource_queries_performed: false,
  selected_artifact_scope_en:
    "Only exact inventoried map binaries may be omitted; present binaries and all original .log/.pid/.exit/.sh/traffic.tar files remain required and hashed. Uninventoried tiny-city originals are not byte-verified.",
  selected_artifact_scope_ko:
    "정확한 목록의 지도 바이너리만 누락 가능하며 존재 바이너리와 원 .log/.pid/.exit/.sh/traffic.tar는 필수 해시검사입니다. 목록 밖 작은 지도 원본의 바이트 검증을 주장하지 않습니다.",
  cleanup_limitation_en:
    "Recorded cleanup only. No current remote-host container, volume, PID or port absence is established by querying this machine.",
  cleanup_limitation_ko:
    "기록된 정리만 검사합니다. 이 컴퓨터에 질의하여 현재 원격 호스트의 컨테이너·볼륨·PID·포트 부재를 입증하지 않습니다.",
  expected_source: expectedSource,
  scope_en:
    "Whole hosted P01–P13 selected-artifact linkage, hashes, fixed cases and recorded cleanup; detailed P10 proof is inspected separately.",
  scope_ko:
    "원격 P01–P13 선별 원문 연결·해시·고정사례·기록된 정리이며 상세 P10 근거는 별도 검사합니다.",
  gateway_public_successes_allowlist_checked: publicResponses,
  gateway_recorded_owned_containers: [...gatewayContainers].sort(),
  gateway_recorded_owned_volumes: [...gatewayVolumes].sort(),
  gateway_recorded_owned_ports: gatewayPorts.map((p) => p.port),
  gateway_cleanup_files_verified: gatewayCleanupFiles.sort(),
  recorded_owned_pids: ownedPids.length,
  status: "PASS",
  node_recorded_owned_containers: [...nodeContainers].sort(),
  node_recorded_owned_volumes: [...nodeVolumes].sort(),
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
    gateway: 32,
    client:32,
    scenarios:24,cloudflare:32,
    total: 438,
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
  current_remote_resource_absence_verified: false,
  traffic_recorded_owned_containers: [...trafficContainers].sort(),
  traffic_recorded_owned_volumes: [...trafficVolumes].sort(),
  traffic_cleanup_files_verified: trafficCleanupFiles.sort(),
  message_en:
    "Main independently checked artifact bytes, all stored traversal contents and geometry/timing, retry result bytes, durable restart/expiry/revocation read-backs and recorded owned-resource cleanup. This proves the bounded synthetic local pilot, not production authentication or real-driving accuracy.",
  message_ko:
    "메인이 원문 해시·저장 통과 전체의 지형/시간·재시도 결과 바이트·재시작/만료/철회 재조회·기록된 정확한 소유 자원 정리를 독립 검사했습니다. 제한된 합성 로컬 파일럿 증거이며 운영 인증·실주행 정확도는 별도입니다.",
};
fs.writeFileSync(output, JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(proof, null, 2));
