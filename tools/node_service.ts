/** Authenticated loopback node API and private supervisor IPC / 인증 로컬 노드 API·비공개 감독 통신. */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { performance } from "node:perf_hooks";
import { timingSafeEqual } from "node:crypto";
import { isMain, parseJson, identifier } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import {
  RoutingNodeController,
  nodeFailure,
  nodeReason,
} from "./node_controller.js";
import { TrafficError } from "./traffic_bundle.js";
import type {
  NodeControlMessage,
  NodeHooks,
  NodeMessage,
  NodePhase,
  NodePhaseDetail,
  RoutingNodeConfig,
} from "./node_types.js";
export const NODE_PHASES: NodePhase[] = [
  "AFTER_NODE_CANDIDATE_READY",
  "AFTER_NODE_ENGINE_RESULT",
  "AFTER_NODE_ACTIVATION",
];
interface Waiter {
  phase: NodePhase;
  request_id?: string;
  resume(): void;
  reject(error: unknown): void;
}
export class NodePhaseBarriers {
  private selected: { phase: NodePhase; request_id?: string } | null = null;
  private waiters = new Set<Waiter>();
  set(phase: NodePhase | null, request_id?: string): void {
    if (phase !== null && !NODE_PHASES.includes(phase))
      throw new TrafficError("INVALID_CONTROL");
    if (request_id !== undefined) identifier(request_id, "request_id");
    this.selected = phase ? { phase, request_id } : null;
  }
  wait(
    phase: NodePhase,
    detail: NodePhaseDetail,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      !this.selected ||
      this.selected.phase !== phase ||
      (this.selected.request_id !== undefined &&
        this.selected.request_id !== detail.request_id)
    )
      return Promise.resolve();
    if (!process.send)
      return Promise.reject(new TrafficError("PRIVATE_IPC_REQUIRED"));
    return new Promise((done, reject) => {
      const cleanup = () => {
        this.waiters.delete(waiter);
        signal?.removeEventListener("abort", aborted);
      };
      const waiter: Waiter = {
        phase,
        request_id: detail.request_id,
        resume: () => {
          cleanup();
          done();
        },
        reject: (e) => {
          cleanup();
          reject(e);
        },
      };
      const aborted = () =>
        waiter.reject(
          new TrafficError(
            typeof signal?.reason === "string"
              ? signal.reason
              : "REQUEST_DEADLINE",
          ),
        );
      this.waiters.add(waiter);
      signal?.addEventListener("abort", aborted, { once: true });
      if (signal?.aborted) {
        aborted();
        return;
      }
      process.send?.({
        type: "PHASE",
        phase,
        pid: process.pid,
        ...detail,
      } satisfies NodeMessage);
    });
  }
  resume(phase: NodePhase, request_id?: string): void {
    for (const waiter of [...this.waiters])
      if (
        waiter.phase === phase &&
        (request_id === undefined || waiter.request_id === request_id)
      )
        waiter.resume();
  }
  close(): void {
    for (const waiter of [...this.waiters])
      waiter.reject(new TrafficError("NODE_CLOSING"));
  }
}
function authorized(request: IncomingMessage, token: string): boolean {
  const actual = Buffer.from(request.headers.authorization ?? ""),
    expected = Buffer.from("Bearer " + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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
export async function readNodeBody(
  request: IncomingMessage,
  deadline: number,
): Promise<unknown> {
  const contentLength = request.headers["content-length"];
  if (
    contentLength !== undefined &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > 65536)
  ) {
    request.resume();
    throw new TrafficError("BODY_TOO_LARGE");
  }
  if (
    request.headers["content-type"]?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    request.resume();
    throw new TrafficError("INVALID_REQUEST");
  }
  return new Promise((done, reject) => {
    const chunks: Buffer[] = [];
    let length = 0,
      settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("aborted", aborted);
      request.off("error", aborted);
    };
    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      request.resume();
      reject(new TrafficError(reason));
    };
    const data = (chunk: Buffer) => {
      length += chunk.length;
      if (length > 65536) {
        fail("BODY_TOO_LARGE");
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    const end = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        done(parseJson(Buffer.concat(chunks)));
      } catch {
        reject(new TrafficError("INVALID_REQUEST"));
      }
    };
    const aborted = () => fail("INVALID_REQUEST");
    const timer = setTimeout(
      () => fail("REQUEST_DEADLINE"),
      Math.max(1, deadline - performance.now()),
    );
    request.on("data", data);
    request.once("end", end);
    request.once("aborted", aborted);
    request.once("error", aborted);
    if (deadline <= performance.now()) fail("REQUEST_DEADLINE");
  });
}
export interface RunningRoutingNode {
  port: number;
  controller: RoutingNodeController;
  close(): Promise<void>;
}
export async function startRoutingNode(
  config: RoutingNodeConfig,
  hooks: NodeHooks = {},
): Promise<RunningRoutingNode> {
  const controller = await RoutingNodeController.create(config, hooks);
  const server = createServer((request, response) => {
    const deadline = performance.now() + 30000;
    void (async () => {
      if (!authorized(request, config.token)) {
        request.resume();
        respond(response, 401, nodeFailure("AUTH_REQUIRED"));
        return;
      }
      if (request.url === "/internal/v1/status" && request.method === "GET") {
        const status = await controller.status();
        respond(response, status.ready ? 200 : 503, status);
        return;
      }
      if (request.url === "/internal/v1/route" && request.method === "POST") {
        try {
          const result = await controller.route(
            await readNodeBody(request, deadline),
            deadline,
          );
          respond(response, result.status, result.body);
        } catch (error) {
          const reason = nodeReason(error);
          respond(
            response,
            reason === "BODY_TOO_LARGE" || reason === "INVALID_REQUEST"
              ? 422
              : 503,
            nodeFailure(reason),
          );
        }
        return;
      }
      request.resume();
      respond(
        response,
        request.url === "/internal/v1/status" ||
          request.url === "/internal/v1/route"
          ? 405
          : 404,
        nodeFailure("NOT_FOUND"),
      );
    })().catch(() =>
      respond(response, 503, nodeFailure("NODE_OPERATION_FAILED")),
    );
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  try {
    await new Promise<void>((done, reject) => {
      server.once("error", reject);
      server.listen(config.port ?? 0, "127.0.0.1", () => {
        server.off("error", reject);
        done();
      });
    });
  } catch (error) {
    await controller.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new TrafficError("NODE_LISTENER");
  controller.start();
  let closing: Promise<void> | undefined;
  return {
    port: address.port,
    controller,
    close: () =>
      (closing ??= (async () => {
        const serverClosed = new Promise<void>((done, reject) =>
          server.close((error) => (error ? reject(error) : done())),
        );
        server.closeIdleConnections();
        await controller.close();
        server.closeAllConnections();
        await serverClosed;
      })()),
  };
}
export async function runNodeAgent(config: RoutingNodeConfig): Promise<number> {
  const barriers = new NodePhaseBarriers();
  let node: RunningRoutingNode | undefined, stopping: Promise<void> | undefined;
  const send = (message: NodeMessage) => process.send?.(message);
  let finish!: (code: number) => void;
  const completed = new Promise<number>((done) => {
    finish = done;
  });
  const stop = () =>
    (stopping ??= (async () => {
      let cleanup = true;
      barriers.close();
      try {
        await node?.close();
      } catch {
        cleanup = false;
      }
      if (node)
        send({
          type: "STOPPED",
          node_id: config.node_id,
          cleanup_verified: cleanup,
        });
      process.off("message", control);
      process.off("disconnect", disconnected);
      process.off("SIGINT", signal);
      process.off("SIGTERM", signal);
      finish(cleanup ? 0 : 1);
    })());
  const signal = () => {
    void stop();
  };
  const disconnected = () => {
    void stop();
  };
  const control = (value: unknown) => {
    void (async () => {
      if (!value || typeof value !== "object" || !("type" in value) || !node)
        return;
      const message = value as NodeControlMessage;
      const id = "control_id" in message ? message.control_id : "";
      try {
        identifier(id, "control_id");
        if (message.type === "RESUME") {
          if (!NODE_PHASES.includes(message.phase))
            throw new TrafficError("INVALID_CONTROL");
          barriers.resume(message.phase, message.request_id);
          send({ type: "CONTROL_RESULT", control_id: id, code: "APPLIED" });
        } else if (message.type === "SET_NODE_PAUSE") {
          barriers.set(message.phase, message.request_id);
          send({ type: "CONTROL_RESULT", control_id: id, code: "APPLIED" });
        } else if (message.type === "RECONCILE") {
          await node.controller.reconcile(message.pull ?? true);
          const status = await node.controller.status();
          send({
            type: "CONTROL_RESULT",
            control_id: id,
            code: "RECONCILED",
            reason: status.reason,
          });
        } else if (message.type === "SHUTDOWN") {
          send({ type: "CONTROL_RESULT", control_id: id, code: "CLOSING" });
          await stop();
        } else
          send({
            type: "CONTROL_RESULT",
            control_id: id,
            code: "REJECTED",
            reason: "INVALID_CONTROL",
          });
      } catch (error) {
        send({
          type: "CONTROL_RESULT",
          control_id: id,
          code: "REJECTED",
          reason: nodeReason(error),
        });
      }
    })().catch(() => {
      void stop();
    });
  };
  try {
    node = await startRoutingNode(config, {
      phase: (phase, detail, abort) => barriers.wait(phase, detail, abort),
    });
    process.on("message", control);
    process.once("disconnect", disconnected);
    process.once("SIGINT", signal);
    process.once("SIGTERM", signal);
    send({
      type: "READY",
      kind: "routing-node",
      node_id: config.node_id,
      instance_id: node.controller.instance_id,
      pid: process.pid,
      port: node.port,
    });
    return await completed;
  } catch {
    barriers.close();
    await node?.close().catch(() => {});
    return 1;
  }
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    return await runNodeAgent(privateConfig<RoutingNodeConfig>(args));
  } catch {
    process.stderr.write(
      "Use --config PRIVATE_JSON for routing nodes / 경로 노드는 --config PRIVATE_JSON을 사용하세요\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
