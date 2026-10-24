/** Scheduler doubles prove unit boundaries only; real lifecycle proof uses native HTTP.
 * 조정 모형은 단위 경계만 증명하며 실제 수명주기는 실제 HTTP로 검증합니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as turn } from "node:timers/promises";
import { canonical, sha256 } from "../tools/shared.js";
import {
  RoutingNodeController,
  validateNodeRequest,
} from "../tools/node_controller.js";
import { TrafficError } from "../tools/traffic_bundle.js";
import { NativeRouteRejection } from "../tools/route_contract.js";
import {
  COMPILER_POLICY,
  type TrafficBundle,
  type TrafficGeneration,
} from "../tools/traffic_types.js";
import type {
  AcceptedInspection,
  VerifiedPublication,
} from "../tools/publication_types.js";
import type {
  NodeControllerDependencies,
  NodeHooks,
  NodeNativeEngine,
  RoutingNodeConfig,
} from "../tools/node_types.js";
const graph = "a".repeat(64),
  blank = "b".repeat(64);
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function accepted(sequence = 0): AcceptedInspection {
  return {
    high_water: sequence,
    checked_at_event_time: "2026-10-24T00:04:30.000Z",
    active: sequence
      ? ({
          manifest: {
            graph_id: graph,
            traffic_snapshot_id: String(sequence).repeat(64),
            sequence,
            valid_until: "2026-10-24T00:07:00.000Z",
          },
        } as unknown as VerifiedPublication)
      : null,
  };
}
function generation(input: AcceptedInspection["active"]): TrafficGeneration {
  const identity = {
      graph_id: graph,
      skeleton_sha256: blank,
      traffic_snapshot_id: input?.manifest.traffic_snapshot_id ?? null,
      compiler_policy: COMPILER_POLICY,
    },
    id = sha256(canonical(identity));
  return {
    ...identity,
    generation_id: id,
    sequence: input?.manifest.sequence ?? null,
    valid_until: input?.manifest.valid_until ?? null,
    traffic_sha256: (input ? "c" : "d").repeat(64),
    traffic_byte_length: 3072,
    live_edges: [],
    directory: "/unit/generation",
    traffic_path: "/unit/generation/traffic.tar",
    manifest_path: "/unit/generation/manifest.json",
  };
}
function fixture(hooks: NodeHooks = {}) {
  const parent = mkdtempSync(join(tmpdir(), "routelens-node-unit-"));
  let state = accepted(),
    reads = 0,
    inspectOverride: (() => Promise<AcceptedInspection>) | undefined,
    engineInspect: ((engine: FakeEngine) => Promise<void>) | undefined,
    maxLive = 0,
    corrupt = false;
  const engines: FakeEngine[] = [],
    compiled: Array<number | null> = [];
  const bundle = {
    directory: parent,
    graph_directory: parent,
    graph_id: graph,
    graph_manifest_sha256: "e".repeat(64),
    coverage_bounds: [126.7, 37.4, 127.25, 37.75] as const,
    image_id: "sha256:" + "f".repeat(64),
    skeleton_path: "/unit/blank",
    skeleton_sha256: blank,
    skeleton_byte_length: 3072,
    graph_extract_path: "/unit/graph",
    graph_extract_sha256: blank,
    catalog: [],
    tile_paths: [],
    members: [],
  } satisfies TrafficBundle;
  const config: RoutingNodeConfig = {
    node_id: "unit-node",
    consumer: {
      store: {
        database_url: "private-unit-never-connected",
        namespace: "p09-unit",
        graph_id: graph,
        matching_policy: "seoul-observed-v3",
      },
      consumer_id: "unit-consumer",
      publisher_id: "publisher",
      region_id: "seoul-pilot-corridors-v1",
      allowed_graph_ids: [graph],
      catalogs: [],
      trust_roots: [],
      origin: "http://127.0.0.1:1",
    },
    graph_directory: parent,
    bundle_directory: parent,
    generation_root: join(parent, "generations"),
    runtime_root: join(parent, "runtime"),
    token: "unit-private-token-never-published-000000",
    poll_interval_ms: 10000,
  };
  class FakeEngine implements NodeNativeEngine {
    stopped = false;
    calls = 0;
    inspects = 0;
    readonly identity;
    readonly directory = parent;
    constructor(readonly generation: TrafficGeneration) {
      this.identity = {
        pid: 100 + engines.length,
        start_ticks: String(10000 + engines.length),
        container_id: "unit-only",
        container_name: "unit-only-" + engines.length,
        owner_id: "unit-only",
      };
    }
    async inspect() {
      this.inspects++;
      await engineInspect?.(this);
      if (this.stopped) throw new TrafficError("ENGINE_UNAVAILABLE");
      return { ...this.identity };
    }
    async route(request: unknown) {
      this.calls++;
      if (routeRejection) throw routeRejection;
      return {
        request,
        route: {
          trip: {
            status: 0,
            legs: [{ shape: this.generation.generation_id }],
            summary: { time: 100, length: 1, cost: 100 },
          },
        },
        trace: { edges: [{ id: 10 }] },
      };
    }
    async stop() {
      this.stopped = true;
    }
  }
  const deps: NodeControllerDependencies = {
    bundle,
    store: {
      inspectAccepted: async () => {
        reads++;
        return inspectOverride ? inspectOverride() : structuredClone(state);
      },
      pull: async () => ({ code: "REJECTED", reason: "TRANSPORT_FAILED" }),
      close: async () => {},
    },
    compile: async (input) => {
      compiled.push(input?.manifest.sequence ?? null);
      return generation(input);
    },
    engine: async (g) => {
      const engine = new FakeEngine(g);
      engines.push(engine);
      maxLive = Math.max(maxLive, engines.filter((e) => !e.stopped).length);
      return engine;
    },
    verifyGeneration: () => {
      if (corrupt) throw new TrafficError("GENERATION_CONFLICT");
    },
  };
  let routeRejection: NativeRouteRejection | undefined;
  const controller = new RoutingNodeController(config, deps, hooks);
  return {
    controller,
    engines,
    compiled,
    config,
    set routeRejection(value: NativeRouteRejection | undefined) { routeRejection = value; },
    get reads() {
      return reads;
    },
    get maxLive() {
      return maxLive;
    },
    set state(value: AcceptedInspection) {
      state = value;
    },
    get state() {
      return state;
    },
    set inspectOverride(
      value: (() => Promise<AcceptedInspection>) | undefined,
    ) {
      inspectOverride = value;
    },
    set engineInspect(
      value: ((engine: FakeEngine) => Promise<void>) | undefined,
    ) {
      engineInspect = value;
    },
    set corrupt(value: boolean) {
      corrupt = value;
    },
    async close() {
      await controller.close();
      rmSync(parent, { recursive: true, force: true });
    },
  };
}
const request = (id: string) =>
  ({
    request_id: id,
    graph_id: graph,
    locations: [
      { lon: 127.029, lat: 37.4984 },
      { lon: 127.049, lat: 37.5045 },
    ],
  }) as const;
test("Repeated unit routes pin one engine and strict expected generation / 반복 단위 요청은 엔진 하나와 정확 세대를 고정", async () => {
  const f = fixture();
  try {
    await f.controller.reconcile(false);
    const a = await f.controller.route(request("one")),
      b = await f.controller.route(request("two"));
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.ok(a.body.code === "ROUTE" && b.body.code === "ROUTE");
    assert.deepEqual(
      a.body.provenance.native_daemon,
      b.body.provenance.native_daemon,
    );
    assert.equal(f.engines.length, 1);
    assert.equal(f.engines[0]!.calls, 2);
    const wrong = await f.controller.route({
      ...request("wrong"),
      expected_generation_id: "9".repeat(64),
    });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.code, "UNAVAILABLE");
    assert.equal(f.engines[0]!.calls, 2);
    assert.throws(
      () =>
        validateNodeRequest(
          { ...request("input"), exclude_locations: [] },
          graph,
        ),
      /INVALID_REQUEST/,
    );
  } finally {
    await f.close();
  }
});
test("Held old lease survives activation, rejects changed acceptance and coalesces within two slots / 기존 고정 요청은 교체 동안 유지되고 바뀐 수용 결과를 거부하며 두 엔진 상한 유지", async () => {
  const held = deferred(),
    reached = deferred();
  const f = fixture({
    phase: async (phase, detail) => {
      if (
        phase === "AFTER_NODE_ENGINE_RESULT" &&
        detail.request_id === "held"
      ) {
        reached.resolve();
        await held.promise;
      }
    },
  });
  try {
    await f.controller.reconcile(false);
    const old = f.controller.route(request("held"));
    await reached.promise;
    f.state = accepted(1);
    await f.controller.reconcile(false);
    assert.equal(f.engines.length, 2);
    assert.equal(f.engines[0]!.stopped, false);
    const fresh = await f.controller.route(request("fresh"));
    assert.equal(fresh.status, 200);
    assert.ok(fresh.body.code === "ROUTE");
    assert.equal(fresh.body.provenance.sequence, 1);
    f.state = accepted(2);
    await f.controller.reconcile(false);
    f.state = accepted(3);
    await f.controller.reconcile(false);
    assert.equal(f.engines.length, 2);
    held.resolve();
    const stale = await old;
    assert.equal(stale.status, 409);
    assert.ok(stale.body.code === "UNAVAILABLE");
    assert.equal(stale.body.reason, "ACCEPTED_STATE_CHANGED");
    for (let i = 0; i < 10 && f.engines.length < 3; i++) await turn();
    assert.equal(f.engines[0]!.stopped, true);
    assert.equal(f.engines.length, 3);
    assert.equal(f.maxLive, 2);
    assert.deepEqual(f.compiled, [null, 1, 3]);
    const status = await f.controller.status();
    assert.equal(status.active?.sequence, 3);
    assert.equal(status.slots.length, 1);
  } finally {
    held.resolve();
    await f.close();
  }
});
test("Candidate final acceptance follows deferred engine inspection / 후보의 최종 수용 검사는 지연된 엔진 확인 뒤 수행", async () => {
  const gate = deferred(),
    reached = deferred();
  const f = fixture();
  let used = false;
  f.engineInspect = async () => {
    if (!used) {
      used = true;
      reached.resolve();
      await gate.promise;
    }
  };
  try {
    const work = f.controller.reconcile(false);
    await reached.promise;
    f.state = accepted(1);
    gate.resolve();
    await work;
    assert.equal((await f.controller.status()).ready, false);
    assert.equal(f.engines[0]!.stopped, true);
    assert.equal((await f.controller.status()).slots.length, 0);
    f.engineInspect = undefined;
    await f.controller.reconcile(false);
    assert.equal((await f.controller.status()).active?.sequence, 1);
  } finally {
    gate.resolve();
    await f.close();
  }
});
test("Route final acceptance follows deferred native identity check / 경로의 최종 수용 검사는 지연된 네이티브 식별 확인 뒤 수행", async () => {
  const gate = deferred(),
    reached = deferred();
  const f = fixture();
  try {
    await f.controller.reconcile(false);
    f.engineInspect = async (e) => {
      if (e.inspects === 3) {
        reached.resolve();
        await gate.promise;
      }
    };
    const work = f.controller.route(request("deferred"));
    await reached.promise;
    f.state = accepted(1);
    gate.resolve();
    const r = await work;
    assert.equal(r.status, 409);
    assert.ok(r.body.code === "UNAVAILABLE");
    assert.equal(r.body.reason, "ACCEPTED_STATE_CHANGED");
    assert.equal("engine_result" in r.body, false);
  } finally {
    gate.resolve();
    await f.close();
  }
});
test("Dead native engine and corrupt generation return explicit failures / 죽은 네이티브 엔진과 손상 세대는 명시 실패", async () => {
  const f = fixture();
  try {
    await f.controller.reconcile(false);
    f.engines[0]!.stopped = true;
    const dead = await f.controller.route(request("dead"));
    assert.equal(dead.status, 503);
    assert.ok(dead.body.code === "UNAVAILABLE");
    assert.equal(dead.body.reason, "ENGINE_UNAVAILABLE");
    f.engines[0]!.stopped = false;
    f.corrupt = true;
    const bad = await f.controller.route(request("corrupt"));
    assert.equal(bad.status, 503);
    assert.ok(bad.body.code === "UNAVAILABLE");
    assert.equal(bad.body.reason, "GENERATION_CONFLICT");
  } finally {
    await f.close();
  }
});
test("Eight held requests are admitted and the ninth is refused / 고정 요청 여덟 개를 접수하고 아홉 번째 거부", async () => {
  const gate = deferred(),
    reached = deferred();
  let arrived = 0;
  const f = fixture({
    phase: async (phase) => {
      if (phase === "AFTER_NODE_ENGINE_RESULT") {
        if (++arrived === 8) reached.resolve();
        await gate.promise;
      }
    },
  });
  try {
    await f.controller.reconcile(false);
    const work = Array.from({ length: 8 }, (_, i) =>
      f.controller.route(request("held-" + i)),
    );
    await reached.promise;
    const ninth = await f.controller.route(request("overflow"));
    assert.equal(ninth.status, 429);
    assert.ok(ninth.body.code === "UNAVAILABLE");
    assert.equal(ninth.body.reason, "CAPACITY");
    assert.equal((await f.controller.status()).in_flight, 8);
    gate.resolve();
    assert.ok((await Promise.all(work)).every((r) => r.status === 200));
    assert.equal((await f.controller.status()).in_flight, 0);
  } finally {
    gate.resolve();
    await f.close();
  }
});
test("Held phase respects request deadline and releases its lease / 단계 대기도 요청 시간 상한을 지키고 고정을 해제", async (t) => {
  const gate = deferred(),
    reached = deferred();
  const f = fixture({
    phase: async (phase) => {
      if (phase === "AFTER_NODE_ENGINE_RESULT") {
        reached.resolve();
        await gate.promise;
      }
    },
  });
  try {
    await f.controller.reconcile(false);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const work = f.controller.route(request("deadline"));
    await reached.promise;
    t.mock.timers.tick(30001);
    const r = await work;
    assert.equal(r.status, 503);
    assert.ok(r.body.code === "UNAVAILABLE");
    assert.equal(r.body.reason, "REQUEST_DEADLINE");
    assert.equal((await f.controller.status()).in_flight, 0);
  } finally {
    t.mock.timers.reset();
    gate.resolve();
    await f.close();
  }
});
test("Timed-out underlying store work blocks further queries until completion, then requires a fresh read / 시간초과 저장소 작업은 완료까지 새 조회를 막고 다음에는 새로 조회", async (t) => {
  const gate = deferred<AcceptedInspection>(),
    f = fixture();
  let held = true;
  f.inspectOverride = () =>
    held ? gate.promise : Promise.resolve(structuredClone(f.state));
  try {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const statuses = Array.from({ length: 18 }, () => f.controller.status());
    await turn();
    assert.equal(f.reads, 1);
    assert.equal((await statuses[17]!).reason, "STORE_UNAVAILABLE");
    t.mock.timers.tick(5001);
    const failed = await Promise.all(statuses);
    assert.ok(
      failed.every(
        (r) => r.ready === false && r.reason === "STORE_UNAVAILABLE",
      ),
    );
    assert.equal((await f.controller.status()).reason, "STORE_UNAVAILABLE");
    assert.equal(f.reads, 1);
    f.state = accepted(2);
    held = false;
    gate.resolve(accepted());
    await turn();
    await f.controller.reconcile(false);
    assert.ok(f.reads > 1);
    assert.deepEqual(f.compiled, [2]);
    assert.equal((await f.controller.status()).active?.sequence, 2);
  } finally {
    t.mock.timers.reset();
    held = false;
    gate.resolve(accepted());
    await f.close();
  }
});
test("Closing discards a late store result and never activates afterward / 종료는 늦은 저장소 결과를 버리고 이후 활성화하지 않음", async () => {
  const gate = deferred<AcceptedInspection>(),
    f = fixture();
  f.inspectOverride = () => gate.promise;
  try {
    const work = f.controller.reconcile(false);
    await turn();
    await f.controller.close();
    gate.resolve(accepted(1));
    await work;
    await turn();
    assert.equal(f.engines.length, 0);
    assert.equal((await f.controller.status()).ready, false);
    assert.equal((await f.controller.status()).slots.length, 0);
  } finally {
    gate.resolve(accepted());
    await f.close();
  }
});

test("Slow reconciliation skips periodic ticks and completes one explicit follow-up serially / 느린 재조정은 주기 호출을 건너뛰고 명시적 후속 한 번을 직렬 완료", async (t) => {
  const first = deferred(), second = deferred(), f = fixture();
  let active = 0, maxActive = 0, calls = 0, completed = false;
  f.config.poll_interval_ms = 500;
  f.inspectOverride = async () => {
    const call = ++calls;
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      if (call === 1) await first.promise;
      if (call === 2) await second.promise;
      throw new TrafficError("GENERATION_CONFLICT");
    } finally {
      active--;
    }
  };
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    f.controller.start();
    await turn();
    assert.equal(calls, 1);
    t.mock.timers.tick(1500);
    await turn();
    assert.equal(calls, 1);
    // Several explicit callers coalesce into exactly one fresh follow-up.
    // 여러 명시 호출은 새 후속 작업 정확히 하나로 병합됩니다.
    const explicit = f.controller.reconcile(false);
    const duplicate = f.controller.reconcile(false);
    assert.equal(explicit, duplicate);
    void explicit.then(() => { completed = true; });
    first.resolve();
    await turn();
    assert.equal(calls, 2);
    t.mock.timers.tick(1500);
    await turn();
    assert.equal(calls, 2);
    assert.equal(completed, false);
    second.resolve();
    await turn();
    assert.equal(completed, true);
    await explicit;
    assert.equal(calls, 2);
    assert.equal(maxActive, 1);
    assert.equal(f.engines.length, 0);
    // Failure remains retryable on the next periodic tick after completion.
    // 실패 후에도 완료 다음 주기에는 다시 시도합니다.
    t.mock.timers.tick(500);
    await turn();
    assert.equal(calls, 3);
    assert.equal(maxActive, 1);
    assert.equal((await f.controller.status()).reason, "GENERATION_CONFLICT");
  } finally {
    first.resolve();
    second.resolve();
    await f.close();
    t.mock.timers.reset();
  }
});

test("Domain failures keep leases and reject changed authority before return / 업무 실패도 고정을 유지하고 반환 전 승인 변경 거부", async () => {
  let f: ReturnType<typeof fixture>, change = false;
  f = fixture({phase: async phase => {
    if (change && phase === "AFTER_NODE_ENGINE_RESULT") f.state = accepted(1);
  }});
  try {
    await f.controller.reconcile(false);
    f.routeRejection = new NativeRouteRejection(442);
    const r = {...request("domain"), snap_policy:"nearest_road_100m" as const};
    const response = await f.controller.route(r);
    assert.equal(response.status,422);
    assert.equal(response.body.code,"ROUTE_REJECTED");
    if (response.body.code !== "ROUTE_REJECTED") throw Error();
    assert.equal(response.body.request_sha256,sha256(canonical(r)));
    assert.equal(response.body.native_code,442);
    assert.equal(response.body.reason,"NO_PATH");
    assert.equal((await f.controller.status()).in_flight,0);
    change = true;
    assert.equal((await f.controller.route(r)).status,409);
  } finally { await f.close(); }
});
