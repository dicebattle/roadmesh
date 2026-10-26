/** Pure public gateway wire contracts; no Node/runtime imports.
 * Node·실행 모듈을 가져오지 않는 순수 공개 중계 전송 계약입니다. */
import type { GuidanceLanguage, RouteGuidance } from "./guidance.js";
export interface GatewayRequest {
  schema_version: "0.1";
  request_id: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile: "car";
  traffic_policy: "prefer_live";
  snap_policy?: "nearest_road_100m";
  guidance_language?: GuidanceLanguage;
}

export type GatewayReason =
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
  | "OUT_OF_COVERAGE"
  | "NO_SUITABLE_ROAD"
  | "NO_PATH"
  | "UNSUPPORTED_POLICY"
  | "RATE_LIMITED"
  | "VERSION_MISMATCH"
  | "TRAFFIC_CHANGED"
  | "NO_HEALTHY_NODE"
  | "STORE_UNAVAILABLE"
  | "DEADLINE_EXCEEDED";

export interface GatewayWarning {
  code: string;
  message_en: string;
  message_ko: string;
}

export interface GatewayFreshness {
  high_water: number;
  checked_at_event_time: string;
  traffic_published_at: string | null;
  traffic_valid_until: string | null;
  source_class: "SYNTHETIC" | "PUBLIC_AGENCY";
  clock_basis: "SIMULATION_EVENT_TIME" | "WALL_CLOCK_UTC";
  public_traffic?: PublicTrafficContext;
}

export interface PublicTrafficContext {
  provider: "kr-its" | "kr-regional";
  source_state: "CURRENT" | "EXPIRED" | "UNAVAILABLE" | "NO_MAPPED_SPEEDS";
  refresh_state: "OK" | "FAILED" | "WAITING";
  retrieved_at: string | null;
  observed_from: string | null;
  observed_until: string | null;
  graph_edges: number;
  mapped_edges: number;
  live_edges: number;
  sources?: Array<{provider: "kr-gits" | "kr-ex"; live_edges: number;
    access: "ANONYMOUS_WEBSITE" | "OFFICIAL_PUBLIC_DEMO_BROWSER_DOCUMENT";
    observed_from: string | null; observed_until: string | null}>;
}

export interface GatewayRouteContext extends GatewayFreshness {
  schema_version: "0.1" | "public-route-0.1";
  graph_id: string;
  traffic_snapshot_id: string | null;
  sequence: number | null;
}

export interface GatewayContextReply {
  status: number;
  body: GatewayRouteContext | GatewayFailure;
}

export interface GatewaySuccess extends GatewayFreshness {
  request_id: string;
  /** SHA256(canonical(complete original public request)); native input is separately compared byte-for-byte canonically.
   * 공개 원요청 전체 정규 JSON 해시이며 네이티브 입력은 별도로 정규 바이트 대조합니다. */
  request_sha256: string;
  graph_id: string;
  snapshot_id: string | null;
  sequence: number | null;
  generation_id: string;
  traffic_sha256: string;
  engine_version: "3.9.1";
  image_id: string;
  costing_config_id: "valhalla-current-v1";
  node_id: string;
  calculated_at: string;
  traffic_mode: "LIVE_MIXED" | "BASE_ONLY";
  distance_m: number;
  duration_s: number;
  geometry: { type: "LineString"; coordinates: number[][] };
  guidance?: RouteGuidance;
  live_coverage_ratio: number;
  warnings: GatewayWarning[];
}

export interface GatewayFailure extends GatewayWarning {
  code: "ERROR";
  reason: GatewayReason;
}

export interface GatewayReply {
  status: number;
  body: GatewaySuccess | GatewayFailure;
}
