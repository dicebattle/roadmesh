/** P09 persistent node and private supervisor boundaries / P09 지속 노드·비공개 감독 경계. */
import type {
  ConsumerConfig,
  AcceptedInspection,
} from "./publication_types.js";
import type {
  TrafficBundle,
  TrafficGeneration,
  TrafficProvenance,
  TrafficRouteRequest,
} from "./traffic_types.js";
import type { RouteNativeCode, RouteRejectionReason } from "./route_contract.js";
export interface RoutingNodeConfig {
  node_id: string;
  consumer: ConsumerConfig;
  graph_directory: string;
  bundle_directory: string;
  generation_root: string;
  runtime_root: string;
  token: string;
  port?: number;
  poll_interval_ms?: number;
}
export type NodePhase =
  | "AFTER_NODE_CANDIDATE_READY"
  | "AFTER_NODE_ENGINE_RESULT"
  | "AFTER_NODE_ACTIVATION";
export interface NodePhaseDetail {
  node_id: string;
  instance_id: string;
  generation_id: string;
  request_id?: string;
  engine_container: string;
  engine_run_directory: string;
}
export interface NodeHooks {
  phase?: (
    phase: NodePhase,
    detail: NodePhaseDetail,
    signal?: AbortSignal,
  ) => Promise<void>;
}
export interface NativeDaemonIdentity {
  pid: number;
  start_ticks: string;
}
export interface NativeEngineIdentity extends NativeDaemonIdentity {
  container_id: string;
  container_name: string;
  owner_id: string;
}
export interface NodeRouteRequest extends TrafficRouteRequest {
  request_id: string;
  expected_generation_id?: string;
}
export interface NodeProvenance extends TrafficProvenance {
  activation_epoch: number;
  native_daemon: NativeDaemonIdentity;
}
export interface NodeFailure {
  code: "UNAVAILABLE";
  reason: string;
  message_en: string;
  message_ko: string;
}
export interface NodeRouteSuccess {
  code: "ROUTE";
  request_id: string;
  node_id: string;
  instance_id: string;
  engine_result: { request: unknown; route: unknown; trace: unknown };
  provenance: NodeProvenance;
}
export interface NodeRouteFailure {
  code: "ROUTE_REJECTED";
  request_id: string;
  request_sha256: string;
  native_request_sha256: string;
  node_id: string;
  instance_id: string;
  reason: RouteRejectionReason;
  native_code: RouteNativeCode;
  provenance: NodeProvenance;
}
export interface NodeReply {
  status: number;
  body: NodeRouteSuccess | NodeRouteFailure | NodeFailure;
}
export type NodeSlotState = "PREPARING" | "ACTIVE" | "DRAINING";
export interface NodeStatus {
  node_id: string;
  instance_id: string;
  ready: boolean;
  active: NodeProvenance | null;
  in_flight: number;
  slots: Array<{
    generation_id: string;
    state: NodeSlotState;
    in_flight: number;
    native_daemon: NativeDaemonIdentity | null;
  }>;
  reason: string;
  message_en: string;
  message_ko: string;
}
/** Internal test boundaries never appear in private configuration or public HTTP.
 * 내부 검사 경계는 비공개 설정이나 공개 HTTP에 노출하지 않습니다. */
export interface NodeAcceptedStore {
  inspectAccepted(): Promise<AcceptedInspection>;
  pull(eventTimeUtc: string): Promise<unknown>;
  close(): Promise<void>;
}
export interface NodeNativeEngine {
  readonly generation: TrafficGeneration;
  readonly identity: NativeEngineIdentity;
  readonly directory: string;
  inspect(signal?: AbortSignal): Promise<NativeEngineIdentity>;
  route(
    request: TrafficRouteRequest,
    signal: AbortSignal,
    deadline?: number,
  ): Promise<{ request: unknown; route: unknown; trace: unknown }>;
  stop(): Promise<void>;
}
export interface NodeControllerDependencies {
  bundle: TrafficBundle;
  store: NodeAcceptedStore;
  compile(input: AcceptedInspection["active"]): Promise<TrafficGeneration>;
  engine(
    generation: TrafficGeneration,
    signal?: AbortSignal,
  ): Promise<NodeNativeEngine>;
  verifyGeneration(generation: TrafficGeneration): void;
}
export type NodeControlMessage =
  | { type: "RECONCILE"; control_id: string; pull?: boolean }
  | {
      type: "SET_NODE_PAUSE";
      control_id: string;
      phase: NodePhase | null;
      request_id?: string;
    }
  | {
      type: "RESUME";
      control_id: string;
      phase: NodePhase;
      request_id?: string;
    }
  | { type: "SHUTDOWN"; control_id: string };
export type NodeMessage =
  | {
      type: "READY";
      kind: "routing-node";
      node_id: string;
      instance_id: string;
      pid: number;
      port: number;
    }
  | ({ type: "PHASE"; phase: NodePhase; pid: number } & NodePhaseDetail)
  | {
      type: "CONTROL_RESULT";
      control_id: string;
      code: "APPLIED" | "RECONCILED" | "CLOSING" | "REJECTED";
      reason?: string;
    }
  | { type: "STOPPED"; node_id: string; cleanup_verified: boolean };
