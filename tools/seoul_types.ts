import type { EdgeMapping } from "./graph_evidence.js";

/** Actual located scene edges; never a matcher candidate whitelist.
 * 실제 조회한 장면 구간이며 매칭 후보 허용목록이 아닙니다. */
export interface SeoulGraphBundle {
  directory: string;
  graphId: string;
  manifest: Record<string, unknown>;
  manifestSha256: string;
  fixture: { fixture_id: "seoul-osm-20261023-v1" };
  geometry_policy: "geodesic-sphere-v1";
  edges: EdgeMapping[];
  routes: Array<{
    route_id: string;
    name_en: string;
    name_ko: string;
    edge_ids: string[];
    bounds: [number, number, number, number];
  }>;
  context_roads: Array<{ name: string; coordinates: number[][] }>;
}
