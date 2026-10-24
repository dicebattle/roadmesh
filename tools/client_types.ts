export type {
  ClientLocation,
  ClientPreset,
  ClientBootstrap,
} from "./client_public_types.js";
import type { ClientBootstrap } from "./client_public_types.js";
import type { GatewayControlMessage } from "./gateway_types.js";
import type { NodeControlMessage } from "./node_types.js";
/** P11 same-origin client and owned pilot lifetime / 같은 출처 클라이언트·소유 파일럿 수명. */
export interface ClientServerConfig {
  gateway_origin: string;
  gateway_token: string;
  assets_directory: string;
  bootstrap: ClientBootstrap;
  port?: number;
  evidence_directory?: string;
}
export interface ClientRuntimeConfig {
  graph_directory: string;
  output_directory: string;
  assets_directory: string;
  clock_mode: "automatic" | "supervised";
  lifetime_ms?: number;
}
/** Private controls never become HTTP endpoints or bootstrap fields.
 * 비공개 제어는 HTTP 경로나 초기 화면 자료에 포함하지 않습니다. */
export type ClientControl =
  | { type: "ADVANCE"; control_id: string; event_ms: number }
  | { type: "PUBLISH"; control_id: string; mode: "live" | "correction" }
  | { type: "RESTART_NODE"; control_id: string; node_id: string }
  | { type: "KILL_NODE"; control_id: string; node_id: string }
  | {
      type: "GATEWAY_CONTROL";
      control_id: string;
      message: GatewayControlMessage;
    }
  | {
      type: "NODE_CONTROL";
      control_id: string;
      node_id: string;
      message: NodeControlMessage;
    }
  | { type: "CONTEXT"; control_id: string }
  | { type: "SHUTDOWN"; control_id: string };
export type ClientMessage =
  | {
      type: "READY";
      kind: "route-client";
      pid: number;
      origin: string;
      graph_id: string;
      clock_mode: ClientRuntimeConfig["clock_mode"];
    }
  | {
      type: "CONTROL_RESULT";
      control_id: string;
      code: "APPLIED" | "REJECTED";
      result?: unknown;
      message_en?: string;
      message_ko?: string;
    }
  | { type: "STOPPED"; cleanup_verified: boolean };
/** Public aliases preserve earlier server callers without duplicating wire fields.
 * 공개 전송 필드를 중복하지 않고 기존 서버 호출자의 이름을 유지합니다. */
export type ClientRouteInput =
  import("./gateway_public_types.js").GatewayRequest;
export type ClientContext =
  import("./gateway_public_types.js").GatewayRouteContext;
export type ClientRouteResult =
  import("./gateway_public_types.js").GatewaySuccess;
