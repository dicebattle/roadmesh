/** Independent hosted selected-artifact P10 raw evidence inspection / P10 원격 선별 원문 독립 검사.
 * No production validators are imported. Execution is owned by main.
 * 생산 검증기를 가져오지 않으며 실행은 메인이 담당합니다. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const args = process.argv.slice(2);
assert.ok(
  args.length === 6 &&
    args[2] === "--output" &&
    args[4] === "--expected-source",
  "Usage / 사용법: node data/inspect-p10-evidence-hosted.mjs ROOT_GATEWAY GRAPH_DIR --output NEW_FILE_OUTSIDE_INPUTS --expected-source EXPECTED_SHA",
);
const root = fs.realpathSync(args[0]),
  graphRoot = fs.realpathSync(args[1]),
  output = path.resolve(args[3]);
const expectedSource = args[5];
assert.match(expectedSource, /^[a-f0-9]{40}$/);
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
try {
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
    return result.sort();
  }
  const allFiles = walk(),
    manifest = read("manifest.json"),
    owner = read("runtime/ownership.json"),
    graphManifest = graphRead("manifest.json");
  assert.equal(manifest.status, "PASS");
  assert.equal(manifest.cleanup_verified, true);
  assert.equal(manifest.source.dirty, false);
  assert.equal(manifest.source.commit, expectedSource);
  const expectedRuntime =
    "bebae7f5f5e7c8efed69627735ef82a2749570d1bba66937c3507dfe990dc538";
  const local = JSON.parse(
    fs.readFileSync("data/p10-main-20261025/manifest.json"),
  );
  assert.equal(local.implementation_sha256, expectedRuntime);
  assert.equal(manifest.implementation_sha256, expectedRuntime);
  assert.equal(manifest.graph_id, graphManifest.graph_id);
  assert.equal(
    manifest.graph_manifest_sha256,
    hash(graphBytes("manifest.json")),
  );
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
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(resolved))
        .digest("hex"),
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
    "gateway/bundle/graph.tar",
    read("bundle/manifest.json").graph_extract_sha256,
    "gateway/bundle/manifest.json",
  );
  assert.equal(allowedMissing.size, 16);
  const hashed = new Set();
  for (const [file, sha] of Object.entries(manifest.output_sha256)) {
    assert.match(sha, /^[a-f0-9]{64}$/);
    if (verifyBytes(root, file, sha, "gateway/" + file)) hashed.add(file);
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
  function graphWalk(relative = "") {
    const out = [];
    for (const e of fs.readdirSync(inside(graphRoot, relative), {
      withFileTypes: true,
    })) {
      assert.ok(!e.isSymbolicLink());
      const p = relative ? relative + "/" + e.name : e.name;
      if (e.isDirectory()) out.push(...graphWalk(p));
      else {
        assert.ok(e.isFile());
        out.push(p);
      }
    }
    return out.sort();
  }
  equal(
    graphWalk().filter((f) => f !== "manifest.json"),
    Object.keys(graphManifest.files_sha256 ?? graphManifest.output_sha256)
      .filter((f) => !omitted.has("graph/" + f))
      .sort(),
  );
  assert.equal(
    hash(
      Buffer.from(
        canonical({
          source_lock_sha256: graphManifest.source_lock_sha256,
          source_sha256: graphManifest.map_source.sha256,
          pbf_sha256: graphManifest.pbf_sha256,
          config_sha256: graphManifest.config_sha256,
          image: graphManifest.image,
          engine: graphManifest.engine,
          tile_sha256: graphManifest.tile_sha256,
        }),
      ),
    ),
    graphManifest.graph_id,
  );

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
  ].map((x) => "p10-" + x);
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
    maxAuthoredDurationError = Math.max(
      maxAuthoredDurationError,
      durationError,
    );
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
  assert.ok(
    db.traversals.every((t) => targets.has(t.edge_id + ":" + t.forward)),
  );
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
  assert.equal(publications.size, 3);
  equal(
    [...sequenceMap.keys()].sort((a, b) => a - b),
    [1, 2, 3],
  );
  for (let seq = 1; seq <= 2; seq++) {
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
  for (const seq of [3]) {
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
    "gateway/bundle/graph.tar",
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
  assert.ok(nodeOwners.length >= 2 && engineOwners.length > 0);
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
              [
                "0100007F:1F42",
                "0000000000000000FFFF00000100007F:1F42",
              ].includes(p[1]) && p[3] === "0A"
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
    engines.push({
      directory: dir,
      owner: o,
      node: node.record,
      generation: g,
    });
  }

  // P10-specific original response bindings follow. / P10 원응답 결합 검사가 이어집니다.

  const parentCommands = read("runtime/commands.json");
  assert.match(owner.run_id, /^[a-f0-9-]{36}$/);
  assert.equal(owner.container, "routelens-p05-" + owner.run_id);
  assert.equal(owner.volume, owner.container + "-db");
  const namespace = "p09-" + owner.run_id.replaceAll("-", "").slice(0, 16);
  assert.ok(
    roots.every(
      (r) => r.simulation_namespace === namespace && r.revoked === false,
    ),
  );
  const gatewayOwner = read("gateway/runtime/gateway-ownership.json");
  assert.equal(gatewayOwner.consumer_id, "p10-gateway");
  assert.equal(gatewayOwner.simulation_namespace, namespace);
  assert.equal(rebase(gatewayOwner.runtime_root), "gateway/runtime");
  assert.equal(gatewayOwner.graph_id, manifest.graph_id);
  assert.deepEqual(
    new Set(nodeOwners.map((n) => n.record.consumer_id)),
    new Set(["p10-node-a", "p10-node-b"]),
  );
  for (const o of nodeOwners)
    assert.equal(o.record.simulation_namespace, namespace);
  // The index and member headers are decoded directly, without trusting the compiler's offsets.
  // 변환기의 위치값을 신뢰하지 않고 목록과 멤버 헤더를 직접 해독합니다.
  function octal(b) {
    const s = b.toString("ascii").replace(/\0.*$/s, "").trim();
    assert.match(s, /^[0-7]+$/);
    return parseInt(s, 8);
  }
  const tar = [];
  let cursor = 0;
  while (cursor + 512 <= skeleton.length) {
    const h = skeleton.subarray(cursor, cursor + 512);
    if (h.every((x) => x === 0)) break;
    assert.equal(
      octal(h.subarray(148, 156)),
      h.reduce((sum, v, i) => sum + (i >= 148 && i < 156 ? 32 : v), 0),
    );
    assert.equal(h[156], 48);
    assert.equal(h.subarray(257, 263).toString(), "ustar\0");
    const name = h.subarray(0, 100).toString().replace(/\0.*$/s, ""),
      size = octal(h.subarray(124, 136)),
      offset = cursor + 512;
    assert.ok(offset + size <= skeleton.length);
    tar.push({ name, size, offset });
    cursor = offset + Math.ceil(size / 512) * 512;
  }
  assert.ok(
    skeleton.length - cursor >= 1024 &&
      skeleton.subarray(cursor).every((x) => x === 0),
  );
  assert.equal(tar[0].name, "index.bin");
  assert.equal(tar[0].offset, 512);
  assert.equal(tar[0].size % 16, 0);
  const tileNames = Object.keys(graphManifest.tile_sha256).sort();
  equal(
    tar
      .slice(1)
      .map((t) => t.name)
      .sort(),
    tileNames,
  );
  assert.equal(tar[0].size, tileNames.length * 16);
  const directMembers = [];
  for (let pos = 512; pos < 512 + tar[0].size; pos += 16) {
    const big = skeleton.readBigUInt64LE(pos);
    assert.ok(big <= BigInt(Number.MAX_SAFE_INTEGER));
    const offset = Number(big),
      base = skeleton.readUInt32LE(pos + 8),
      size = skeleton.readUInt32LE(pos + 12),
      t = tar.find((t) => t.offset === offset);
    assert.ok(t && t.size === size);
    const [level, ...parts] = t.name.split("/");
    assert.equal(
      base,
      Number(parts.join("").replace(/\.gph$/, "")) * 8 + Number(level),
    );
    assert.equal(skeleton.readBigUInt64LE(offset), BigInt(base));
    assert.equal(skeleton.readBigUInt64LE(offset + 8), 0n);
    assert.equal(skeleton.readUInt32LE(offset + 20), 3);
    assert.equal(skeleton.readUInt32LE(offset + 24), 0);
    assert.equal(skeleton.readUInt32LE(offset + 28), 0);
    const count = skeleton.readUInt32LE(offset + 16);
    assert.equal(size, 32 + count * 8);
    assert.ok(
      skeleton.subarray(offset + 32, offset + size).every((x) => x === 0),
    );
    directMembers.push({
      tile_base: base,
      offset,
      byte_length: size,
      directed_edge_count: count,
    });
  }
  equal(
    directMembers.sort((a, b) => a.offset - b.offset),
    [...bundle.members].sort((a, b) => a.offset - b.offset),
  );
  for (const c of catalog) {
    const id = BigInt(c.edge_id),
      m = directMembers.find(
        (m) => m.tile_base === Number(id & ((1n << 25n) - 1n)),
      );
    assert.ok(m && Number(id >> 25n) < m.directed_edge_count);
  }
  const generationFiles = allFiles.filter((f) =>
    /\/generations\/[a-f0-9]{64}\/manifest\.json$/.test(f),
  );
  for (const file of generationFiles) {
    const g = read(file),
      dir = path.dirname(file);
    assert.equal(g.generation_id, path.basename(dir));
    assert.equal(g.graph_id, manifest.graph_id);
    assert.equal(g.compiler_policy, "valhalla-current-v1");
    assert.equal(g.traffic_sha256, trafficHash(g.traffic_snapshot_id));
    assert.equal(hash(bytes(dir + "/traffic.tar")), g.traffic_sha256);
    assert.equal(bytes(dir + "/traffic.tar").length, skeleton.length);
  }
  assert.ok(generationFiles.some((f) => f.startsWith("gateway/generations/")));
  for (const file of allFiles.filter(
    (f) => f.endsWith("/events.json") && f.startsWith("nodes/"),
  )) {
    const events = read(file);
    for (const e of events) {
      assert.ok(e.slot_count >= 0 && e.slot_count <= 2);
      assert.ok(e.in_flight >= 0 && e.in_flight <= 8);
    }
  }
  const routeInputs = read("source/route-inputs.json");
  assert.equal(routeInputs.selected_before_native_routing, true);
  assert.equal(routeInputs.source_fraction, 0.35);
  assert.equal(routeInputs.target_fraction, 0.65);
  const middle = targetEdges[1];
  equal(routeInputs.original_geometry, middle.directed_geometry);
  assert.equal(routeInputs.target.edge_id, middle.edge_id);
  function position(points, offset) {
    const rad = Math.PI / 180,
      deg = 180 / Math.PI;
    let left = offset;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        d = length([a, b]);
      if (left <= d && d > 0) {
        if (left === 0) return a;
        const p = a[1] * rad,
          q = b[1] * rad,
          dl = (b[0] - a[0]) * rad,
          bearing = Math.atan2(
            Math.sin(dl) * Math.cos(q),
            Math.cos(p) * Math.sin(q) -
              Math.sin(p) * Math.cos(q) * Math.cos(dl),
          ),
          angle = left / 6371008.8,
          latitude = Math.asin(
            Math.sin(p) * Math.cos(angle) +
              Math.cos(p) * Math.sin(angle) * Math.cos(bearing),
          ),
          longitude =
            a[0] * rad +
            Math.atan2(
              Math.sin(bearing) * Math.sin(angle) * Math.cos(p),
              Math.cos(angle) - Math.sin(p) * Math.sin(latitude),
            );
        return [((longitude * deg + 540) % 360) - 180, latitude * deg];
      }
      left -= d;
    }
    return points.at(-1);
  }
  for (const [key, fraction] of [
    ["origin", 0.35],
    ["destination", 0.65],
  ]) {
    const actual = routeInputs.short[key],
      point = position(
        middle.directed_geometry,
        length(middle.directed_geometry) * fraction,
      );
    assert.ok(length([point, [actual.longitude, actual.latitude]]) < 1e-6);
  }
  assert.ok(
    Math.abs(
      routeInputs.expected_partial_distance_m -
        length(middle.directed_geometry) * 0.3,
    ) < 1e-6,
  );
  equal(routeInputs.long, {
    origin: { longitude: 127.029, latitude: 37.4984 },
    destination: { longitude: 127.049, latitude: 37.5045 },
  });
  function decode(s) {
    assert.equal(typeof s, "string");
    let i = 0,
      x = 0,
      y = 0;
    const out = [];
    function component() {
      let value = 0,
        shift = 0,
        b;
      do {
        assert.ok(i < s.length && shift <= 30);
        b = s.charCodeAt(i++) - 63;
        assert.ok(b >= 0 && b <= 63);
        value += (b & 31) * 2 ** shift;
        shift += 5;
      } while (b >= 32);
      return value % 2 ? -(value + 1) / 2 : value / 2;
    }
    while (i < s.length) {
      y += component();
      x += component();
      assert.ok(Math.abs(x) <= 180e6 && Math.abs(y) <= 90e6);
      out.push([x / 1e6, y / 1e6]);
    }
    assert.ok(out.length >= 2);
    return out;
  }
  const publicKeysAllow = [
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
  ].sort();
  const publicReplies = new Map(),
    gatewayRequests = new Map(),
    bindings = [],
    usedNative = new Set();
  for (const file of allFiles.filter((f) =>
    /^gateway\/runtime\/requests\/[^/]+\/request\.json$/.test(f),
  )) {
    const req = read(file),
      dir = path.dirname(file);
    assert.ok(!gatewayRequests.has(req.request_id));
    gatewayRequests.set(req.request_id, {
      dir,
      request: req,
      attempts: read(dir + "/attempts.json"),
      target: allFiles.includes(dir + "/target.json")
        ? read(dir + "/target.json")
        : null,
      result: read(dir + "/result.json"),
      statuses: allFiles.includes(dir + "/statuses.json")
        ? read(dir + "/statuses.json")
        : [],
    });
  }
  for (const file of allFiles.filter((f) =>
    /^requests\/[^/]+\.json$/.test(f),
  )) {
    const r = read(file),
      id = path.basename(file, ".json");
    publicReplies.set(id, r);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.ok(
      Number.isFinite(r.elapsed_ms) &&
        r.elapsed_ms >= 0 &&
        r.elapsed_ms <= 12500,
    );
    if (r.status !== 200) continue;
    const b = r.body,
      input = r.request,
      gw = gatewayRequests.get(input.request_id);
    assert.ok(gw);
    equal(gw.request, input);
    equal(Object.keys(b).sort(), publicKeysAllow);
    assert.equal(b.request_id, input.request_id);
    assert.equal(b.request_sha256, hash(Buffer.from(canonical(input))));
    assert.equal(b.graph_id, manifest.graph_id);
    assert.equal(b.engine_version, "3.9.1");
    assert.equal(b.image_id, graphManifest.image.id);
    assert.equal(b.costing_config_id, "valhalla-current-v1");
    assert.ok(Number.isFinite(Date.parse(b.calculated_at)));
    equal(
      Object.keys(input).sort(),
      [
        "schema_version",
        "request_id",
        "origin",
        "destination",
        "profile",
        "traffic_policy",
      ].sort(),
    );
    assert.equal(input.schema_version, "0.1");
    assert.equal(input.profile, "car");
    assert.equal(input.traffic_policy, "prefer_live");
    equal(gw.result.body, b);
    assert.equal(gw.result.status, 200);
    assert.ok(gw.attempts.length >= 1 && gw.attempts.length <= 2);
    const successful = gw.attempts.filter((a) => a.outcome === "VALIDATED");
    assert.equal(successful.length, 1);
    const a = successful[0],
      n = a.body,
      p = n.provenance;
    assert.equal(n.request_id, input.request_id);
    assert.equal(n.node_id, b.node_id);
    assert.equal(a.node_id, b.node_id);
    assert.equal(p.generation_id, b.generation_id);
    assert.equal(p.traffic_snapshot_id, b.snapshot_id);
    assert.equal(p.sequence, b.sequence);
    assert.equal(p.traffic_sha256, b.traffic_sha256);
    assert.equal(gw.target.generation_id, b.generation_id);
    assert.equal(gw.target.snapshot_id, b.snapshot_id);
    assert.equal(p.engine.image_id, graphManifest.image.id);
    assert.equal(p.engine.version, "3.9.1");
    const ordinary = {
      locations: [
        { lon: input.origin.longitude, lat: input.origin.latitude },
        { lon: input.destination.longitude, lat: input.destination.latitude },
      ],
      costing: "auto",
      units: "kilometers",
      language: "en-US",
      date_time: { type: 0 },
    };
    equal(n.engine_result.request, ordinary);
    equal(gw.target.expected_native, ordinary);
    assert.equal(
      gw.target.expected_native_sha256,
      hash(Buffer.from(canonical(ordinary))),
    );
    const matches = nativeRecords.filter(
      (x) =>
        !usedNative.has(x.directory) &&
        x.node.node_id === n.node_id &&
        x.node.instance_id === n.instance_id &&
        x.generation.generation_id === p.generation_id &&
        x.owner.native_daemon.pid === p.native_daemon.pid &&
        x.owner.native_daemon.start_ticks === p.native_daemon.start_ticks &&
        canonical(x.request) === canonical(n.engine_result.request) &&
        canonical(x.route) === canonical(n.engine_result.route) &&
        canonical(x.trace) === canonical(n.engine_result.trace),
    );
    assert.ok(
      matches.length > 0,
      "No exact original native pair / 정확한 원래 네이티브 쌍 없음: " + id,
    );
    const native = matches[0];
    usedNative.add(native.directory);
    const trip = native.route.trip;
    assert.equal(trip.status, 0);
    assert.equal(trip.legs.length, 1);
    const geometry = decode(trip.legs[0].shape),
      trace = native.trace,
      traceGeometry = decode(trace.shape);
    assert.equal(geometry.length, traceGeometry.length);
    assert.ok(
      geometry.every((p, i) =>
        p.every((x, j) => Math.abs(x - traceGeometry[i][j]) <= 0.000001000001),
      ),
    );
    equal(b.geometry, { type: "LineString", coordinates: geometry });
    assert.equal(b.distance_m, trip.summary.length * 1000);
    assert.equal(b.duration_s, trip.summary.time);
    assert.ok(
      Number.isFinite(b.distance_m) &&
        b.distance_m >= 0 &&
        Number.isFinite(b.duration_s) &&
        b.duration_s >= 0,
    );
    assert.equal(trace.units, "kilometers");
    const live = new Set(
      b.snapshot_id
        ? publications
            .get(b.snapshot_id)
            .snapshot.entries.filter((e) => e.status === "LIVE")
            .map((e) => e.edge_id)
        : [],
    );
    let total = 0,
      covered = 0;
    for (const [i, e] of trace.edges.entries()) {
      assert.ok(
        Number.isSafeInteger(e.id) &&
          e.id >= 0 &&
          Number.isFinite(e.length) &&
          e.length >= 0,
      );
      const source = e.source_percent_along ?? 0,
        target = e.target_percent_along ?? 1;
      assert.ok(source >= 0 && target <= 1 && source <= target);
      assert.ok(i === 0 || e.source_percent_along === undefined);
      assert.ok(
        i === trace.edges.length - 1 || e.target_percent_along === undefined,
      );
      total += e.length * 1000;
      if (live.has(String(e.id))) covered += e.length * 1000;
    }
    // Already trimmed three-decimal km lengths; do not multiply fractions again.
    // 이미 잘린 소수 세 자리 km 길이이며 부분 비율을 다시 곱하지 않습니다.
    assert.ok(total > 0);
    const tolerance = trace.edges.length * 0.5 + 2;
    assert.ok(Math.abs(total - b.distance_m) <= tolerance);
    assert.ok(
      Math.abs(length(geometry) - b.distance_m) <=
        Math.max(tolerance, b.distance_m * 0.01),
    );
    const ratio = covered / total;
    assert.ok(
      Math.abs(b.live_coverage_ratio - ratio) < 1e-12 &&
        ratio >= 0 &&
        ratio <= 1,
    );
    assert.equal(b.traffic_mode, ratio > 0 ? "LIVE_MIXED" : "BASE_ONLY");
    assert.equal(b.traffic_sha256, trafficHash(b.snapshot_id));
    assert.ok(Array.isArray(b.warnings));
    for (const w of b.warnings) {
      equal(Object.keys(w).sort(), ["code", "message_en", "message_ko"].sort());
      assert.ok(typeof w.code === "string" && w.message_en && w.message_ko);
    }
    if (ratio === 0)
      assert.equal(
        b.warnings[0].code,
        b.snapshot_id ? "NO_ROUTE_LIVE_COVERAGE" : "NO_USABLE_SNAPSHOT",
      );
    bindings.push({
      request_id: input.request_id,
      node_id: n.node_id,
      instance_id: n.instance_id,
      native_directory: native.directory,
      pid: p.native_daemon.pid,
      start_ticks: p.native_daemon.start_ticks,
      generation_id: b.generation_id,
      sequence: b.sequence,
      distance_m: b.distance_m,
      duration_s: b.duration_s,
      trace_partial_length_m: total,
      live_partial_length_m: covered,
      live_coverage_ratio: ratio,
      exact_matching_native_candidates: matches.length,
    });
  }
  assert.ok(bindings.length >= 16);
  for (const gw of gatewayRequests.values()) {
    assert.ok(gw.attempts.length <= 2);
    for (const [i, a] of gw.attempts.entries()) {
      assert.equal(a.attempt, i + 1);
      assert.ok(
        Number.isInteger(a.deadline_ms) &&
          a.deadline_ms >= 1 &&
          a.deadline_ms <= 4000,
      );
      assert.ok(
        a.elapsed_start_ms >= 0 &&
          a.elapsed_end_ms >= a.elapsed_start_ms &&
          a.elapsed_end_ms <= 12500,
      );
      if (i) assert.ok(a.elapsed_start_ms >= gw.attempts[i - 1].elapsed_end_ms);
      assert.equal(a.request.expected_generation_id, gw.target.generation_id);
      equal(a.request.locations, gw.target.expected_native.locations);
      assert.equal(a.request.graph_id, manifest.graph_id);
      assert.equal(a.request.request_id, gw.request.request_id);
    }
    if (gw.attempts.length === 2)
      assert.notEqual(gw.attempts[0].node_id, gw.attempts[1].node_id);
  }
  function reply(id) {
    assert.ok(
      publicReplies.has(id),
      "Missing original HTTP / 원 HTTP 누락: " + id,
    );
    return publicReplies.get(id);
  }
  function failure(id, status, reason) {
    const r = typeof id === "string" ? reply(id) : id;
    assert.equal(r.status, status);
    equal(
      Object.keys(r.body).sort(),
      ["code", "reason", "message_en", "message_ko"].sort(),
    );
    assert.equal(r.body.code, "ERROR");
    assert.equal(r.body.reason, reason);
    assert.ok(r.body.message_en && r.body.message_ko);
  }
  for (const [id, status, reason] of [
    ["unauthorized", 401, "AUTH_REQUIRED"],
    ["invalid-latitude", 422, "INVALID_INPUT"],
    ["invalid-profile", 422, "INVALID_INPUT"],
    ["invalid-schema", 422, "INVALID_INPUT"],
    ["invalid-unknown", 422, "INVALID_INPUT"],
    ["body-limit", 422, "INVALID_INPUT"],
    ["body-limit-chunked", 422, "INVALID_INPUT"],
    ["unsupported-policy", 422, "UNSUPPORTED_POLICY"],
    ["no-matching-node", 503, "NO_HEALTHY_NODE"],
    ["both-down", 503, "NO_HEALTHY_NODE"],
    ["retry-once", 503, "NO_HEALTHY_NODE"],
    ["propagated-node-deadline", 503, "NO_HEALTHY_NODE"],
    ["shared-deadline", 504, "DEADLINE_EXCEEDED"],
    ["admission-ninth", 429, "RATE_LIMITED"],
    ["result-version-change", 409, "TRAFFIC_CHANGED"],
    ["store-outage", 503, "STORE_UNAVAILABLE"],
  ])
    failure(id, status, reason);
  for (const [id, reason, mode] of [
    ["wrong-generation-rejected", "WRONG_GENERATION", "wrong-generation"],
    ["wrong-request-rejected", "WRONG_REQUEST", "wrong-request"],
    ["malformed-route-rejected", "INVALID_ROUTE", "malformed"],
    ["oversized-response-rejected", "OVERSIZED_RESPONSE", "oversized"],
    ["redirect-rejected", "REDIRECT_REJECTED", "redirect"],
  ]) {
    failure(id, 503, "NO_HEALTHY_NODE");
    const gw = gatewayRequests.get(id);
    assert.equal(gw.attempts.length, 2);
    assert.ok(gw.attempts.every((a) => a.reason === reason));
  }
  const proxy = read("proxies/node-requests.json");
  assert.ok(proxy.length > 0 && proxy.every((r) => r.test_proxy === true));
  for (const [id, mode] of [
    ["wrong-generation-rejected", "wrong-generation"],
    ["wrong-request-rejected", "wrong-request"],
    ["malformed-route-rejected", "malformed"],
    ["oversized-response-rejected", "oversized"],
    ["redirect-rejected", "redirect"],
  ]) {
    const records = proxy.filter(
      (r) => r.request?.request_id === id && r.path === "/internal/v1/route",
    );
    assert.equal(records.length, 2);
    assert.ok(records.every((r) => r.mode === mode));
    for (const r of records) {
      if (mode === "oversized") assert.ok(r.byte_length > 2 * 1024 * 1024);
      else if (mode === "redirect") assert.equal(r.status, 302);
      else {
        assert.equal(r.original_status, 200);
        assert.ok(
          nativeRecords.some(
            (n) =>
              canonical(n.request) ===
                canonical(r.original_body.engine_result.request) &&
              canonical(n.route) ===
                canonical(r.original_body.engine_result.route) &&
              canonical(n.trace) ===
                canonical(r.original_body.engine_result.trace),
          ),
        );
      }
    }
  }
  assert.equal(reply("body-limit-chunked").transfer_encoding, "chunked");
  assert.ok(Buffer.byteLength(reply("body-limit-chunked").raw_body) > 65536);
  assert.ok(Buffer.byteLength(reply("body-limit").raw_body) > 65536);
  const invalidConfigs = read("negative/configured-origins.json");
  assert.equal(invalidConfigs.length, 2);
  assert.ok(invalidConfigs.every((c) => c.exit.code !== 0 && !c.ready));
  for (const id of ["no-matching-node", "both-down"])
    assert.equal(gatewayRequests.get(id).attempts.length, 0);
  for (const id of ["stale-node-excluded", "primary-kill-failover"])
    assert.equal(gatewayRequests.get(id).attempts.length, 1);
  for (const id of ["primary-unavailable-retry", "retry-once"])
    assert.equal(gatewayRequests.get(id).attempts.length, 2);
  assert.equal(
    reply("stale-node-excluded").body.node_id,
    "seoul-gateway-node-b",
  );
  assert.equal(
    reply("primary-kill-failover").body.node_id,
    "seoul-gateway-node-b",
  );
  const baseline = reply("baseline").body,
    live = reply("live-primary").body,
    detour = reply("live-detour").body,
    expired = reply("exact-expiry").body;
  assert.equal(baseline.snapshot_id, null);
  assert.equal(live.sequence, 1);
  assert.equal(live.traffic_mode, "LIVE_MIXED");
  assert.ok(live.live_coverage_ratio > 0);
  equal(
    {
      origin: reply("live-primary").request.origin,
      destination: reply("live-primary").request.destination,
    },
    routeInputs.short,
  );
  assert.ok(live.distance_m < length(middle.directed_geometry));
  assert.equal(detour.live_coverage_ratio, 0);
  assert.equal(detour.traffic_mode, "BASE_ONLY");
  assert.ok(
    detour.distance_m > baseline.distance_m + 50 &&
      detour.duration_s > baseline.duration_s + 5,
  );
  assert.notEqual(canonical(detour.geometry), canonical(baseline.geometry));
  equal(expired.geometry, baseline.geometry);
  assert.ok(Math.abs(expired.duration_s - baseline.duration_s) <= 1e-6);
  assert.equal(expired.snapshot_id, null);
  const changed = gatewayRequests.get("result-version-change");
  assert.equal(changed.target.sequence, 1);
  assert.equal(changed.attempts.length, 1);
  assert.equal(changed.attempts[0].body.provenance.sequence, 1);
  for (const [label, seq, empty] of [
    ["live", 1, false],
    ["version-change", 2, false],
    ["correction", 3, false],
    ["expiry", 3, true],
  ]) {
    const sql = read("readbacks/sql-" + label + ".json");
    assert.match(
      sql.query,
      /SELECT namespace,consumer_id,publisher_id,region_id,high_water,last_snapshot_id,octet_length\(artifact\)/,
    );
    assert.equal(sql.namespace, namespace);
    assert.equal(sql.rows.length, 3);
    equal(sql.rows.map((r) => r.consumer_id).sort(), [
      "p10-gateway",
      "p10-node-a",
      "p10-node-b",
    ]);
    for (const r of sql.rows) {
      assert.equal(r.namespace, namespace);
      assert.equal(Number(r.high_water), seq);
      assert.equal(r.last_snapshot_id, sequenceMap.get(seq));
      assert.equal(r.publisher_id, roots[0].publisher_id);
      if (empty) assert.equal(r.artifact_bytes, null);
      else
        assert.equal(
          r.artifact_bytes,
          bytes("public/sequence-" + seq + ".json").length,
        );
    }
  }
  const correction = read("readbacks/non-live-source.json");
  assert.equal(correction.revoked.length, 3);
  assert.ok(correction.revoked.every((r) => r.status === 200));
  assert.equal(correction.corrected.code, "FINALIZED");
  assert.equal(
    correction.corrected.draft.entries.filter((e) => e.status === "LIVE")
      .length,
    0,
  );
  assert.equal(
    reply("non-live-correction").body.snapshot_id,
    sequenceMap.get(3),
  );
  assert.equal(reply("non-live-correction").body.live_coverage_ratio, 0);
  assert.equal(reply("before-expiry").body.snapshot_id, sequenceMap.get(3));
  const processes = read("process-events.json"),
    phases = processes.flatMap((p) =>
      p.messages.filter((m) => m.type === "PHASE"),
    );
  assert.ok(
    processes.some(
      (p) =>
        p.role === "p10-gateway" &&
        p.messages.some(
          (m) => m.type === "READY" && m.kind === "route-gateway",
        ),
    ),
  );
  const kill = read("readbacks/primary-sigkill.json");
  assert.equal(kill.exit.signal, "SIGKILL");
  assert.equal(kill.node_id, "seoul-gateway-node-a");
  assert.ok(
    processes.some((p) => p.pid === kill.pid && p.signal === "SIGKILL"),
  );
  const reaped = read("readbacks/primary-parent-reaped.json");
  assert.ok(reaped.length > 0);
  for (const item of reaped) {
    assert.ok(item.absent || item.already_absent);
    if (item.exact_inspect) {
      const o = item.owner,
        d = item.exact_inspect;
      assert.equal(d.Id, o.container_id);
      assert.equal(d.Name, "/" + o.container_name);
      assert.equal(d.Config.Labels["io.routelens.run_id"], o.owner_id);
      assert.ok(
        d.Mounts.some(
          (m) =>
            m.Destination === "/work" &&
            rebase(m.Source) === rebase(o.work_directory),
        ),
      );
      assert.ok(
        parentCommands.some(
          (c) =>
            c.args[0] === "rm" && c.args.includes(d.Id) && c.exit_code === 0,
        ),
      );
    }
  }
  assert.ok(
    parentCommands.some(
      (c) =>
        c.args[0] === "pause" &&
        c.args[1] === owner.container &&
        c.exit_code === 0,
    ),
  );
  assert.ok(
    parentCommands.some(
      (c) =>
        c.args[0] === "unpause" &&
        c.args[1] === owner.container &&
        c.exit_code === 0,
    ),
  );
  for (const e of engineOwners) {
    const dir = path.dirname(e.file),
      cleanupFile = dir + "/cleanup.json";
    if (allFiles.includes(cleanupFile))
      assert.equal(read(cleanupFile).cleanup_verified, true);
    else
      assert.ok(
        reaped.some(
          (r) =>
            r.owner.container_id === e.record.container_id &&
            (r.absent || r.already_absent),
        ),
        "No exact engine cleanup / 정확 엔진 정리 근거 없음",
      );
  }
  const propagated = read("readbacks/propagated-node-deadline.json");
  failure(propagated.reply, 503, "NO_HEALTHY_NODE");
  assert.equal(propagated.leased.in_flight, 1);
  assert.equal(propagated.released.in_flight, 0);
  assert.equal(propagated.proxy_requests.length, 1);
  const header = Number(propagated.proxy_requests[0].deadline_ms);
  assert.ok(Number.isInteger(header) && header >= 1 && header <= 4000);
  assert.ok(
    propagated.lease_observed_elapsed_ms >= 0 &&
      propagated.lease_observed_elapsed_ms <= header + 500,
  );
  assert.equal(propagated.lease_bound_ms, header + 500);
  assert.ok(
    phases.some(
      (p) =>
        p.phase === "AFTER_NODE_ENGINE_RESULT" &&
        p.request_id === "propagated-node-deadline",
    ),
  );
  const disconnect = read("readbacks/client-disconnect.json");
  assert.equal(disconnect.client_destroyed, true);
  assert.equal(disconnect.before.in_flight, 1);
  assert.equal(disconnect.after.in_flight, 0);
  assert.equal(disconnect.gateway_after_abort.in_flight, 0);
  assert.ok(
    disconnect.gateway_release_after_abort_ms >= 0 &&
      disconnect.gateway_release_after_abort_ms <= 500,
  );
  assert.ok(
    Number.isInteger(disconnect.propagated_deadline_ms) &&
      disconnect.propagated_deadline_ms >= 1 &&
      disconnect.propagated_deadline_ms <= 4000,
  );
  assert.ok(
    disconnect.node_lease_observed_elapsed_ms >= 0 &&
      disconnect.node_lease_observed_elapsed_ms <=
        disconnect.propagated_deadline_ms + 500,
  );
  assert.equal(disconnect.proxy_requests.length, 1);
  assert.equal(
    Number(disconnect.proxy_requests[0].deadline_ms),
    disconnect.propagated_deadline_ms,
  );
  assert.ok(
    phases.some(
      (p) =>
        p.phase === "AFTER_NODE_ENGINE_RESULT" &&
        p.request_id === "client-disconnect",
    ),
  );
  const shared = read("readbacks/shared-deadline.json");
  failure(shared.reply, 504, "DEADLINE_EXCEEDED");
  assert.ok(shared.elapsed_ms >= 12000 && shared.elapsed_ms <= 12500);
  assert.equal(shared.status.in_flight, 0);
  assert.ok(
    phases.some(
      (p) =>
        p.phase === "AFTER_GATEWAY_SELECTION" &&
        p.request_id === "shared-deadline",
    ),
  );
  assert.equal(read("status/admission-eight.json").in_flight, 8);
  for (let i = 0; i < 8; i++) {
    assert.ok(
      phases.some(
        (p) =>
          p.phase === "AFTER_GATEWAY_SELECTION" &&
          p.request_id === "admission-" + i,
      ),
    );
    assert.equal(reply("admission-" + i).status, 200);
  }
  assert.ok(
    phases.some(
      (p) =>
        p.phase === "AFTER_GATEWAY_NODE_RESULT" &&
        p.request_id === "result-version-change",
    ),
  );
  const outage = read("readbacks/publisher-outage.json");
  assert.ok(outage.some((r) => r.status === 502 && r.configured_http_502));
  assert.equal(reply("publisher-outage").body.sequence, 2);
  const forbidden =
    /"(?:token|password|database_url|private_jwk|contributor_id|trip_id|sample_id|native_daemon|container_name|container_id|runtime_root|generation_root|engine_result|trace)"\s*:/;
  for (const [id, r] of publicReplies) {
    assert.ok(!forbidden.test(JSON.stringify(r.body)), id);
    assert.ok(!/postgres(?:ql)?:\/\//.test(JSON.stringify(r.body)), id);
  }
  assert.equal(read("gateway/runtime/cleanup.json").cleanup_verified, true);
  assert.equal(read("gateway/runtime/cleanup.json").in_flight, 0);

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
    assert.equal(item.open, false);
    assert.ok(
      Number.isInteger(item.port) && item.port > 0 && item.port < 65536,
    );
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
    original_hashes_checked: hashed.size,
    graph_hashes_checked: graphHashes,
    standard_ed25519_publications_verified: publications.size,
    fresh_source: {
      trips: 15,
      stored_traversals: 15,
      truth_traversals: 45,
      max_boundary_error_ms: maxBoundaryError,
      max_authored_duration_error_ms: maxAuthoredDurationError,
      independent_medians: medians,
    },
    source_namespace: namespace,
    gateway_consumer_id: gatewayOwner.consumer_id,
    native_original_pairs: nativeRecords.length,
    api_successes_bound: bindings.length,
    bindings,
    partial_route_inputs_independently_checked: routeInputs.short,
    maximum_engine_slots: 2,
    propagated_lease_elapsed_ms: propagated.lease_observed_elapsed_ms,
    propagated_header_ms: header,
    shared_deadline_ms: shared.elapsed_ms,
    client_abort_gateway_release_ms: disconnect.gateway_release_after_abort_ms,
    recorded_owned_containers: [...containers].sort(),
    recorded_owned_volume: owner.volume,
    recorded_owned_host_pids: pids.length,
    limitations_en: [
      "Recorded cleanup only; no current remote PID/container/volume/port lookup is performed. Exact excluded map bytes are listed and not byte-verified; every present inventoried file remains hashed.",
      "Authored synthetic input and approved local native peers are not independent real-road accuracy or malicious-peer consensus proof.",
      "Adversarial responses are explicit HTTP test proxies. Configured HTTP502 is not packet-loss proof.",
      "SQL checks inspect preserved query/readback bytes; the removed database is not queried again.",
      "The native protocol omits the public request ID. Each API success is assigned one distinct exact matching native request/route/trace pair with node instance, daemon and generation identity; identical repeated calculations can have several matching raw candidates.",
      "Timing readbacks combine original recorded monotonic measurements with confirmed private phases and native lease state. These are measured pilot bounds, not production latency certification.",
    ],
    limitations_ko: [
      "기록된 정리만 검사하고 현재 원격 PID·컨테이너·볼륨·포트에는 질의하지 않습니다. 정확히 열거한 제외 지도 바이트는 검증하지 않으며 존재하는 모든 목록 파일의 해시는 검사합니다.",
      "자체 합성 입력·승인 로컬 엔진은 독립 실도로 정확도·악성노드 합의 근거가 아닙니다.",
      "적대 응답은 명시 HTTP 시험대리서버이며 설정한502는 패킷손실 근거가 아닙니다.",
      "SQL은 보존한 질의·읽기 바이트를 검사하며 제거된 DB를 다시 조회하지 않습니다.",
      "네이티브 규격에는 공개요청ID가 없어 노드실행·데몬·세대와 정확히 같은 요청/경로/추적 원문쌍을 성공별로 하나씩 연결합니다. 동일 반복계산은 여러 원문후보가 일치할 수 있습니다.",
      "시간은 보존한 단조 측정과 확인된 비공개 단계·고정요청 상태를 함께 검사하며 운영 지연 보장이 아닙니다.",
    ],
    message_en:
      "Independent hosted selected-artifact P10 original evidence inspection.",
    message_ko: "원격 선별 P10 원문 근거 독립 검사.",
  };
  fs.writeFileSync(output, JSON.stringify(proof, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  const failed = {
    status: "FAIL",
    error_en: String(error?.stack ?? error),
    message_en:
      "Independent inspection failed; no missing evidence was manufactured.",
    message_ko:
      "독립 검사가 실패했으며 누락 근거를 만들어 보충하지 않았습니다.",
  };
  fs.writeFileSync(output, JSON.stringify(failed, null, 2) + "\n", {
    flag: "wx",
  });
  console.error(JSON.stringify(failed, null, 2));
  process.exitCode = 1;
}
