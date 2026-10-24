/** Owned local-pilot bootstrap; source preparation is deliberately separate from HTTP validators.
 * 소유 로컬 파일럿 준비이며 원본 준비와 HTTP 응답 검증을 분리합니다. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { generateKeyPair, exportJWK } from "jose";
import { prepareNodeSource } from "./node_checks.js";
import {
  OwnedIngestionRuntime,
  portIsOpen,
  pause,
  type OwnedIngestionProcess,
} from "./ingestion_runtime.js";
import { PublicationConsumer } from "./publication_consumer.js";
import { durableNodeJSON } from "./node_engine.js";
import { geodesicSphere } from "./geodesy.js";
import { TRAFFIC_START } from "./traffic_scenario.js";
import {
  startClientServer,
  type RunningClientServer,
} from "./client_server.js";
import type { ClientBootstrap, ClientRuntimeConfig } from "./client_types.js";
import type {
  RoutingNodeConfig,
  NodeControlMessage,
  NodeStatus,
} from "./node_types.js";
import type {
  GatewayConfig,
  GatewayControlMessage,
  GatewayRouteContext,
} from "./gateway_types.js";
import type {
  ConsumerConfig,
  PublicationSigner,
  TrustRoot,
} from "./publication_types.js";
type Source = Awaited<ReturnType<typeof prepareNodeSource>>;
export interface ClientNodeHandle {
  node_id: string;
  origin: string;
  process: OwnedIngestionProcess;
  config: RoutingNodeConfig;
}
export function validateClientRuntimeConfig(c: ClientRuntimeConfig): void {
  if (
    !["automatic", "supervised"].includes(c.clock_mode) ||
    !Number.isInteger(c.lifetime_ms ?? 900000) ||
    (c.lifetime_ms ?? 900000) < 1 ||
    (c.lifetime_ms ?? 900000) > 900000
  )
    throw Error("Invalid pilot lifetime / 파일럿 수명 오류");
  for (const p of [c.graph_directory, c.output_directory, c.assets_directory])
    if (typeof p !== "string" || !p || p.includes("\0"))
      throw Error("Invalid pilot path / 파일럿 경로 오류");
}
/** Await owned work only within a finite cleanup budget; late values are never reused.
 * 소유 작업은 유한한 정리 한도 안에서만 기다리며 늦은 결과를 재사용하지 않습니다. */
export async function settleClientWork(
  work: Promise<unknown>,
  milliseconds: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((done) => {
        timer = setTimeout(() => done(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** Only this pilot's source helper is guarded; shared P09 runtime behavior is unchanged.
 * 이 파일럿의 원본 준비만 보호하며 공통 P09 실행 동작은 바꾸지 않습니다. */
class ClientOwnedRuntime extends OwnedIngestionRuntime {
  constructor(
    output: string,
    ownedRoot: string,
    private readonly cancelled: () => boolean,
  ) {
    super(output, ownedRoot);
  }
  private check(): void {
    if (this.cancelled())
      throw Error("Pilot startup cancelled / 파일럿 준비 취소됨");
  }
  override async start(): Promise<string> {
    this.check();
    return super.start();
  }
  override spawn(
    ...args: Parameters<OwnedIngestionRuntime["spawn"]>
  ): OwnedIngestionProcess {
    this.check();
    return super.spawn(...args);
  }
  override spawnCommand(
    ...args: Parameters<OwnedIngestionRuntime["spawnCommand"]>
  ): OwnedIngestionProcess {
    this.check();
    return super.spawnCommand(...args);
  }
}
export class ClientRuntime {
  readonly owner: OwnedIngestionRuntime;
  readonly nodes: ClientNodeHandle[] = [];
  gateway!: OwnedIngestionProcess;
  gatewayOrigin = "";
  private gatewayToken = "";
  bootstrap!: ClientBootstrap;
  private app?: RunningClientServer;
  private source?: Source;
  private stores: Array<{ close(): Promise<void> }> = [];
  private signers: PublicationSigner[] = [];
  private roots: TrustRoot[] = [];
  private nextSigner = 0;
  private corrected = false;
  private closing = false;
  private initializing?: Promise<void>;
  private startupSignal?: AbortSignal;
  private startupAbort?: () => void;
  private closed?: Promise<boolean>;
  private clockTimer?: ReturnType<typeof setInterval>;
  private lifetimeTimer?: ReturnType<typeof setTimeout>;
  private mutations: Promise<unknown> = Promise.resolve();
  private events: unknown[] = [];
  readonly ended: Promise<boolean>;
  private finish!: (clean: boolean) => void;
  private constructor(readonly config: ClientRuntimeConfig) {
    validateClientRuntimeConfig(config);
    mkdirSync(resolve(config.output_directory));
    for (const p of ["nodes", "gateway", "public", "app", "readbacks"])
      mkdirSync(join(config.output_directory, p));
    this.owner = new ClientOwnedRuntime(
      join(config.output_directory, "runtime"),
      resolve(config.output_directory),
      () => this.closing,
    );
    this.ended = new Promise((done) => {
      this.finish = done;
    });
  }
  get origin(): string {
    if (!this.app) throw Error("Client not ready / 화면 준비 전");
    return this.app.origin;
  }
  private record(code: string, detail: unknown = {}): void {
    this.events.push({ code, at_utc: new Date().toISOString(), detail });
    durableNodeJSON(
      join(this.config.output_directory, "events.json"),
      this.events,
    );
  }
  private guard(): Source {
    if (this.closing || !this.source)
      throw Error(
        "Pilot closing or unavailable / 파일럿 종료 중 또는 사용 불가",
      );
    return this.source;
  }
  private mutate<T>(run: () => Promise<T>): Promise<T> {
    const work = this.mutations.then(() => {
      this.guard();
      return run();
    });
    this.mutations = work.catch(() => {});
    return work;
  }
  static async start(
    config: ClientRuntimeConfig,
    signal?: AbortSignal,
  ): Promise<ClientRuntime> {
    if (signal?.aborted)
      throw Error("Pilot startup cancelled / 파일럿 준비 취소됨");
    const runtime = new ClientRuntime(config);
    runtime.startupSignal = signal;
    runtime.startupAbort = () => {
      void runtime.close();
    };
    signal?.addEventListener("abort", runtime.startupAbort, { once: true });
    try {
      runtime.initializing = runtime.initialize();
      await runtime.initializing;
      runtime.guard();
      return runtime;
    } catch (e) {
      try {
        runtime.record("START_FAILED");
      } catch {
        /* Cleanup cannot depend on a writable evidence directory. / 근거 쓰기와 무관하게 정리. */
      } finally {
        await runtime.close();
      }
      throw e;
    }
  }
  private async initialize(): Promise<void> {
    const f = (this.source = await prepareNodeSource(
      this.config.graph_directory,
      this.config.output_directory,
      this.owner,
      this.stores,
    ));
    this.guard();
    const middle = f.scene.targets[1]!,
      edge = f.graph.edges.find(
        (e) => e.edge_id === middle.edge_id && e.forward === middle.forward,
      )!;
    const start = geodesicSphere.position(
        edge.directed_geometry,
        middle.distance_m * 0.35,
      ),
      end = geodesicSphere.position(
        edge.directed_geometry,
        middle.distance_m * 0.65,
      );
    const roads = f.graph.context_roads.map((r) => ({
      type: "Feature" as const,
      properties: { name: r.name },
      geometry: { type: "LineString" as const, coordinates: r.coordinates },
    }));
    const points = roads.flatMap((r) => r.geometry.coordinates);
    this.bootstrap = {
      schema_version: "0.1",
      graph_id: f.graph.graphId,
      source_class: "SYNTHETIC",
      clock_basis: "SIMULATION_EVENT_TIME",
      bounds: [
        Math.min(...points.map((p) => p[0]!)),
        Math.min(...points.map((p) => p[1]!)),
        Math.max(...points.map((p) => p[0]!)),
        Math.max(...points.map((p) => p[1]!)),
      ],
      roads: { type: "FeatureCollection", features: roads },
      presets: {
        long: {
          origin: { longitude: 127.029, latitude: 37.4984 },
          destination: { longitude: 127.049, latitude: 37.5045 },
        },
        short: {
          origin: { longitude: start[0]!, latitude: start[1]! },
          destination: { longitude: end[0]!, latitude: end[1]! },
        },
      },
      attribution: {
        text: "© OpenStreetMap contributors · ODbL 1.0",
        url: "https://www.openstreetmap.org/copyright",
      },
    };
    durableNodeJSON(
      join(this.config.output_directory, "app/bootstrap.json"),
      this.bootstrap,
    );
    durableNodeJSON(
      join(this.config.output_directory, "source/route-inputs.json"),
      {
        selected_before_native_routing: true,
        target: middle,
        original_geometry: edge.directed_geometry,
        source_fraction: 0.35,
        target_fraction: 0.65,
        short: this.bootstrap.presets.short,
        long: this.bootstrap.presets.long,
      },
    );
    for (let i = 0; i < 8; i++) {
      this.guard();
      const key = await generateKeyPair("EdDSA", { extractable: true }),
        private_jwk = await exportJWK(key.privateKey),
        public_jwk = await exportJWK(key.publicKey),
        kid = "client-key-" + i;
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
    durableNodeJSON(
      join(this.config.output_directory, "public/trust-roots.json"),
      this.roots,
    );
    const publisher = this.owner.spawn(
      "p11-publication-service",
      "publication_service",
      { publication: f.publication, port: 0 },
    );
    const pubReady = await publisher.message(
      (m) => m.type === "READY" && m.kind === "publication-service",
    );
    this.guard();
    const consumer = (id: string): ConsumerConfig => ({
      store: f.config,
      consumer_id: id,
      publisher_id: f.publication.publisher_id,
      region_id: "seoul-pilot-corridors-v1",
      allowed_graph_ids: [f.graph.graphId],
      catalogs: [{ graph_id: f.graph.graphId, edges: f.scene.catalog }],
      trust_roots: this.roots,
      origin: `http://127.0.0.1:${pubReady.port}`,
    });
    for (const id of ["p11-node-a", "p11-node-b", "p11-gateway"]) {
      const store = new PublicationConsumer(consumer(id));
      this.stores.push(store);
      this.guard();
      await store.initialize();
      this.guard();
    }
    for (const [i, id] of ["client-node-a", "client-node-b"].entries()) {
      mkdirSync(join(this.config.output_directory, "nodes", id));
      const c: RoutingNodeConfig = {
        node_id: id,
        consumer: consumer(i === 0 ? "p11-node-a" : "p11-node-b"),
        graph_directory: f.graph.directory,
        bundle_directory: f.bundle.directory,
        generation_root: join(
          this.config.output_directory,
          "nodes",
          id,
          "generations",
        ),
        runtime_root: join(
          this.config.output_directory,
          "nodes",
          id,
          "runtime-" + randomUUID(),
        ),
        token: randomBytes(24).toString("hex"),
        port: 0,
        poll_interval_ms: 500,
      };
      this.nodes.push(await this.startNode(c));
    }
    const gatewayToken = randomBytes(24).toString("hex"),
      gatewayConfig: GatewayConfig = {
        gateway_id: "client-gateway",
        consumer: consumer("p11-gateway"),
        graph_directory: f.graph.directory,
        bundle_directory: f.bundle.directory,
        generation_root: join(
          this.config.output_directory,
          "gateway/generations",
        ),
        runtime_root: join(this.config.output_directory, "gateway/runtime"),
        token: gatewayToken,
        port: 0,
        nodes: this.nodes.map((n) => ({
          node_id: n.node_id,
          origin: n.origin,
          token: n.config.token,
        })) as GatewayConfig["nodes"],
      };
    this.gatewayToken = gatewayToken;
    this.gateway = this.owner.spawn(
      "p11-gateway",
      "gateway_service",
      gatewayConfig,
    );
    const ready = await this.gateway.message(
      (m) => m.type === "READY" && m.kind === "route-gateway",
    );
    this.gatewayOrigin = `http://127.0.0.1:${ready.port}`;
    this.guard();
    if (this.config.clock_mode === "automatic") await this.publish(false);
    this.app = await startClientServer({
      gateway_origin: this.gatewayOrigin,
      gateway_token: gatewayToken,
      assets_directory: this.config.assets_directory,
      bootstrap: this.bootstrap,
      evidence_directory: join(this.config.output_directory, "app"),
    });
    if (this.closing) {
      await this.app.close();
      throw Error("Pilot startup cancelled / 파일럿 준비 취소됨");
    }
    this.record("READY", {
      origin: this.origin,
      clock_mode: this.config.clock_mode,
      lifetime_ms: this.config.lifetime_ms ?? 900000,
    });
    // The interactive lifetime begins only after startup; preparation evidence is preserved separately.
    // 대화형 수명은 준비가 끝난 시점부터이며 원본 준비 근거는 별도 보존합니다.
    this.lifetimeTimer = setTimeout(() => {
      void this.close();
    }, this.config.lifetime_ms ?? 900000);
    if (this.config.clock_mode === "automatic") {
      const began = performance.now();
      let busy = false;
      this.clockTimer = setInterval(() => {
        if (busy || this.closing) return;
        busy = true;
        void this.mutate(() =>
          f.advance(270000 + Math.floor(performance.now() - began)),
        )
          .catch(() => {
            void this.close();
          })
          .finally(() => {
            busy = false;
          });
      }, 500);
    }
  }
  private async startNode(
    config: RoutingNodeConfig,
  ): Promise<ClientNodeHandle> {
    this.guard();
    const child = this.owner.spawn(
      "p11-node-" + config.node_id + "-" + randomUUID(),
      "node_service",
      config,
    );
    const ready = await child.message(
      (m) => m.type === "READY" && m.kind === "routing-node",
      300000,
    );
    this.guard();
    const handle = {
      node_id: config.node_id,
      origin: `http://127.0.0.1:${ready.port}`,
      process: child,
      config: { ...config, port: Number(ready.port) },
    };
    const began = performance.now();
    while (performance.now() - began < 180000) {
      const s = await this.statusNode(handle);
      this.guard();
      if (s.ready) return handle;
      await pause(100);
    }
    throw Error("Native node readiness deadline / 지속 노드 준비 기한");
  }
  async statusNode(node: ClientNodeHandle): Promise<NodeStatus> {
    const response = await fetch(node.origin + "/internal/v1/status", {
      headers: { authorization: "Bearer " + node.config.token },
      signal: AbortSignal.timeout(5000),
    });
    return (await response.json()) as NodeStatus;
  }
  private async control(
    child: OwnedIngestionProcess,
    message: Record<string, unknown>,
  ): Promise<any> {
    this.guard();
    const control_id =
      typeof message.control_id === "string"
        ? message.control_id
        : "client-" + randomUUID();
    child.send({ ...message, control_id });
    const result = await child.message(
      (m) => m.type === "CONTROL_RESULT" && m.control_id === control_id,
      180000,
    );
    this.record("CONTROL", {
      role: child.role,
      request_type: message.type,
      control_id,
      code: result.code,
    });
    if (result.code === "REJECTED")
      throw Error("Private control rejected / 비공개 제어 거부");
    return result;
  }
  gatewayControl(message: GatewayControlMessage): Promise<any> {
    return this.control(
      this.gateway,
      message as unknown as Record<string, unknown>,
    );
  }
  nodeControl(node_id: string, message: NodeControlMessage): Promise<any> {
    const node = this.nodes.find((n) => n.node_id === node_id);
    if (!node) throw Error("Unknown node / 알 수 없는 노드");
    return this.control(
      node.process,
      message as unknown as Record<string, unknown>,
    );
  }
  async context(): Promise<GatewayRouteContext> {
    this.guard();
    const r = await fetch(this.gatewayOrigin + "/v1/route-context", {
      headers: { authorization: "Bearer " + this.gatewayToken },
      signal: AbortSignal.timeout(2500),
    });
    if (r.status !== 200) throw Error("Context unavailable / 문맥 사용 불가");
    return r.json() as Promise<GatewayRouteContext>;
  }
  advance(event_ms: number): Promise<string> {
    if (this.config.clock_mode !== "supervised")
      throw Error("Clock is automatic / 시계 자동 진행 중");
    return this.mutate(async () => {
      const f = this.guard(),
        current = Date.parse(f.now) - Date.parse(TRAFFIC_START);
      if (
        !Number.isInteger(event_ms) ||
        event_ms < current ||
        event_ms < 270000
      )
        throw Error("Clock cannot move backward / 시계 역행 불가");
      const result = await f.advance(event_ms);
      this.guard();
      this.record("CLOCK_ADVANCED", { event_ms });
      await this.reconcile();
      return result;
    });
  }
  private async reconcile(): Promise<void> {
    for (const n of this.nodes) {
      if (n.process.child?.connected)
        await this.control(n.process, { type: "RECONCILE", pull: true });
    }
    await this.control(this.gateway, { type: "RECONCILE", pull: true });
  }
  private async publish(correction: boolean): Promise<unknown> {
    const f = this.guard();
    if (
      Date.parse(f.now) >= Date.parse(TRAFFIC_START) + 420000 ||
      (!correction && this.corrected)
    )
      throw Error(
        "Live candidate expired or corrected / 실시간 후보 만료 또는 정정됨",
      );
    if (correction) {
      if (this.corrected) throw Error("Already corrected / 이미 정정됨");
      this.corrected = true;
      for (const i of [0, 5, 10]) {
        this.guard();
        const response = await f.post(i, "/v1/consent/revoke");
        this.guard();
        if (response.status !== 200)
          throw Error("Consent revocation failed / 동의 철회 실패");
      }
      const candidate = await f.aggregate.finalize(
        new Date(Date.parse(TRAFFIC_START) + 180000).toISOString(),
        f.now,
      );
      this.guard();
      durableNodeJSON(
        join(this.config.output_directory, "readbacks/correction.json"),
        candidate,
      );
    }
    this.guard();
    const signer = this.signers[this.nextSigner++];
    if (!signer)
      throw Error(
        "Pilot signing-key allowance exhausted / 파일럿 서명키 한도 소진",
      );
    const result = await f.publisher.publish(
      new Date(Date.parse(TRAFFIC_START) + 180000).toISOString(),
      f.now,
      signer,
    );
    this.guard();
    if (!result.publication) throw Error("Publication failed / 게시 실패");
    const pub = result.publication;
    durableNodeJSON(
      join(
        this.config.output_directory,
        `public/sequence-${pub.sequence}.json`,
      ),
      JSON.parse(Buffer.from(pub.artifact).toString()),
    );
    // Exact signed bytes are preserved in addition to the human-readable artifact.
    // 사람이 읽는 자료와 별도로 정확한 서명 바이트를 보존합니다.
    const { writeFileSync } = await import("node:fs");
    this.guard();
    writeFileSync(
      join(
        this.config.output_directory,
        `public/sequence-${pub.sequence}.artifact.json`,
      ),
      pub.artifact,
      { flag: "wx" },
    );
    writeFileSync(
      join(
        this.config.output_directory,
        `public/sequence-${pub.sequence}.jws.txt`,
      ),
      pub.jws,
      { flag: "wx" },
    );
    this.record("PUBLISHED", {
      sequence: pub.sequence,
      snapshot_id: pub.traffic_snapshot_id,
      mode: correction ? "correction" : "live",
    });
    await this.reconcile();
    return { sequence: pub.sequence, snapshot_id: pub.traffic_snapshot_id };
  }
  publishLive(): Promise<unknown> {
    return this.mutate(() => this.publish(false));
  }
  publishCorrection(): Promise<unknown> {
    return this.mutate(() => this.publish(true));
  }
  async nodeKill(node_id: string): Promise<void> {
    const n = this.nodes.find((n) => n.node_id === node_id);
    if (
      !n ||
      !n.process.child ||
      n.process.child.exitCode !== null ||
      n.process.child.signalCode !== null
    )
      throw Error("Owned node unavailable / 소유 노드 사용 불가");
    n.process.child.kill("SIGKILL");
    const exit = await n.process.exited(30000);
    this.record("NODE_SIGKILL", { node_id, pid: n.process.child.pid, exit });
  }
  async restartNode(node_id: string): Promise<void> {
    this.guard();
    const index = this.nodes.findIndex((n) => n.node_id === node_id),
      old = this.nodes[index];
    if (
      !old ||
      (old.process.child?.exitCode === null &&
        old.process.child?.signalCode === null)
    )
      throw Error(
        "Node must be stopped before restart / 재시작 전 노드 종료 필요",
      );
    if (await portIsOpen(old.config.port!))
      throw Error("Owned port is occupied / 소유 포트 점유됨");
    const directory = join(old.config.runtime_root, "engines");
    if (existsSync(directory))
      for (const entry of readdirSync(directory)) {
        const o = JSON.parse(
            readFileSync(join(directory, entry, "ownership.json"), "utf8"),
          ),
          inspection = this.owner.commands.command(
            ["inspect", o.container_id ?? o.container_name],
            10000,
            true,
          );
        if (inspection.status !== 0) {
          if (!/No such (?:container|object)/i.test(inspection.stderr))
            throw Error("Engine inspection failed / 엔진 검사 실패");
          continue;
        }
        const d = JSON.parse(inspection.stdout)[0];
        if (
          d.Id !== o.container_id ||
          d.Name !== "/routelens-p02-" + o.owner_id ||
          d.Config.Labels["io.routelens.run_id"] !== o.owner_id ||
          !d.Mounts.some(
            (m: any) =>
              m.Destination === "/work" &&
              resolve(m.Source) === resolve(o.work_directory) &&
              resolve(m.Source).startsWith(
                resolve(this.config.output_directory) + "/",
              ),
          )
        )
          throw Error("Engine ownership mismatch / 엔진 소유 불일치");
        this.owner.commands.command(["rm", "-f", d.Id]);
        const absent = this.owner.commands.command(
          ["inspect", d.Id],
          10000,
          true,
        );
        if (
          absent.status === 0 ||
          !/No such (?:container|object)/i.test(absent.stderr)
        )
          throw Error("Engine remains / 엔진 잔존");
      }
    const config = {
      ...old.config,
      runtime_root: join(
        this.config.output_directory,
        "nodes",
        node_id,
        "runtime-" + randomUUID(),
      ),
    };
    this.nodes[index] = await this.startNode(config);
    this.record("NODE_RESTARTED", { node_id, port: config.port });
  }
  close(): Promise<boolean> {
    return (this.closed ??= (async () => {
      this.closing = true;
      clearTimeout(this.lifetimeTimer);
      clearInterval(this.clockTimer);
      this.startupSignal?.removeEventListener("abort", this.startupAbort!);
      let clean = true,
        ownerCleaned = false,
        appClosed = !this.app;
      try {
        try {
          await this.app?.close();
          appClosed = true;
        } catch {
          clean = false;
        }
        const settled = await settleClientWork(this.mutations, 3000);
        if (!settled) {
          clean = false;
          // Reaping our exact DB/children breaks unresolved PG work; later continuations hit closing guards.
          // 정확한 소유 DB·자식을 회수해 미완료 PG 작업을 끊고 늦은 연속 작업은 종료 검사로 거부합니다.
          try {
            await this.owner.cleanup();
            ownerCleaned = true;
          } catch {
            clean = false;
          }
        } else if (
          !this.initializing ||
          (await settleClientWork(this.initializing, 0))
        ) {
          for (const child of [
            this.gateway,
            ...this.nodes.map((n) => n.process),
          ]) {
            if (child?.child?.connected)
              try {
                const id = "close-" + randomUUID();
                child.send({ type: "SHUTDOWN", control_id: id });
                if (
                  !(await settleClientWork(
                    (async () => {
                      await child.message((m) => m.type === "STOPPED", 35000);
                      await child.exited(5000);
                    })(),
                    40000,
                  ))
                )
                  clean = false;
              } catch {
                clean = false;
              }
          }
        }
        if (!ownerCleaned)
          try {
            clean = (await this.owner.cleanup()) && clean;
          } catch {
            clean = false;
          }
        if (this.initializing) await settleClientWork(this.initializing, 5000);
        if (!(await settleClientWork(this.mutations, 3000))) clean = false;
        try {
          await this.app?.close();
          appClosed = true;
        } catch {
          clean = false;
        }
        for (const store of this.stores.reverse())
          if (
            !(await settleClientWork(
              Promise.resolve().then(() => store.close()),
              3000,
            ))
          )
            clean = false;
        const processes = this.owner.processes.map((p) => ({
          role: p.role,
          pid: p.child?.pid,
          exit_code: p.child?.exitCode,
          signal: p.child?.signalCode,
          messages: p.messages,
          diagnostics: p.diagnostics.join(""),
        }));
        try {
          this.owner.assertSafe(JSON.stringify(processes));
          durableNodeJSON(
            join(this.config.output_directory, "process-events.json"),
            processes,
          );
        } catch {
          clean = false;
        }
      } catch {
        clean = false;
      } finally {
        try {
          durableNodeJSON(join(this.config.output_directory, "cleanup.json"), {
            cleanup_verified: clean,
            app_closed: appClosed,
            source_class: "SYNTHETIC",
            message_en:
              "Owned interactive pilot resources stopped; failures remain explicit.",
            message_ko: "소유 대화형 파일럿 자원을 종료하며 실패는 명시합니다.",
          });
        } catch {
          clean = false;
        }
        this.finish(clean);
      }
      return clean;
    })());
  }
}
