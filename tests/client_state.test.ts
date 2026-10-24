import test from "node:test";
import assert from "node:assert/strict";
import { RouteClientState, validContext } from "../web/pilot/state.js";
import type {
  GatewayRouteContext,
  GatewaySuccess,
} from "../tools/gateway_types.js";
const context = (water = 1, time = 270000): GatewayRouteContext => ({
  schema_version: "0.1",
  graph_id: "a".repeat(64),
  high_water: water,
  traffic_snapshot_id: water ? String(water).repeat(64) : null,
  sequence: water || null,
  checked_at_event_time: new Date(time).toISOString(),
  traffic_published_at: water ? new Date(270000).toISOString() : null,
  traffic_valid_until: water ? new Date(420000).toISOString() : null,
  source_class: "SYNTHETIC",
  clock_basis: "SIMULATION_EVENT_TIME",
});
const route = (id: string, water = 1, time = 270000): GatewaySuccess => {
  const c = context(water, time);
  return {
    request_id: id,
    request_sha256: "b".repeat(64),
    graph_id: c.graph_id,
    high_water: c.high_water,
    snapshot_id: c.traffic_snapshot_id,
    sequence: c.sequence,
    generation_id: "c".repeat(64),
    traffic_sha256: "d".repeat(64),
    engine_version: "3.9.1",
    image_id: "sha256:" + "e".repeat(64),
    costing_config_id: "valhalla-current-v1",
    node_id: "node-a",
    calculated_at: new Date(999999999).toISOString(),
    traffic_mode: water ? "LIVE_MIXED" : "BASE_ONLY",
    distance_m: 12,
    duration_s: 10,
    geometry: {
      type: "LineString",
      coordinates: [
        [127, 37.5],
        [127.001, 37.501],
      ],
    },
    live_coverage_ratio: water ? 1 : 0,
    warnings: [],
    checked_at_event_time: c.checked_at_event_time,
    traffic_published_at: c.traffic_published_at,
    traffic_valid_until: c.traffic_valid_until,
    source_class: c.source_class,
    clock_basis: c.clock_basis,
  };
};
test("input/new requests fence late route and failure completion / 입력·새요청이늦은응답·실패를차단", () => {
  const s = new RouteClientState(),
    old = s.begin("old"),
    next = s.begin("new");
  assert.ok(s.result(next, "new", route("new")));
  assert.equal(s.result(old, "old", route("old")), false);
  s.fail(old, "NO_HEALTHY_NODE");
  assert.equal(s.route?.request_id, "new");
  s.invalidate();
  assert.equal(s.route, null);
  assert.equal(s.result(next, "new", route("new")), false);
});
test("authority is monotonic in both high-water and event time / 승인순번·관측시간의동시단조성", () => {
  const s = new RouteClientState();
  s.context(context(2, 300000));
  assert.equal(s.context(context(1, 310000)), false);
  assert.equal(s.context(context(3, 290000)), false);
  assert.equal(s.authority?.high_water, 2);
  assert.equal(
    s.authority?.checked_at_event_time,
    new Date(300000).toISOString(),
  );
});
test("fresh response may establish newer authority but old snapshot is rejected / 새응답승인확립·옛스냅샷거부", () => {
  const s = new RouteClientState();
  s.context(context());
  let g = s.begin("new");
  assert.ok(s.result(g, "new", route("new", 2, 280000)));
  s.context(context(3, 290000));
  g = s.begin("old");
  assert.equal(s.result(g, "old", route("old", 2, 280000)), false);
  assert.equal(s.route, null);
  assert.equal(s.phase, "unverified");
});
test("exact event expiry removes route independently of browser real time / 실제브라우저시계와독립한관측시각만료", () => {
  const s = new RouteClientState(),
    g = s.begin("r");
  s.result(g, "r", route("r"));
  s.context(context(1, 419999));
  assert.ok(s.route);
  s.context({
    ...context(1, 420000),
    traffic_snapshot_id: null,
    sequence: null,
    traffic_published_at: null,
    traffic_valid_until: null,
  });
  assert.equal(s.route, null);
  assert.equal(s.phase, "expired");
});
test("freshness/route failure clears current line and stale error cannot return it / 신선도·요청실패의현재경로제거", () => {
  const s = new RouteClientState();
  s.result(s.begin("r"), "r", route("r"));
  s.freshnessFailed();
  assert.equal(s.route, null);
  assert.equal(s.phase, "unverified");
  s.fail(s.begin("timeout"), "DEADLINE_EXCEEDED");
  assert.equal(s.phase, "timeout");
  s.fail(s.begin("invalid"), "INVALID_INPUT");
  assert.equal(s.phase, "invalid");
});
test("unknown authority and nonfinite route content never become current / 알수없는승인·비유한경로의현재표시거부", () => {
  assert.equal(
    validContext({ ...context(), checked_at_event_time: "invalid" }),
    false,
  );
  assert.equal(validContext({ ...context(), high_water: -1 }), false);
  assert.equal(
    validContext({ ...context(), traffic_snapshot_id: null }),
    false,
  );
  assert.equal(
    validContext({ ...context(), traffic_published_at: null }),
    false,
  );
  assert.equal(validContext({ ...context(), sequence: 2 }), false);
  assert.equal(validContext(context(1, 420000)), false);
  assert.equal(
    validContext({
      ...context(1, 420000),
      traffic_snapshot_id: null,
      sequence: null,
      traffic_published_at: null,
      traffic_valid_until: null,
    }),
    true,
  );
  const s = new RouteClientState(),
    bad = route("bad");
  bad.geometry.coordinates[0]![0] = NaN;
  assert.equal(s.result(s.begin("bad"), "bad", bad), false);
  assert.equal(s.route, null);
});

test("Route domain errors clear geometry and preserve distinct states / 경로 업무 오류는 지형을 지우고 서로 다른 상태 유지", () => {
  for(const [reason,phase] of [["NO_PATH","noPath"],["NO_SUITABLE_ROAD","noRoad"],["OUT_OF_COVERAGE","invalid"]]) {
    const s=new RouteClientState();const generation=s.begin("domain");s.fail(generation,reason!);
    assert.equal(s.phase,phase);assert.equal(s.route,null);
  }
});
