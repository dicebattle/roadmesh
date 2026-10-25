/** Authored synthetic coordinates on the exact returned Seoul geometry.
 * 정확한 반환 서울 지형 위 자체 합성 좌표이며 실제 위치 기록이 아닙니다. */
import { geodesicSphere as geo } from "./geodesy.js";
import { routeBinding, type ProgressFix } from "./route_progress.js";
import type { GatewaySuccess } from "./gateway_public_types.js";
export type ReplayScenario = "noisy-route" | "departure-rejoin";
export interface AuthoredReplay {
  schema_version: "0.1";
  source_class: "SYNTHETIC";
  scenario: ReplayScenario;
  binding: ReturnType<typeof routeBinding>;
  truth_scope: "AUTHORED_ROUTE_GEOMETRY_NOT_REAL_GPS";
  samples: Array<{
    fix: ProgressFix;
    truth_along_m: number | null;
    event: string;
  }>;
  alternate_road: number | null;
}
export function buildProgressReplay(
  route: GatewaySuccess,
  roads: number[][][],
  scenario: ReplayScenario,
): AuthoredReplay {
  const line = route.geometry.coordinates,
    total = geo.length(line),
    binding = routeBinding(route);
  if (!["noisy-route", "departure-rejoin"].includes(scenario))
    throw Error("Unknown replay scenario / 재생 시나리오 오류");
  const samples: AuthoredReplay["samples"] = [];
  let time = 0;
  const add = (
    point: number[],
    along: number | null,
    event: string,
    heading?: number,
  ) => {
    samples.push({
      fix: {
        binding: { ...binding },
        source_class: "SYNTHETIC",
        event_time_ms: time,
        longitude: point[0]!,
        latitude: point[1]!,
        accuracy_m: 4,
        heading_degrees: heading ?? null,
        speed_mps: heading === undefined ? 0 : Math.min(25, total),
      },
      truth_along_m: along,
      event,
    });
    time += 1000;
  };
  const on = (along: number) => {
    const p = geo.position(line, along),
      ahead = geo.position(line, Math.min(total, along + 1));
    const heading =
      along < total
        ? (geo.project(p, [p, ahead]).tangent_radians * 180) / Math.PI
        : undefined;
    const noise =
      along === 0 || along === total
        ? 0
        : [0, 2, -2, 1, -1][samples.length % 5]!;
    add(
      geo.offset(p, noise, noise / 2),
      along,
      along === total ? "ENDPOINT" : "ROUTE_WITH_AUTHORED_NOISE",
      heading === undefined ? undefined : (heading + 360) % 360,
    );
  };
  const anchor = Math.min(total * 0.35, 350);
  const offsets = [0];
  for (let d = 25; d < total; d += 25) offsets.push(d);
  offsets.push(total);
  let alternate: number | null = null,
    inserted = false;
  for (const d of offsets) {
    on(d);
    if (
      scenario === "departure-rejoin" &&
      !inserted &&
      d >= anchor &&
      d < total - 25
    ) {
      const anchorPoint = geo.position(line, d);
      const options = roads
        .flatMap((road, index) => {
          const length = geo.length(road);
          if (length < 20) return [];
          const closest = geo.project(anchorPoint, road),
            middle = closest.fraction * length;
          const positions = [
            middle,
            Math.min(length, middle + 5),
            Math.min(length, middle + 10),
          ].map((x) => geo.position(road, x));
          const distance = geo.distance(anchorPoint, positions[0]!);
          return distance <= 180 &&
            positions.every((p) => geo.project(p, line).distance_m >= 60)
            ? [{ index, positions, distance }]
            : [];
        })
        .sort((a, b) => a.distance - b.distance || a.index - b.index);
      const choice = options[0];
      if (choice) {
        alternate = choice.index;
        time += 3000;
        choice.positions.forEach((p) =>
          add(p, null, "ACTUAL_CONTEXT_ROAD_DEPARTURE"),
        );
        add(geo.position(line, d), d, "REJOIN_FIRST");
        add(geo.position(line, d), d, "REJOIN_SECOND");
        inserted = true;
      }
    }
  }
  on(total);
  on(total);
  if (scenario === "departure-rejoin" && !inserted)
    throw Error(
      "No authored alternate road for this route / 이 경로의 합성 이탈 도로를 찾지 못했습니다",
    );
  return {
    schema_version: "0.1",
    source_class: "SYNTHETIC",
    scenario,
    binding,
    truth_scope: "AUTHORED_ROUTE_GEOMETRY_NOT_REAL_GPS",
    samples,
    alternate_road: alternate,
  };
}
