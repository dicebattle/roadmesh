/** Independent durable authority and bounded two-node routing / 독립 영속 승인·제한된 두 노드 계산. */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonical, identifier, parseJson, record, sha256 } from "./shared.js";
import { PublicationConsumer } from "./publication_consumer.js";
import { assertSameTrafficSelection } from "./traffic_controller.js";
import { durableNodeJSON } from "./node_engine.js";
import { GatewayCompilerAdapter } from "./gateway_compiler.js";
import { sphericalDistance, polylineLength } from "./geodesy.js";
import type { AcceptedInspection } from "./publication_types.js";
import type { TrafficGeneration } from "./traffic_types.js";
import type {
  GatewayConfig,
  GatewayDependencies,
  GatewayFailure,
  GatewayHooks,
  GatewayNode,
  GatewayReason,
  GatewayReply,
  GatewayRequest,
  GatewayRouteOptions,
  GatewayStatus,
  GatewaySuccess,
} from "./gateway_types.js";

export const GATEWAY_REQUEST_MS = 12000;
export const GATEWAY_DEADLINE_HEADER = "x-routelens-deadline-ms";
export class GatewayError extends Error {
  constructor(readonly reason: GatewayReason) {
    super(reason);
  }
}
function reject(reason: GatewayReason): never {
  throw new GatewayError(reason);
}
class PeerError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
export function gatewayFailure(reason: GatewayReason): GatewayFailure {
  return {
    code: "ERROR",
    reason,
    message_en:
      "The gateway cannot return a current verified route for this request.",
    message_ko: "이 요청에 현재 검증된 경로를 반환할 수 없습니다.",
  };
}
export function gatewayHttpStatus(reason: GatewayReason): number {
  return (
    {
      AUTH_REQUIRED: 401,
      INVALID_INPUT: 422,
      UNSUPPORTED_POLICY: 422,
      RATE_LIMITED: 429,
      VERSION_MISMATCH: 409,
      TRAFFIC_CHANGED: 409,
      NO_HEALTHY_NODE: 503,
      STORE_UNAVAILABLE: 503,
      DEADLINE_EXCEEDED: 504,
    } as const
  )[reason];
}
export function gatewayReason(error: unknown): GatewayReason {
  return error instanceof GatewayError ? error.reason : "NO_HEALTHY_NODE";
}
export function validateGatewayConfig(c: GatewayConfig): void {
  try {
    identifier(c.gateway_id, "gateway_id");
    if (
      !/^[A-Za-z0-9_-]{32,256}$/.test(c.token) ||
      !/^p(?:09|10)-[a-z0-9_-]+$/.test(c.consumer.store.namespace) ||
      !Array.isArray(c.nodes) ||
      c.nodes.length !== 2
    )
      throw Error();
    if (
      !Number.isInteger(c.port ?? 0) ||
      (c.port ?? 0) < 0 ||
      (c.port ?? 0) > 65535 ||
      !Number.isInteger(c.poll_interval_ms ?? 500) ||
      (c.poll_interval_ms ?? 500) < 100 ||
      (c.poll_interval_ms ?? 500) > 10000
    )
      throw Error();
    for (const p of [
      c.graph_directory,
      c.bundle_directory,
      c.generation_root,
      c.runtime_root,
    ])
      if (typeof p !== "string" || !p || p.includes("\0")) throw Error();
    for (const n of c.nodes) {
      identifier(n.node_id, "node_id");
      const u = new URL(n.origin);
      if (
        n.origin !== `http://127.0.0.1:${u.port}` ||
        !u.port ||
        Number(u.port) < 1 ||
        u.hostname !== "127.0.0.1" ||
        u.protocol !== "http:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/" ||
        typeof n.token !== "string" ||
        !n.token.trim() ||
        /[\r\n]/.test(n.token)
      )
        throw Error();
    }
    if (
      new Set(c.nodes.map((n) => n.node_id)).size !== 2 ||
      new Set(c.nodes.map((n) => n.origin)).size !== 2
    )
      throw Error();
  } catch {
    reject("INVALID_INPUT");
  }
}
export function validateGatewayRequest(
  value: unknown,
): asserts value is GatewayRequest {
  try {
    record(value, "request", [
      "schema_version",
      "request_id",
      "origin",
      "destination",
      "profile",
      "traffic_policy",
    ]);
    identifier(value.request_id, "request_id");
    if (value.schema_version !== "0.1" || value.profile !== "car")
      throw Error();
    for (const p of [value.origin, value.destination]) {
      record(p, "coordinate", ["latitude", "longitude"]);
      if (
        typeof p.latitude !== "number" ||
        !Number.isFinite(p.latitude) ||
        Math.abs(p.latitude) > 90 ||
        typeof p.longitude !== "number" ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.longitude) > 180
      )
        throw Error();
    }
  } catch {
    reject("INVALID_INPUT");
  }
  if (value.traffic_policy === ("base_only" as string))
    reject("UNSUPPORTED_POLICY");
  if (value.traffic_policy !== "prefer_live") reject("INVALID_INPUT");
}
function object(x: unknown): Record<string, any> {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw Error("object");
  return x as Record<string, any>;
}
function finite(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}
/** Decode upstream polyline6 without depending on verification/test modules.
 * 검증·시험 모듈에 의존하지 않고 상위 polyline6를 해독합니다. */
export function decodeGatewayShape(encoded: unknown): number[][] {
  if (typeof encoded !== "string" || !encoded || encoded.length > 1024 * 1024)
    throw Error("shape");
  let i = 0,
    lat = 0,
    lon = 0;
  const points: number[][] = [];
  const component = () => {
    let r = 0,
      shift = 0,
      b = 0;
    do {
      if (i >= encoded.length || shift > 30) throw Error("shape");
      b = encoded.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) throw Error("shape");
      r += (b & 31) * 2 ** shift;
      shift += 5;
    } while (b >= 32);
    return r % 2 ? -(r + 1) / 2 : r / 2;
  };
  while (i < encoded.length) {
    lat += component();
    lon += component();
    if (Math.abs(lat) > 90e6 || Math.abs(lon) > 180e6) throw Error("shape");
    points.push([lon / 1e6, lat / 1e6]);
  }
  if (points.length < 2) throw Error("shape");
  return points;
}
function sameState(a: AcceptedInspection, b: AcceptedInspection): void {
  try {
    assertSameTrafficSelection(a, b);
  } catch {
    reject("TRAFFIC_CHANGED");
  }
}
function expectedNative(r: GatewayRequest) {
  return {
    locations: [
      { lon: r.origin.longitude, lat: r.origin.latitude },
      { lon: r.destination.longitude, lat: r.destination.latitude },
    ],
    costing: "auto",
    units: "kilometers",
    language: "en-US",
    date_time: { type: 0 },
  };
}
function compatible(
  raw: unknown,
  node: GatewayNode,
  bundle: GatewayDependencies["bundle"],
  g: TrafficGeneration,
): boolean {
  try {
    const p = object(raw);
    return (
      p.graph_id === bundle.graph_id &&
      p.generation_id === g.generation_id &&
      p.traffic_snapshot_id === g.traffic_snapshot_id &&
      p.sequence === g.sequence &&
      p.traffic_sha256 === g.traffic_sha256 &&
      p.traffic_byte_length === g.traffic_byte_length &&
      p.compiler_policy === g.compiler_policy &&
      p.valid_until === g.valid_until &&
      p.engine?.image_id === bundle.image_id &&
      p.engine?.version === "3.9.1" &&
      Number.isSafeInteger(p.high_water) &&
      p.high_water >= 0 &&
      (g.sequence === null || p.high_water === g.sequence)
    );
  } catch {
    return false;
  }
}
/** Derive public geometry and live distance only from the original native route/trace.
 * 원래 네이티브 경로·추적에서만 공개 지형과 실시간 적용 거리를 계산합니다. */
export function validateGatewayNodeResult(
  raw: unknown,
  r: GatewayRequest,
  node: GatewayNode,
  bundle: GatewayDependencies["bundle"],
  g: TrafficGeneration,
): Omit<GatewaySuccess, "calculated_at"> {
  const v = object(raw);
  record(v, "node result", [
    "code",
    "request_id",
    "node_id",
    "instance_id",
    "engine_result",
    "provenance",
  ]);
  if (!compatible(v.provenance, node, bundle, g))
    throw new PeerError("WRONG_GENERATION");
  if (
    v.code !== "ROUTE" ||
    v.request_id !== r.request_id ||
    v.node_id !== node.node_id ||
    typeof v.instance_id !== "string"
  )
    throw new PeerError("WRONG_REQUEST");
  const e = object(v.engine_result);
  record(e, "native result", ["request", "route", "trace"]);
  if (!canonical(e.request).equals(canonical(expectedNative(r))))
    throw new PeerError("WRONG_REQUEST");
  const trip = object(object(e.route).trip),
    legs = trip.legs;
  if (trip.status !== 0 || !Array.isArray(legs) || legs.length !== 1)
    throw Error("route");
  const summary = object(trip.summary),
    leg = object(legs[0]),
    trace = object(e.trace);
  if (
    !finite(summary.length) ||
    !finite(summary.time) ||
    !finite(summary.cost) ||
    trace.units !== "kilometers" ||
    !Array.isArray(trace.edges) ||
    trace.edges.length === 0
  )
    throw Error("summary");
  const coordinates = decodeGatewayShape(leg.shape),
    traceShape = decodeGatewayShape(trace.shape);
  // edge_walk preserves ordered vertices, with at most one polyline6 tick of requantization.
  // edge_walk의 순서 정점은 polyline6 재양자화 한 눈금 이내로 보존되어야 합니다.
  if (
    coordinates.length !== traceShape.length ||
    coordinates.some((p, i) =>
      p.some((x, j) => Math.abs(x - traceShape[i]![j]!) > 0.000001000001),
    )
  )
    throw Error("trace geometry continuity");
  if (
    sphericalDistance(coordinates[0]!, [
      r.origin.longitude,
      r.origin.latitude,
    ]) > 100 ||
    sphericalDistance(coordinates.at(-1)!, [
      r.destination.longitude,
      r.destination.latitude,
    ]) > 100
  )
    throw Error("route endpoints");
  const live = new Set(g.live_edges.map((x) => x.edge_id));
  let total = 0,
    covered = 0;
  for (const [index, entry] of trace.edges.entries()) {
    const edge = object(entry);
    if (!Number.isSafeInteger(edge.id) || edge.id < 0 || !finite(edge.length))
      throw Error("trace edge");
    const source = edge.source_percent_along ?? 0,
      target = edge.target_percent_along ?? 1;
    if (
      !finite(source) ||
      source > 1 ||
      !finite(target) ||
      target > 1 ||
      source > target ||
      (index !== 0 && edge.source_percent_along !== undefined) ||
      (index !== trace.edges.length - 1 &&
        edge.target_percent_along !== undefined)
    )
      throw Error("trace partial bounds");
    // Upstream 3.9.1 serializes already trimmed length_km to three decimals.
    // 상위3.9.1은 이미 잘린 길이를 소수 세 자리 km로 내보내므로 비율을 다시 곱하지 않습니다.
    total += edge.length * 1000;
    if (live.has(String(edge.id))) covered += edge.length * 1000;
  }
  const distance = summary.length * 1000,
    geometryLength = polylineLength(coordinates),
    tolerance = trace.edges.length * 0.5 + 2;
  if (
    total <= 0 ||
    Math.abs(total - distance) > tolerance ||
    Math.abs(geometryLength - distance) > Math.max(tolerance, distance * 0.01)
  )
    throw Error("trace length");
  const ratio = covered / total;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
    throw Error("coverage");
  return {
    request_id: r.request_id,
    request_sha256: sha256(canonical(r)),
    graph_id: bundle.graph_id,
    snapshot_id: g.traffic_snapshot_id,
    sequence: g.sequence,
    generation_id: g.generation_id,
    traffic_sha256: g.traffic_sha256,
    engine_version: "3.9.1",
    image_id: bundle.image_id,
    costing_config_id: g.compiler_policy,
    node_id: node.node_id,
    traffic_mode: ratio > 0 ? "LIVE_MIXED" : "BASE_ONLY",
    distance_m: distance,
    duration_s: summary.time,
    geometry: { type: "LineString", coordinates },
    live_coverage_ratio: ratio,
    warnings:
      ratio > 0
        ? []
        : [
            {
              code: g.traffic_snapshot_id
                ? "NO_ROUTE_LIVE_COVERAGE"
                : "NO_USABLE_SNAPSHOT",
              message_en: g.traffic_snapshot_id
                ? "This route has no accepted live edge coverage; default speeds apply."
                : "No usable snapshot is accepted; default speeds apply.",
              message_ko: g.traffic_snapshot_id
                ? "이 경로에 수용된 실시간 구간이 없어 기본 속도를 적용합니다."
                : "사용 가능한 수용 자료가 없어 기본 속도를 적용합니다.",
            },
          ],
  };
}
function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((done, fail) => {
    const abort = () => fail(new GatewayError("DEADLINE_EXCEEDED"));
    if (signal.aborted) {
      // A caller can stop waiting without leaving the owned worker's late rejection unhandled.
      // 요청 대기는 멈추되 소유 작업자의 늦은 거부를 수거합니다.
      void promise.catch(() => {});
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", abort);
        done(v);
      },
      (e) => {
        signal.removeEventListener("abort", abort);
        fail(e);
      },
    );
  });
}
type StoreJob = {
  run: () => Promise<unknown>;
  done: (value: unknown) => void;
  fail: (error: unknown) => void;
  deadline: number;
};
export class GatewayController {
  readonly instance_id = randomUUID();
  private closing = false;
  private admission = 0;
  private interval?: ReturnType<typeof setInterval>;
  private reconciling?: Promise<void>;
  private storeActive?: { timedOut: boolean };
  private storeQueue: StoreJob[] = [];
  private closeSignal = new AbortController();
  private requests = new Set<AbortController>();
  private reason = "NOT_READY";
  constructor(
    readonly config: GatewayConfig,
    private readonly dependencies: GatewayDependencies,
    private readonly hooks: GatewayHooks = {},
  ) {
    validateGatewayConfig(config);
    mkdirSync(resolve(config.runtime_root));
    mkdirSync(join(config.runtime_root, "requests"));
    durableNodeJSON(join(config.runtime_root, "gateway-ownership.json"), {
      gateway_id: config.gateway_id,
      instance_id: this.instance_id,
      pid: process.pid,
      consumer_id: config.consumer.consumer_id,
      simulation_namespace: config.consumer.store.namespace,
      graph_id: dependencies.bundle.graph_id,
      runtime_root: resolve(config.runtime_root),
    });
  }
  static async create(
    config: GatewayConfig,
    hooks: GatewayHooks = {},
  ): Promise<GatewayController> {
    validateGatewayConfig(config);
    const compiler = await GatewayCompilerAdapter.start(
      {
        bundle_directory: config.bundle_directory,
        graph_directory: config.graph_directory,
        generation_root: config.generation_root,
      },
      resolve(config.runtime_root) + ".compiler-" + randomUUID(),
    );
    let store: PublicationConsumer | undefined;
    try {
      const bundle = await compiler.loadBundle();
      const catalog = config.consumer.catalogs.find(
        (c) => c.graph_id === bundle.graph_id,
      );
      if (
        bundle.graph_id !== config.consumer.store.graph_id ||
        !catalog ||
        !canonical(
          [...catalog.edges].sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
        ).equals(
          canonical(
            [...bundle.catalog].sort((a, b) =>
              a.edge_id.localeCompare(b.edge_id),
            ),
          ),
        )
      )
        reject("VERSION_MISMATCH");
      store = new PublicationConsumer(config.consumer);
      return new GatewayController(
        config,
        {
          bundle,
          store,
          compile: (input) => compiler.prepare(input),
          verifyGeneration: (g) => compiler.verify(g),
          closeCompiler: () => compiler.close(),
          fetch: globalThis.fetch,
        },
        hooks,
      );
    } catch (error) {
      try {
        await store?.close();
      } finally {
        await compiler.close();
      }
      throw error;
    }
  }
  private storeCall<T>(run: () => Promise<T>, deadline: number): Promise<T> {
    if (
      this.closing ||
      this.storeActive?.timedOut ||
      this.storeQueue.length >= 16
    )
      return Promise.reject(new GatewayError("STORE_UNAVAILABLE"));
    return new Promise((done, fail) => {
      this.storeQueue.push({ run, done: (v) => done(v as T), fail, deadline });
      this.pump();
    });
  }
  private pump(): void {
    if (this.storeActive || this.closing) return;
    const job = this.storeQueue.shift();
    if (!job) return;
    if (job.deadline <= performance.now()) {
      job.fail(new GatewayError("DEADLINE_EXCEEDED"));
      this.pump();
      return;
    }
    const active = { timedOut: false };
    this.storeActive = active;
    const budget = Math.min(2000, job.deadline - performance.now());
    const timer = setTimeout(
      () => {
        active.timedOut = true;
        job.fail(
          new GatewayError(
            budget < 2000 ? "DEADLINE_EXCEEDED" : "STORE_UNAVAILABLE",
          ),
        );
        for (const q of this.storeQueue.splice(0))
          q.fail(new GatewayError("STORE_UNAVAILABLE"));
      },
      Math.max(1, budget),
    );
    const finish = (error: unknown, value?: unknown) => {
      clearTimeout(timer);
      if (!active.timedOut) {
        if (error)
          job.fail(
            error instanceof GatewayError
              ? error
              : new GatewayError("STORE_UNAVAILABLE"),
          );
        else job.done(value);
      }
      if (this.storeActive === active) this.storeActive = undefined;
      this.pump();
    };
    Promise.resolve()
      .then(job.run)
      .then(
        (v) => finish(null, v),
        (e) => finish(e),
      );
  }
  private inspect(
    deadline: number,
    signal?: AbortSignal,
  ): Promise<AcceptedInspection> {
    const work = this.storeCall(
      () => this.dependencies.store.inspectAccepted(),
      deadline,
    );
    return signal ? wait(work, signal) : work;
  }
  private async verifyGeneration(
    generation: TrafficGeneration,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await wait(
        Promise.resolve(this.dependencies.verifyGeneration(generation)),
        signal,
      );
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      reject("NO_HEALTHY_NODE");
    }
  }
  start(): void {
    if (this.interval || this.closing) return;
    this.interval = setInterval(() => {
      if (!this.reconciling) void this.reconcile(true);
    }, this.config.poll_interval_ms ?? 500);
    this.interval.unref();
    void this.reconcile(true);
  }
  reconcile(pull = true): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.reconciling) return this.reconciling;
    this.reconciling = (async () => {
      try {
        const deadline = performance.now() + 12000;
        let state = await this.inspect(deadline, this.closeSignal.signal);
        if (pull) {
          await wait(
            this.storeCall(
              () => this.dependencies.store.pull(state.checked_at_event_time),
              deadline,
            ),
            this.closeSignal.signal,
          );
          state = await this.inspect(deadline, this.closeSignal.signal);
        }
        this.reason = "READY";
      } catch (e) {
        this.reason = gatewayReason(e);
      }
    })().finally(() => {
      this.reconciling = undefined;
    });
    return this.reconciling;
  }
  async status(): Promise<GatewayStatus> {
    let s: AcceptedInspection | undefined,
      reason = this.reason;
    try {
      if (this.closing) throw Error();
      s = await this.inspect(performance.now() + 2000);
      reason = "READY";
    } catch (e) {
      // Internal status has a store budget, not a public route deadline.
      // 내부 상태 조회의 시간 한도는 공개 경로 기한이 아닌 저장소 한도입니다.
      reason =
        gatewayReason(e) === "DEADLINE_EXCEEDED"
          ? "STORE_UNAVAILABLE"
          : gatewayReason(e);
    }
    return {
      gateway_id: this.config.gateway_id,
      instance_id: this.instance_id,
      in_flight: this.admission,
      closing: this.closing,
      high_water: s?.high_water ?? null,
      snapshot_id: s?.active?.manifest.traffic_snapshot_id ?? null,
      checked_at_event_time: s?.checked_at_event_time ?? null,
      reason,
    };
  }
  private async peer(
    node: GatewayNode,
    path: string,
    body: unknown,
    budget: number,
    signal: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    const abort = new AbortController(),
      onAbort = () => abort.abort(),
      timer = setTimeout(() => abort.abort(), Math.max(1, budget));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) abort.abort();
    try {
      const response = await this.dependencies.fetch(node.origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${node.token}`,
          "content-type": "application/json",
          ...(body === undefined
            ? {}
            : {
                [GATEWAY_DEADLINE_HEADER]: String(
                  Math.max(1, Math.floor(budget)),
                ),
              }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: abort.signal,
      });
      if (
        response.redirected ||
        (response.status >= 300 && response.status < 400)
      ) {
        await response.body?.cancel();
        throw new PeerError("REDIRECT_REJECTED");
      }
      if (
        response.headers.get("content-type")?.split(";")[0]?.trim() !==
          "application/json" ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new PeerError("INVALID_ROUTE");
      }
      const reader = response.body.getReader();
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 2 * 1024 * 1024) {
            await reader.cancel();
            throw new PeerError("OVERSIZED_RESPONSE");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      return {
        status: response.status,
        body: parseJson(Buffer.concat(chunks)),
      };
    } catch (e) {
      if (
        e instanceof TypeError &&
        String((e.cause as Error | undefined)?.message).includes("redirect")
      )
        throw new PeerError("REDIRECT_REJECTED");
      throw e;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
  async route(
    raw: unknown,
    options: GatewayRouteOptions,
  ): Promise<GatewayReply> {
    try {
      validateGatewayRequest(raw);
    } catch (e) {
      const reason = gatewayReason(e);
      return {
        status: gatewayHttpStatus(reason),
        body: gatewayFailure(reason),
      };
    }
    if (this.admission >= 8)
      return { status: 429, body: gatewayFailure("RATE_LIMITED") };
    if (this.closing)
      return { status: 503, body: gatewayFailure("NO_HEALTHY_NODE") };
    const deadline = Math.min(options.deadline, performance.now() + 12000),
      started = performance.now(),
      abort = new AbortController();
    const stop = () => abort.abort(),
      timer = setTimeout(stop, Math.max(1, deadline - performance.now()));
    options.signal.addEventListener("abort", stop, { once: true });
    this.closeSignal.signal.addEventListener("abort", stop, { once: true });
    if (options.signal.aborted) stop();
    this.requests.add(abort);
    this.admission++;
    const directory = join(
      this.config.runtime_root,
      "requests",
      raw.request_id + "-" + randomUUID(),
    );
    const attempts: unknown[] = [];
    const write = (name: string, value: unknown) => {
      try {
        durableNodeJSON(join(directory, name), value);
      } catch {
        // Evidence failure is terminal, never a reason to retry another peer.
        // 근거 기록 실패는 종료 사유이며 다른 노드 재시도 사유가 아닙니다.
        throw new GatewayError("NO_HEALTHY_NODE");
      }
    };
    const budget = (limit: number) => {
      if (abort.signal.aborted || performance.now() >= deadline)
        reject("DEADLINE_EXCEEDED");
      return Math.max(
        1,
        Math.min(limit, Math.floor(deadline - performance.now())),
      );
    };
    try {
      mkdirSync(directory);
      write("request.json", raw);
      write("attempts.json", attempts);
      budget(12000);
      const selected = await this.inspect(deadline, abort.signal);
      const generation = await wait(
        this.dependencies.compile(selected.active),
        abort.signal,
      );
      await this.verifyGeneration(generation, abort.signal);
      budget(12000);
      sameState(selected, await this.inspect(deadline, abort.signal));
      write("target.json", {
        high_water: selected.high_water,
        snapshot_id: generation.traffic_snapshot_id,
        sequence: generation.sequence,
        generation_id: generation.generation_id,
        traffic_sha256: generation.traffic_sha256,
        expected_native: expectedNative(raw),
        expected_native_sha256: sha256(canonical(expectedNative(raw))),
      });
      await wait(
        this.hooks.phase?.(
          "AFTER_GATEWAY_SELECTION",
          {
            request_id: raw.request_id,
            generation_id: generation.generation_id,
          },
          abort.signal,
        ) ?? Promise.resolve(),
        abort.signal,
      );
      const statuses = await Promise.all(
        this.config.nodes.map(async (node) => {
          try {
            const result = await this.peer(
              node,
              "/internal/v1/status",
              undefined,
              budget(1000),
              abort.signal,
            );
            const s = object(result.body);
            return {
              node_id: node.node_id,
              ...result,
              matching:
                result.status === 200 &&
                s.node_id === node.node_id &&
                s.ready === true &&
                compatible(
                  s.active,
                  node,
                  this.dependencies.bundle,
                  generation,
                ),
            };
          } catch {
            return {
              node_id: node.node_id,
              status: 0,
              body: null,
              matching: false,
            };
          }
        }),
      );
      write("statuses.json", statuses);
      budget(12000);
      sameState(selected, await this.inspect(deadline, abort.signal));
      const matching = this.config.nodes.filter(
        (n) => statuses.find((s) => s.node_id === n.node_id)?.matching,
      );
      if (!matching.length) reject("NO_HEALTHY_NODE");
      for (const node of matching) {
        const attempt = attempts.length + 1,
          elapsedStart = performance.now() - started,
          routeBudget = budget(4000);
        const nativeRequest = {
          request_id: raw.request_id,
          graph_id: this.dependencies.bundle.graph_id,
          locations: expectedNative(raw).locations,
          expected_generation_id: generation.generation_id,
        };
        let response: { status: number; body: unknown } | undefined;
        try {
          response = await this.peer(
            node,
            "/internal/v1/route",
            nativeRequest,
            routeBudget,
            abort.signal,
          );
          if (response.status === 409) {
            const f = object(response.body);
            reject(
              f.reason === "GENERATION_MISMATCH"
                ? "VERSION_MISMATCH"
                : "TRAFFIC_CHANGED",
            );
          }
          if (response.status !== 200) throw new PeerError("NODE_UNAVAILABLE");
          const success = validateGatewayNodeResult(
            response.body,
            raw,
            node,
            this.dependencies.bundle,
            generation,
          );
          attempts.push({
            attempt,
            node_id: node.node_id,
            request: nativeRequest,
            deadline_ms: routeBudget,
            status: response.status,
            body: response.body,
            outcome: "VALIDATED",
            elapsed_start_ms: elapsedStart,
            elapsed_end_ms: performance.now() - started,
          });
          write("attempts.json", attempts);
          await wait(
            this.hooks.phase?.(
              "AFTER_GATEWAY_NODE_RESULT",
              {
                request_id: raw.request_id,
                generation_id: generation.generation_id,
                node_id: node.node_id,
                attempt,
              },
              abort.signal,
            ) ?? Promise.resolve(),
            abort.signal,
          );
          await this.verifyGeneration(generation, abort.signal);
          budget(12000);
          // Last asynchronous boundary is current durable authorization, never a peer call.
          // 마지막 비동기 경계는 노드 호출이 아닌 현재 영속 승인 조회입니다.
          const final = await this.inspect(deadline, abort.signal);
          sameState(selected, final);
          budget(12000);
          if (this.closing) reject("NO_HEALTHY_NODE");
          const reply = {
            status: 200,
            body: { ...success, calculated_at: new Date().toISOString() },
          };
          write("result.json", {
            ...reply,
            elapsed_ms: performance.now() - started,
          });
          return reply;
        } catch (error) {
          if (error instanceof GatewayError) {
            if (!attempts.some((x: any) => x.attempt === attempt)) {
              attempts.push({
                attempt,
                node_id: node.node_id,
                request: nativeRequest,
                deadline_ms: routeBudget,
                status: response?.status ?? 0,
                body: response?.body ?? null,
                outcome: "REJECTED",
                reason: error.reason,
                elapsed_start_ms: elapsedStart,
                elapsed_end_ms: performance.now() - started,
              });
              write("attempts.json", attempts);
            }
            throw error;
          }
          attempts.push({
            attempt,
            node_id: node.node_id,
            request: nativeRequest,
            deadline_ms: routeBudget,
            status: response?.status ?? 0,
            body: response?.body ?? null,
            outcome: "REJECTED",
            reason:
              error instanceof PeerError
                ? error.reason
                : abort.signal.aborted
                  ? "DEADLINE_EXCEEDED"
                  : error instanceof Error && error.name === "AbortError"
                    ? "NODE_TIMEOUT"
                    : "INVALID_ROUTE",
            elapsed_start_ms: elapsedStart,
            elapsed_end_ms: performance.now() - started,
          });
          write("attempts.json", attempts);
          budget(12000);
          sameState(selected, await this.inspect(deadline, abort.signal));
        }
      }
      reject("NO_HEALTHY_NODE");
    } catch (e) {
      const reason =
        abort.signal.aborted || performance.now() >= deadline
          ? "DEADLINE_EXCEEDED"
          : gatewayReason(e);
      const reply = {
        status: gatewayHttpStatus(reason),
        body: gatewayFailure(reason),
      };
      // A failed evidence directory cannot also persist its failure response.
      // 근거 폴더가 실패한 경우 실패 응답 기록도 불가능하므로 명시 실패만 반환합니다.
      try {
        write("result.json", {
          ...reply,
          elapsed_ms: performance.now() - started,
        });
      } catch {
        /* Preserve the explicit failure and always release admission. / 명시 실패·접수 회수 유지. */
      }
      return reply;
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", stop);
      this.closeSignal.signal.removeEventListener("abort", stop);
      this.requests.delete(abort);
      this.admission--;
    }
  }
  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    clearInterval(this.interval);
    this.closeSignal.abort();
    for (const a of this.requests) a.abort();
    for (const q of this.storeQueue.splice(0))
      q.fail(new GatewayError("STORE_UNAVAILABLE"));
    await this.reconciling;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let clean = false;
    let compilerCleanup: Awaited<
      ReturnType<NonNullable<GatewayDependencies["closeCompiler"]>>
    >;
    const compilerClosing = Promise.resolve()
      .then(() => this.dependencies.closeCompiler?.())
      .then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, value: undefined }),
      );
    try {
      await Promise.race([
        this.dependencies.store.close(),
        new Promise((_, fail) => {
          timeout = setTimeout(() => fail(Error("store close timeout")), 16000);
        }),
      ]);
      clean = true;
    } finally {
      clearTimeout(timeout);
      const compilerResult = await compilerClosing;
      compilerCleanup = compilerResult.value;
      if (
        !compilerResult.ok ||
        (compilerCleanup &&
          (!compilerCleanup.termination_verified ||
            compilerCleanup.cleanup_verified === false))
      )
        clean = false;
      durableNodeJSON(join(this.config.runtime_root, "cleanup.json"), {
        gateway_id: this.config.gateway_id,
        cleanup_verified: clean,
        in_flight: this.admission,
        ...(this.dependencies.closeCompiler
          ? { compiler: compilerCleanup ?? { termination_verified: false } }
          : {}),
        message_en:
          "Only this gateway's consumer and compiler resources are closed.",
        message_ko: "이 중계자의 수신 자원과 작업 스레드만 종료합니다.",
      });
    }
    if (!clean)
      throw new Error("Gateway cleanup incomplete / 중계 정리 미완료");
  }
}
