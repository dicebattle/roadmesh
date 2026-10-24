/** Authority context unit boundaries; actual source/native/browser checks remain separate.
 * 승인 문맥 단위 경계이며 실제 원본·엔진·브라우저 검사는 별도입니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as turn } from "node:timers/promises";
import { GatewayController } from "../tools/gateway_controller.js";
import { validateClientRuntimeConfig } from "../tools/client_runtime.js";
import type { GatewayConfig } from "../tools/gateway_types.js";
import type { TrafficBundle } from "../tools/traffic_types.js";
import type { AcceptedInspection } from "../tools/publication_types.js";
const graph = "a".repeat(64);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "routelens-client-context-"));
  let state: AcceptedInspection = {
      high_water: 0,
      active: null,
      checked_at_event_time: "2026-10-24T00:04:30.000Z",
    },
    inspect: (() => Promise<AcceptedInspection>) | undefined;
  const config: GatewayConfig = {
    gateway_id: "unit-context",
    consumer: {
      consumer_id: "unit",
      store: { namespace: "p09-unit", graph_id: graph },
    } as GatewayConfig["consumer"],
    graph_directory: dir,
    bundle_directory: dir,
    generation_root: join(dir, "generations"),
    runtime_root: join(dir, "runtime"),
    token: "unit-token-00000000000000000000000000",
    nodes: [
      { node_id: "a", origin: "http://127.0.0.1:1234", token: "private-a" },
      { node_id: "b", origin: "http://127.0.0.1:1235", token: "private-b" },
    ],
  };
  let nodeCalls = 0;
  const controller = new GatewayController(config, {
    bundle: { graph_id: graph } as TrafficBundle,
    store: {
      inspectAccepted: () => (inspect ? inspect() : Promise.resolve(state)),
      pull: async () => {},
      close: async () => {},
    },
    compile: async () => {
      throw Error("not needed");
    },
    verifyGeneration: () => {},
    fetch: (async () => {
      nodeCalls++;
      throw Error("not needed");
    }) as typeof fetch,
  });
  return {
    controller,
    get state() {
      return state;
    },
    set state(v: AcceptedInspection) {
      state = v;
    },
    set inspect(v: () => Promise<AcceptedInspection>) {
      inspect = v;
    },
    get nodeCalls() {
      return nodeCalls;
    },
    async close() {
      await controller.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("Current context is authorized independently of node readiness and clears expired metadata / 현재 문맥은 노드 준비와 별개이며 만료 메타데이터 해제", async () => {
  const f = fixture();
  try {
    const baseline = await f.controller.context();
    assert.equal(baseline.status, 200);
    assert.equal((baseline.body as any).traffic_published_at, null);
    const fields = [
      "schema_version",
      "graph_id",
      "high_water",
      "traffic_snapshot_id",
      "sequence",
      "checked_at_event_time",
      "traffic_published_at",
      "traffic_valid_until",
      "source_class",
      "clock_basis",
    ].sort();
    assert.deepEqual(Object.keys(baseline.body).sort(), fields);
    f.state = {
      ...f.state,
      high_water: 1,
      active: {
        manifest: {
          graph_id: graph,
          traffic_snapshot_id: "b".repeat(64),
          sequence: 1,
          published_at: "2026-10-24T00:04:30.000Z",
          valid_until: "2026-10-24T00:07:00.000Z",
        },
      } as AcceptedInspection["active"],
    };
    const live = await f.controller.context();
    assert.equal(
      (live.body as any).traffic_published_at,
      "2026-10-24T00:04:30.000Z",
    );
    assert.equal((live.body as any).high_water, 1);
    f.state = {
      high_water: 1,
      active: null,
      checked_at_event_time: "2026-10-24T00:07:00.000Z",
    };
    const expired = await f.controller.context();
    assert.equal((expired.body as any).high_water, 1);
    assert.equal((expired.body as any).traffic_snapshot_id, null);
    assert.equal((expired.body as any).traffic_valid_until, null);
    assert.equal(f.nodeCalls, 0);
  } finally {
    await f.close();
  }
});
test("Context store timeout returns503 and late store data is not cached / 문맥 저장소 시간초과는503이며 늦은 값을 캐시하지 않음", async (t) => {
  const f = fixture();
  let resolve!: (value: AcceptedInspection) => void;
  f.inspect = () =>
    new Promise((done) => {
      resolve = done;
    });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const work = f.controller.context();
    await turn();
    t.mock.timers.tick(2001);
    const response = await work;
    assert.equal(response.status, 503);
    assert.equal((response.body as any).reason, "STORE_UNAVAILABLE");
    resolve(f.state);
    await turn();
    f.inspect = async () => ({ ...f.state, high_water: 3 });
    assert.equal(((await f.controller.context()).body as any).high_water, 3);
  } finally {
    t.mock.timers.reset();
    await f.close();
  }
});
test("Interactive pilot lifetime cannot exceed fifteen minutes / 대화형 파일럿 수명은15분을 넘길 수 없음", () => {
  const config = {
    graph_directory: "/unit/graph",
    output_directory: "/unit/output",
    assets_directory: "/unit/assets",
    clock_mode: "supervised" as const,
    lifetime_ms: 900000,
  };
  assert.doesNotThrow(() => validateClientRuntimeConfig(config));
  for (const lifetime_ms of [0, -1, 900001, NaN])
    assert.throws(() =>
      validateClientRuntimeConfig({ ...config, lifetime_ms }),
    );
});
