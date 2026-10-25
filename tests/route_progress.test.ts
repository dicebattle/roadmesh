import test from "node:test";
import assert from "node:assert/strict";
import {
  RouteProgress,
  routeBinding,
  type ProgressFix,
} from "../tools/route_progress.js";
import { geodesicSphere as geo } from "../tools/geodesy.js";
import { buildProgressReplay } from "../tools/progress_replay.js";
import { InputError as SharedError } from "../tools/shared.js";
import { InputError as BrowserError } from "../tools/input_error.js";
import type { GatewaySuccess } from "../tools/gateway_public_types.js";
const line = [
    [127, 37.5],
    [127.001, 37.5],
    [127.002, 37.5],
  ],
  length = geo.length(line),
  half = geo.distance(line[0]!, line[1]!);
function route(): GatewaySuccess {
  return {
    request_id: "unit-progress",
    request_sha256: "a".repeat(64),
    graph_id: "b".repeat(64),
    generation_id: "c".repeat(64),
    geometry: { type: "LineString", coordinates: structuredClone(line) },
    distance_m: length,
    duration_s: 20,
    guidance: {
      schema_version: "0.1",
      language: "en-US",
      maneuvers: [
        {
          index: 0,
          native_type: 1,
          instruction: "Drive east.",
          distance_m: half,
          duration_s: 10,
          begin_shape_index: 0,
          end_shape_index: 1,
        },
        {
          index: 1,
          native_type: 10,
          instruction: "Turn right.",
          distance_m: length - half,
          duration_s: 10,
          begin_shape_index: 1,
          end_shape_index: 2,
        },
        {
          index: 2,
          native_type: 4,
          instruction: "Arrive.",
          distance_m: 0,
          duration_s: 0,
          begin_shape_index: 2,
          end_shape_index: 2,
        },
      ],
    },
  } as GatewaySuccess;
}
function fix(
  r: GatewaySuccess,
  along: number,
  time: number,
  north = 0,
): ProgressFix {
  const p = geo.offset(geo.position(r.geometry.coordinates, along), 0, north);
  return {
    binding: routeBinding(r),
    source_class: "SYNTHETIC",
    event_time_ms: time,
    longitude: p[0]!,
    latitude: p[1]!,
    accuracy_m: 4,
  };
}
test("same geodesy and error identity reach browser without changing legacy failures / 브라우저 구면 계산·기존 오류 식별 유지", () => {
  assert.equal(SharedError, BrowserError);
  assert.throws(() => geo.distance([181, 0], [0, 0]), SharedError);
});
test("next native instruction and remaining geometry advance only after a crossed boundary / 경계를 지난 뒤 다음 원 안내·남은 거리", () => {
  const r = route(),
    t = new RouteProgress(r);
  let s = t.observe(fix(r, 0, 0), 0).state;
  assert.equal(s.status, "ON_ROUTE");
  assert.equal(s.next_maneuver!.index, 1);
  assert.ok(Math.abs(s.remaining_m! - length) < 0.01);
  s = t.observe(fix(r, half + 2, 3000), 3000).state;
  assert.equal(s.next_maneuver!.index, 1);
  s = t.observe(fix(r, half + 4, 4000), 4000).state;
  assert.equal(s.next_maneuver!.index, 2);
  assert.ok(Math.abs(s.remaining_m! - (length - half - 4)) < 0.01);
});
test("wrong route invalid input duplicate and time order never fabricate progress / 다른 경로·오류·중복·역순 진행 차단", () => {
  const r = route(),
    t = new RouteProgress(r);
  t.observe(fix(r, 0, 0), 0);
  const old = t.snapshot();
  const foreign = fix(r, 10, 1000);
  foreign.binding.generation_id = "d".repeat(64);
  assert.equal(t.observe(foreign, 1000).reason, "WRONG_ROUTE");
  assert.deepEqual(t.snapshot(), old);
  assert.equal(t.observe(fix(r, 10, 0), 0).reason, "DUPLICATE_FIX");
  assert.equal(t.observe(fix(r, 10, 500), 1000).accepted, true);
  const progress = t.snapshot().last_confirmed_progress_m;
  assert.equal(t.observe(fix(r, 90, 400), 1100).reason, "OUT_OF_ORDER");
  assert.equal(t.snapshot().last_confirmed_progress_m, progress);
  for (const mutate of [
    (v: any) => (v.accuracy_m = 26),
    (v: any) => (v.longitude = Infinity),
    (v: any) => (v.extra = true),
    (v: any) => (v.heading_degrees = 360),
    (v: any) => (v.source_class = "REAL"),
  ]) {
    const bad = fix(r, 20, 2000);
    mutate(bad);
    assert.equal(t.observe(bad, 2000).accepted, false);
    assert.equal(t.snapshot().next_maneuver, null);
  }
});
test("stale future samples and clock rewind cannot revive guidance / 오래됨·미래·시각 역행으로 안내 복구 금지", () => {
  const r = route(),
    t = new RouteProgress(r);
  t.observe(fix(r, 0, 0), 0);
  assert.equal(t.observe(fix(r, 10, 2000), 1000).reason, "FUTURE_FIX");
  assert.equal(t.advance(6000).status, "STALE");
  assert.equal(t.snapshot().confirmed_position, null);
  assert.equal(t.observe(fix(r, 10, 6001), 5999).reason, "INVALID_CLOCK");
  assert.throws(() => t.advance(5000));
  assert.equal(t.observe(fix(r, 10, 1000), 7000).reason, "STALE_FIX");
  assert.equal(t.snapshot().remaining_m, null);
});
test("one GPS outlier cannot confirm off-route and invalid points break the streak / 단일 오차 이탈 확정 금지·거부 표본 연속 차단", () => {
  const r = route(),
    t = new RouteProgress(r);
  t.observe(fix(r, 0, 0), 0);
  assert.equal(
    t.observe(fix(r, 20, 1000, 80), 1000).state.status,
    "OFF_ROUTE_PENDING",
  );
  assert.equal(t.observe(fix(r, 20, 2000), 2000).state.status, "ON_ROUTE");
  t.observe(fix(r, 20, 3000, 80), 3000);
  t.observe(fix(r, 20, 4000, 80), 4000);
  const bad = fix(r, 20, 5000, 80);
  bad.accuracy_m = 90;
  t.observe(bad, 5000);
  assert.equal(
    t.observe(fix(r, 20, 6000, 80), 6000).state.status,
    "OFF_ROUTE_PENDING",
  );
  t.observe(fix(r, 20, 7000, 80), 7000);
  assert.equal(t.observe(fix(r, 20, 8000, 80), 8000).state.status, "OFF_ROUTE");
  assert.equal(t.snapshot().next_maneuver, null);
  assert.equal(t.observe(fix(r, 25, 9000), 9000).state.status, "OFF_ROUTE");
  assert.equal(t.observe(fix(r, 25, 10000), 10000).state.status, "ON_ROUTE");
});
test("jitter cannot reverse progress and a forward jump cannot skip maneuvers / 흔들림 역행·큰 도약 회전 건너뛰기 금지", () => {
  const r = route(),
    t = new RouteProgress(r);
  t.observe(fix(r, 0, 0), 0);
  t.observe(fix(r, 35, 1000), 1000);
  t.observe(fix(r, 32, 2000), 2000);
  assert.ok(t.snapshot().progress_m! >= 34.9);
  assert.equal(
    t.observe(fix(r, 0, 3000), 3000).state.reason,
    "BACKWARD_MOTION",
  );
  assert.equal(t.observe(fix(r, length, 3100), 3100).state.status, "UNCERTAIN");
  assert.equal(t.snapshot().last_confirmed_progress_m! > 40, false);
});
test("competing context roads withhold position and turns / 경쟁하는 주변 도로에서 위치·회전 보류", () => {
  const r = route(),
    parallel = line.map((p) => geo.offset(p, 0, 15)),
    t = new RouteProgress(r, [parallel]);
  t.observe(fix(r, 0, 0), 0);
  const f = fix(r, 20, 1000, 15);
  f.accuracy_m = 20;
  const s = t.observe(f, 1000).state;
  assert.equal(s.reason, "AMBIGUOUS_CONTEXT_ROAD");
  assert.equal(s.confirmed_position, null);
  assert.equal(s.next_maneuver, null);
});
test("arrival needs observed travel and two accurate endpoint positions / 실제 진행·정확한 끝점 표본 두 개 뒤 도착", () => {
  const r = route(),
    t = new RouteProgress(r);
  assert.equal(t.observe(fix(r, length, 0), 0).state.status, "UNCERTAIN");
  const s = new RouteProgress(r);
  s.observe(fix(r, 0, 0), 0);
  s.observe(fix(r, 60, 2000), 2000);
  s.observe(fix(r, 120, 4000), 4000);
  assert.equal(s.observe(fix(r, length, 6000), 6000).state.status, "ON_ROUTE");
  assert.equal(s.observe(fix(r, length, 7000), 7000).state.status, "ARRIVED");
  assert.equal(s.snapshot().remaining_m, 0);
  assert.equal(s.snapshot().next_maneuver, null);
});
test("route snapshot is isolated from caller mutation and invalidation is final / 원자료 변경 격리·무효화 후 재사용 금지", () => {
  const r = route(),
    t = new RouteProgress(r);
  r.geometry.coordinates[0]![0] = 0;
  r.guidance!.maneuvers[1]!.instruction = "Changed";
  t.observe(fix(route(), 0, 0), 0);
  assert.equal(t.snapshot().next_maneuver!.instruction, "Turn right.");
  const snapshot = t.snapshot();
  snapshot.binding.graph_id = "d".repeat(64);
  assert.equal(t.snapshot().binding.graph_id, "b".repeat(64));
  t.invalidate();
  assert.equal(t.observe(fix(route(), 10, 1000), 1000).accepted, false);
  assert.equal(t.snapshot().raw_position, null);
});
test("authored replay is deterministic, explicit synthetic data and requires a real alternate road / 합성 재생 결정성·실제 대체 도로 필수", () => {
  const r = route();
  assert.deepEqual(
    buildProgressReplay(r, [], "noisy-route"),
    buildProgressReplay(r, [], "noisy-route"),
  );
  assert.throws(() => buildProgressReplay(r, [], "departure-rejoin"));
  assert.ok(
    buildProgressReplay(r, [], "noisy-route").samples.every(
      (x) => x.fix.source_class === "SYNTHETIC",
    ),
  );
});
