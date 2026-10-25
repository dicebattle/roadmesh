/** P12 owns real HTTP/TCP faults around independent native nodes; never a public control surface.
 * P12는 독립 실제 노드 주위의 HTTP/TCP 장애를 소유하며 공개 제어 경로가 아닙니다. */
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateKeyPair, exportJWK } from "jose";
import { prepareNodeSource } from "./node_checks.js";
import {
  OwnedIngestionRuntime,
  pause,
  portIsOpen,
  type OwnedIngestionProcess,
} from "./ingestion_runtime.js";
import { PublicationConsumer } from "./publication_consumer.js";
import { sha256 } from "./shared.js";
import { TRAFFIC_START } from "./traffic_scenario.js";
import type {
  ConsumerConfig,
  PublicationSigner,
  TrustRoot,
} from "./publication_types.js";
import type { RoutingNodeConfig, NodeStatus } from "./node_types.js";
import type { GatewayConfig, GatewayRequest } from "./gateway_types.js";

export type FaultMode = "normal" | "reset" | "blackhole" | "malformed-domain";
export interface ScenarioProxy {
  mode: FaultMode;
  origin: string;
  events: Array<Record<string, unknown>>;
}
export async function scenarioControl(
  child: OwnedIngestionProcess,
  body: Record<string, unknown>,
) {
  const control_id = randomUUID();
  child.send({ ...body, control_id });
  const result = await child.message(
    (m) => m.type === "CONTROL_RESULT" && m.control_id === control_id,
    180000,
  );
  if (result.code === "REJECTED")
    throw Error("Scenario control rejected / 시나리오 제어 거부");
  return result;
}
export class ScenarioRuntime {
  readonly owner: OwnedIngestionRuntime;
  readonly stores: Array<{ close(): Promise<void> }> = [];
  readonly servers: Server[] = [];
  readonly sockets = new Set<Socket>();
  readonly ports: number[] = [];
  readonly secrets: string[] = [];
  readonly nodes: Array<{
    config: RoutingNodeConfig;
    child: OwnedIngestionProcess;
    origin: string;
    proxy: ScenarioProxy;
  }> = [];
  readonly consumers: PublicationConsumer[] = [];
  readonly roots: TrustRoot[] = [];
  readonly signers: PublicationSigner[] = [];
  source!: Awaited<ReturnType<typeof prepareNodeSource>>;
  publisherProxy!: ScenarioProxy;
  gateway!: OwnedIngestionProcess;
  gatewayOrigin = "";
  gatewayConfig!: GatewayConfig;
  gatewayRoots: string[] = [];
  private closed?: Promise<boolean>;
  constructor(readonly output: string) {
    mkdirSync(output);
    for (const dir of [
      "readbacks",
      "public",
      "nodes",
      "gateways",
      "requests",
      "supervisors",
    ])
      mkdirSync(join(output, dir));
    this.owner = new OwnedIngestionRuntime(
      join(output, "runtime"),
      resolve(output),
    );
    this.owner.setBeforeCleanup(async () => {
      await this.closeServers();
    });
  }
  write(file: string, value: unknown) {
    writeFileSync(
      join(this.output, file),
      JSON.stringify(value, null, 2) + "\n",
    );
  }
  private async closeServers() {
    for (const socket of this.sockets) socket.destroy();
    await Promise.all(
      this.servers.map(
        (server) =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      ),
    );
  }
  private async proxy(
    origin: string,
    publisher = false,
  ): Promise<ScenarioProxy> {
    const proxy: ScenarioProxy = { mode: "normal", origin: "", events: [] };
    const server = createServer((req, res) => {
      const event: Record<string, unknown> = {
        path: req.url,
        mode: proxy.mode,
        accepted_ms: performance.now(),
        forwarded: false,
      };
      proxy.events.push(event);
      const closed = () => {
        event.closed_ms = performance.now();
      };
      req.socket.once("close", closed);
      res.once("finish", () => req.socket.off("close", closed));
      const route = req.url === "/internal/v1/route";
      if (publisher || route) {
        if (proxy.mode === "reset") {
          event.reset_ms = performance.now();
          req.socket.destroy();
          return;
        }
        if (proxy.mode === "blackhole") {
          event.held_without_headers = true;
          return;
        }
      }
      void (async () => {
        const parts: Buffer[] = [];
        for await (const part of req) parts.push(Buffer.from(part));
        const bytes = Buffer.concat(parts);
        if (bytes.length) event.request_sha256 = sha256(bytes);
        event.forwarded = true;
        const abort = new AbortController();
        const close = () => {
          if (!res.writableEnded) abort.abort();
        };
        res.once("close", close);
        try {
          const upstream = await fetch(origin + (req.url ?? "/"), {
            method: req.method,
            headers: req.headers as Record<string, string>,
            ...(bytes.length ? { body: bytes } : {}),
            redirect: "error",
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
          });
          const raw = Buffer.from(await upstream.arrayBuffer());
          event.status = upstream.status;
          event.response_sha256 = sha256(raw);
          if (
            route &&
            proxy.mode === "malformed-domain" &&
            upstream.status === 422
          ) {
            const body = JSON.parse(raw.toString());
            body.request_sha256 = "0".repeat(64);
            event.forged_request_hash = true;
            res.writeHead(422, { "content-type": "application/json" });
            res.end(JSON.stringify(body));
          } else {
            const headers = Object.fromEntries(upstream.headers);
            delete headers["transfer-encoding"];
            res.writeHead(upstream.status, headers);
            res.end(raw);
          }
        } finally {
          res.off("close", close);
        }
      })().catch(() => {
        if (!res.destroyed) {
          res.writeHead(502);
          res.end();
        }
      });
    });
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
    this.servers.push(server);
    await new Promise<void>((done, fail) => {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", done);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Proxy address missing / 대리 주소 없음");
    this.ports.push(address.port);
    proxy.origin = `http://127.0.0.1:${address.port}`;
    return proxy;
  }
  async start(graph: string): Promise<void> {
    const f = (this.source = await prepareNodeSource(
      graph,
      this.output,
      this.owner,
      this.stores,
    ));
    this.secrets.push(...f.credentials.map((c) => c.token));
    for (let i = 0; i < 3; i++) {
      const keys = await generateKeyPair("EdDSA", { extractable: true }),
        private_jwk = await exportJWK(keys.privateKey),
        public_jwk = await exportJWK(keys.publicKey),
        kid = `scenario-key-${i}`;
      this.secrets.push(private_jwk.d!);
      this.signers.push({ kid, private_jwk });
      this.roots.push({
        kid,
        public_jwk,
        publisher_id: f.publication.publisher_id,
        simulation_namespace: f.config.namespace,
        region_id: "seoul-pilot-corridors-v1",
        allowed_graph_ids: [f.graph.graphId],
        source_class: "SYNTHETIC",
        valid_from: new Date(Date.parse(TRAFFIC_START) - 60000).toISOString(),
        valid_until: new Date(
          Date.parse(TRAFFIC_START) + 3600000,
        ).toISOString(),
        revoked: false,
      });
    }
    this.write("public/trust-roots.json", this.roots);
    const pub = this.owner.spawn("p12-publication", "publication_service", {
      publication: f.publication,
      port: 0,
    });
    const ready = await pub.message(
      (m) => m.type === "READY" && m.kind === "publication-service",
    );
    this.ports.push(Number(ready.port));
    this.publisherProxy = await this.proxy(
      `http://127.0.0.1:${ready.port}`,
      true,
    );
    const consumer = (id: string): ConsumerConfig => ({
      store: f.config,
      consumer_id: id,
      publisher_id: f.publication.publisher_id,
      region_id: "seoul-pilot-corridors-v1",
      allowed_graph_ids: [f.graph.graphId],
      catalogs: [{ graph_id: f.graph.graphId, edges: f.scene.catalog }],
      trust_roots: this.roots,
      origin: this.publisherProxy.origin,
    });
    for (const id of [
      "scenario-node-a",
      "scenario-node-b",
      "scenario-gateway",
    ]) {
      const c = new PublicationConsumer(consumer(id));
      this.stores.push(c);
      this.consumers.push(c);
      await c.initialize();
    }
    for (const id of ["scenario-node-a", "scenario-node-b"]) {
      mkdirSync(join(this.output, "nodes", id));
      const config: RoutingNodeConfig = {
        node_id: id,
        consumer: consumer(id),
        graph_directory: f.graph.directory,
        bundle_directory: f.bundle.directory,
        generation_root: join(this.output, "nodes", id, "generations"),
        runtime_root: join(this.output, "nodes", id, "runtime"),
        token: randomBytes(24).toString("hex"),
        port: 0,
        poll_interval_ms: 10000,
      };
      this.secrets.push(config.token);
      const child = this.owner.spawn(id, "node_service", config);
      const r = await child.message(
        (m) => m.type === "READY" && m.kind === "routing-node",
        300000,
      );
      this.ports.push(Number(r.port));
      const origin = `http://127.0.0.1:${r.port}`;
      const proxy = await this.proxy(origin);
      this.nodes.push({ config, child, origin, proxy });
      const until = performance.now() + 180000;
      while (!(await this.nodeStatus(this.nodes.length - 1)).ready) {
        if (performance.now() > until)
          throw Error("Node not ready / 노드 준비 시간 초과");
        await pause(100);
      }
    }
    this.gatewayConfig = {
      gateway_id: "scenario-gateway",
      consumer: consumer("scenario-gateway"),
      graph_directory: f.graph.directory,
      bundle_directory: f.bundle.directory,
      generation_root: join(this.output, "gateways", "generations"),
      runtime_root: "",
      token: randomBytes(24).toString("hex"),
      port: 0,
      poll_interval_ms: 10000,
      nodes: this.nodes.map((n) => ({
        node_id: n.config.node_id,
        origin: n.proxy.origin,
        token: n.config.token,
      })) as GatewayConfig["nodes"],
    };
    this.secrets.push(this.gatewayConfig.token);
    await this.restartGateway([]);
  }
  async nodeStatus(index: number): Promise<NodeStatus> {
    const n = this.nodes[index]!;
    const r = await fetch(n.origin + "/internal/v1/status", {
      headers: { authorization: "Bearer " + n.config.token },
      signal: AbortSignal.timeout(5000),
    });
    if (![200, 503].includes(r.status))
      throw Error("Node status failed / 노드 상태 조회 실패");
    const status = (await r.json()) as NodeStatus;
    if (typeof status.ready !== "boolean" || !Array.isArray(status.slots))
      throw Error("Node status invalid / 노드 상태 형식 오류");
    return status;
  }
  async restartGateway(excluded_node_ids: string[]): Promise<void> {
    if (this.gateway) {
      await scenarioControl(this.gateway, { type: "SHUTDOWN" });
      await this.gateway.message((m) => m.type === "STOPPED", 45000);
      await this.gateway.exited(10000);
    }
    const root = join(this.output, "gateways", "runtime-" + randomUUID());
    this.gatewayRoots.push(root);
    this.gatewayConfig = {
      ...this.gatewayConfig,
      runtime_root: root,
      excluded_node_ids: [...excluded_node_ids],
    };
    this.gateway = this.owner.spawn(
      "p12-gateway-" + this.gatewayRoots.length,
      "gateway_service",
      this.gatewayConfig,
    );
    const r = await this.gateway.message(
      (m) => m.type === "READY" && m.kind === "route-gateway",
      180000,
    );
    this.ports.push(Number(r.port));
    this.gatewayOrigin = `http://127.0.0.1:${r.port}`;
  }
  async route(request: GatewayRequest) {
    const start = performance.now();
    const r = await fetch(this.gatewayOrigin + "/v1/routes", {
      method: "POST",
      headers: {
        authorization: "Bearer " + this.gatewayConfig.token,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15000),
    });
    const reply = {
      status: r.status,
      body: (await r.json()) as any,
      elapsed_ms: performance.now() - start,
    };
    if (this.secrets.some((secret) => JSON.stringify(reply).includes(secret)))
      throw Error("Private scenario route refused / 비공개 시나리오 경로 거부");
    this.write("requests/" + request.request_id + ".json", {
      request,
      ...reply,
    });
    return reply;
  }
  async publish(index = 0) {
    const f = this.source,
      publication = await f.publisher.publish(
        new Date(Date.parse(TRAFFIC_START) + 180000).toISOString(),
        f.now,
        this.signers[index]!,
      );
    if (!publication.publication)
      throw Error("Scenario publication failed / 시나리오 게시 실패");
    const p = publication.publication;
    writeFileSync(
      join(this.output, `public/sequence-${p.sequence}.jws.txt`),
      p.jws,
      { flag: "wx" },
    );
    writeFileSync(
      join(this.output, `public/sequence-${p.sequence}.artifact.json`),
      p.artifact,
      { flag: "wx" },
    );
    await this.reconcile();
    return p;
  }
  async reconcile() {
    for (const n of this.nodes)
      await scenarioControl(n.child, { type: "RECONCILE", pull: true });
    await scenarioControl(this.gateway, { type: "RECONCILE", pull: true });
  }
  async advance(ms: number) {
    await this.source.advance(ms);
    await this.reconcile();
  }
  close(): Promise<boolean> {
    return (this.closed ??= (async () => {
      let clean = true;
      try {
        for (const child of [this.gateway, ...this.nodes.map((n) => n.child)])
          if (child?.child?.connected) {
            try {
              await scenarioControl(child, { type: "SHUTDOWN" });
              await child.message((m) => m.type === "STOPPED", 45000);
              await child.exited(10000);
            } catch {
              clean = false;
            }
          }
      } finally {
        for (const s of [...this.stores].reverse())
          try {
            await s.close();
          } catch {
            clean = false;
          }
        try {
          clean = (await this.owner.cleanup()) && clean;
        } catch {
          clean = false;
        }
        for (const p of this.ports) if (await portIsOpen(p)) clean = false;
        this.write("proxies.json", {
          publisher: this.publisherProxy,
          nodes: this.nodes.map((n) => ({
            node_id: n.config.node_id,
            proxy: n.proxy,
          })),
        });
        const processes = this.owner.processes.map((p) => ({
          role: p.role,
          pid: p.child?.pid,
          code: p.child?.exitCode,
          signal: p.child?.signalCode,
          messages: p.messages,
          diagnostics: p.diagnostics.join(""),
        }));
        try {
          const diagnostics = JSON.stringify(processes);
          this.owner.assertSafe(diagnostics);
          if (this.secrets.some((secret) => diagnostics.includes(secret)))
            throw Error();
          this.write("process-events.json", processes);
        } catch {
          clean = false;
          this.write("diagnostic-refusal.json", {
            message_en: "Private scenario diagnostics were refused.",
            message_ko: "비공개 시나리오 진단을 기록하지 않았습니다.",
          });
        }
        this.write("cleanup.json", {
          cleanup_verified: clean,
          ports: this.ports,
          sockets_remaining: this.sockets.size,
        });
      }
      return clean;
    })());
  }
}
