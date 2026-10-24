/** Author the P06 schedule before observing any matcher output. */
import { geodesicSphere } from "./geodesy.js";
import {
  generateSimulation,
  type SimulationSpec,
  type SimulationResult,
} from "./vehicle_simulator.js";
import type { SeoulGraphBundle } from "./seoul_types.js";
import type { CatalogEdge } from "./aggregation_types.js";
export interface AggregationScenario {
  spec: SimulationSpec;
  simulation: SimulationResult;
  catalog: CatalogEdge[];
  target: CatalogEdge;
  expected: {
    vehicle_id: string;
    speed_mps: number;
    trip_activity: "TRAVEL" | "PARKED";
    entered_at_ms: number;
    exited_at_ms: number;
    duration_s: number;
    pause_at_ms: number;
  }[];
  expected_median_duration_s: number;
  expected_speed_mps: number;
  route_id: string;
}
export function createAggregationScenario(
  graph: SeoulGraphBundle,
): AggregationScenario {
  const route = graph.routes.find((r) => r.route_id === "teheran");
  if (!route || route.edge_ids.length < 3)
    throw new Error(
      "Three verified Teheran edges are required / 검증한 테헤란 구간3개가 필요합니다",
    );
  const selected = route.edge_ids.slice(0, 3).map((id) => {
    const edge = graph.edges.find((e) => e.edge_id === id);
    if (!edge) throw new Error("Scene edge missing / 장면 구간 누락");
    return edge;
  });
  const lengths = selected.map((e) =>
    geodesicSphere.length(e.directed_geometry),
  );
  const total = lengths.reduce((a, b) => a + b, 0);
  const expected = [3, 4, 5, 6, 7, 2].map((speed, index) => {
    const pause = Math.ceil(((lengths[0]! + lengths[1]! / 2) / speed) * 1000);
    const entry = Math.ceil((lengths[0]! / speed) * 1000);
    const exit = Math.ceil(((lengths[0]! + lengths[1]!) / speed) * 1000) + 8000;
    if (Math.ceil((total / speed) * 1000) + 8000 > 60000)
      throw new Error(
        "Authored short trip exceeds 60 seconds / 직접 만든 짧은 여행이60초를 초과합니다",
      );
    return {
      vehicle_id: index === 5 ? "p06-parked" : "p06-speed-" + speed,
      speed_mps: speed,
      trip_activity: index === 5 ? ("PARKED" as const) : ("TRAVEL" as const),
      entered_at_ms: entry,
      exited_at_ms: exit,
      duration_s: lengths[1]! / speed + 8,
      pause_at_ms: pause,
    };
  });
  const spec: SimulationSpec = {
    schema_version: "0.1",
    simulation_id: "p06-signal-population",
    fixture_id: graph.fixture.fixture_id,
    graph_id: graph.graphId,
    seed: 7,
    start_time_utc: "2026-10-24T00:00:00.000Z",
    duration_ms: 60000,
    sample_interval_ms: 500,
    vehicles: expected.map((e) => ({
      vehicle_id: e.vehicle_id,
      departure_ms: 0,
      path: selected.map((edge) => ({
        label: edge.label,
        forward: edge.forward,
      })),
      speed_profile: [
        { duration_ms: e.pause_at_ms, speed_mps: e.speed_mps },
        { duration_ms: 8000, speed_mps: 0 },
        { duration_ms: 60000 - e.pause_at_ms - 8000, speed_mps: e.speed_mps },
      ],
      noise_radius_m: 0,
      drop_intervals: [],
    })),
  };
  const median = [
    ...expected
      .filter((e) => e.trip_activity === "TRAVEL")
      .map((e) => e.duration_s),
  ].sort((a, b) => a - b)[2]!;
  return {
    spec,
    simulation: generateSimulation(spec, graph),
    catalog: graph.edges.map((e) => ({
      edge_id: e.edge_id,
      forward: e.forward,
      distance_m: geodesicSphere.length(e.directed_geometry),
    })),
    target: {
      edge_id: selected[1]!.edge_id,
      forward: selected[1]!.forward,
      distance_m: lengths[1]!,
    },
    expected,
    expected_median_duration_s: median,
    expected_speed_mps: lengths[1]! / median,
    route_id: route.route_id,
  };
}
