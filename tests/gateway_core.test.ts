/** Unit peers establish consistency boundaries, not actual native proof.
 * 단위 응답 대역은 일관성 경계만 확인하며 실제 엔진 근거가 아닙니다. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as turn } from "node:timers/promises";
import { canonical, sha256 } from "../tools/shared.js";
import { trafficProvenance } from "../tools/traffic_controller.js";
import {
  GatewayController,
  validateGatewayConfig,
  validateGatewayRequest,
  validateGatewayNodeResult,
  validateGatewayNodeRejection,
} from "../tools/gateway_controller.js";
import type {
  GatewayConfig,
  GatewayDependencies,
  GatewayHooks,
  GatewayRequest,
} from "../tools/gateway_types.js";
import type {
  TrafficBundle,
  TrafficGeneration,
} from "../tools/traffic_types.js";
import type { AcceptedInspection } from "../tools/publication_types.js";
import { nativeRouteRequest } from "../tools/route_contract.js";
import type { NodeRouteRequest } from "../tools/node_types.js";

const graph = "a".repeat(64);
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function shape(points: number[][]): string {
  let lat = 0,
    lon = 0,
    s = "";
  const emit = (v: number) => {
    let n = v < 0 ? -v * 2 - 1 : v * 2;
    while (n >= 32) {
      s += String.fromCharCode(((n % 32) | 32) + 63);
      n = Math.floor(n / 32);
    }
    s += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const y = Math.round(p[1]! * 1e6),
      x = Math.round(p[0]! * 1e6);
    emit(y - lat);
    emit(x - lon);
    lat = y;
    lon = x;
  }
  return s;
}
const request: GatewayRequest = {
  schema_version: "0.1",
  request_id: "unit-request",
  origin: { longitude: 127.03, latitude: 37.5 },
  destination: { longitude: 127.031, latitude: 37.5 },
  profile: "car",
  traffic_policy: "prefer_live",
};
function fixture(hooks: GatewayHooks = {}, excluded?: string[]) {
  const root = mkdtempSync(join(tmpdir(), "routelens-gateway-unit-"));
  const bundle = {
    graph_id: graph,
    coverage_bounds: [126.7, 37.4, 127.25, 37.75],
    image_id: "sha256:" + "b".repeat(64),
    catalog: [],
    directory: root,
    graph_directory: root,
  } as unknown as TrafficBundle;
  let state: AcceptedInspection = {
    high_water: 0,
    active: null,
    checked_at_event_time: "2026-10-24T00:00:00.000Z",
  };
  const g: TrafficGeneration = {
    compiler_policy: "valhalla-current-v1",
    generation_id: "c".repeat(64),
    graph_id: graph,
    skeleton_sha256: "d".repeat(64),
    traffic_snapshot_id: null,
    sequence: null,
    valid_until: null,
    traffic_sha256: "e".repeat(64),
    traffic_byte_length: 1024,
    live_edges: [],
    directory: root,
    traffic_path: join(root, "traffic.tar"),
    manifest_path: join(root, "manifest.json"),
  };
  const config: GatewayConfig = {
    ...(excluded ? { excluded_node_ids: excluded } : {}),
    gateway_id: "unit-gateway",
    consumer: {
      store: { namespace: "p10-unit", graph_id: graph },
      consumer_id: "gateway-unit",
    } as GatewayConfig["consumer"],
    graph_directory: root,
    bundle_directory: root,
    generation_root: join(root, "generations"),
    runtime_root: join(root, "runtime"),
    token: "unit-token-00000000000000000000000000",
    nodes: [
      {
        node_id: "node-a",
        origin: "http://127.0.0.1:10001",
        token: "node-a-unit",
      },
      {
        node_id: "node-b",
        origin: "http://127.0.0.1:10002",
        token: "node-b-unit",
      },
    ],
  };
  const calls: Array<{
    node: string;
    path: string;
    body: any;
    deadline: string | undefined;
  }> = [];
  let reads = 0,
    overrideInspect: (() => Promise<AcceptedInspection>) | undefined,
    overrideFetch:
      | ((
          node: string,
          path: string,
          body: any,
          signal: AbortSignal,
        ) => Promise<Response>)
      | undefined,
    corrupt = false;
  const result = (node: string, r: GatewayRequest = request) => ({
    code: "ROUTE",
    request_id: r.request_id,
    node_id: node,
    instance_id: "unit-instance",
    engine_result: {
      request: {
        locations: [
          { lon: r.origin.longitude, lat: r.origin.latitude },
          { lon: r.destination.longitude, lat: r.destination.latitude },
        ],
        costing: "auto",
        units: "kilometers",
        language: "en-US",
        date_time: { type: 0 },
      },
      route: {
        trip: {
          status: 0,
          legs: [
            {
              shape: shape([
                [127.03, 37.5],
                [127.031, 37.5],
              ]),
            },
          ],
          summary: { length: 0.088, time: 8, cost: 8 },
        },
      },
      trace: {
        units: "kilometers",
        shape: shape([
          [127.03, 37.5],
          [127.031, 37.5],
        ]),
        edges: [
          {
            id: 1,
            length: 0.088,
            source_percent_along: 0.35,
            target_percent_along: 0.65,
          },
        ],
      },
    },
    provenance: {
      ...trafficProvenance(bundle, g, state),
      activation_epoch: 1,
      native_daemon: { pid: 123, start_ticks: "456" },
    },
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const dependencies: GatewayDependencies = {
    bundle,
    store: {
      inspectAccepted: async () => {
        reads++;
        return overrideInspect ? overrideInspect() : structuredClone(state);
      },
      pull: async () => ({ code: "REJECTED" }),
      close: async () => {},
    },
    compile: async () => g,
    verifyGeneration: () => {
      if (corrupt) throw Error("corrupt");
    },
    fetch: (async (input, init) => {
      const url = new URL(String(input)),
        node = url.port === "10001" ? "node-a" : "node-b",
        body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({
        node,
        path: url.pathname,
        body,
        deadline:
          new Headers(init?.headers).get("x-routelens-deadline-ms") ??
          undefined,
      });
      if (overrideFetch)
        return overrideFetch(node, url.pathname, body, init!.signal!);
      if (url.pathname.endsWith("status"))
        return json({
          node_id: node,
          instance_id: "unit-instance",
          ready: true,
          active: trafficProvenance(bundle, g, state),
        });
      return json(result(node, { ...request, request_id: body.request_id }));
    }) as typeof fetch,
  };
  const controller = new GatewayController(config, dependencies, hooks);
  return {
    root,
    config,
    controller,
    dependencies,
    bundle,
    g,
    calls,
    result,
    json,
    get reads() {
      return reads;
    },
    get state() {
      return state;
    },
    set state(v: AcceptedInspection) {
      state = v;
    },
    set inspect(v: (() => Promise<AcceptedInspection>) | undefined) {
      overrideInspect = v;
    },
    set fetch(v: typeof overrideFetch) {
      overrideFetch = v;
    },
    set corrupt(v: boolean) {
      corrupt = v;
    },
    run: (r: unknown = request, ms = 12000) =>
      controller.route(r, {
        deadline: performance.now() + ms,
        signal: new AbortController().signal,
      }),
    async close() {
      await controller.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("Domain rejection binds policy, request, selected instance and final authority / 업무 거부는 정책·요청·선택 실행·최종 승인을 연결", async () => {
  let f: ReturnType<typeof fixture>;
  let change = false;
  f = fixture({ phase: async phase => {
    if (change && phase === "AFTER_GATEWAY_NODE_RESULT") f.state = { ...f.state, high_water: 1 };
  }});
  const r: GatewayRequest = { ...request, snap_policy: "nearest_road_100m" };
  const internal: NodeRouteRequest = {
    request_id: r.request_id, graph_id: graph,
    locations: [{lon: r.origin.longitude, lat: r.origin.latitude}, {lon: r.destination.longitude, lat: r.destination.latitude}],
    snap_policy: r.snap_policy, expected_generation_id: f.g.generation_id,
  };
  const domain = {
    code: "ROUTE_REJECTED", request_id: r.request_id,
    request_sha256: sha256(canonical(internal)),
    native_request_sha256: sha256(canonical(nativeRouteRequest(internal))),
    node_id: "node-a", instance_id: "unit-instance", reason: "NO_PATH", native_code: 442,
    provenance: f.result("node-a").provenance,
  };
  let malformed = false;
  f.fetch = async (node, path, body) => path.endsWith("status")
    ? f.json({ node_id: node, instance_id: "unit-instance", ready: true, active: f.result(node).provenance })
    : node === "node-a" ? f.json({ ...domain, ...(malformed ? { request_sha256: "f".repeat(64) } : {}) }, 422)
    : f.json({ ...f.result(node, r), engine_result: { ...f.result(node, r).engine_result, request: nativeRouteRequest(internal) } });
  try {
    assert.equal(validateGatewayNodeRejection(domain, r, f.config.nodes[0], f.bundle, f.g, "unit-instance"), "NO_PATH");
    for (const delta of [{native_code:441}, {reason:"NO_SUITABLE_ROAD"}, {instance_id:"another"}, {native_request_sha256:"bad"}, {extra:"private"}])
      assert.throws(() => validateGatewayNodeRejection({...domain,...delta},r,f.config.nodes[0],f.bundle,f.g,"unit-instance"));
    const reply = await f.run(r);
    assert.equal(reply.status, 422);
    assert.deepEqual(Object.keys(reply.body).sort(), ["code", "message_en", "message_ko", "reason"]);
    assert.equal((reply.body as any).reason, "NO_PATH");
    assert.equal(f.calls.filter(c => c.path.endsWith("route")).length, 1);
    assert.deepEqual(f.calls.at(-1)!.body, internal);
    malformed = true;
    assert.equal((await f.run(r)).status, 200);
    malformed = false;
    change = true;
    assert.equal((await f.run(r)).status, 409);
  } finally { await f.close(); }
});
test("Coverage is checked before dispatch and exclusions skip healthy peers / 범위는 전달 전에 검사하고 제외한 정상 노드는 건너뜀", async () => {
  const f = fixture({}, ["node-a"]);
  try {
    const outside = await f.run({...request, destination:{longitude:127.26,latitude:37.5}});
    assert.equal((outside.body as any).reason,"OUT_OF_COVERAGE");
    assert.equal(f.calls.length,0);
    assert.equal(f.reads,0);
    assert.equal((await f.run()).status,200);
    assert.ok(f.calls.every(c=>c.node==="node-b"));
    for (const excluded_node_ids of [["unknown"],["node-a","node-a"],"node-a"])
      assert.throws(()=>validateGatewayConfig({...f.config,excluded_node_ids} as GatewayConfig));
  } finally { await f.close(); }
  const both = fixture({},["node-a","node-b"]);
  try {
    assert.equal((await both.run()).status,503);
    assert.equal(both.calls.length,0);
  } finally { await both.close(); }
});
test("Strict public input and exact configured origins / 정확 공개 입력·설정 주소", async () => {
  const f = fixture();
  try {
    for (const value of [
      { ...request, extra: true },
      { ...request, origin: { latitude: NaN, longitude: 127 } },
      { ...request, schema_version: "2" },
    ])
      assert.throws(() => validateGatewayRequest(value));
    assert.throws(
      () => validateGatewayRequest({ ...request, traffic_policy: "base_only" }),
      /UNSUPPORTED_POLICY/,
    );
    for (const origin of [
      "http://localhost:10001",
      "http://127.0.0.1:10001/",
      "http://127.0.0.1:10001/path",
      "http://u@127.0.0.1:10001",
      "https://127.0.0.1:10001",
    ]) {
      const c = structuredClone(f.config);
      c.nodes[0].origin = origin;
      assert.throws(() => validateGatewayConfig(c));
    }
    const dup = structuredClone(f.config);
    dup.nodes[1] = dup.nodes[0];
    assert.throws(() => validateGatewayConfig(dup));
  } finally {
    await f.close();
  }
});
test("Stable node order, canonical public hash and route-local partial coverage / 고정 노드 순서·공개 정규해시·부분구간 적용률", async () => {
  const f = fixture();
  try {
    const reply = await f.run();
    assert.equal(reply.status, 200);
    if (!("geometry" in reply.body)) throw Error();
    assert.equal(reply.body.node_id, "node-a");
    assert.equal(reply.body.request_sha256, sha256(canonical(request)));
    assert.equal(reply.body.live_coverage_ratio, 0);
    assert.equal(reply.body.traffic_mode, "BASE_ONLY");
    assert.equal("native_daemon" in reply.body, false);
    f.g.live_edges = [
      { edge_id: "1" } as TrafficGeneration["live_edges"][number],
    ];
    const live = await f.run();
    assert.equal(live.status, 200);
    if (!("geometry" in live.body)) throw Error();
    assert.equal(live.body.live_coverage_ratio, 1);
    assert.equal(live.body.traffic_mode, "LIVE_MIXED");
    const route = f.calls.find((c) => c.path.endsWith("route"))!;
    assert.ok(Number(route.deadline) > 0 && Number(route.deadline) <= 4000);
    assert.equal(route.body.expected_generation_id, f.g.generation_id);
    const raw = f.result("node-a");
    raw.engine_result.trace.edges = [
      {
        id: 1,
        length: 0.044,
        source_percent_along: 0.35,
      },
      {
        id: 2,
        length: 0.044,
        target_percent_along: 0.65,
      },
    ] as any;
    assert.equal(
      validateGatewayNodeResult(raw, request, f.config.nodes[0], f.bundle, f.g)
        .live_coverage_ratio,
      0.5,
    );
  } finally {
    await f.close();
  }
});
test("One retry preserves the pinned generation and invalid first response is retained / 한 번 재시도는 고정 세대를 유지하고 첫 잘못된 원문 보존", async () => {
  const f = fixture();
  try {
    f.fetch = async (node, path) =>
      path.endsWith("status")
        ? f.json({
            node_id: node,
            ready: true,
            active: trafficProvenance(f.bundle, f.g, f.state),
          })
        : f.json(
            node === "node-a"
              ? { ...f.result(node), request_id: "wrong" }
              : f.result(node),
          );
    const reply = await f.run();
    assert.equal(reply.status, 200);
    assert.equal((reply.body as any).node_id, "node-b");
    assert.deepEqual(
      f.calls
        .filter((c) => c.path.endsWith("route"))
        .map((c) => c.body.expected_generation_id),
      [f.g.generation_id, f.g.generation_id],
    );
    const dir = readdirSync(join(f.config.runtime_root, "requests"))[0]!;
    const attempts = JSON.parse(
      readFileSync(
        join(f.config.runtime_root, "requests", dir, "attempts.json"),
        "utf8",
      ),
    );
    assert.equal(attempts[0].reason, "WRONG_REQUEST");
    assert.equal(attempts.length, 2);
  } finally {
    await f.close();
  }
});
test("No compatible node and two unavailable peers cannot silently downgrade / 호환 노드 부재·두 장애는 몰래 이전 버전을 반환하지 않음", async () => {
  const f = fixture();
  try {
    f.fetch = async (node, path) =>
      path.endsWith("status")
        ? f.json({
            node_id: node,
            ready: true,
            active: {
              ...trafficProvenance(f.bundle, f.g, f.state),
              generation_id: "f".repeat(64),
            },
          })
        : f.json({});
    assert.equal((await f.run()).status, 503);
    assert.equal(f.calls.filter((c) => c.path.endsWith("route")).length, 0);
    f.fetch = async (node, path) =>
      path.endsWith("status")
        ? f.json({
            node_id: node,
            ready: true,
            active: trafficProvenance(f.bundle, f.g, f.state),
          })
        : f.json({ code: "UNAVAILABLE" }, 503);
    assert.equal((await f.run()).status, 503);
    assert.equal(f.calls.filter((c) => c.path.endsWith("route")).length, 2);
  } finally {
    await f.close();
  }
});
test("409 stops retry and final durable version change discards the route /409는 재시도를 멈추고 최종 영속 변경은 결과 폐기", async () => {
  const f = fixture();
  try {
    f.fetch = async (node, path) =>
      path.endsWith("status")
        ? f.json({
            node_id: node,
            ready: true,
            active: trafficProvenance(f.bundle, f.g, f.state),
          })
        : f.json({ reason: "GENERATION_MISMATCH" }, 409);
    const mismatch = await f.run();
    assert.equal(mismatch.status, 409);
    assert.equal(f.calls.filter((c) => c.path.endsWith("route")).length, 1);
  } finally {
    await f.close();
  }
  const changed = fixture({
    phase: async (phase) => {
      if (phase === "AFTER_GATEWAY_NODE_RESULT")
        changed.state = { ...changed.state, high_water: 1 };
    },
  });
  try {
    const reply = await changed.run();
    assert.equal(reply.status, 409);
    assert.equal((reply.body as any).reason, "TRAFFIC_CHANGED");
    assert.equal("geometry" in reply.body, false);
  } finally {
    await changed.close();
  }
});
test("Malformed shapes, wrong native request and discontinuous trace are rejected / 잘못된 지형·원요청·불연속 추적 거부", async () => {
  const f = fixture();
  try {
    for (const mutate of [
      (r: any) => (r.engine_result.route.trip.legs[0].shape = "?"),
      (r: any) => (r.engine_result.request.date_time.type = 1),
      (r: any) => (r.engine_result.trace.edges[0].length = 1),
      (r: any) =>
        (r.engine_result.trace.shape = shape([
          [127.03, 37.5],
          [127.032, 37.5],
        ])),
      (r: any) => (r.engine_result.trace.edges[0].source_percent_along = 1.1),
    ]) {
      const r = f.result("node-a");
      mutate(r);
      assert.throws(() =>
        validateGatewayNodeResult(r, request, f.config.nodes[0], f.bundle, f.g),
      );
    }
  } finally {
    await f.close();
  }
});
test("Overall deadline and client cancellation discard a held result / 전체 기한·연결 취소는 대기 결과 폐기", async (t) => {
  const entered = deferred<void>();
  const f = fixture({
    phase: async (phase) => {
      if (phase === "AFTER_GATEWAY_NODE_RESULT") {
        entered.resolve();
        await new Promise(() => {});
      }
    },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const result = f.run();
    await entered.promise;
    t.mock.timers.tick(12001);
    assert.equal((await result).status, 504);
    assert.equal((await f.controller.status()).in_flight, 0);
  } finally {
    t.mock.timers.reset();
    await f.close();
  }
  const held = deferred<void>();
  const c = fixture({
    phase: async (phase) => {
      if (phase === "AFTER_GATEWAY_NODE_RESULT") {
        held.resolve();
        await new Promise(() => {});
      }
    },
  });
  try {
    const abort = new AbortController();
    const work = c.controller.route(request, {
      deadline: performance.now() + 12000,
      signal: abort.signal,
    });
    await held.promise;
    abort.abort();
    assert.equal((await work).status, 504);
  } finally {
    await c.close();
  }
});
test("Eight admitted requests have no public waiting queue / 동시 여덟 요청 뒤 공개 대기열 없음", async () => {
  const gate = deferred<void>();
  let entered = 0;
  const f = fixture({
    phase: async (phase) => {
      if (phase === "AFTER_GATEWAY_NODE_RESULT") {
        entered++;
        await gate.promise;
      }
    },
  });
  try {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      f.run({ ...request, request_id: "request-" + i }),
    );
    for (let i = 0; i < 30 && entered < 8; i++) await turn();
    assert.equal(entered, 8);
    assert.equal((await f.run()).status, 429);
    gate.resolve();
    assert.ok((await Promise.all(tasks)).every((x) => x.status === 200));
  } finally {
    gate.resolve();
    await f.close();
  }
});
test("Timed-out underlying store blocks new work, discards late values and requires a fresh read / 저장소 시간초과는 새 작업을 막고 늦은 값을 버린 뒤 새 조회", async (t) => {
  const f = fixture(),
    gate = deferred<AcceptedInspection>();
  let held = true;
  f.inspect = () => (held ? gate.promise : Promise.resolve(f.state));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const work = f.controller.status();
    await turn();
    assert.equal(f.reads, 1);
    t.mock.timers.tick(2001);
    assert.equal((await work).reason, "STORE_UNAVAILABLE");
    assert.equal((await f.controller.status()).reason, "STORE_UNAVAILABLE");
    assert.equal(f.reads, 1);
    held = false;
    gate.resolve({ ...f.state, high_water: 99 });
    await turn();
    assert.equal((await f.controller.status()).high_water, 0);
    assert.equal(f.reads, 2);
  } finally {
    gate.resolve(f.state);
    t.mock.timers.reset();
    await f.close();
  }
});

test("Evidence directory failure releases admission and recovery accepts a fresh request / 근거 폴더 실패는 접수를 회수하고 복원 뒤 새 요청 허용", async () => {
  const f = fixture();
  const requests = join(f.config.runtime_root, "requests"),
    moved = join(f.config.runtime_root, "requests-moved");
  let renamed = false;
  try {
    renameSync(requests, moved);
    renamed = true;
    const failure = await f.run();
    assert.equal(failure.status, 503);
    assert.equal((failure.body as any).reason, "NO_HEALTHY_NODE");
    assert.equal((await f.controller.status()).in_flight, 0);
    assert.equal(f.calls.length, 0);
    renameSync(moved, requests);
    renamed = false;
    assert.equal((await f.run()).status, 200);
    assert.equal((await f.controller.status()).in_flight, 0);
  } finally {
    if (renamed) renameSync(moved, requests);
    await f.close();
  }
});

test("Both generation byte checks are awaited and final verification failure is terminal / 세대 바이트 검사 두 번을 기다리고 마지막 실패는 재시도하지 않음", async () => {
  const f = fixture(),
    first = deferred<void>(),
    last = deferred<void>();
  let checks = 0;
  f.dependencies.verifyGeneration = () =>
    ++checks === 1 ? first.promise : last.promise;
  try {
    let finished = false;
    const work = f.run().then((value) => {
      finished = true;
      return value;
    });
    await turn();
    assert.equal(checks, 1);
    assert.equal(f.calls.length, 0);
    assert.equal(finished, false);
    first.resolve();
    for (let i = 0; i < 10 && checks < 2; i++) await turn();
    assert.equal(checks, 2);
    assert.equal(finished, false);
    last.resolve();
    assert.equal((await work).status, 200);
  } finally {
    first.resolve();
    last.resolve();
    await f.close();
  }
  const bad = fixture();
  let n = 0;
  bad.dependencies.verifyGeneration = async () => {
    if (++n === 2) throw Error("worker verification failed");
  };
  try {
    assert.equal((await bad.run()).status, 503);
    assert.equal(bad.calls.filter((c) => c.path.endsWith("route")).length, 1);
  } finally {
    await bad.close();
  }
});
test("Cancelling one caller stops its wait without authorizing late shared preparation / 한 요청 취소는 대기만 멈추고 늦은 공유 준비로 승인하지 않음", async () => {
  const f = fixture(),
    gate = deferred<TrafficGeneration>();
  f.dependencies.compile = () => gate.promise;
  try {
    const abort = new AbortController(),
      cancelled = f.controller.route(
        { ...request, request_id: "cancelled" },
        { deadline: performance.now() + 12000, signal: abort.signal },
      ),
      other = f.run({ ...request, request_id: "other" });
    await turn();
    abort.abort();
    assert.equal((await cancelled).status, 504);
    gate.resolve(f.g);
    assert.equal((await other).status, 200);
    assert.ok(
      f.calls
        .filter((c) => c.path.endsWith("route"))
        .every((c) => c.body.request_id === "other"),
    );
  } finally {
    gate.resolve(f.g);
    await f.close();
  }
});
test("Optional compiler shutdown is awaited and unsuccessful termination makes cleanup fail / 선택적 작업자 종료를 기다리고 종료 실패는 정리 실패", async () => {
  const f = fixture(),
    gate = deferred<void>();
  let done = false;
  f.dependencies.closeCompiler = async () => {
    await gate.promise;
    return { termination_verified: true };
  };
  const work = f.controller.close().then(() => {
    done = true;
  });
  await turn();
  assert.equal(done, false);
  gate.resolve();
  await work;
  assert.equal(
    JSON.parse(
      readFileSync(join(f.config.runtime_root, "cleanup.json"), "utf8"),
    ).compiler.termination_verified,
    true,
  );
  await f.close();
  const bad = fixture();
  bad.dependencies.closeCompiler = async () => ({
    termination_verified: false,
  });
  try {
    await assert.rejects(bad.controller.close(), /cleanup incomplete/);
    assert.equal(
      JSON.parse(
        readFileSync(join(bad.config.runtime_root, "cleanup.json"), "utf8"),
      ).cleanup_verified,
      false,
    );
  } finally {
    await bad.close();
  }
});
