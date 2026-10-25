/** Route-bound synthetic progress; no device, network or wall-clock access.
 * 단말·네트워크·실제 시계에 접근하지 않는 경로 연결 합성 진행입니다. */
import { geodesicSphere as geo } from "./geodesy.js";
import { validateRouteGuidance } from "./guidance.js";
import type { GatewaySuccess } from "./gateway_public_types.js";
export const PROGRESS_POLICY = "route-progress-v1";
export interface RouteBinding {
  request_id: string;
  request_sha256: string;
  graph_id: string;
  generation_id: string;
}
export interface ProgressFix {
  binding: RouteBinding;
  source_class: "SYNTHETIC";
  event_time_ms: number;
  longitude: number;
  latitude: number;
  accuracy_m: number;
  heading_degrees?: number | null;
  speed_mps?: number | null;
}
export type ProgressStatus =
  | "WAITING"
  | "ON_ROUTE"
  | "UNCERTAIN"
  | "OFF_ROUTE_PENDING"
  | "OFF_ROUTE"
  | "ARRIVED"
  | "STALE"
  | "INVALIDATED";
export interface ProgressState {
  policy_id: typeof PROGRESS_POLICY;
  source_class: "SYNTHETIC";
  binding: RouteBinding;
  status: ProgressStatus;
  reason: string;
  event_time_ms: number | null;
  accuracy_m: number | null;
  raw_position: number[] | null;
  confirmed_position: number[] | null;
  geometry_length_m: number;
  last_confirmed_progress_m: number | null;
  progress_m: number | null;
  remaining_m: number | null;
  distance_to_route_m: number | null;
  next_maneuver: {
    index: number;
    instruction: string;
    distance_m: number;
  } | null;
}
export interface ProgressUpdate {
  accepted: boolean;
  reason: string;
  state: ProgressState;
}
export function routeBinding(route: GatewaySuccess): RouteBinding {
  return {
    request_id: route.request_id,
    request_sha256: route.request_sha256,
    graph_id: route.graph_id,
    generation_id: route.generation_id,
  };
}
export function sameRouteBinding(a: RouteBinding, b: RouteBinding): boolean {
  return ["request_id", "request_sha256", "graph_id", "generation_id"].every(
    (k) => a[k as keyof RouteBinding] === b[k as keyof RouteBinding],
  );
}
function strictObject(
  value: unknown,
  required: string[],
  optional: string[] = [],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    required.every((k) => Object.hasOwn(value, k)) &&
    Object.keys(value).every(
      (k) => required.includes(k) || optional.includes(k),
    )
  );
}
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
function validFix(value: unknown): value is ProgressFix {
  if (
    !strictObject(
      value,
      [
        "binding",
        "source_class",
        "event_time_ms",
        "longitude",
        "latitude",
        "accuracy_m",
      ],
      ["heading_degrees", "speed_mps"],
    )
  )
    return false;
  const v = value as unknown as ProgressFix;
  return (
    strictObject(v.binding, [
      "request_id",
      "request_sha256",
      "graph_id",
      "generation_id",
    ]) &&
    v.source_class === "SYNTHETIC" &&
    Number.isSafeInteger(v.event_time_ms) &&
    v.event_time_ms >= 0 &&
    typeof v.longitude === "number" &&
    Number.isFinite(v.longitude) &&
    Math.abs(v.longitude) <= 180 &&
    typeof v.latitude === "number" &&
    Number.isFinite(v.latitude) &&
    Math.abs(v.latitude) <= 90 &&
    typeof v.accuracy_m === "number" &&
    Number.isFinite(v.accuracy_m) &&
    v.accuracy_m > 0 &&
    v.accuracy_m <= 25 &&
    (v.heading_degrees === undefined ||
      v.heading_degrees === null ||
      (nonnegative(v.heading_degrees) && v.heading_degrees < 360)) &&
    (v.speed_mps === undefined ||
      v.speed_mps === null ||
      (nonnegative(v.speed_mps) && v.speed_mps <= 45))
  );
}
type Road = {
  line: number[][];
  west: number;
  south: number;
  east: number;
  north: number;
};
type Candidate = {
  along: number;
  distance: number;
  coordinate: number[];
  heading: number;
};
export class RouteProgress {
  readonly binding: RouteBinding;
  readonly line: number[][];
  readonly cumulative: number[] = [0];
  readonly geometry_length_m: number;
  private readonly maneuvers: NonNullable<
    GatewaySuccess["guidance"]
  >["maneuvers"];
  private readonly roads: Road[];
  private state: ProgressState;
  private inputTime: number | null = null;
  private clock = 0;
  private confirmedTime: number | null = null;
  private previousAccuracy = 0;
  private confirmed: number | null = null;
  private firstConfirmed: number | null = null;
  private currentManeuver = 0;
  private departed = false;
  private offTimes: number[] = [];
  private recoveryTimes: number[] = [];
  private arrivalTimes: number[] = [];
  constructor(route: GatewaySuccess, roadLines: number[][][] = []) {
    if (
      !route.guidance ||
      route.geometry?.type !== "LineString" ||
      !Array.isArray(route.geometry.coordinates) ||
      route.geometry.coordinates.length < 2 ||
      route.geometry.coordinates.length > 10000 ||
      roadLines.length > 5000 ||
      roadLines.reduce((n, l) => n + l.length, 0) > 100000
    )
      throw Error("Unsupported progress geometry / 진행 계산 지형 범위 오류");
    validateRouteGuidance(
      route.guidance,
      route.guidance.language,
      route.geometry.coordinates.length,
      route.distance_m,
      route.duration_s,
    );
    this.binding = Object.freeze(routeBinding(route));
    for (const k of [
      this.binding.request_sha256,
      this.binding.graph_id,
      this.binding.generation_id,
    ])
      if (!/^[a-f0-9]{64}$/.test(k))
        throw Error("Invalid progress binding / 진행 연결 오류");
    this.line = route.geometry.coordinates.map((p) => [...p]);
    for (let i = 1; i < this.line.length; i++)
      this.cumulative.push(
        this.cumulative[i - 1]! +
          geo.distance(this.line[i - 1]!, this.line[i]!),
      );
    this.geometry_length_m = this.cumulative.at(-1)!;
    if (!(this.geometry_length_m > 0))
      throw Error("Empty progress route / 진행 경로 길이 없음");
    this.line.forEach(Object.freeze);
    Object.freeze(this.line);
    Object.freeze(this.cumulative);
    this.maneuvers = route.guidance.maneuvers.map((m) => ({ ...m }));
    this.roads = roadLines
      .filter((line) => geo.length(line) > 0.001)
      .map((line) => {
        const copied = line.map((p) => [...p]);
        return {
          line: copied,
          west: Math.min(...line.map((p) => p[0]!)),
          south: Math.min(...line.map((p) => p[1]!)),
          east: Math.max(...line.map((p) => p[0]!)),
          north: Math.max(...line.map((p) => p[1]!)),
        };
      });
    this.state = {
      policy_id: PROGRESS_POLICY,
      source_class: "SYNTHETIC",
      binding: { ...this.binding },
      status: "WAITING",
      reason: "WAITING_FOR_FIX",
      event_time_ms: null,
      accuracy_m: null,
      raw_position: null,
      confirmed_position: null,
      geometry_length_m: this.geometry_length_m,
      last_confirmed_progress_m: null,
      progress_m: null,
      remaining_m: null,
      distance_to_route_m: null,
      next_maneuver: null,
    };
  }
  snapshot(): ProgressState {
    return structuredClone(this.state);
  }
  private streaks(): void {
    this.offTimes = [];
    this.recoveryTimes = [];
    this.arrivalTimes = [];
  }
  private withhold(status: ProgressStatus, reason: string): void {
    Object.assign(this.state, {
      status,
      reason,
      confirmed_position: null,
      progress_m: null,
      remaining_m: null,
      next_maneuver: null,
    });
  }
  invalidate(): ProgressState {
    this.streaks();
    this.withhold("INVALIDATED", "ROUTE_INVALIDATED");
    this.state.raw_position = null;
    return this.snapshot();
  }
  advance(now: number): ProgressState {
    if (!Number.isSafeInteger(now) || now < 0)
      throw Error("Invalid replay clock / 재생 시각 오류");
    if (now < this.clock)
      throw Error("Replay clock cannot rewind / 재생 시각 역행 금지");
    this.clock = now;
    if (
      this.state.status !== "INVALIDATED" &&
      this.inputTime !== null &&
      now - this.inputTime > 5000
    ) {
      this.streaks();
      this.withhold("STALE", "FIX_EXPIRED");
      this.state.raw_position = null;
    }
    return this.snapshot();
  }
  private result(accepted: boolean, reason: string): ProgressUpdate {
    return { accepted, reason, state: this.snapshot() };
  }
  observe(value: unknown, now: number): ProgressUpdate {
    if (this.state.status === "INVALIDATED")
      return this.result(false, "ROUTE_INVALIDATED");
    if (!validFix(value)) {
      this.streaks();
      this.withhold("UNCERTAIN", "INVALID_FIX");
      return this.result(false, "INVALID_FIX");
    }
    const fix = value;
    if (!sameRouteBinding(fix.binding, this.binding))
      return this.result(false, "WRONG_ROUTE");
    if (!Number.isSafeInteger(now) || now < this.clock) {
      this.streaks();
      return this.result(false, "INVALID_CLOCK");
    }
    this.clock = now;
    if (fix.event_time_ms > now) {
      this.streaks();
      return this.result(false, "FUTURE_FIX");
    }
    if (now - fix.event_time_ms > 5000) {
      this.streaks();
      this.withhold("STALE", "STALE_FIX");
      return this.result(false, "STALE_FIX");
    }
    if (this.inputTime !== null && fix.event_time_ms <= this.inputTime) {
      this.streaks();
      return this.result(
        false,
        fix.event_time_ms === this.inputTime ? "DUPLICATE_FIX" : "OUT_OF_ORDER",
      );
    }
    if (this.inputTime !== null && fix.event_time_ms - this.inputTime > 5000)
      this.streaks();
    this.inputTime = fix.event_time_ms;
    const point = [fix.longitude, fix.latitude];
    Object.assign(this.state, {
      event_time_ms: fix.event_time_ms,
      accuracy_m: fix.accuracy_m,
      raw_position: point,
    });
    const candidates: Candidate[] = [];
    for (let i = 1; i < this.line.length; i++) {
      const length = this.cumulative[i]! - this.cumulative[i - 1]!;
      if (!length) continue;
      const p = geo.project(point, [this.line[i - 1]!, this.line[i]!]);
      candidates.push({
        along: this.cumulative[i - 1]! + p.fraction * length,
        distance: p.distance_m,
        coordinate: p.coordinate,
        heading: (p.tangent_radians * 180) / Math.PI,
      });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.along - b.along);
    const nearest = candidates[0]!;
    this.state.distance_to_route_m = nearest.distance;
    if (nearest.distance - fix.accuracy_m >= 30) {
      this.recoveryTimes = [];
      this.arrivalTimes = [];
      this.offTimes.push(fix.event_time_ms);
      this.offTimes = this.offTimes.slice(-3);
      if (
        this.offTimes.length === 3 &&
        this.offTimes[2]! - this.offTimes[0]! >= 2000
      )
        this.departed = true;
      this.withhold(
        this.departed ? "OFF_ROUTE" : "OFF_ROUTE_PENDING",
        this.departed
          ? "DEPARTURE_CONFIRMED"
          : "WAITING_FOR_DEPARTURE_CONFIRMATION",
      );
      return this.result(true, this.state.reason);
    }
    this.offTimes = [];
    const uncertain = (reason: string) => {
      this.streaks();
      this.withhold(this.departed ? "OFF_ROUTE" : "UNCERTAIN", reason);
      return this.result(true, reason);
    };
    const corridor = Math.max(12, fix.accuracy_m + 5);
    if (nearest.distance > corridor)
      return uncertain("OUTSIDE_CONFIRMED_CORRIDOR");
    const elapsed =
      this.confirmedTime === null
        ? 0
        : (fix.event_time_ms - this.confirmedTime) / 1000;
    const forward = Math.max(
      25,
      45 * elapsed + this.previousAccuracy + fix.accuracy_m,
    );
    const headingTrusted =
      fix.heading_degrees !== undefined &&
      fix.heading_degrees !== null &&
      (fix.speed_mps ?? 0) >= 3;
    const near = candidates.filter(
      (c) =>
        c.distance <= corridor &&
        c.distance <= nearest.distance + fix.accuracy_m,
    );
    const plausible = near.filter((c) => {
      if (headingTrusted) {
        const d = Math.abs(
          ((c.heading - fix.heading_degrees! + 540) % 360) - 180,
        );
        if (d > 60) return false;
      }
      return this.confirmed === null
        ? c.along <= 50
        : c.along >= this.confirmed - 15 - fix.accuracy_m &&
            c.along <= this.confirmed + forward;
    });
    if (!plausible.length)
      return uncertain(
        this.confirmed === null
          ? "START_NOT_CONFIRMED"
          : nearest.along < this.confirmed - 15 - fix.accuracy_m
            ? "BACKWARD_MOTION"
            : "IMPLAUSIBLE_JUMP_OR_HEADING",
      );
    const best = plausible[0]!;
    if (plausible.some((c) => Math.abs(c.along - best.along) > 40))
      return uncertain("AMBIGUOUS_ROUTE_SEGMENTS");
    const latPad = (fix.accuracy_m + 20) / 110000,
      lonPad =
        latPad / Math.max(0.01, Math.cos((fix.latitude * Math.PI) / 180));
    for (const road of this.roads) {
      if (
        road.east < fix.longitude - lonPad ||
        road.west > fix.longitude + lonPad ||
        road.north < fix.latitude - latPad ||
        road.south > fix.latitude + latPad
      )
        continue;
      const other = geo.project(point, road.line);
      if (
        other.distance_m <= fix.accuracy_m &&
        geo.distance(other.coordinate, best.coordinate) > 8
      )
        return uncertain("AMBIGUOUS_CONTEXT_ROAD");
    }
    if (this.departed) {
      this.recoveryTimes.push(fix.event_time_ms);
      this.recoveryTimes = this.recoveryTimes.slice(-2);
      if (
        this.recoveryTimes.length < 2 ||
        this.recoveryTimes[1]! - this.recoveryTimes[0]! < 1000
      ) {
        this.withhold("OFF_ROUTE", "WAITING_FOR_REJOIN_CONFIRMATION");
        return this.result(true, this.state.reason);
      }
      this.departed = false;
      this.recoveryTimes = [];
    }
    this.confirmed = Math.max(this.confirmed ?? 0, best.along);
    this.firstConfirmed ??= this.confirmed;
    this.confirmedTime = fix.event_time_ms;
    this.previousAccuracy = fix.accuracy_m;
    this.state.last_confirmed_progress_m = this.confirmed;
    while (
      this.currentManeuver < this.maneuvers.length - 2 &&
      this.confirmed >=
        this.cumulative[
          this.maneuvers[this.currentManeuver + 1]!.begin_shape_index
        ]! +
          3
    )
      this.currentManeuver++;
    const next =
      this.maneuvers[
        Math.min(this.maneuvers.length - 1, this.currentManeuver + 1)
      ]!;
    const nearEnd =
      this.geometry_length_m - this.confirmed <= 8 &&
      geo.distance(point, this.line.at(-1)!) <= Math.max(8, fix.accuracy_m) &&
      fix.accuracy_m <= 10 &&
      this.confirmed - this.firstConfirmed >=
        Math.min(20, this.geometry_length_m / 2);
    if (nearEnd) {
      this.arrivalTimes.push(fix.event_time_ms);
      this.arrivalTimes = this.arrivalTimes.slice(-2);
    } else this.arrivalTimes = [];
    const arrived =
      this.arrivalTimes.length === 2 &&
      this.arrivalTimes[1]! - this.arrivalTimes[0]! >= 1000;
    Object.assign(this.state, {
      status: arrived ? "ARRIVED" : "ON_ROUTE",
      reason: arrived
        ? "REPLAY_ENDPOINT_CONFIRMED"
        : "CONFIRMED_ROUTE_POSITION",
      confirmed_position: geo.position(
        this.line,
        arrived ? this.geometry_length_m : this.confirmed,
      ),
      progress_m: arrived ? this.geometry_length_m : this.confirmed,
      remaining_m: arrived
        ? 0
        : Math.max(0, this.geometry_length_m - this.confirmed),
      next_maneuver: arrived
        ? null
        : {
            index: next.index,
            instruction: next.instruction,
            distance_m: Math.max(
              0,
              this.cumulative[next.begin_shape_index]! - this.confirmed,
            ),
          },
    });
    return this.result(true, this.state.reason);
  }
}
