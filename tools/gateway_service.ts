/** Authenticated local route gateway and private parent controls / 인증 로컬 경로 중계·비공개 부모 제어. */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isMain, identifier } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import { readNodeBody } from "./node_service.js";
import { TrafficError } from "./traffic_bundle.js";
import {
  GatewayController,
  GatewayError,
  gatewayFailure,
  gatewayHttpStatus,
  gatewayReason,
  GATEWAY_REQUEST_MS,
} from "./gateway_controller.js";
import type {
  GatewayConfig,
  GatewayControlMessage,
  GatewayHooks,
  GatewayMessage,
  GatewayPhase,
  GatewayPhaseDetail,
} from "./gateway_types.js";
export const GATEWAY_PHASES: GatewayPhase[] = [
  "AFTER_GATEWAY_SELECTION",
  "AFTER_GATEWAY_NODE_RESULT",
];
function authorized(request: IncomingMessage, token: string): boolean {
  const value = request.headers.authorization,
    expected = Buffer.from("Bearer " + token);
  return (
    typeof value === "string" &&
    Buffer.byteLength(value) === expected.length &&
    timingSafeEqual(Buffer.from(value), expected)
  );
}
function respond(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}
export class GatewayPhaseBarriers {
  private selected: { phase: GatewayPhase; request_id?: string } | null = null;
  private waiters = new Set<{
    phase: GatewayPhase;
    request_id: string;
    done: () => void;
    fail: (error: unknown) => void;
  }>();
  set(phase: GatewayPhase | null, request_id?: string): void {
    if (phase !== null && !GATEWAY_PHASES.includes(phase))
      throw new GatewayError("INVALID_INPUT");
    if (request_id !== undefined) identifier(request_id, "request_id");
    this.selected = phase ? { phase, request_id } : null;
  }
  async wait(
    phase: GatewayPhase,
    detail: GatewayPhaseDetail,
    signal: AbortSignal,
  ): Promise<void> {
    if (
      !this.selected ||
      this.selected.phase !== phase ||
      (this.selected.request_id &&
        this.selected.request_id !== detail.request_id)
    )
      return;
    await new Promise<void>((done, fail) => {
      const waiter = {
        phase,
        request_id: detail.request_id,
        done: () => {
          clean();
          done();
        },
        fail: (e: unknown) => {
          clean();
          fail(e);
        },
      };
      const abort = () => waiter.fail(new GatewayError("DEADLINE_EXCEEDED"));
      const clean = () => {
        signal.removeEventListener("abort", abort);
        this.waiters.delete(waiter);
      };
      this.waiters.add(waiter);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else
        process.send?.({
          type: "PHASE",
          phase,
          pid: process.pid,
          ...detail,
        } satisfies GatewayMessage);
    });
  }
  resume(phase: GatewayPhase, request_id?: string): void {
    if (!GATEWAY_PHASES.includes(phase))
      throw new GatewayError("INVALID_INPUT");
    for (const waiter of [...this.waiters])
      if (
        waiter.phase === phase &&
        (!request_id || waiter.request_id === request_id)
      )
        waiter.done();
  }
  close(): void {
    for (const waiter of [...this.waiters])
      waiter.fail(new GatewayError("NO_HEALTHY_NODE"));
  }
}
export type GatewayHttpController = Pick<GatewayController, "route" | "status">;
/** Admission includes incomplete bodies. No public waiting queue is created.
 * 미완성 본문도 동시 접수 한도에 포함하고 공개 대기열은 만들지 않습니다. */
export function createGatewayHttpServer(
  config: GatewayConfig,
  controller: GatewayHttpController,
) {
  let admitted = 0;
  const server = createServer((request, response) => {
    const deadline = performance.now() + GATEWAY_REQUEST_MS,
      abort = new AbortController();
    const disconnected = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.once("close", disconnected);
    request.once("aborted", disconnected);
    void (async () => {
      if (!authorized(request, config.token)) {
        request.resume();
        respond(response, 401, gatewayFailure("AUTH_REQUIRED"));
        return;
      }
      if (request.url === "/internal/v1/status" && request.method === "GET") {
        respond(response, 200, await controller.status());
        return;
      }
      if (request.url !== "/v1/routes" || request.method !== "POST") {
        request.resume();
        respond(response, 422, gatewayFailure("INVALID_INPUT"));
        return;
      }
      if (admitted >= 8) {
        request.resume();
        respond(response, 429, gatewayFailure("RATE_LIMITED"));
        return;
      }
      admitted++;
      try {
        let body: unknown;
        try {
          body = await readNodeBody(request, deadline);
        } catch (e) {
          throw new GatewayError(
            e instanceof TrafficError && e.reason === "REQUEST_DEADLINE"
              ? "DEADLINE_EXCEEDED"
              : "INVALID_INPUT",
          );
        }
        if (abort.signal.aborted || performance.now() >= deadline)
          throw new GatewayError("DEADLINE_EXCEEDED");
        const result = await controller.route(body, {
          deadline,
          signal: abort.signal,
        });
        respond(response, result.status, result.body);
      } catch (e) {
        const reason = gatewayReason(e);
        respond(response, gatewayHttpStatus(reason), gatewayFailure(reason));
      } finally {
        admitted--;
      }
    })()
      .catch(() => respond(response, 503, gatewayFailure("NO_HEALTHY_NODE")))
      .finally(() => {
        response.off("close", disconnected);
        request.off("aborted", disconnected);
      });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 12000;
  return server;
}
export interface RunningRouteGateway {
  port: number;
  controller: GatewayController;
  close(): Promise<void>;
}
export async function startRouteGateway(
  config: GatewayConfig,
  hooks: GatewayHooks = {},
): Promise<RunningRouteGateway> {
  const controller = await GatewayController.create(config, hooks),
    server = createGatewayHttpServer(config, controller);
  try {
    await new Promise<void>((done, fail) => {
      server.once("error", fail);
      server.listen(config.port ?? 0, "127.0.0.1", () => {
        server.off("error", fail);
        done();
      });
    });
    controller.start();
  } catch (e) {
    await controller.close();
    throw e;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Gateway listener unavailable / 중계 수신 소켓 없음");
  let closing: Promise<void> | undefined;
  return {
    port: address.port,
    controller,
    close: () =>
      (closing ??= (async () => {
        const closed = new Promise<void>((done, fail) =>
          server.close((e) => (e ? fail(e) : done())),
        );
        server.closeIdleConnections();
        await controller.close();
        server.closeAllConnections();
        await closed;
      })()),
  };
}
function send(message: GatewayMessage): void {
  process.send?.(message);
}
export async function runGatewayAgent(configPath: string): Promise<number> {
  const config = privateConfig<GatewayConfig>(["--config", configPath]),
    barriers = new GatewayPhaseBarriers();
  let node: RunningRouteGateway | undefined,
    stopping: Promise<void> | undefined;
  let finish!: (code: number) => void;
  const ended = new Promise<number>((done) => {
    finish = done;
  });
  const stop = () =>
    (stopping ??= (async () => {
      barriers.close();
      let cleanup = false;
      try {
        await node?.close();
        cleanup = true;
      } finally {
        send({
          type: "STOPPED",
          gateway_id: config.gateway_id,
          cleanup_verified: cleanup,
        });
        process.off("message", control);
        process.off("SIGTERM", signal);
        process.off("SIGINT", signal);
        process.off("disconnect", signal);
        finish(cleanup ? 0 : 1);
      }
    })());
  const signal = () => {
    void stop();
  };
  const control = (raw: unknown) => {
    void (async () => {
      if (!raw || typeof raw !== "object" || !node) return;
      const message = raw as GatewayControlMessage;
      try {
        identifier(message.control_id, "control_id");
        if (message.type === "RESUME") {
          barriers.resume(message.phase, message.request_id);
          send({
            type: "CONTROL_RESULT",
            control_id: message.control_id,
            code: "APPLIED",
          });
        } else if (message.type === "SET_GATEWAY_PAUSE") {
          barriers.set(message.phase, message.request_id);
          send({
            type: "CONTROL_RESULT",
            control_id: message.control_id,
            code: "APPLIED",
          });
        } else if (message.type === "RECONCILE") {
          await node.controller.reconcile(message.pull ?? true);
          send({
            type: "CONTROL_RESULT",
            control_id: message.control_id,
            code: "RECONCILED",
            status: await node.controller.status(),
          });
        } else if (message.type === "STATUS") {
          send({
            type: "CONTROL_RESULT",
            control_id: message.control_id,
            code: "STATUS",
            status: await node.controller.status(),
          });
        } else if (message.type === "SHUTDOWN") {
          send({
            type: "CONTROL_RESULT",
            control_id: message.control_id,
            code: "CLOSING",
          });
          await stop();
        } else throw Error();
      } catch {
        send({
          type: "CONTROL_RESULT",
          control_id: message.control_id ?? "invalid",
          code: "REJECTED",
          reason: "INVALID_INPUT",
        });
      }
    })();
  };
  node = await startRouteGateway(config, {
    phase: (phase, detail, signal) => barriers.wait(phase, detail, signal),
  });
  process.on("message", control);
  process.once("SIGTERM", signal);
  process.once("SIGINT", signal);
  process.once("disconnect", signal);
  send({
    type: "READY",
    kind: "route-gateway",
    gateway_id: config.gateway_id,
    instance_id: node.controller.instance_id,
    pid: process.pid,
    port: node.port,
  });
  return ended;
}
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config") {
    process.stderr.write(
      "Use --config PRIVATE_JSON / --config 비공개_JSON을 사용하세요\n",
    );
    process.exitCode = 2;
  } else
    runGatewayAgent(args[1]!).then(
      (code) => {
        process.exitCode = code;
      },
      () => {
        process.stderr.write(
          "Gateway failed; inspect owned evidence / 중계 실패: 소유 근거를 확인하세요\n",
        );
        process.exitCode = 1;
      },
    );
}
