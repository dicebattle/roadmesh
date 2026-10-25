/** P08 immutable-file and private worker contracts / P08 불변 파일·비공개 처리자 계약. */
import type {
  ConsumerConfig,
  VerifiedPublication,
} from "./publication_types.js";
import type { CatalogEdge } from "./aggregation_types.js";
import type { PublicTrafficPublication } from "./public_speed_publication.js";
export const COMPILER_POLICY = "valhalla-current-v1" as const;
export interface TrafficMember {
  tile_base: number;
  offset: number;
  byte_length: number;
  directed_edge_count: number;
}
export interface TrafficBundle {
  directory: string;
  graph_directory: string;
  graph_id: string;
  graph_manifest_sha256: string;
  coverage_bounds: readonly [number, number, number, number];
  image_id: string;
  skeleton_path: string;
  skeleton_sha256: string;
  skeleton_byte_length: number;
  graph_extract_path: string;
  graph_extract_sha256: string;
  catalog: CatalogEdge[];
  tile_paths: string[];
  members: TrafficMember[];
}
export interface EncodedTrafficEdge {
  edge_id: string;
  forward: boolean;
  offset: number;
  input_speed_mps: number;
  raw_speed: number;
  decoded_speed_mps: number;
  quantization_error_mps: number;
}
export interface TrafficGeneration {
  compiler_policy: typeof COMPILER_POLICY;
  generation_id: string;
  graph_id: string;
  skeleton_sha256: string;
  traffic_snapshot_id: string | null;
  sequence: number | null;
  valid_until: string | null;
  traffic_sha256: string;
  traffic_byte_length: number;
  live_edges: EncodedTrafficEdge[];
  directory: string;
  traffic_path: string;
  manifest_path: string;
}
export type TrafficPhase =
  | "AFTER_TRAFFIC_WRITE"
  | "AFTER_TRAFFIC_COMMIT"
  | "AFTER_TRAFFIC_SELECTION"
  | "AFTER_ENGINE_READY"
  | "AFTER_ROUTE_RESULT";
export interface TrafficPhaseDetail {
  engine_container?: string;
  engine_run_directory?: string;
}
export interface TrafficHooks {
  phase?: (phase: TrafficPhase, detail?: TrafficPhaseDetail) => Promise<void>;
}
import type { GuidanceLanguage } from "./guidance.js";
export interface TrafficRouteRequest {
  graph_id: string;
  snap_policy?: "nearest_road_100m";
  guidance_language?: GuidanceLanguage;
  locations: [
    {
      lon: number;
      lat: number;
    },
    {
      lon: number;
      lat: number;
    },
  ];
}
export interface TrafficWorkerConfig {
  consumer: ConsumerConfig;
  graph_directory: string;
  bundle_directory: string;
  generation_root: string;
  expected_graph_id: string;
  operation: "compile" | "route";
  request?: TrafficRouteRequest;
  pause_at?: TrafficPhase;
}
export type TrafficMode = "LIVE" | "NO_USABLE_SNAPSHOT" | "NO_LIVE_COVERAGE";
export interface TrafficProvenance {
  graph_id: string;
  high_water: number;
  sequence: number | null;
  traffic_snapshot_id: string | null;
  compiler_policy: typeof COMPILER_POLICY;
  generation_id: string;
  traffic_sha256: string;
  traffic_byte_length: number;
  checked_at_event_time: string;
  valid_until: string | null;
  traffic_mode: TrafficMode;
  engine: {
    image_id: string;
    version: "3.9.1";
  };
  message_en: string;
  message_ko: string;
}
export type TrafficResult =
  | {
      code: "READY";
      generation: TrafficGeneration;
      provenance: TrafficProvenance;
    }
  | {
      code: "ROUTE";
      traffic_mode: TrafficMode;
      engine_result: unknown;
      provenance: TrafficProvenance;
    }
  | {
      code: "REJECTED" | "UNAVAILABLE";
      reason: string;
      message_en: string;
      message_ko: string;
    };
export type TrafficMessage =
  | {
      type: "READY";
      kind: "traffic";
      pid: number;
    }
  | ({
      type: "PHASE";
      phase: TrafficPhase;
      pid: number;
    } & TrafficPhaseDetail)
  | ({
      type: "RESULT";
    } & TrafficResult);
export type VerifiedTrafficInput = VerifiedPublication | PublicTrafficPublication | null;
