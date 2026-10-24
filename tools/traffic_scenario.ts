/** Fixed authored Seoul source; independent expectations precede engine matching.
 * 고정 서울 합성 입력이며 독립 기대값은 엔진 매칭 전에 계산합니다. */
import { geodesicSphere } from "./geodesy.js";
import {
  generateSimulation,
  type SimulationSpec,
  type SimulationResult,
  type Observation,
} from "./vehicle_simulator.js";
import type { SeoulGraphBundle } from "./seoul_types.js";
import type { CatalogEdge } from "./aggregation_types.js";
export const TRAFFIC_START = "2026-10-24T00:00:00.000Z";
export const TRAFFIC_TARGETS = [
  {
    label: "west",
    start: [127.036993, 37.500712],
    end: [127.037245, 37.50079],
  },
  {
    label: "middle",
    start: [127.037245, 37.50079],
    end: [127.03768, 37.500924],
  },
  {
    label: "east",
    start: [127.03768, 37.500924],
    end: [127.038474, 37.50117],
  },
] as const;
export interface TrafficExpectedTrip {
  vehicle_id: string;
  contributor_id: string;
  trip_id: string;
  target: CatalogEdge;
  label: string;
  speed_mps: number;
  trip_activity: "TRAVEL";
  expected_average_speed_mps: number;
  boundary_buffer_m: number;
  boundary_speed_mps: number;
  entry_buffer_m: number;
  central_distance_m: number;
  central_speed_mps: number;
  requested_duration_s: number;
  duration_error_ms: number;
  entered_at_ms: number;
  exited_at_ms: number;
  duration_s: number;
  observation_start_ms: number;
  observation_end_ms: number;
  predecessor_edge_id: string;
  successor_edge_id: string;
}
export interface TrafficScenario {
  spec: SimulationSpec;
  simulation: SimulationResult;
  observations: Observation[];
  catalog: CatalogEdge[];
  targets: (CatalogEdge & {
    label: string;
  })[];
  expected: TrafficExpectedTrip[];
  route_id: string;
  clipping_policy: string;
}
export function createTrafficScenario(
  graph: SeoulGraphBundle,
): TrafficScenario {
  const route = graph.routes.find((r) => r.route_id === "teheran");
  if (!route) throw new Error("Teheran route missing / 테헤란 경로 누락");
  const equal = (a: readonly number[], b: readonly number[]) =>
    a.length === 2 && a.every((v, i) => Math.abs(v - b[i]!) <= 1e-7);
  const selected = TRAFFIC_TARGETS.map((target) => {
    const found = graph.edges.filter(
      (e) =>
        e.osm_way_id === 919983793 &&
        e.car_access &&
        equal(e.directed_geometry[0]!, target.start) &&
        equal(e.directed_geometry.at(-1)!, target.end),
    );
    if (found.length !== 1)
      throw new Error(
        "Pinned corridor source drift / 고정 구간 원본 변경: " + target.label,
      );
    return found[0]!;
  });
  const indices = selected.map((e) => route.edge_ids.indexOf(e.edge_id));
  if (
    indices[0]! < 1 ||
    indices[1] !== indices[0]! + 1 ||
    indices[2] !== indices[1]! + 1 ||
    indices[2]! >= route.edge_ids.length - 1
  )
    throw new Error(
      "Ordered complete corridor context required / 순서가 맞는 전체 구간 문맥 필요",
    );
  const catalog = graph.edges.map((e) => ({
    edge_id: e.edge_id,
    forward: e.forward,
    distance_m: geodesicSphere.length(e.directed_geometry),
  }));
  const targets = selected.map((e, i) => ({
    ...catalog.find((c) => c.edge_id === e.edge_id)!,
    label: TRAFFIC_TARGETS[i]!.label,
  }));
  const expected: TrafficExpectedTrip[] = [];
  const vehicles: SimulationSpec["vehicles"] = [];
  selected.forEach((edge, index) => {
    const before = graph.edges.find(
      (e) => e.edge_id === route.edge_ids[indices[index]! - 1],
    )!;
    const after = graph.edges.find(
      (e) => e.edge_id === route.edge_ids[indices[index]! + 1],
    )!;
    if (!before?.car_access || !after?.car_access)
      throw new Error("Car context missing / 자동차 문맥 누락");
    const pre = geodesicSphere.length(before.directed_geometry),
      length = targets[index]!.distance_m,
      post = geodesicSphere.length(after.directed_geometry);
    if (pre <= 8 || post <= 8)
      throw new Error(
        "Partial context must remain partial / 부분 문맥은 전체 구간보다 짧아야 합니다",
      );
    [0.4, 0.45, 0.5, 0.55, 0.6].forEach((speed, j) => {
      // Keep fast boundary crossings distinct from the central congestion.
      // 양끝의 빠른 경계 통과와 중앙 정체를 구분합니다.
      const approachMs = Math.ceil(((pre + 3) / 5) * 1000);
      const entryInside = (approachMs / 1000) * 5 - pre;
      const slowDistance = length - entryInside - 3;
      const requestedDuration = length / speed;
      const slowMs = Math.round(
        (requestedDuration - (entryInside + 3) / 5) * 1000,
      );
      const slowSpeed = slowDistance / (slowMs / 1000);
      if (
        slowDistance <= 0 ||
        slowMs <= 0 ||
        !Number.isFinite(slowSpeed) ||
        slowSpeed <= 0
      )
        throw new Error(
          "Invalid authored central congestion / 합성 중앙 정체 형식 오류",
        );
      const departure = 210000 - approachMs - slowMs - 600;
      const entry = departure + (pre / 5) * 1000;
      const exit = departure + approachMs + slowMs + 600;
      const duration = (exit - entry) / 1000;
      const durationErrorMs = (duration - requestedDuration) * 1000;
      if (Math.abs(durationErrorMs) > 1)
        throw new Error(
          "Authored average duration exceeds 1ms tolerance / 합성 평균 통과시간이 1ms 허용오차를 초과합니다",
        );
      const id = "p08-" + targets[index]!.label + "-" + j;
      const endDuration = 240000 - departure - approachMs - slowMs;
      if (departure < 0 || (endDuration * 5) / 1000 < 3 + post)
        throw new Error(
          "Authored trip exceeds fixed scenario / 합성 여행이 고정 시나리오를 초과합니다",
        );
      vehicles.push({
        vehicle_id: id,
        departure_ms: departure,
        path: [before, edge, after].map((e) => ({
          label: e.label,
          forward: e.forward,
        })),
        speed_profile: [
          {
            duration_ms: approachMs,
            speed_mps: 5,
          },
          {
            duration_ms: slowMs,
            speed_mps: slowSpeed,
          },
          {
            duration_ms: endDuration,
            speed_mps: 5,
          },
        ],
        noise_radius_m: 0,
        drop_intervals: [],
      });
      expected.push({
        vehicle_id: id,
        contributor_id: "traffic-person-" + index + "-" + j,
        trip_id: "traffic-trip-" + index + "-" + j,
        target: targets[index]!,
        label: targets[index]!.label,
        speed_mps: speed,
        trip_activity: "TRAVEL",
        expected_average_speed_mps: length / duration,
        boundary_buffer_m: 3,
        boundary_speed_mps: 5,
        entry_buffer_m: entryInside,
        central_distance_m: slowDistance,
        central_speed_mps: slowSpeed,
        requested_duration_s: requestedDuration,
        duration_error_ms: durationErrorMs,
        entered_at_ms: entry,
        exited_at_ms: exit,
        duration_s: (exit - entry) / 1000,
        observation_start_ms: entry - (8 / 5) * 1000,
        observation_end_ms: exit + (8 / 5) * 1000,
        predecessor_edge_id: before.edge_id,
        successor_edge_id: after.edge_id,
      });
    });
  });
  const spec: SimulationSpec = {
    schema_version: "0.1",
    simulation_id: "p08-fixed-seoul-congestion",
    fixture_id: graph.fixture.fixture_id,
    graph_id: graph.graphId,
    seed: 8,
    start_time_utc: TRAFFIC_START,
    duration_ms: 240000,
    sample_interval_ms: 500,
    vehicles,
  };
  const simulation = generateSimulation(spec, graph);
  const observations = simulation.observations.filter((o) => {
    const e = expected.find((e) => e.vehicle_id === o.vehicle_id)!;
    return (
      o.offset_ms >= e.observation_start_ms &&
      o.offset_ms <= e.observation_end_ms
    );
  });
  return {
    spec,
    simulation,
    observations,
    catalog,
    targets,
    expected,
    route_id: route.route_id,
    clipping_policy:
      "Authored observations only: at most 8m partial context on each side; independent full simulator truth is retained. / 관측만 양쪽 최대8m 부분 문맥으로 자르고 독립 전체 정답은 보존합니다.",
  };
}
