/** P10 gateway authority, public allowlist and private IPC / 중계 승인·공개 허용목록·비공개 통신. */
import type {
  AcceptedInspection,
  ConsumerConfig,
} from "./publication_types.js";
import type { TrafficBundle, TrafficGeneration } from "./traffic_types.js";
import type { NodeAcceptedStore } from "./node_types.js";
export interface GatewayNode {
  node_id: string;
  origin: string;
  token: string;
}
export interface GatewayConfig {
  gateway_id: string;
  consumer: ConsumerConfig;
  graph_directory: string;
  bundle_directory: string;
  generation_root: string;
  runtime_root: string;
  token: string;
  nodes: [GatewayNode, GatewayNode];
  port?: number;
  poll_interval_ms?: number;
}
export interface GatewayRequest {
  schema_version: "0.1";
  request_id: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile: "car";
  traffic_policy: "prefer_live";
}
export type GatewayReason =
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
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
export interface GatewaySuccess {
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
export interface GatewayRouteOptions {
  deadline: number;
  signal: AbortSignal;
}
export type GatewayPhase =
  | "AFTER_GATEWAY_SELECTION"
  | "AFTER_GATEWAY_NODE_RESULT";
export interface GatewayPhaseDetail {
  request_id: string;
  generation_id: string;
  node_id?: string;
  attempt?: number;
}
export interface GatewayHooks {
  phase?(
    phase: GatewayPhase,
    detail: GatewayPhaseDetail,
    signal: AbortSignal,
  ): Promise<void>;
}
/** Authenticated internal status only; never part of the public route allowlist.
 * 인증 내부 상태 전용이며 공개 경로 허용목록에 포함하지 않습니다. */
export interface GatewayStatus {
  gateway_id: string;
  instance_id: string;
  in_flight: number;
  closing: boolean;
  high_water: number | null;
  snapshot_id: string | null;
  checked_at_event_time: string | null;
  reason: string;
}
export interface GatewayDependencies {
  bundle: TrafficBundle;
  store: NodeAcceptedStore;
  compile(input: AcceptedInspection["active"]): Promise<TrafficGeneration>;
  verifyGeneration(generation: TrafficGeneration): void;
  fetch: typeof globalThis.fetch;
}
export type GatewayControlMessage =
  | { type: "RECONCILE"; control_id: string; pull?: boolean }
  | { type: "STATUS"; control_id: string }
  | {
      type: "SET_GATEWAY_PAUSE";
      control_id: string;
      phase: GatewayPhase | null;
      request_id?: string;
    }
  | {
      type: "RESUME";
      control_id: string;
      phase: GatewayPhase;
      request_id?: string;
    }
  | { type: "SHUTDOWN"; control_id: string };
export type GatewayMessage =
  | {
      type: "READY";
      kind: "route-gateway";
      gateway_id: string;
      instance_id: string;
      pid: number;
      port: number;
    }
  | ({ type: "PHASE"; phase: GatewayPhase; pid: number } & GatewayPhaseDetail)
  | {
      type: "CONTROL_RESULT";
      control_id: string;
      code: "APPLIED" | "RECONCILED" | "STATUS" | "CLOSING" | "REJECTED";
      reason?: string;
      status?: GatewayStatus;
    }
  | { type: "STOPPED"; gateway_id: string; cleanup_verified: boolean };
