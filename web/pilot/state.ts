/** Pure request/freshness transitions; browser wall time never authorizes synthetic traffic.
 * 순수 요청·신선도 전이이며 브라우저 실제 시각으로 합성 교통을 승인하지 않습니다. */
import type {
  GatewayRouteContext,
  GatewaySuccess,
} from "../../tools/gateway_public_types.js";
export type ClientPhase =
  | "empty"
  | "loading"
  | "current"
  | "unverified"
  | "expired"
  | "invalid"
  | "noRoad"
  | "noPath"
  | "unavailable"
  | "timeout";
export function validContext(value: unknown): value is GatewayRouteContext {
  if (!value || typeof value !== "object") return false;
  const v = value as GatewayRouteContext;
  const common =
    v.schema_version === "0.1" &&
    /^[a-f0-9]{64}$/.test(v.graph_id) &&
    Number.isSafeInteger(v.high_water) &&
    v.high_water >= 0 &&
    Number.isFinite(Date.parse(v.checked_at_event_time)) &&
    v.source_class === "SYNTHETIC" &&
    v.clock_basis === "SIMULATION_EVENT_TIME";
  if (!common) return false;
  if (v.traffic_snapshot_id === null)
    return (
      v.sequence === null &&
      v.traffic_published_at === null &&
      v.traffic_valid_until === null
    );
  return (
    /^[a-f0-9]{64}$/.test(v.traffic_snapshot_id) &&
    Number.isSafeInteger(v.sequence) &&
    v.sequence !== null &&
    v.sequence > 0 &&
    v.sequence === v.high_water &&
    v.traffic_published_at !== null &&
    v.traffic_valid_until !== null &&
    Number.isFinite(Date.parse(v.traffic_published_at)) &&
    Number.isFinite(Date.parse(v.traffic_valid_until)) &&
    Date.parse(v.checked_at_event_time) < Date.parse(v.traffic_valid_until)
  );
}
export function routeContext(route: GatewaySuccess): GatewayRouteContext {
  return {
    schema_version: "0.1",
    graph_id: route.graph_id,
    traffic_snapshot_id: route.snapshot_id,
    sequence: route.sequence,
    high_water: route.high_water,
    checked_at_event_time: route.checked_at_event_time,
    traffic_published_at: route.traffic_published_at,
    traffic_valid_until: route.traffic_valid_until,
    source_class: route.source_class,
    clock_basis: route.clock_basis,
  };
}
export function olderAuthority(
  next: GatewayRouteContext,
  current: GatewayRouteContext,
): boolean {
  return (
    next.high_water < current.high_water ||
    Date.parse(next.checked_at_event_time) <
      Date.parse(current.checked_at_event_time)
  );
}
export function routeCurrent(
  route: GatewaySuccess,
  authority: GatewayRouteContext,
): boolean {
  return (
    route.graph_id === authority.graph_id &&
    route.snapshot_id === authority.traffic_snapshot_id &&
    route.high_water === authority.high_water &&
    route.sequence === authority.sequence &&
    (route.traffic_valid_until === null ||
      Date.parse(authority.checked_at_event_time) <
        Date.parse(route.traffic_valid_until))
  );
}
export class RouteClientState {
  generation = 0;
  request_id: string | null = null;
  route: GatewaySuccess | null = null;
  authority: GatewayRouteContext | null = null;
  phase: ClientPhase = "empty";
  reason = "";
  invalidate(phase: ClientPhase = "empty", reason = ""): void {
    this.generation++;
    this.request_id = null;
    this.route = null;
    this.phase = phase;
    this.reason = reason;
  }
  begin(request_id: string): number {
    this.invalidate("loading");
    this.request_id = request_id;
    return this.generation;
  }
  context(next: unknown): boolean {
    if (!validContext(next)) {
      this.freshnessFailed();
      return false;
    }
    if (this.authority && olderAuthority(next, this.authority)) return false;
    this.authority = next;
    if (this.route && !routeCurrent(this.route, next)) {
      const expired =
        this.route.traffic_valid_until !== null &&
        Date.parse(next.checked_at_event_time) >=
          Date.parse(this.route.traffic_valid_until);
      this.route = null;
      this.phase = expired ? "expired" : "unverified";
      this.reason = expired ? "EXPIRED" : "TRAFFIC_CHANGED";
    }
    return true;
  }
  result(
    generation: number,
    request_id: string,
    route: GatewaySuccess,
  ): boolean {
    if (generation !== this.generation || this.request_id !== request_id)
      return false;
    const own = routeContext(route);
    if (
      route.request_id !== request_id ||
      !validContext(own) ||
      !["LIVE_MIXED", "BASE_ONLY"].includes(route.traffic_mode) ||
      !Array.isArray(route.warnings) ||
      !route.warnings.every(
        (w) =>
          typeof w.code === "string" &&
          typeof w.message_en === "string" &&
          typeof w.message_ko === "string",
      ) ||
      !Number.isFinite(route.distance_m) ||
      route.distance_m < 0 ||
      !Number.isFinite(route.duration_s) ||
      route.duration_s < 0 ||
      !Number.isFinite(route.live_coverage_ratio) ||
      route.live_coverage_ratio < 0 ||
      route.live_coverage_ratio > 1 ||
      route.geometry?.type !== "LineString" ||
      route.geometry.coordinates.length < 2 ||
      !route.geometry.coordinates.every(
        (p) =>
          p.length === 2 &&
          p.every(Number.isFinite) &&
          Math.abs(p[0]!) <= 180 &&
          Math.abs(p[1]!) <= 90,
      )
    ) {
      this.fail(generation, "INVALID_RESPONSE");
      return false;
    }
    if (!this.authority || !olderAuthority(own, this.authority))
      this.context(own);
    if (!this.authority || !routeCurrent(route, this.authority)) {
      this.route = null;
      this.phase = "unverified";
      this.reason = "TRAFFIC_CHANGED";
      return false;
    }
    this.route = route;
    this.phase = "current";
    this.reason = "";
    return true;
  }
  fail(generation: number, reason: string): void {
    if (generation !== this.generation) return;
    this.route = null;
    this.reason = reason;
    this.phase =
      reason === "DEADLINE_EXCEEDED"
        ? "timeout"
        : reason === "NO_SUITABLE_ROAD"
          ? "noRoad"
          : reason === "NO_PATH"
            ? "noPath"
        : reason === "INVALID_INPUT" || reason === "OUT_OF_COVERAGE"
          ? "invalid"
          : reason === "TRAFFIC_CHANGED" || reason === "VERSION_MISMATCH"
            ? "unverified"
            : "unavailable";
  }
  freshnessFailed(): void {
    this.route = null;
    this.phase = "unverified";
    this.reason = "FRESHNESS_UNAVAILABLE";
  }
}
