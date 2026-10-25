import { test } from "node:test";
import assert from "node:assert/strict";
import { validPublicTrafficContext, validSourceClock } from "../tools/public_traffic_context.js";
import { validateClientContext } from "../tools/client_server.js";
import { validContext, routeCurrent } from "../web/pilot/state.js";
import type { GatewayRouteContext, GatewaySuccess } from "../tools/gateway_public_types.js";

const graph = "a".repeat(64);
function context(): GatewayRouteContext {
  const now = Date.now(), iso = (offset: number) => new Date(now + offset).toISOString();
  return {schema_version: "public-route-0.1", graph_id: graph, traffic_snapshot_id: "b".repeat(64), sequence: 1,
    high_water: 1, checked_at_event_time: iso(0), traffic_published_at: iso(-5000), traffic_valid_until: iso(540000),
    source_class: "PUBLIC_AGENCY", clock_basis: "WALL_CLOCK_UTC", public_traffic: {
      provider: "kr-its", source_state: "CURRENT", refresh_state: "OK", retrieved_at: iso(-10000),
      observed_from: iso(-60000), observed_until: iso(-30000), graph_edges: 79, mapped_edges: 22, live_edges: 3}};
}
test("source and clock must form an explicit pair / 출처·시계의 명시 쌍 검사", () => {
  assert.equal(validSourceClock("SYNTHETIC", "SIMULATION_EVENT_TIME"), true);
  assert.equal(validSourceClock("PUBLIC_AGENCY", "WALL_CLOCK_UTC"), true);
  assert.equal(validSourceClock("PUBLIC_AGENCY", "SIMULATION_EVENT_TIME"), false);
  assert.equal(validSourceClock("SYNTHETIC", "WALL_CLOCK_UTC"), false);
});
test("public server/browser validate the same current source metadata / 서버·화면의 같은 현재 공공 문맥 검사", () => {
  const c = context();
  assert.doesNotThrow(() => validateClientContext(c, graph)); assert.equal(validContext(c), true);
  assert.equal(validPublicTrafficContext(c.public_traffic, c.checked_at_event_time, true), true);
  for (const corrupt of [{...c, schema_version: "0.1"}, {...c, clock_basis: "SIMULATION_EVENT_TIME"},
    {...c, public_traffic: undefined}, {...c, source_class: "SYNTHETIC", clock_basis: "SIMULATION_EVENT_TIME", schema_version: "0.1"}]) {
    assert.throws(() => validateClientContext(corrupt, graph)); assert.equal(validContext(corrupt), false);
  }
});
test("coverage counts, future source time and made-up expiry cannot authorize public traffic / 적용 수·미래 시각·수명 위조 승인 금지", () => {
  const c = context(), metadata = c.public_traffic!;
  const corruptions = [{...metadata, live_edges: 80}, {...metadata, mapped_edges: -1},
    {...metadata, observed_until: new Date(Date.parse(c.checked_at_event_time) + 60000).toISOString()},
    {...metadata, source_state: "EXPIRED"}, {...metadata, provider: "other"}, {...metadata, extra: "unsafe"}];
  for (const public_traffic of corruptions) {
    const v = {...c, public_traffic};
    assert.throws(() => validateClientContext(v, graph)); assert.equal(validContext(v), false);
  }
  const extended = {...c, traffic_valid_until: new Date(Date.parse(c.traffic_valid_until!) + 60000).toISOString()};
  assert.throws(() => validateClientContext(extended, graph)); assert.equal(validContext(extended), false);
});
test("public fallback still exposes absence or expiry without a live snapshot / 공공 기본값의 부재·만료 상태 표시", () => {
  for (const source_state of ["EXPIRED", "UNAVAILABLE", "NO_MAPPED_SPEEDS"] as const) {
    const c = context(); c.traffic_snapshot_id = null; c.sequence = null; c.traffic_published_at = null; c.traffic_valid_until = null;
    c.public_traffic = {...c.public_traffic!, live_edges: 0, source_state};
    assert.doesNotThrow(() => validateClientContext(c, graph)); assert.equal(validContext(c), true);
  }
  const falseCurrent = context(); falseCurrent.traffic_snapshot_id = null;
  assert.throws(() => validateClientContext(falseCurrent, graph)); assert.equal(validContext(falseCurrent), false);
});
test("browser vetoes expiry or source change even when identifiers match / 식별자가 같아도 만료·출처 변경 때 화면 거부", () => {
  const c = context(), r = {...c, snapshot_id: c.traffic_snapshot_id} as unknown as GatewaySuccess;
  assert.equal(routeCurrent(r, c), true);
  assert.equal(routeCurrent({...r, source_class: "SYNTHETIC", clock_basis: "SIMULATION_EVENT_TIME"}, c), false);
  const old = new Date(Date.now() - 1).toISOString(), before = new Date(Date.now() - 10_000).toISOString();
  assert.equal(routeCurrent({...r, traffic_valid_until: old}, {...c, checked_at_event_time: before}), false);
});
