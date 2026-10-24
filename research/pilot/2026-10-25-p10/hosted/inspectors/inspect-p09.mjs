/** Independent hosted selected-artifact P09 raw evidence inspection / P09 원격 선별 원문 독립 검사.
 * No production validators are imported. Execution is owned by main.
 * 생산 검증기를 가져오지 않으며 실행은 메인이 담당합니다. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const args = process.argv.slice(2);
assert.ok(
  args.length === 6 &&
    args[2] === "--expected-source" &&
    args[4] === "--output",
  "Usage / 사용법: node data/inspect-p09-in-p10-hosted.mjs ROOT_NODES GRAPH_DIR --expected-source EXPECTED_SHA --output NEW_FILE_OUTSIDE_INPUTS",
);
const root = fs.realpathSync(args[0]),
  graphRoot = fs.realpathSync(args[1]),
  output = path.resolve(args[5]);
const expectedSource = args[3];
assert.match(
  expectedSource,
  /^[a-f0-9]{40}$/,
  "Expected source must be a 40-character lowercase hexadecimal commit SHA / 기대 소스는 소문자 40자리 커밋 SHA여야 합니다",
);
const contained = (base, p) => p === base || p.startsWith(base + path.sep);
const outputParent = fs.realpathSync(path.dirname(output));
assert.ok(
  !contained(root, output) &&
    !contained(graphRoot, output) &&
    !contained(root, outputParent) &&
    !contained(graphRoot, outputParent),
  "Output must be outside inputs / 출력은 입력 폴더 밖이어야 합니다",
);
assert.ok(
  !fs.existsSync(output),
  "Output must be new / 출력 파일이 이미 있습니다",
);
const inside = (base, relative) => {
  assert.equal(typeof relative, "string");
  assert.ok(
    !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."),
    "Unsafe relative path / 안전하지 않은 상대경로: " + relative,
  );
  const full = path.resolve(base, relative);
  assert.ok(contained(base, full));
  assert.ok(
    contained(base, fs.realpathSync(full)),
    "Symlink escaped input / 심볼릭 링크가 입력 밖으로 나갔습니다",
  );
  return full;
};
const bytes = (p) => fs.readFileSync(inside(root, p)),
  read = (p) => JSON.parse(bytes(p));
const graphBytes = (p) => fs.readFileSync(inside(graphRoot, p)),
  graphRead = (p) => JSON.parse(graphBytes(p));
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const canonical = (x) =>
  JSON.stringify(
    Array.isArray(x)
      ? x.map((y) => JSON.parse(canonical(y)))
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, JSON.parse(canonical(x[k]))]),
          )
        : x,
  );
const equal = (a, b, message) =>
  assert.equal(canonical(a), canonical(b), message);
function walk(directory = "") {
  const result = [];
  for (const entry of fs.readdirSync(inside(root, directory), {
    withFileTypes: true,
  })) {
    assert.ok(
      !entry.isSymbolicLink(),
      "Evidence symlink refused / 증거 심볼릭 링크 거부",
    );
    const p = directory ? directory + "/" + entry.name : entry.name;
    if (entry.isDirectory()) result.push(...walk(p));
    else if (entry.isFile()) result.push(p);
    else assert.fail("Non-file evidence / 일반 파일이 아닌 증거: " + p);
  }
  return result;
}
const allFiles = walk(),
  manifest = read("manifest.json"),
  owner = read("runtime/ownership.json"),
  graphManifest = graphRead("manifest.json");
assert.equal(manifest.status, "PASS");
assert.equal(manifest.cleanup_verified, true);
const local = JSON.parse(
  fs.readFileSync("data/p10-main-20261025/nodes/manifest.json"),
);
assert.equal(manifest.implementation_sha256, local.implementation_sha256);
assert.equal(manifest.source.commit, expectedSource);
assert.equal(manifest.graph_id, graphManifest.graph_id);
assert.equal(manifest.graph_manifest_sha256, hash(graphBytes("manifest.json")));
const recordedRoot = path.resolve(owner.owned_output_root);
const rebase = (p) => {
  assert.equal(typeof p, "string");
  const absolute = path.resolve(p);
  assert.ok(
    contained(recordedRoot, absolute),
    "Unowned recorded path / 소유 범위 밖 기록 경로: " + p,
  );
  return path.relative(recordedRoot, absolute).split(path.sep).join("/");
};

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

assert.equal(Object.keys(graphManifest.tile_sha256).length, 14);
allow("graph/seoul.osm.pbf", graphManifest.pbf_sha256, "graph/manifest.json");
for (const [tile, sha] of Object.entries(graphManifest.tile_sha256))
  allow("graph/tiles/" + tile, sha, "graph/manifest.json");
allow(
  "nodes/bundle/graph.tar",
  read("bundle/manifest.json").graph_extract_sha256,
  "nodes/bundle/manifest.json",
);
assert.equal(allowedMissing.size, 16);
const hashed = new Set();
for (const [file, sha] of Object.entries(manifest.output_sha256)) {
  assert.match(sha, /^[a-f0-9]{64}$/);
  if (verifyBytes(root, file, sha, "nodes/" + file)) hashed.add(file);
}
for (const file of allFiles)
  if (file !== "manifest.json")
    assert.ok(
      hashed.has(file),
      "Uninventoried raw evidence / 해시목록 밖 원문: " + file,
    );
let graphHashes = 0;
for (const [file, sha] of Object.entries(
  graphManifest.files_sha256 ?? graphManifest.output_sha256 ?? {},
)) {
  if (verifyBytes(graphRoot, file, sha, "graph/" + file)) graphHashes++;
}
assert.ok(graphHashes > 0);
verifyBytes(
  graphRoot,
  "seoul.osm.pbf",
  graphManifest.pbf_sha256,
  "graph/seoul.osm.pbf",
);
for (const [tile, sha] of Object.entries(graphManifest.tile_sha256)) {
  verifyBytes(graphRoot, "tiles/" + tile, sha, "graph/tiles/" + tile);
}
const ids = [
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
const assertions = read("assertions.json");
assert.equal(assertions.length, 32);
assert.equal(new Set(assertions.map((a) => a.assertion_id)).size, 32);
equal(assertions.map((a) => a.assertion_id).sort(), [...ids].sort());
for (const a of assertions) {
  assert.equal(a.status, "PASS");
  assert.ok(
    hashed.has(a.evidence_path),
    "Required case lacks inventoried original / 필수 사례 원문 없음: " +
      a.assertion_id,
  );
}
const spec = read("source/scenario.json"),
  expected = read("source/expected.json"),
  db = read("source/db.json"),
  truth = read("source/full-truth.json"),
  observations = read("source/observations.json"),
  catalog = read("source/catalog.json"),
  candidate = read("source/candidate.json"),
  edges = graphRead("edge-map.json"),
  graphRoutes = graphRead("routes.json");
const start = Date.parse(spec.start_time_utc),
  at = (ms) => new Date(start + ms).toISOString();
assert.equal(spec.duration_ms, 240000);
assert.equal(spec.sample_interval_ms, 500);
assert.equal(spec.vehicles.length, 15);
assert.equal(expected.calculated_before_matching, true);
assert.equal(expected.trips.length, 15);
assert.equal(new Set(expected.trips.map((t) => t.contributor_id)).size, 15);
assert.equal(truth.traversals.length, 45);
assert.equal(db.trips.length, 15);
assert.equal(db.traversals.length, 15);
assert.equal(db.counts.raw_payloads, 0);
assert.ok(
  db.trips.every((t) => t.state === "SUCCEEDED" && t.raw_payload_count === 0),
);
assert.equal(new Set(db.traversals.map((t) => t.observation_id)).size, 15);
function length(points) {
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      h =
        Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
        Math.cos(a[1] * rad) *
          Math.cos(b[1] * rad) *
          Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
    total += 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return total;
}
const anchors = [
  [
    [127.036993, 37.500712],
    [127.037245, 37.50079],
  ],
  [
    [127.037245, 37.50079],
    [127.03768, 37.500924],
  ],
  [
    [127.03768, 37.500924],
    [127.038474, 37.50117],
  ],
];
const near = (a, b) =>
  a.length === 2 &&
  a.every(
    (v, i) => Math.abs(Math.round(v * 1e6) - Math.round(b[i] * 1e6)) <= 1,
  );
const targetEdges = anchors.map(([a, b]) => {
  const found = edges.filter(
    (e) =>
      e.osm_way_id === 919983793 &&
      e.car_access &&
      near(e.directed_geometry[0], a) &&
      near(e.directed_geometry.at(-1), b),
  );
  assert.equal(found.length, 1);
  return found[0];
});
const teheran = graphRoutes.find((r) => r.route_id === "teheran"),
  indexes = targetEdges.map((e) => teheran.edge_ids.indexOf(e.edge_id));
assert.ok(
  indexes[0] > 0 &&
    indexes[1] === indexes[0] + 1 &&
    indexes[2] === indexes[1] + 1 &&
    indexes[2] < teheran.edge_ids.length - 1,
);
equal(
  expected.targets.map((t) => t.edge_id),
  targetEdges.map((e) => e.edge_id),
);
assert.equal(catalog.length, edges.length);
for (const c of catalog) {
  const edge = edges.find(
    (e) => e.edge_id === c.edge_id && e.forward === c.forward,
  );
  assert.ok(edge);
  assert.ok(Math.abs(c.distance_m - length(edge.directed_geometry)) < 1e-6);
}
const targets = new Set(targetEdges.map((e) => e.edge_id + ":" + e.forward));
let maxBoundaryError = 0,
  maxAuthoredDurationError = 0;
for (const e of expected.trips) {
  const vehicle = spec.vehicles.find((v) => v.vehicle_id === e.vehicle_id),
    edge = targetEdges.find(
      (t) => t.edge_id === e.target.edge_id && t.forward === e.target.forward,
    ),
    selected = db.traversals.filter(
      (t) =>
        t.trip_id === e.trip_id &&
        t.edge_id === e.target.edge_id &&
        t.forward === e.target.forward,
    );
  assert.ok(edge);
  assert.equal(selected.length, 1);
  const row = selected[0];
  assert.equal(row.contributor_id, e.contributor_id);
  assert.equal(row.graph_id, manifest.graph_id);
  assert.equal(row.matching_policy, "seoul-observed-v3");
  const distance = length(edge.directed_geometry);
  assert.ok(Math.abs(row.distance_m - distance) < 1e-6);
  const pre = edges.find((t) => t.edge_id === e.predecessor_edge_id),
    post = edges.find((t) => t.edge_id === e.successor_edge_id);
  equal(
    vehicle.path,
    [pre, edge, post].map((t) => ({ label: t.label, forward: t.forward })),
  );
  assert.equal(vehicle.noise_radius_m, 0);
  equal(vehicle.drop_intervals, []);
  assert.equal(vehicle.speed_profile.length, 3);
  assert.equal(vehicle.speed_profile[0].speed_mps, 5);
  assert.equal(vehicle.speed_profile[2].speed_mps, 5);
  const entry =
      vehicle.departure_ms + (length(pre.directed_geometry) / 5) * 1000,
    inside =
      (vehicle.speed_profile[0].duration_ms / 1000) * 5 -
      length(pre.directed_geometry),
    central = distance - inside - 3;
  assert.ok(inside >= 3 - 1e-8 && inside < 3.0051);
  assert.ok(central > 0);
  assert.ok(
    Math.abs(
      (central / vehicle.speed_profile[1].speed_mps) * 1000 -
        vehicle.speed_profile[1].duration_ms,
    ) < 1e-6,
  );
  const exit =
    vehicle.departure_ms +
    vehicle.speed_profile[0].duration_ms +
    vehicle.speed_profile[1].duration_ms +
    600;
  assert.equal(exit, 210000);
  assert.ok(Math.abs(entry - e.entered_at_ms) < 1e-6);
  assert.ok(Math.abs(exit - e.exited_at_ms) < 1e-6);
  const durationError = Math.abs(
    exit - entry - (distance / e.speed_mps) * 1000,
  );
  assert.ok(durationError <= 1);
  maxAuthoredDurationError = Math.max(maxAuthoredDurationError, durationError);
  const boundaryError = Math.max(
    Math.abs(Date.parse(row.entered_at_utc) - start - entry),
    Math.abs(Date.parse(row.exited_at_utc) - start - exit),
  );
  assert.ok(boundaryError <= 150);
  maxBoundaryError = Math.max(maxBoundaryError, boundaryError);
  assert.equal(
    row.duration_s,
    (Date.parse(row.exited_at_utc) - Date.parse(row.entered_at_utc)) / 1000,
  );
  assert.ok(
    observations.filter((o) => o.vehicle_id === e.vehicle_id).length > 2,
  );
  assert.ok(
    observations
      .filter((o) => o.vehicle_id === e.vehicle_id)
      .every(
        (o) =>
          o.source_class === "SYNTHETIC" &&
          o.offset_ms >= entry - 1600 &&
          o.offset_ms <= exit + 1600 &&
          !("edge_id" in o) &&
          !("speed_mps" in o),
      ),
  );
  const actualTruth = truth.traversals.filter(
    (t) => t.vehicle_id === e.vehicle_id,
  );
  assert.equal(actualTruth.length, 3);
  assert.ok(
    actualTruth.some(
      (t) =>
        t.edge_id === edge.edge_id &&
        Math.abs(t.entered_at_ms - entry) <= 1 &&
        Math.abs(t.exited_at_ms - exit) <= 1,
    ),
  );
}
assert.equal(candidate.code, "FINALIZED");
assert.equal(candidate.draft.entries.length, catalog.length);
assert.equal(candidate.draft.window_start, at(180000));
assert.equal(candidate.draft.valid_until, at(420000));
const medians = [];
for (const t of targetEdges) {
  const rows = db.traversals.filter(
    (r) => r.edge_id === t.edge_id && r.forward === t.forward,
  );
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((r) => r.contributor_id)).size, 5);
  const median = rows.map((r) => r.duration_s).sort((a, b) => a - b)[2],
    speed = length(t.directed_geometry) / median,
    selection = candidate.selections.find(
      (s) => s.edge_id === t.edge_id && s.forward === t.forward,
    ),
    entry = candidate.draft.entries.find(
      (e) => e.edge_id === t.edge_id && e.forward === t.forward,
    );
  assert.equal(selection.eligible_contributors, 5);
  assert.ok(Math.abs(selection.median_duration_s - median) < 1e-9);
  equal(
    [...selection.selected_observation_ids].sort(),
    rows.map((r) => r.observation_id).sort(),
  );
  assert.equal(entry.status, "LIVE");
  assert.equal(entry.sample_bucket, "5-9");
  assert.ok(Math.abs(entry.speed_mps / speed - 1) < 0.00001);
  assert.ok(Math.abs(entry.speed_mps / 0.5 - 1) <= 0.02);
  medians.push({
    edge_id: t.edge_id,
    contributors: 5,
    median_duration_s: median,
    speed_mps: speed,
  });
}
assert.equal(
  candidate.draft.entries.filter((e) => e.status === "LIVE").length,
  3,
);
assert.ok(db.traversals.every((t) => targets.has(t.edge_id + ":" + t.forward)));
const sourceHttp = read("source/http.json"),
  sourceWorkers = read("source/workers.json");
assert.equal(sourceHttp.length, db.counts.batches);
assert.ok(
  sourceHttp.every((r) => r.status === 202 && r.body.code === "ACCEPTED"),
);
assert.ok(
  sourceHttp.every(
    (r, i) =>
      i === 0 ||
      Date.parse(r.checked_at_event_time) >=
        Date.parse(sourceHttp[i - 1].checked_at_event_time),
  ),
);
assert.equal(sourceWorkers.length, 15);
assert.equal(new Set(sourceWorkers.map((r) => r.pid)).size, 15);
assert.ok(
  sourceWorkers.every(
    (r) =>
      r.message.code === "SUCCEEDED" &&
      r.message.stored_count === 1 &&
      r.exit.code === 0,
  ),
);
const sourceAttempts = allFiles.filter((f) =>
  /^source\/synthetic-engines\/[^/]+\/result\.json$/.test(f),
);
assert.equal(sourceAttempts.length, 15);
for (const file of sourceAttempts) {
  const directory = path.dirname(file),
    result = read(file),
    input = read(directory + "/input.json"),
    accepted = result.traversals.filter((t) => t.status === "ACCEPTED");
  assert.equal(accepted.length, 1);
  const t = accepted[0],
    trip = db.trips.find((r) => r.vehicle_id === t.vehicle_id),
    stored = db.traversals.find((r) => r.trip_id === trip.trip_id);
  assert.equal(trip.matching_digest, result.semantic_sha256);
  assert.equal(
    read(directory + "/manifest.json").semantic_sha256,
    result.semantic_sha256,
  );
  assert.equal(stored.edge_id, t.edge_id);
  assert.equal(stored.forward, t.forward);
  assert.equal(Date.parse(stored.entered_at_utc) - start, t.entered_at_ms);
  assert.equal(Date.parse(stored.exited_at_utc) - start, t.exited_at_ms);
  assert.ok(
    input.observations.every((p) => !("edge_id" in p) && !("speed_mps" in p)),
  );
  const commands = read(directory + "/commands.json");
  const traceCalls = commands.filter(
    (c) => c.exit_code === 0 && c.args.some((a) => a === "trace_attributes"),
  );
  assert.ok(
    traceCalls.length > 0,
    "Fresh P05 trace command absent / 새P05trace명령없음",
  );
  for (const command of traceCalls) {
    assert.ok(bytes(directory + "/" + command.stdout).length > 0);
  }
}
assert.equal(
  hash(Buffer.from(canonical(candidate.draft))),
  candidate.canonical_sha256,
);
const roots = read("public/trust-roots.json");
assert.equal(new Set(roots.map((r) => r.kid)).size, roots.length);
const publicKeys = new Map(
  roots.map((r) => {
    assert.equal(r.public_jwk.kty, "OKP");
    assert.equal(r.public_jwk.crv, "Ed25519");
    assert.ok(!("d" in r.public_jwk));
    return [r.kid, r];
  }),
);
const publications = new Map(),
  sequenceMap = new Map();
for (const file of allFiles.filter((f) =>
  /^public\/sequence-\d+\.jws\.txt$/.test(f),
)) {
  const seq = Number(file.match(/sequence-(\d+)/)[1]),
    jws = bytes(file).toString("utf8"),
    parts = jws.split(".");
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], "base64url")),
    payloadBytes = Buffer.from(parts[1], "base64url"),
    payload = JSON.parse(payloadBytes),
    key = publicKeys.get(header.kid);
  equal(Object.keys(header).sort(), ["alg", "kid", "typ"]);
  assert.equal(header.alg, "EdDSA");
  assert.equal(header.typ, "routelens-traffic-manifest+jws");
  assert.ok(key);
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(parts[0] + "." + parts[1]),
      crypto.createPublicKey({ key: key.public_jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    ),
    true,
  );
  const raw = bytes("public/sequence-" + seq + ".json"),
    snapshot = JSON.parse(raw);
  assert.ok(
    !/"(?:contributor_id|trip_id|sample_id|longitude|latitude|database_url|token|private_jwk|d)"\s*:/.test(
      raw.toString("utf8"),
    ),
  );
  equal(
    Object.keys(payload).sort(),
    [
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
    ].sort(),
  );
  equal(
    Object.keys(snapshot).sort(),
    [
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
    ].sort(),
  );
  assert.equal(payload.schema_version, "0.1");
  assert.equal(payload.media_type, "application/json");
  assert.equal(payload.region_id, "seoul-pilot-corridors-v1");
  assert.equal(payload.aggregation_policy, "seoul-window-median-v1");
  assert.equal(payload.window_start, at(180000));
  assert.equal(payload.window_end, at(240000));
  assert.equal(
    Date.parse(payload.window_end) - Date.parse(payload.window_start),
    60000,
  );
  assert.equal(
    Date.parse(payload.valid_until) - Date.parse(payload.window_end),
    180000,
  );
  assert.equal(payload.traffic_snapshot_id, hash(raw));
  assert.equal(payload.byte_length, raw.length);
  assert.equal(raw.toString("utf8"), canonical(snapshot));
  assert.equal(payloadBytes.toString("utf8"), canonical(payload));
  for (const field of [
    "schema_version",
    "graph_id",
    "sequence",
    "simulation_namespace",
    "publisher_id",
    "region_id",
    "window_start",
    "window_end",
    "published_at",
    "valid_until",
    "aggregation_policy",
  ])
    assert.equal(snapshot[field], payload[field], field);
  assert.equal(payload.sequence, seq);
  assert.equal(payload.graph_id, manifest.graph_id);
  assert.equal(payload.publisher_id, key.publisher_id);
  assert.equal(payload.simulation_namespace, key.simulation_namespace);
  assert.equal(payload.region_id, key.region_id);
  assert.ok(key.allowed_graph_ids.includes(manifest.graph_id));
  assert.ok(
    Date.parse(payload.published_at) >= Date.parse(at(270000)) &&
      Date.parse(payload.published_at) < Date.parse(at(420000)),
  );
  assert.ok(
    Date.parse(payload.published_at) >= Date.parse(key.valid_from) &&
      Date.parse(payload.published_at) < Date.parse(key.valid_until),
  );
  assert.equal(payload.valid_until, at(420000));
  assert.equal(snapshot.entries.length, catalog.length);
  equal(
    snapshot.entries.map((e) => [e.edge_id, e.forward]).sort(),
    catalog.map((e) => [e.edge_id, e.forward]).sort(),
  );
  assert.ok(snapshot.entries.every((e) => e.source_class === "SYNTHETIC"));
  for (const entry of snapshot.entries) {
    equal(
      Object.keys(entry).sort(),
      [
        "edge_id",
        "forward",
        "source_class",
        "status",
        "speed_mps",
        "sample_bucket",
      ].sort(),
    );
    if (entry.status === "LIVE") {
      assert.ok(Number.isFinite(entry.speed_mps) && entry.speed_mps > 0);
      assert.ok(["5-9", "10-19", "20+"].includes(entry.sample_bucket));
    } else {
      assert.ok(["UNKNOWN", "INSUFFICIENT", "STALE"].includes(entry.status));
      assert.equal(entry.speed_mps, null);
      assert.equal(entry.sample_bucket, null);
    }
  }

  publications.set(payload.traffic_snapshot_id, {
    payload,
    snapshot,
    jws,
    seq,
  });
  sequenceMap.set(seq, payload.traffic_snapshot_id);
}
assert.equal(publications.size, 9);
equal(
  [...sequenceMap.keys()].sort((a, b) => a - b),
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
);
for (let seq = 1; seq <= 7; seq++) {
  const pub = publications.get(sequenceMap.get(seq));
  assert.equal(
    pub.snapshot.entries.filter((e) => e.status === "LIVE").length,
    3,
  );
  for (const t of targetEdges)
    assert.equal(
      pub.snapshot.entries.find(
        (e) => e.edge_id === t.edge_id && e.forward === t.forward,
      ).status,
      "LIVE",
    );
}
for (const seq of [8, 9]) {
  const pub = publications.get(sequenceMap.get(seq));
  assert.equal(
    pub.snapshot.entries.filter((e) => e.status === "LIVE").length,
    0,
  );
  for (const t of targetEdges)
    assert.equal(
      pub.snapshot.entries.find(
        (e) => e.edge_id === t.edge_id && e.forward === t.forward,
      ).status,
      "INSUFFICIENT",
    );
}
const bundle = read("bundle/manifest.json"),
  skeleton = bytes("bundle/traffic.tar");
assert.equal(hash(skeleton), bundle.skeleton_sha256);
assert.equal(skeleton.length, bundle.skeleton_byte_length);
assert.equal(bundle.graph_id, manifest.graph_id);
verifyBytes(
  root,
  "bundle/graph.tar",
  bundle.graph_extract_sha256,
  "nodes/bundle/graph.tar",
);
const expectedTraffic = new Map();
function trafficHash(snapshotId) {
  if (expectedTraffic.has(snapshotId)) return expectedTraffic.get(snapshotId);
  const compiled = Buffer.from(skeleton);
  for (const e of snapshotId
    ? publications.get(snapshotId).snapshot.entries
    : []) {
    if (e.status !== "LIVE") {
      assert.equal(e.speed_mps, null);
      continue;
    }
    assert.ok(
      Number.isFinite(e.speed_mps) && e.speed_mps > 0 && e.speed_mps <= 70,
    );
    const packed = BigInt(e.edge_id),
      base = Number(packed & ((1n << 25n) - 1n)),
      index = Number(packed >> 25n),
      member = bundle.members.find((m) => m.tile_base === base);
    assert.ok(member && index < member.directed_edge_count);
    const offset = member.offset + 32 + index * 8,
      raw = Math.max(1, Math.round((e.speed_mps * 3.6) / 2));
    assert.equal(raw, 1);
    compiled.writeBigUInt64LE(
      BigInt(raw) | (BigInt(raw) << 7n) | (255n << 28n),
      offset,
    );
  }
  const h = hash(compiled);
  expectedTraffic.set(snapshotId, h);
  return h;
}
const nodeOwners = allFiles
    .filter((f) => f.endsWith("/node-ownership.json"))
    .map((file) => ({ file, record: read(file) })),
  engineOwners = allFiles
    .filter((f) => f.endsWith("/ownership.json"))
    .map((file) => ({ file, record: read(file) }))
    .filter((x) => x.record.schema_version === "p09-engine-0.1");
assert.ok(nodeOwners.length >= 6 && engineOwners.length > 0);
assert.equal(new Set(nodeOwners.map((o) => o.record.node_id)).size, 2);
assert.equal(
  new Set(nodeOwners.map((o) => o.record.instance_id)).size,
  nodeOwners.length,
);
assert.equal(
  new Set(engineOwners.map((o) => o.record.container_id)).size,
  engineOwners.length,
);
assert.equal(
  new Set(engineOwners.map((o) => o.record.owner_id)).size,
  engineOwners.length,
);
for (const nodeId of new Set(nodeOwners.map((o) => o.record.node_id)))
  assert.equal(
    new Set(
      nodeOwners
        .filter((o) => o.record.node_id === nodeId)
        .map((o) => o.record.consumer_id),
    ).size,
    1,
  );
const engines = [],
  nativeRecords = [];
for (const item of engineOwners) {
  const o = item.record,
    dir = path.dirname(item.file);
  assert.match(o.owner_id, /^[a-f0-9-]{36}$/);
  assert.equal(o.container_name, "routelens-p02-" + o.owner_id);
  assert.equal(o.owner_label, "io.routelens.run_id=" + o.owner_id);
  assert.match(o.container_id, /^[a-f0-9]{64}$/);
  assert.equal(rebase(o.work_directory), dir);
  assert.equal(
    path.resolve(o.graph_directory),
    path.resolve(engineOwners[0].record.graph_directory),
  );
  assert.equal(o.planned_before_creation, true);
  assert.ok(o.native_daemon.pid > 1);
  assert.match(o.native_daemon.start_ticks, /^[1-9]\d*$/);
  const node = nodeOwners.find((n) =>
    contained(path.dirname(n.file), item.file),
  );
  assert.ok(node);
  const generationDir =
      rebase(node.record.generation_root) + "/" + o.generation_id,
    g = read(generationDir + "/manifest.json");
  assert.equal(g.generation_id, o.generation_id);
  assert.equal(g.graph_id, manifest.graph_id);
  assert.equal(g.skeleton_sha256, bundle.skeleton_sha256);
  assert.equal(
    g.generation_id,
    hash(
      Buffer.from(
        canonical({
          graph_id: g.graph_id,
          skeleton_sha256: g.skeleton_sha256,
          traffic_snapshot_id: g.traffic_snapshot_id,
          compiler_policy: "valhalla-current-v1",
        }),
      ),
    ),
  );
  assert.equal(g.traffic_sha256, trafficHash(g.traffic_snapshot_id));
  assert.equal(hash(bytes(generationDir + "/traffic.tar")), g.traffic_sha256);
  assert.equal(hash(bytes(dir + "/traffic.tar")), g.traffic_sha256);
  const commands = read(dir + "/commands.json");
  const create = commands.find((c) => c.args[0] === "create");
  assert.ok(create && create.status === 0);
  assert.ok(
    create.args.includes("--network") &&
      create.args[create.args.indexOf("--network") + 1] === "none",
  );
  const inspect = commands.find(
      (c) => c.args[0] === "inspect" && c.status === 0,
    ),
    docker = JSON.parse(bytes(dir + "/" + inspect.stdout))[0];
  assert.equal(docker.Id, o.container_id);
  assert.equal(docker.Name, "/" + o.container_name);
  assert.equal(docker.Config.Labels["io.routelens.run_id"], o.owner_id);
  assert.equal(docker.Image, graphManifest.image.id);
  assert.equal(docker.HostConfig.NetworkMode, "none");
  assert.equal(docker.HostConfig.NanoCpus, 2000000000);
  assert.equal(docker.HostConfig.Memory, 4294967296);
  assert.ok(!Object.keys(docker.HostConfig.PortBindings ?? {}).length);
  assert.ok(
    docker.Mounts.some(
      (m) => m.Destination === "/work" && rebase(m.Source) === dir,
    ),
  );
  assert.ok(
    docker.Mounts.some(
      (m) =>
        m.Destination === "/graph" &&
        m.Source === o.graph_directory &&
        m.RW === false,
    ),
  );
  const starts = commands.filter(
    (c) => c.args[0] === "exec" && c.args.includes("/work/start-service.sh"),
  );
  assert.equal(starts.length, 1);
  assert.equal(starts[0].status, 0);
  assert.match(
    bytes(dir + "/start-service.sh").toString(),
    /valhalla_service \/work\/service-config\.json 1/,
  );
  const listens = commands.filter(
    (c) => c.status === 0 && c.args.some((a) => a.includes("/proc/net/tcp")),
  );
  assert.ok(
    listens.some((c) =>
      bytes(dir + "/" + c.stdout)
        .toString()
        .trim()
        .split("\n")
        .some((line) => {
          const p = line.trim().split(/\s+/);
          return (
            ["0100007F:1F42", "0000000000000000FFFF00000100007F:1F42"].includes(
              p[1],
            ) && p[3] === "0A"
          );
        }),
    ),
    "No original loopback LISTEN bytes / 원래 로컬 LISTEN 바이트 없음",
  );
  const procStats = commands
    .filter(
      (c) =>
        c.status === 0 &&
        c.args.some((a) => a.includes("/proc/") && a.includes("/stat")),
    )
    .map((c) =>
      bytes(dir + "/" + c.stdout)
        .toString()
        .trim(),
    )
    .filter((s) => /^\d+ \(valhalla_servic/.test(s));
  assert.ok(
    procStats.some((s) => {
      const m = s.match(/^(\d+) \(([^)]+)\) (.+)$/);
      return (
        Number(m[1]) === o.native_daemon.pid &&
        m[3].split(/\s+/)[19] === o.native_daemon.start_ticks
      );
    }),
  );
  for (const identityFile of allFiles.filter(
    (f) => f.startsWith(dir + "/requests/") && f.endsWith("/identity.json"),
  )) {
    const d = path.dirname(identityFile),
      identity = read(identityFile);
    equal(identity.before, identity.after);
    assert.equal(identity.before.container_id, o.container_id);
    assert.equal(identity.before.pid, o.native_daemon.pid);
    assert.equal(identity.before.start_ticks, o.native_daemon.start_ticks);
    for (const action of ["route", "trace_attributes"]) {
      assert.match(
        bytes(d + "/" + action + ".headers.txt").toString(),
        /^HTTP\/1\.[01] 200\b/m,
      );
      assert.ok(
        commands.some(
          (c) =>
            c.status === 0 &&
            c.args[0] === "exec" &&
            c.args.includes("curl") &&
            c.args.at(-1) === "http://127.0.0.1:8002/" + action &&
            c.args.includes(
              "@/work/" +
                path.relative(dir, d).split(path.sep).join("/") +
                "/" +
                action +
                ".request.json",
            ) &&
            bytes(dir + "/" + c.stdout)
              .toString()
              .trim() === "200",
        ),
      );
    }
    equal(read(d + "/trace_attributes.request.json"), {
      encoded_polyline: read(d + "/route.response.json").trip.legs[0].shape,
      shape_match: "edge_walk",
      costing: "auto",
      date_time: { type: 0 },
      filters: {
        action: "include",
        attributes: ["edge.id", "edge.length", "edge.speed", "shape"],
      },
    });
    nativeRecords.push({
      directory: d,
      owner: o,
      node: node.record,
      generation: g,
      request: read(d + "/route.request.json"),
      route: read(d + "/route.response.json"),
      trace: read(d + "/trace_attributes.response.json"),
    });
  }
  engines.push({ directory: dir, owner: o, node: node.record, generation: g });
}
const requests = new Map(),
  usedNative = new Set(),
  routeFacts = [];
const request = read("request.json");
equal(request, {
  graph_id: manifest.graph_id,
  locations: [
    { lon: 127.029, lat: 37.4984 },
    { lon: 127.049, lat: 37.5045 },
  ],
});
const ordinary = {
  locations: request.locations,
  costing: "auto",
  units: "kilometers",
  language: "en-US",
  date_time: { type: 0 },
};
for (const file of allFiles.filter((f) => /^requests\/[^/]+\.json$/.test(f))) {
  const response = read(file);
  requests.set(path.basename(file, ".json"), response);
  assert.equal(response.headers["cache-control"], "no-store");
  if (response.body.code !== "ROUTE") continue;
  assert.equal(response.status, 200);
  const body = response.body,
    p = body.provenance;
  assert.equal(body.request_id, path.basename(file, ".json"));
  equal(
    Object.keys(p).sort(),
    [
      "graph_id",
      "high_water",
      "sequence",
      "traffic_snapshot_id",
      "compiler_policy",
      "generation_id",
      "traffic_sha256",
      "traffic_byte_length",
      "checked_at_event_time",
      "valid_until",
      "traffic_mode",
      "engine",
      "message_en",
      "message_ko",
      "activation_epoch",
      "native_daemon",
    ].sort(),
  );
  equal(Object.keys(p.native_daemon).sort(), ["pid", "start_ticks"]);
  equal(Object.keys(p.engine).sort(), ["image_id", "version"]);
  assert.equal(p.graph_id, manifest.graph_id);
  assert.equal(p.compiler_policy, "valhalla-current-v1");
  assert.ok(Number.isInteger(p.activation_epoch) && p.activation_epoch > 0);
  assert.ok(p.native_daemon.pid > 1);
  assert.match(p.native_daemon.start_ticks, /^[1-9]\d*$/);
  equal(body.engine_result.request, ordinary);
  const matching = nativeRecords.filter(
    (n) =>
      !usedNative.has(n.directory) &&
      n.node.node_id === body.node_id &&
      n.node.instance_id === body.instance_id &&
      n.generation.generation_id === p.generation_id &&
      n.owner.native_daemon.pid === p.native_daemon.pid &&
      n.owner.native_daemon.start_ticks === p.native_daemon.start_ticks &&
      canonical(n.request) === canonical(body.engine_result.request) &&
      canonical(n.route) === canonical(body.engine_result.route) &&
      canonical(n.trace) === canonical(body.engine_result.trace),
  );
  assert.ok(
    matching.length > 0,
    "No original native HTTP bytes for / 원 native HTTP 바이트 연결 없음: " +
      file,
  );
  const n = matching[0];
  usedNative.add(n.directory);
  const trip = body.engine_result.route.trip;
  assert.equal(trip.status, 0);
  assert.equal(trip.legs.length, 1);
  assert.equal(typeof trip.legs[0].shape, "string");
  assert.ok(
    Number.isFinite(trip.summary.time) && Number.isFinite(trip.summary.length),
  );
  assert.ok(body.engine_result.trace.edges.length > 0);
  assert.equal(p.traffic_sha256, n.generation.traffic_sha256);
  assert.equal(
    p.traffic_byte_length,
    bytes(n.directory.split("/requests/")[0] + "/traffic.tar").length,
  );
  assert.equal(p.engine.image_id, graphManifest.image.id);
  assert.equal(p.engine.version, "3.9.1");
  if (p.traffic_snapshot_id) {
    const pub = publications.get(p.traffic_snapshot_id);
    assert.ok(pub);
    assert.equal(p.sequence, pub.seq);
    assert.equal(p.high_water, pub.seq);
    assert.equal(p.valid_until, pub.payload.valid_until);
    assert.ok(Date.parse(p.checked_at_event_time) < Date.parse(p.valid_until));
    assert.equal(
      p.traffic_mode,
      pub.snapshot.entries.some((e) => e.status === "LIVE")
        ? "LIVE"
        : "NO_LIVE_COVERAGE",
    );
  } else {
    assert.equal(p.sequence, null);
    assert.equal(p.valid_until, null);
    assert.equal(p.traffic_mode, "NO_USABLE_SNAPSHOT");
  }
  const runtimeEvents = read(rebase(n.node.runtime_root) + "/events.json");
  assert.ok(
    runtimeEvents.some(
      (e) =>
        e.code === "ACTIVATED" &&
        e.generation_id === p.generation_id &&
        e.activation_epoch === p.activation_epoch,
    ),
  );
  routeFacts.push({
    request_id: body.request_id,
    node_id: body.node_id,
    instance_id: body.instance_id,
    sequence: p.sequence,
    snapshot_id: p.traffic_snapshot_id,
    generation_id: p.generation_id,
    pid: p.native_daemon.pid,
    start_ticks: p.native_daemon.start_ticks,
    epoch: p.activation_epoch,
    native_directory: n.directory,
  });
}
function failure(reply, status, reason) {
  assert.equal(reply.status, status);
  equal(Object.keys(reply.body).sort(), [
    "code",
    "message_en",
    "message_ko",
    "reason",
  ]);
  assert.equal(reply.body.code, "UNAVAILABLE");
  assert.equal(reply.body.reason, reason);
  assert.equal(typeof reply.body.message_en, "string");
  assert.equal(typeof reply.body.message_ko, "string");
}
for (const [id, status, reason] of [
  ["invalid-input", 422, "INVALID_REQUEST"],
  ["invalid-graph", 422, "INVALID_REQUEST"],
  ["invalid-public-clock", 422, "INVALID_REQUEST"],
  ["generation-mismatch", 409, "GENERATION_MISMATCH"],
  ["capacity-excess", 429, "CAPACITY"],
  ["old-held", 409, "ACCEPTED_STATE_CHANGED"],
  ["coalesce-held", 409, "ACCEPTED_STATE_CHANGED"],
  ["store-outage", 503, "STORE_UNAVAILABLE"],
  ["corrupt-generation", 503, "GENERATION_CONFLICT"],
  ["engine-kill", 503, "ENGINE_UNAVAILABLE"],
  ["engine-kill-new-request", 503, "ENGINE_UNAVAILABLE"],
  ["deadline-held", 503, "REQUEST_DEADLINE"],
]) {
  assert.ok(
    requests.has(id),
    "Required original response missing / 필수 원응답 누락: " + id,
  );
  failure(requests.get(id), status, reason);
}
failure(read("negative/unauthorized.json"), 401, "AUTH_REQUIRED");
failure(read("negative/body-limit.json"), 422, "BODY_TOO_LARGE");
const notCalled = read("negative/native-requests-unchanged.json");
assert.ok(notCalled.before >= 3);
assert.equal(notCalled.before, notCalled.after);
assert.equal(read("negative/invalid-input.json").clockAfterInvalid, at(270000));
const success = (id) => {
    const r = requests.get(id);
    assert.ok(r && r.status === 200 && r.body.code === "ROUTE", id);
    return r.body;
  },
  routeSummary = (id) => success(id).engine_result.route.trip.summary,
  shape = (id) => success(id).engine_result.route.trip.legs[0].shape;
const baseline = success("baseline-a-1");
equal(
  baseline.provenance.native_daemon,
  success("baseline-a-2").provenance.native_daemon,
);
assert.equal(
  baseline.provenance.generation_id,
  success("baseline-a-2").provenance.generation_id,
);
assert.equal(shape("baseline-a-1"), shape("baseline-a-2"));
const initialA = read("status/a-baseline.json"),
  initialB = read("status/b-baseline.json");
assert.notEqual(initialA.instance_id, initialB.instance_id);
const aOwner = nodeOwners.find(
    (n) => n.record.instance_id === initialA.instance_id,
  ),
  bOwner = nodeOwners.find(
    (n) => n.record.instance_id === initialB.instance_id,
  );
assert.ok(aOwner && bOwner);
assert.notEqual(aOwner.record.pid, bOwner.record.pid);
assert.notEqual(aOwner.record.consumer_id, bOwner.record.consumer_id);
assert.equal(initialA.active.high_water, 0);
assert.equal(initialB.active.high_water, 0);
for (const id of ["live-a", "live-b"]) {
  const r = success(id),
    s = routeSummary(id);
  assert.equal(r.provenance.traffic_mode, "LIVE");
  assert.equal(r.provenance.sequence, 1);
  assert.notEqual(shape(id), shape("baseline-a-1"));
  assert.ok((s.length - routeSummary("baseline-a-1").length) * 1000 >= 50);
  assert.ok(s.time - routeSummary("baseline-a-1").time >= 5);
  assert.ok(
    r.engine_result.trace.edges.every(
      (e) => !targetEdges.some((t) => String(e.id) === t.edge_id),
    ),
  );
}
const keyRevoked = read("status/b-accepted-key-revoked.json"),
  revokedOwner = nodeOwners.find(
    (n) => n.record.instance_id === keyRevoked.instance_id,
  );
assert.ok(revokedOwner);
assert.equal(revokedOwner.record.consumer_id, bOwner.record.consumer_id);
assert.notEqual(revokedOwner.record.pid, bOwner.record.pid);
assert.notEqual(keyRevoked.instance_id, initialB.instance_id);
assert.equal(keyRevoked.active.high_water, 1);
assert.equal(keyRevoked.active.traffic_snapshot_id, null);
assert.equal(keyRevoked.active.sequence, null);
assert.equal(keyRevoked.active.checked_at_event_time, at(270000));
assert.equal(read("status/b-live-2.json").active.sequence, 2);
assert.equal(read("status/b-live-2.json").active.high_water, 2);
const oldHeld = read("status/old-lease-held.json"),
  switched = read("status/old-draining-new-active.json"),
  settled = read("status/last-lease-retired.json");
assert.equal(oldHeld.in_flight, 1);
assert.equal(oldHeld.active.sequence, 2);
assert.equal(switched.active.sequence, 3);
assert.notEqual(oldHeld.active.generation_id, switched.active.generation_id);
assert.equal(switched.slots.length, 2);
assert.ok(
  switched.slots.some(
    (s) =>
      s.generation_id === oldHeld.active.generation_id &&
      s.state === "DRAINING" &&
      s.in_flight === 1,
  ),
);
assert.ok(
  switched.slots.some(
    (s) =>
      s.generation_id === switched.active.generation_id && s.state === "ACTIVE",
  ),
);
assert.equal(
  success("new-active").provenance.generation_id,
  switched.active.generation_id,
);
assert.equal(settled.in_flight, 0);
assert.equal(settled.slots.length, 1);
const lastLease = read("readbacks/last-lease-cleanup.json");
assert.ok(lastLease.length > 0 && lastLease.every((r) => r.absent));
assert.ok(
  lastLease.every(
    (r) => r.record.generation_id === oldHeld.active.generation_id,
  ),
);
let eventCount = 0;
for (const n of nodeOwners) {
  const dir = path.dirname(n.file),
    events = read(dir + "/events.json");
  assert.ok(events.length > 0);
  assert.ok(
    events.every(
      (e) =>
        e.node_id === n.record.node_id &&
        e.instance_id === n.record.instance_id &&
        Number.isInteger(e.slot_count) &&
        e.slot_count >= 0 &&
        e.slot_count <= 2,
    ),
  );
  eventCount += events.length;
}
const coalescing = read("readbacks/coalescing.json");
assert.equal(coalescing.fifthWaiting.slots.length, 2);
assert.equal(coalescing.sixthWaiting.slots.length, 2);
assert.equal(coalescing.coalesced.active.sequence, 6);
assert.ok(coalescing.slot_history.every((e) => e.slot_count <= 2));
const skipped = hash(
  Buffer.from(
    canonical({
      graph_id: manifest.graph_id,
      skeleton_sha256: bundle.skeleton_sha256,
      traffic_snapshot_id: sequenceMap.get(5),
      compiler_policy: "valhalla-current-v1",
    }),
  ),
);
assert.ok(!engineOwners.some((o) => o.record.generation_id === skipped));
const capacity = read("readbacks/capacity.json");
assert.equal(capacity.full.in_flight, 8);
assert.equal(capacity.completed.length, 8);
assert.ok(capacity.completed.every((r) => r.status === 200));
failure(capacity.excess, 429, "CAPACITY");
for (let i = 0; i < 8; i++)
  assert.equal(
    success("capacity-" + i).provenance.generation_id,
    baseline.provenance.generation_id,
  );
const processes = read("process-events.json"),
  phases = processes.flatMap((p) =>
    p.messages.filter((m) => m.type === "PHASE"),
  );
for (let i = 0; i < 8; i++)
  assert.ok(
    phases.some(
      (p) =>
        p.phase === "AFTER_NODE_ENGINE_RESULT" &&
        p.request_id === "capacity-" + i,
    ),
  );
assert.ok(
  phases.some(
    (p) =>
      p.phase === "AFTER_NODE_ENGINE_RESULT" && p.request_id === "old-held",
  ),
);
const killed = read("readbacks/node-killed.json");
assert.equal(killed.signal, "SIGKILL");
assert.ok(killed.orphan_engines.length > 0);
assert.ok(
  processes.some((p) => p.pid === killed.pid && p.signal === "SIGKILL"),
);
assert.ok(
  killed.orphan_engines.every((o) =>
    engines.some(
      (engine) =>
        engine.owner.container_id === o.record.container_id &&
        engine.node.instance_id === killed.instance_id &&
        engine.owner.native_daemon.pid === o.record.native_daemon.pid &&
        engine.owner.native_daemon.start_ticks ===
          o.record.native_daemon.start_ticks,
    ),
  ),
);
assert.ok(
  phases.some(
    (p) =>
      p.phase === "AFTER_NODE_ENGINE_RESULT" &&
      p.request_id === "node-kill" &&
      p.pid === killed.pid &&
      p.instance_id === killed.instance_id,
  ),
);
const reaped = read("readbacks/parent-reaped.json");
assert.ok(reaped.length > 0 && reaped.every((r) => r.absent));
for (const orphan of killed.orphan_engines) {
  const matched = reaped.find(
    (r) => r.record.container_id === orphan.record.container_id,
  );
  assert.ok(matched && matched.was_present && matched.absent);
  assert.equal(matched.record.owner_id, orphan.record.owner_id);
}
const restarted = success("durable-restarted"),
  restartedOwner = nodeOwners.find(
    (n) => n.record.instance_id === restarted.instance_id,
  );
assert.ok(restartedOwner);
assert.notEqual(restarted.instance_id, killed.instance_id);
assert.equal(restarted.provenance.sequence, 6);
assert.equal(restarted.provenance.high_water, 6);
assert.equal(restarted.provenance.traffic_snapshot_id, sequenceMap.get(6));
assert.equal(restartedOwner.record.consumer_id, aOwner.record.consumer_id);
const parentCommands = read("runtime/commands.json");
for (const r of reaped.filter((r) => r.was_present))
  assert.ok(
    parentCommands.some(
      (c) =>
        c.exit_code === 0 &&
        c.args[0] === "rm" &&
        c.args.includes("-f") &&
        c.args.includes(r.record.container_name),
    ),
  );
for (const reapedEngine of reaped.filter((r) => r.was_present)) {
  const o = reapedEngine.record;
  assert.ok(
    parentCommands.some((command) => {
      if (
        command.exit_code !== 0 ||
        command.args[0] !== "inspect" ||
        command.args[1] !== o.container_name
      )
        return false;
      const actual = JSON.parse(bytes("runtime/" + command.stdout))[0];
      return (
        actual.Id === o.container_id &&
        actual.Name === "/" + o.container_name &&
        actual.Config.Labels["io.routelens.run_id"] === o.owner_id &&
        actual.Mounts.some(
          (m) =>
            m.Destination === "/work" &&
            rebase(m.Source) === rebase(o.work_directory),
        )
      );
    }),
    "No exact original parent ownership inspection / 부모의 정확한 원 소유권 검사 없음",
  );
}
const engineKilled = read("readbacks/engine-before-kill.json");
assert.ok(
  parentCommands.some(
    (c) =>
      c.exit_code === 0 &&
      c.args[0] === "kill" &&
      c.args[1] === engineKilled.ownership.record.container_name,
  ),
);
assert.equal(engineKilled.phase.request_id, "engine-kill");
assert.ok(
  phases.some(
    (p) =>
      p.phase === "AFTER_NODE_CANDIDATE_READY" &&
      p.engine_container !== engineKilled.ownership.record.container_name &&
      p.instance_id === engineKilled.phase.instance_id,
  ),
);
assert.equal(success("engine-recovered").provenance.sequence, 6);
const proxyRecords = read("proxy-requests.json");
for (const node of ["seoul-node-a", "seoul-node-b"])
  assert.ok(
    proxyRecords.some(
      (r) =>
        r.node_id === node &&
        r.status === 200 &&
        r.path.includes("/artifacts/"),
    ),
  );
assert.ok(
  proxyRecords.some(
    (r) =>
      r.node_id === "seoul-node-a" &&
      r.status === 502 &&
      r.proxy_transport_unavailable,
  ),
);
assert.ok(
  proxyRecords.some(
    (r) =>
      r.node_id === "seoul-node-b" &&
      r.status === 502 &&
      r.proxy_transport_unavailable,
  ),
);
assert.equal(success("publisher-outage").provenance.sequence, 6);
assert.ok(
  parentCommands.some(
    (c) =>
      c.exit_code === 0 &&
      c.args[0] === "pause" &&
      c.args[1] === owner.container,
  ),
);
assert.ok(
  parentCommands.some(
    (c) =>
      c.exit_code === 0 &&
      c.args[0] === "unpause" &&
      c.args[1] === owner.container,
  ),
);
const corrupt = allFiles.find((f) =>
  /^negative\/corrupt-generations\/[a-f0-9]{64}\/traffic\.tar$/.test(f),
);
assert.ok(corrupt);
assert.equal(bytes(corrupt).length, 7);
assert.notEqual(
  hash(bytes(corrupt)),
  read(path.dirname(corrupt) + "/manifest.json").traffic_sha256,
);
const deadline = read("readbacks/deadline-drain.json");
failure(deadline.response, 503, "REQUEST_DEADLINE");
assert.ok(
  deadline.request_elapsed_ms >= 29000 && deadline.request_elapsed_ms <= 32000,
);
assert.ok(deadline.draining_elapsed_ms <= 30000);
assert.equal(deadline.held_phase.request_id, "deadline-held");
const deadlineEngine = engines.find(
  (e) => e.owner.container_name === deadline.held_phase.engine_container,
);
assert.ok(deadlineEngine);
const deadlineEvents = read(
    rebase(deadlineEngine.node.runtime_root) + "/events.json",
  ),
  draining = deadlineEvents.find(
    (e) =>
      e.code === "DRAINING" &&
      e.generation_id === deadline.held_phase.generation_id,
  ),
  retired = deadlineEvents.find(
    (e) =>
      e.code === "RETIRED" &&
      e.generation_id === deadline.held_phase.generation_id,
  );
assert.ok(draining && retired);
const rawDrainMs = Date.parse(retired.at_utc) - Date.parse(draining.at_utc);
assert.ok(
  rawDrainMs >= 0 && rawDrainMs <= 30000,
  "Original node events exceed30s draining / 노드 원래 이벤트의 요청 마무리가30초를 초과합니다",
);
const release = deadlineEvents.find(
    (e) =>
      e.code === "LEASE_RELEASED" &&
      e.generation_id === deadline.held_phase.generation_id &&
      Date.parse(e.at_utc) >= Date.parse(draining.at_utc),
  ),
  lease = [...deadlineEvents]
    .reverse()
    .find(
      (e) =>
        e.code === "LEASED" &&
        e.generation_id === deadline.held_phase.generation_id &&
        Date.parse(e.at_utc) <= Date.parse(draining.at_utc),
    );
assert.ok(lease && release);
const rawLeaseMs = Date.parse(release.at_utc) - Date.parse(lease.at_utc);
assert.ok(rawLeaseMs >= 29000 && rawLeaseMs <= 32000);
const correction = read("readbacks/revoked-correction.json");
assert.equal(correction.revocations.length, 3);
assert.ok(correction.revocations.every((r) => r.status === 200));
assert.equal(correction.candidate.code, "FINALIZED");
for (const t of targetEdges) {
  const e = correction.candidate.draft.entries.find(
    (e) => e.edge_id === t.edge_id && e.forward === t.forward,
  );
  assert.equal(e.status, "INSUFFICIENT");
  assert.equal(e.speed_mps, null);
}
assert.equal(success("non-live-correction").provenance.sequence, 8);
assert.equal(
  success("non-live-correction").provenance.traffic_mode,
  "NO_LIVE_COVERAGE",
);
const before = success("before-expiry-offline");
assert.equal(before.provenance.sequence, 2);
assert.equal(before.provenance.traffic_mode, "LIVE");
assert.equal(before.provenance.checked_at_event_time, at(419999));
assert.equal(read("status/before-expiry-a.json").active.sequence, 8);
const expiredCandidate = read("readbacks/expiry-candidate-ready.json");
assert.equal(expiredCandidate.before_clock, at(419999));
assert.equal(expiredCandidate.publication.sequence, 9);
assert.equal(expiredCandidate.publication.valid_until, at(420000));
assert.ok(
  phases.some(
    (p) =>
      p.phase === "AFTER_NODE_CANDIDATE_READY" &&
      p.generation_id === expiredCandidate.phase.generation_id,
  ),
);
const expireOwner = engines.find(
  (e) => e.owner.container_name === expiredCandidate.phase.engine_container,
);
assert.ok(expireOwner);
assert.equal(expireOwner.generation.traffic_snapshot_id, sequenceMap.get(9));
const expireEvents = read(
  rebase(expireOwner.node.runtime_root) + "/events.json",
);
assert.ok(
  expireEvents.some(
    (e) =>
      e.code === "CANDIDATE_DISCARDED" &&
      e.generation_id === expiredCandidate.phase.generation_id,
  ),
);
assert.ok(
  !expireEvents.some(
    (e) =>
      e.code === "ACTIVATED" &&
      e.generation_id === expiredCandidate.phase.generation_id,
  ),
);
for (const [id, high] of [
  ["expired-a", 9],
  ["expired-b", 2],
]) {
  const r = success(id);
  assert.equal(r.provenance.traffic_snapshot_id, null);
  assert.equal(r.provenance.high_water, high);
  assert.equal(r.provenance.traffic_mode, "NO_USABLE_SNAPSHOT");
  assert.equal(r.provenance.checked_at_event_time, at(420000));
  assert.equal(shape(id), shape("baseline-a-1"));
  assert.ok(
    Math.abs(routeSummary(id).time - routeSummary("baseline-a-1").time) <= 1e-6,
  );
}
const forbidden =
  /"(?:token|password|database_url|private_jwk|contributor_id|trip_id|sample_id|runtime_root|generation_root|graph_directory|work_directory|container_name|container_id)"\s*:/;
for (const [id, r] of requests) {
  assert.ok(
    !forbidden.test(JSON.stringify(r.body)),
    "Private public response field / 공개 응답 비공개 필드: " + id,
  );
  assert.ok(!/postgres(?:ql)?:\/\//.test(JSON.stringify(r.body)));
}
for (const file of allFiles.filter(
  (f) => f.startsWith("status/") && f.endsWith(".json"),
))
  assert.ok(!forbidden.test(bytes(file).toString("utf8")), file);
const cleanup = read("runtime/cleanup.json");
assert.equal(cleanup.cleanup_verified, true);
assert.equal(cleanup.private_files_removed, true);
assert.equal(cleanup.processes_exited, true);
assert.ok(
  read("readbacks/ports-after-cleanup.json").every((p) => p.open === false),
);
assert.ok(owner.processes.every((p) => p.exited));
const containers = new Set([
  owner.container,
  ...engineOwners.map((e) => e.record.container_name),
]);
for (const c of parentCommands.filter((c) => c.args?.[0] === "create")) {
  const label = c.args.find(
      (a) => typeof a === "string" && a.startsWith("io.routelens.run_id="),
    ),
    i = c.args.indexOf("--name");
  if (label && i >= 0) {
    const uuid = label.slice("io.routelens.run_id=".length);
    assert.match(uuid, /^[a-f0-9-]{36}$/);
    assert.equal(c.args[i + 1], "routelens-p02-" + uuid);
    containers.add(c.args[i + 1]);
  }
}
// Include exact source-matching and blank-bundle engine names from their original command records.
for (const file of allFiles.filter((f) => f.endsWith("/commands.json"))) {
  const commands = read(file);
  if (!Array.isArray(commands)) continue;
  for (const c of commands) {
    if (c.args?.[0] !== "create") continue;
    const i = c.args.indexOf("--name"),
      label = c.args.find(
        (a) => typeof a === "string" && a.startsWith("io.routelens.run_id="),
      );
    if (i >= 0 && label) {
      const uuid = label.slice("io.routelens.run_id=".length);
      assert.match(uuid, /^[a-f0-9-]{36}$/);
      assert.equal(c.args[i + 1], "routelens-p02-" + uuid);
      containers.add(c.args[i + 1]);
    }
  }
}
const pids = [
  ...new Set(owner.processes.map((p) => p.pid).filter(Number.isInteger)),
];
const closedPorts = read("readbacks/ports-after-cleanup.json");
for (const item of closedPorts) {
  assert.ok(Number.isInteger(item.port) && item.port > 0 && item.port < 65536);
  assert.equal(item.open, false);
}
const proof = {
  expected_source: expectedSource,
  omitted_map_bytes: [...omitted.values()],
  allowed_map_omissions: [...allowedMissing.values()],
  live_resource_queries_performed: false,
  recorded_closed_ports: closedPorts,
  status: "PASS",
  source: manifest.source,
  graph_id: manifest.graph_id,
  implementation_sha256: manifest.implementation_sha256,
  required_cases: 32,
  unique_node_file_hashes_checked: hashed.size,
  graph_file_hashes_checked: graphHashes,
  standard_ed25519_publications_verified: publications.size,
  fresh_source: {
    trips: 15,
    traversals: 15,
    full_truth_traversals: 45,
    maximum_boundary_error_ms: maxBoundaryError,
    maximum_authored_duration_error_ms: maxAuthoredDurationError,
    independent_target_medians: medians,
  },
  original_source_http_batches_verified: sourceHttp.length,
  original_source_matching_attempts_verified: sourceAttempts.length,
  original_native_requests_verified: nativeRecords.length,
  api_successes_bound_to_distinct_native_records: routeFacts.length,
  route_bindings: routeFacts,
  all_runtime_slot_events_checked: eventCount,
  maximum_engine_slots: 2,
  request_deadline_observed_ms: deadline.request_elapsed_ms,
  request_lease_from_original_events_ms: rawLeaseMs,
  drain_from_original_events_ms: rawDrainMs,
  recorded_draining_elapsed_ms: deadline.draining_elapsed_ms,
  recorded_owned_containers: [...containers].sort(),
  recorded_owned_volume: owner.volume,
  recorded_unique_owned_pids: pids.length,
  limitations_en: [
    "Only recorded cleanup is checked; this host cannot establish current remote PID/container/volume/port absence. Exact excluded map bytes are listed and not byte-verified.",
    "Synthetic input and same-engine routing are not independent real-road accuracy or production availability certification.",
    "The loaded revoked-trust private configuration is deleted; independent inspection verifies same-consumer restart, new instance, accepted-state removal and high-water retention, without claiming reconstruction of the loaded private configuration.",
    "Durable consumer observations come from original authenticated node status and signed bytes; this script does not query a removed PostgreSQL instance.",
  ],
  limitations_ko: [
    "기록된 정리만 검사하며 현재 원격 PID·컨테이너·볼륨·포트 부재를 이 호스트에서 확인하지 않습니다. 정확히 열거한 제외 지도 바이트는 검증하지 않습니다.",
    "합성 입력·같은 엔진 경로 검사는 독립 실도로 정확도·운영 가용성 인증이 아닙니다.",
    "로드한 키 철회 비공개 설정은 삭제되어 같은 수신자 재시작·새 실행·수용 해제·최고순번 보존만 독립 확인하며 실제 로드 설정을 재구성했다고 주장하지 않습니다.",
    "영속 소비자 관측은 원 인증 노드 상태·서명 바이트에 근거하며 삭제된 PostgreSQL에 다시 질의하지 않습니다.",
  ],
  message_en:
    "Independent hosted selected-byte, standard-signature, native-HTTP and lifecycle inspection with recorded cleanup only.",
  message_ko:
    "원격 선별 원문 바이트·표준 서명·지속 HTTP·수명주기·기록된 정리를 독립 검사했습니다.",
};
fs.writeFileSync(output, JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(proof, null, 2));
