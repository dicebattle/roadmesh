/** Serialized selection plus per-request immutable leases / 순차 선택·요청별 불변 고정. */
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonical, identifier, parseJson, sha256 } from "./shared.js";
import { PublicationConsumer } from "./publication_consumer.js";
import { PublicationError } from "./publication_crypto.js";
import {
  loadTrafficBundle,
  TrafficError,
  trafficReject,
} from "./traffic_bundle.js";
import {
  compileTrafficGeneration,
  verifyTrafficGeneration,
} from "./traffic_compiler.js";
import {
  assertSameTrafficSelection,
  trafficProvenance,
} from "./traffic_controller.js";
import { validateTrafficRequest } from "./traffic_runtime.js";
import {
  COMPILER_POLICY,
  type TrafficGeneration,
  type TrafficRouteRequest,
} from "./traffic_types.js";
import type { AcceptedInspection } from "./publication_types.js";
import { durableNodeJSON, startNodeEngine } from "./node_engine.js";
import type {
  NodeControllerDependencies,
  NodeFailure,
  NodeHooks,
  NodeNativeEngine,
  NodePhaseDetail,
  NodeProvenance,
  NodeReply,
  NodeRouteRequest,
  NodeSlotState,
  NodeStatus,
  RoutingNodeConfig,
} from "./node_types.js";
export const NODE_REQUEST_MS = 30000,
  NODE_DRAIN_MS = 30000,
  NODE_CAPACITY = 8;
export function nodeReason(error: unknown): string {
  return error instanceof TrafficError
    ? error.reason
    : error instanceof PublicationError
      ? error.code
      : "NODE_OPERATION_FAILED";
}
export function nodeFailure(reason: string): NodeFailure {
  return {
    code: "UNAVAILABLE",
    reason,
    message_en:
      "The routing node cannot return a verified route for this request.",
    message_ko: "이 요청에 검증된 경로를 반환할 수 없습니다.",
  };
}
export function validateNodeConfig(config: RoutingNodeConfig): void {
  try {
    identifier(config.node_id, "node_id");
  } catch {
    trafficReject("INVALID_NODE_CONFIG");
  }
  if (
    typeof config.token !== "string" ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(config.token) ||
    !/^p0[89]-[a-z0-9_-]+$/.test(config.consumer?.store.namespace ?? "") ||
    !Number.isInteger(config.port ?? 0) ||
    (config.port ?? 0) < 0 ||
    (config.port ?? 0) > 65535 ||
    !Number.isInteger(config.poll_interval_ms ?? 500) ||
    (config.poll_interval_ms ?? 500) < 100 ||
    (config.poll_interval_ms ?? 500) > 10000
  )
    trafficReject("INVALID_NODE_CONFIG");
  for (const p of [
    config.graph_directory,
    config.bundle_directory,
    config.generation_root,
    config.runtime_root,
  ])
    if (typeof p !== "string" || !p || p.includes("\0"))
      trafficReject("INVALID_NODE_CONFIG");
}
export function validateNodeRequest(
  request: unknown,
  graphId: string,
): asserts request is NodeRouteRequest {
  try {
    if (!request || typeof request !== "object" || Array.isArray(request))
      throw Error();
    const r = request as Record<string, unknown>,
      allowed = [
        "request_id",
        "graph_id",
        "locations",
        "expected_generation_id",
      ];
    if (
      Object.keys(r).some((k) => !allowed.includes(k)) ||
      !["request_id", "graph_id", "locations"].every((k) => Object.hasOwn(r, k))
    )
      throw Error();
    identifier(r.request_id, "request_id");
    if (
      r.expected_generation_id !== undefined &&
      (typeof r.expected_generation_id !== "string" ||
        !/^[a-f0-9]{64}$/.test(r.expected_generation_id))
    )
      throw Error();
    validateTrafficRequest(
      { graph_id: r.graph_id, locations: r.locations } as TrafficRouteRequest,
      graphId,
    );
  } catch {
    trafficReject("INVALID_REQUEST");
  }
}
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((done, reject) => {
    const abort = () => {
      cleanup();
      reject(
        new TrafficError(
          typeof signal.reason === "string"
            ? signal.reason
            : "REQUEST_DEADLINE",
        ),
      );
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        done(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
interface Lease {
  abort: AbortController;
  request_id: string;
}
interface Slot {
  id: string;
  state: NodeSlotState;
  selection: AcceptedInspection;
  generation?: TrafficGeneration;
  engine?: NodeNativeEngine;
  epoch: number;
  leases: Set<Lease>;
  drainTimer?: NodeJS.Timeout;
  retiring?: Promise<void>;
}
export class RoutingNodeController {
  readonly instance_id = randomUUID();
  private slots = new Set<Slot>();
  private active?: Slot;
  private epoch = 0;
  private admission = 0;
  private closing = false;
  private closeSignal = new AbortController();
  private interval?: NodeJS.Timeout;
  private pending = false;
  private pendingPull = false;
  private reconciling?: Promise<void>;
  private closePromise?: Promise<void>;
  private reason = "NOT_READY";
  private events: Array<Record<string, unknown>> = [];
  private storeActive?: { timedOut: boolean };
  private storeQueue: Array<{
    run: () => Promise<unknown>;
    done: (value: unknown) => void;
    fail: (error: unknown) => void;
  }> = [];
  constructor(
    readonly config: RoutingNodeConfig,
    private readonly dependencies: NodeControllerDependencies,
    private readonly hooks: NodeHooks = {},
  ) {
    validateNodeConfig(config);
    mkdirSync(resolve(config.runtime_root));
    if (lstatSync(resolve(config.runtime_root)).isSymbolicLink())
      trafficReject("INVALID_NODE_CONFIG");

    durableNodeJSON(join(resolve(config.runtime_root), "node-ownership.json"), {
      node_id: config.node_id,
      instance_id: this.instance_id,
      pid: process.pid,
      consumer_id: config.consumer.consumer_id,
      simulation_namespace: config.consumer.store.namespace,
      runtime_root: resolve(config.runtime_root),
      generation_root: resolve(config.generation_root),
      graph_id: dependencies.bundle.graph_id,
      planned_before_creation: true,
    });
    this.event("CREATED");
  }
  static async create(
    config: RoutingNodeConfig,
    hooks: NodeHooks = {},
  ): Promise<RoutingNodeController> {
    validateNodeConfig(config);
    const bundle = loadTrafficBundle(
      config.bundle_directory,
      config.graph_directory,
    );
    if (bundle.graph_id !== config.consumer.store.graph_id)
      trafficReject("GRAPH_MISMATCH");
    const catalog = config.consumer.catalogs.find(
      (c) => c.graph_id === bundle.graph_id,
    );
    if (
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
      trafficReject("CATALOG_MISMATCH");
    const readinessRequest: TrafficRouteRequest = {
      graph_id: bundle.graph_id,
      locations: (
        parseJson(
          readFileSync(
            join(bundle.graph_directory, "route-teheran.request.json"),
          ),
        ) as { locations: TrafficRouteRequest["locations"] }
      ).locations,
    };
    validateTrafficRequest(readinessRequest, bundle.graph_id);
    const store = new PublicationConsumer(config.consumer);
    const dependencies: NodeControllerDependencies = {
      bundle,
      store,
      compile: (input) => {
        loadTrafficBundle(config.bundle_directory, config.graph_directory);
        return compileTrafficGeneration(bundle, input, config.generation_root);
      },
      engine: (generation, signal) =>
        startNodeEngine(
          bundle,
          generation,
          config.runtime_root,
          readinessRequest,
          signal,
        ),
      verifyGeneration: verifyTrafficGeneration,
    };
    try {
      return new RoutingNodeController(config, dependencies, hooks);
    } catch (error) {
      await store.close();
      throw error;
    }
  }
  private event(code: string, slot?: Slot): void {
    this.events.push({
      code,
      at_utc: new Date().toISOString(),
      node_id: this.config.node_id,
      instance_id: this.instance_id,
      slot_count: this.slots.size,
      generation_id: slot?.id ?? null,
      activation_epoch: slot?.epoch ?? null,
      in_flight: this.admission,
    });
    durableNodeJSON(
      join(resolve(this.config.runtime_root), "events.json"),
      this.events,
    );
  }
  private detail(slot: Slot, request_id?: string): NodePhaseDetail {
    if (!slot.engine) trafficReject("ENGINE_NOT_READY");
    return {
      node_id: this.config.node_id,
      instance_id: this.instance_id,
      generation_id: slot.id,
      ...(request_id ? { request_id } : {}),
      engine_container: slot.engine.identity.container_name,
      engine_run_directory: slot.engine.directory,
    };
  }
  start(): void {
    if (this.interval || this.closing) return;
    this.interval = setInterval(() => {
      // Periodic ticks must not extend a running explicit reconciliation forever.
      // 주기 호출은 진행 중인 명시적 재조정의 완료를 무한히 늦추지 않습니다.
      if (this.reconciling) return;
      void this.reconcile(true);
    }, this.config.poll_interval_ms ?? 500);
    this.interval.unref();
    void this.reconcile(true);
  }
  reconcile(pull = true): Promise<void> {
    if (this.closing) return Promise.resolve();
    this.pending = true;
    this.pendingPull ||= pull;
    if (this.reconciling) return this.reconciling;
    this.reconciling = (async () => {
      while (this.pending && !this.closing) {
        const doPull = this.pendingPull;
        this.pending = false;
        this.pendingPull = false;
        try {
          await this.reconcileOnce(doPull);
        } catch (error) {
          this.reason = nodeReason(error);
          this.event("RECONCILE_" + this.reason);
        }
      }
    })().finally(() => {
      this.reconciling = undefined;
    });
    return this.reconciling;
  }
  private storeCall<T>(run: () => Promise<T>): Promise<T> {
    if (
      this.closing ||
      this.storeActive?.timedOut ||
      this.storeQueue.length >= 16
    )
      return Promise.reject(
        new TrafficError(this.closing ? "NODE_CLOSING" : "STORE_UNAVAILABLE"),
      );
    return new Promise<T>((done, fail) => {
      this.storeQueue.push({ run, done: (value) => done(value as T), fail });
      this.pumpStore();
    });
  }
  private pumpStore(): void {
    if (this.storeActive || this.closing) return;
    const job = this.storeQueue.shift();
    if (!job) return;
    const active = { timedOut: false };
    this.storeActive = active;
    const timer = setTimeout(() => {
      active.timedOut = true;
      job.fail(new TrafficError("STORE_UNAVAILABLE"));
      for (const queued of this.storeQueue.splice(0))
        queued.fail(new TrafficError("STORE_UNAVAILABLE"));
    }, 5000);
    const finish = (error: unknown, value?: unknown) => {
      clearTimeout(timer);
      if (!active.timedOut) {
        if (error) job.fail(error);
        else job.done(value);
      }
      if (this.storeActive === active) this.storeActive = undefined;
      this.pumpStore();
    };
    Promise.resolve()
      .then(job.run)
      .then(
        (value) => finish(null, value),
        (error) => finish(error),
      );
  }
  private async inspectAccepted(): Promise<AcceptedInspection> {
    const state = await this.storeCall(() =>
      this.dependencies.store.inspectAccepted(),
    );
    if (
      state.active &&
      state.active.manifest.graph_id !== this.dependencies.bundle.graph_id
    )
      trafficReject("GRAPH_MISMATCH");
    return state;
  }
  private desired(state: AcceptedInspection): string {
    return sha256(
      canonical({
        graph_id: this.dependencies.bundle.graph_id,
        skeleton_sha256: this.dependencies.bundle.skeleton_sha256,
        traffic_snapshot_id: state.active?.manifest.traffic_snapshot_id ?? null,
        compiler_policy: COMPILER_POLICY,
      }),
    );
  }
  private async reconcileOnce(pull: boolean): Promise<void> {
    let selected = await abortable(
      this.inspectAccepted(),
      this.closeSignal.signal,
    );
    if (pull) {
      await abortable(
        this.storeCall(() =>
          this.dependencies.store.pull(selected.checked_at_event_time),
        ),
        this.closeSignal.signal,
      );
      selected = await abortable(
        this.inspectAccepted(),
        this.closeSignal.signal,
      );
    }
    if (this.active && this.active.id === this.desired(selected)) {
      try {
        assertSameTrafficSelection(this.active.selection, selected);
        this.dependencies.verifyGeneration(this.active.generation!);
        await abortable(
          this.active.engine!.inspect(this.closeSignal.signal),
          this.closeSignal.signal,
        );
        this.reason = "READY";
        return;
      } catch (error) {
        this.reason = nodeReason(error);
      }
    }
    if (this.slots.size >= 2) {
      this.reason = "SLOTS_BUSY";
      this.event("COALESCED");
      return;
    }
    const candidate: Slot = {
      id: this.desired(selected),
      state: "PREPARING",
      selection: selected,
      epoch: 0,
      leases: new Set(),
    };
    this.slots.add(candidate);
    this.event("PREPARING", candidate);
    try {
      candidate.generation = await abortable(
        this.dependencies.compile(selected.active),
        this.closeSignal.signal,
      );
      if (candidate.generation.generation_id !== candidate.id)
        trafficReject("GENERATION_CONFLICT");
      assertSameTrafficSelection(
        selected,
        await abortable(this.inspectAccepted(), this.closeSignal.signal),
      );
      candidate.engine = await this.dependencies.engine(
        candidate.generation,
        this.closeSignal.signal,
      );
      await abortable(
        this.hooks.phase?.(
          "AFTER_NODE_CANDIDATE_READY",
          this.detail(candidate),
          this.closeSignal.signal,
        ) ?? Promise.resolve(),
        this.closeSignal.signal,
      );
      this.dependencies.verifyGeneration(candidate.generation);
      await candidate.engine.inspect(this.closeSignal.signal);
      const current = await abortable(
        this.inspectAccepted(),
        this.closeSignal.signal,
      );
      assertSameTrafficSelection(selected, current);
      if (this.closing) trafficReject("NODE_CLOSING");
      const old = this.active;
      candidate.state = "ACTIVE";
      candidate.selection = current;
      candidate.epoch = ++this.epoch;
      this.active = candidate;
      this.reason = "READY";
      this.event("ACTIVATED", candidate);
      if (old) {
        old.state = "DRAINING";
        this.event("DRAINING", old);
        this.beginDrain(old);
      }
      await abortable(
        this.hooks.phase?.(
          "AFTER_NODE_ACTIVATION",
          this.detail(candidate),
          this.closeSignal.signal,
        ) ?? Promise.resolve(),
        this.closeSignal.signal,
      );
    } catch (error) {
      if (this.active !== candidate) {
        await candidate.engine?.stop();
        this.slots.delete(candidate);
        this.event("CANDIDATE_DISCARDED", candidate);
      }
      throw error;
    }
  }
  private beginDrain(slot: Slot): void {
    if (slot.leases.size === 0) {
      void this.retire(slot).catch((error) => {
        this.reason = nodeReason(error);
      });
      return;
    }
    slot.drainTimer = setTimeout(() => {
      for (const lease of slot.leases) lease.abort.abort("DRAIN_DEADLINE");
      void this.retire(slot).catch((error) => {
        this.reason = nodeReason(error);
      });
    }, NODE_DRAIN_MS);
    slot.drainTimer.unref();
  }
  private retire(slot: Slot): Promise<void> {
    return (slot.retiring ??= (async () => {
      if (slot.drainTimer) clearTimeout(slot.drainTimer);
      await slot.engine?.stop();
      this.slots.delete(slot);
      this.event("RETIRED", slot);
      if (!this.closing) void this.reconcile(true);
    })());
  }
  private publicProvenance(
    slot: Slot,
    state: AcceptedInspection,
  ): NodeProvenance {
    const id = slot.engine!.identity;
    return {
      ...trafficProvenance(this.dependencies.bundle, slot.generation!, state),
      activation_epoch: slot.epoch,
      native_daemon: { pid: id.pid, start_ticks: id.start_ticks },
    };
  }
  async status(): Promise<NodeStatus> {
    let active: NodeProvenance | null = null,
      reason = this.reason;
    try {
      if (this.closing) trafficReject("NODE_CLOSING");
      const state = await this.inspectAccepted(),
        slot = this.active;
      if (!slot)
        trafficReject(
          ["GENERATION_CONFLICT", "ENGINE_UNAVAILABLE", "STORE_UNAVAILABLE"].includes(this.reason)
            ? this.reason
            : "NOT_READY",
        );
      assertSameTrafficSelection(slot.selection, state);
      this.dependencies.verifyGeneration(slot.generation!);
      await slot.engine!.inspect();
      const final = await this.inspectAccepted();
      assertSameTrafficSelection(state, final);
      if (this.active !== slot) trafficReject("ACCEPTED_STATE_CHANGED");
      active = this.publicProvenance(slot, final);
      reason = "READY";
    } catch (error) {
      reason = nodeReason(error);
    }
    return {
      node_id: this.config.node_id,
      instance_id: this.instance_id,
      ready: active !== null,
      active,
      in_flight: this.admission,
      slots: [...this.slots].map((s) => ({
        generation_id: s.id,
        state: s.state,
        in_flight: s.leases.size,
        native_daemon: s.engine
          ? {
              pid: s.engine.identity.pid,
              start_ticks: s.engine.identity.start_ticks,
            }
          : null,
      })),
      reason,
      message_en: active
        ? "A current verified engine is ready."
        : "No currently verified engine is ready.",
      message_ko: active
        ? "현재 검증된 엔진이 준비됐습니다."
        : "현재 검증된 준비 엔진이 없습니다.",
    };
  }
  async route(
    request: unknown,
    deadline = performance.now() + NODE_REQUEST_MS,
  ): Promise<NodeReply> {
    try {
      validateNodeRequest(request, this.dependencies.bundle.graph_id);
    } catch {
      return { status: 422, body: nodeFailure("INVALID_REQUEST") };
    }
    if (this.closing) return { status: 503, body: nodeFailure("NODE_CLOSING") };
    if (this.admission >= NODE_CAPACITY)
      return { status: 429, body: nodeFailure("CAPACITY") };
    if (deadline <= performance.now())
      return { status: 503, body: nodeFailure("REQUEST_DEADLINE") };
    this.admission++;
    const abort = new AbortController(),
      timer = setTimeout(
        () => abort.abort("REQUEST_DEADLINE"),
        Math.max(1, deadline - performance.now()),
      );
    let slot: Slot | undefined, lease: Lease | undefined;
    try {
      const selected = await abortable(this.inspectAccepted(), abort.signal);
      slot = this.active;
      if (!slot)
        trafficReject(
          ["GENERATION_CONFLICT", "ENGINE_UNAVAILABLE", "STORE_UNAVAILABLE"].includes(this.reason)
            ? this.reason
            : "NOT_READY",
        );
      assertSameTrafficSelection(slot.selection, selected);
      if (
        request.expected_generation_id &&
        request.expected_generation_id !== slot.id
      )
        return { status: 409, body: nodeFailure("GENERATION_MISMATCH") };
      this.dependencies.verifyGeneration(slot.generation!);
      lease = { abort, request_id: request.request_id };
      slot.leases.add(lease);
      this.event("LEASED", slot);
      const identity = await abortable(
        slot.engine!.inspect(abort.signal),
        abort.signal,
      );
      const engine_result = await abortable(
        slot.engine!.route(
          { graph_id: request.graph_id, locations: request.locations },
          abort.signal,
          deadline,
        ),
        abort.signal,
      );
      await abortable(
        this.hooks.phase?.(
          "AFTER_NODE_ENGINE_RESULT",
          this.detail(slot, request.request_id),
          abort.signal,
        ) ?? Promise.resolve(),
        abort.signal,
      );
      this.dependencies.verifyGeneration(slot.generation!);
      const last = await abortable(
        slot.engine!.inspect(abort.signal),
        abort.signal,
      );
      if (!canonical(identity).equals(canonical(last)))
        trafficReject("ENGINE_IDENTITY");
      const final = await abortable(this.inspectAccepted(), abort.signal);
      assertSameTrafficSelection(selected, final);
      assertSameTrafficSelection(slot.selection, final);
      if (abort.signal.aborted) trafficReject("REQUEST_DEADLINE");
      return {
        status: 200,
        body: {
          code: "ROUTE",
          request_id: request.request_id,
          node_id: this.config.node_id,
          instance_id: this.instance_id,
          engine_result,
          provenance: this.publicProvenance(slot, final),
        },
      };
    } catch (error) {
      let reason = nodeReason(error);
      if (reason === "ENGINE_DEADLINE") reason = "REQUEST_DEADLINE";
      return {
        status: reason === "ACCEPTED_STATE_CHANGED" ? 409 : 503,
        body: nodeFailure(reason),
      };
    } finally {
      clearTimeout(timer);
      this.admission--;
      if (slot && lease) {
        slot.leases.delete(lease);
        this.event("LEASE_RELEASED", slot);
        if (slot.state === "DRAINING" && slot.leases.size === 0)
          void this.retire(slot).catch((error) => {
            this.reason = nodeReason(error);
          });
      }
    }
  }
  close(): Promise<void> {
    return (this.closePromise ??= (async () => {
      this.closing = true;
      if (this.interval) clearInterval(this.interval);
      this.closeSignal.abort("NODE_CLOSING");
      for (const queued of this.storeQueue.splice(0))
        queued.fail(new TrafficError("NODE_CLOSING"));
      this.event("CLOSING");
      if (this.reconciling) await this.reconciling;
      const until = performance.now() + NODE_DRAIN_MS;
      while (this.admission && performance.now() < until)
        await new Promise((done) => setTimeout(done, 25));
      for (const slot of this.slots)
        for (const lease of slot.leases) lease.abort.abort("NODE_CLOSING");
      await Promise.all([...this.slots].map((slot) => this.retire(slot)));
      await this.dependencies.store.close();
      this.active = undefined;
      durableNodeJSON(join(resolve(this.config.runtime_root), "cleanup.json"), {
        cleanup_verified: true,
        slots_remaining: this.slots.size,
        in_flight: this.admission,
      });
    })());
  }
}
