/** Small local HTTP security tests; actual native/browser proof belongs to the whole runner.
 * 작은 로컬 HTTP 보안 검사이며 실제 엔진·브라우저 근거는 전체 실행기에서 확인합니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startClientServer,
  validateClientContext,
  validateClientRoute,
} from "../tools/client_server.js";
import type { ClientBootstrap } from "../tools/client_types.js";
const graph = "a".repeat(64);
const bootstrap: ClientBootstrap = {
  schema_version: "0.1",
  graph_id: graph,
  source_class: "SYNTHETIC",
  clock_basis: "SIMULATION_EVENT_TIME",
  bounds: [127, 37, 128, 38],
  roads: { type: "FeatureCollection", features: [] },
  presets: {
    long: {
      origin: { longitude: 127.03, latitude: 37.5 },
      destination: { longitude: 127.04, latitude: 37.5 },
    },
    short: {
      origin: { longitude: 127.031, latitude: 37.5 },
      destination: { longitude: 127.032, latitude: 37.5 },
    },
  },
  attribution: {
    text: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
  },
};
const context = {
  schema_version: "0.1",
  graph_id: graph,
  high_water: 0,
  traffic_snapshot_id: null,
  sequence: null,
  checked_at_event_time: "2026-10-24T00:04:30.000Z",
  traffic_published_at: null,
  traffic_valid_until: null,
  source_class: "SYNTHETIC",
  clock_basis: "SIMULATION_EVENT_TIME",
};
const route = {
  request_id: "test",
  request_sha256: "b".repeat(64),
  graph_id: graph,
  snapshot_id: null,
  sequence: null,
  generation_id: "c".repeat(64),
  traffic_sha256: "d".repeat(64),
  engine_version: "3.9.1",
  image_id: "sha256:" + "e".repeat(64),
  costing_config_id: "valhalla-current-v1",
  node_id: "unit-node",
  calculated_at: "2026-10-25T00:00:00.000Z",
  traffic_mode: "BASE_ONLY",
  distance_m: 100,
  duration_s: 10,
  geometry: {
    type: "LineString",
    coordinates: [
      [127.03, 37.5],
      [127.04, 37.5],
    ],
  },
  live_coverage_ratio: 0,
  warnings: [],
  high_water: context.high_water,
  checked_at_event_time: context.checked_at_event_time,
  traffic_published_at: null,
  traffic_valid_until: null,
  source_class: "SYNTHETIC",
  clock_basis: "SIMULATION_EVENT_TIME",
};
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "routelens-client-server-"));
  for (const f of [
    "index.html",
    "client.js",
    "client.css",
    "maplibre-worker.js",
  ])
    writeFileSync(
      join(root, f),
      f === "index.html"
        ? "<!doctype html><title>Local pilot</title>"
        : "/* local */",
    );
  let forwards = 0,
    body: unknown = context;
  const privateToken = "private-gateway-token-unit-000000000000";
  const upstream = createServer((req, res) => {
    forwards++;
    assert.equal(req.headers.authorization, "Bearer " + privateToken);
    req.resume();
    req.once("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const addr = upstream.address();
  if (!addr || typeof addr === "string") throw Error();
  const app = await startClientServer({
    gateway_origin: `http://127.0.0.1:${addr.port}`,
    gateway_token: privateToken,
    assets_directory: root,
    bootstrap,
    evidence_directory: join(root, "evidence"),
  });
  const page = await fetch(app.origin);
  const cookie = page.headers.get("set-cookie")!.split(";")[0]!;
  return {
    root,
    app,
    cookie,
    page,
    privateToken,
    get forwards() {
      return forwards;
    },
    set body(v: unknown) {
      body = v;
    },
    async close() {
      await app.close();
      const closed = new Promise<void>((done, fail) =>
        upstream.close((e) => (e ? fail(e) : done())),
      );
      upstream.closeAllConnections();
      await closed;
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("Session, exact Host and Origin protect local APIs without leaking gateway secrets / 세션·정확 호스트·출처로 보호하며 인증값 비공개", async () => {
  const f = await fixture();
  try {
    assert.match(
      f.page.headers.get("set-cookie")!,
      /HttpOnly; SameSite=Strict/,
    );
    assert.match(
      f.page.headers.get("content-security-policy")!,
      /connect-src 'self'/,
    );
    const denied = await fetch(f.app.origin + "/api/route-context");
    assert.equal(denied.status, 403);
    const wrong = await fetch(f.app.origin + "/api/route-context", {
      headers: { cookie: f.cookie, origin: "http://example.invalid" },
    });
    assert.equal(wrong.status, 403);
    // Node fetch normalizes Host; use the actual HTTP transport for this negative request.
    // Node fetch는 Host를 정규화하므로 실제 HTTP 전송으로 잘못된 헤더를 보냅니다.
    const wrongHost = await new Promise<number>((done, fail) => {
      const request = httpRequest(
        f.app.origin + "/api/bootstrap",
        {
          headers: { cookie: f.cookie, host: "localhost:" + f.app.port },
        },
        (response) => {
          response.resume();
          response.once("end", () => done(response.statusCode!));
        },
      );
      request.once("error", fail);
      request.end();
    });
    assert.equal(wrongHost, 403);
    const crossSite = await fetch(f.app.origin + "/api/route-context", {
      headers: { cookie: f.cookie, "sec-fetch-site": "cross-site" },
    });
    assert.equal(crossSite.status, 403);
    const bootstrapReply = await fetch(f.app.origin + "/api/bootstrap", {
      headers: { cookie: f.cookie },
    });
    assert.equal(bootstrapReply.status, 200);
    assert.equal((await bootstrapReply.text()).includes(f.privateToken), false);
    assert.equal(f.forwards, 0);
    const good = await fetch(f.app.origin + "/api/route-context", {
      headers: { cookie: f.cookie },
    });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), context);
    const records = readFileSync(join(f.root, "evidence/http.json"), "utf8");
    assert.equal(records.includes(f.privateToken), false);
    assert.equal(records.includes(f.cookie), false);
  } finally {
    await f.close();
  }
});
test("POST needs exact Origin, rejects out-of-envelope input and only serves allowlisted assets / POST 출처·서버범위·정적 허용목록", async () => {
  const f = await fixture();
  try {
    const input = {
      schema_version: "0.1",
      request_id: "test",
      ...bootstrap.presets.long,
      profile: "car",
      traffic_policy: "prefer_live",
    };
    const headers = { cookie: f.cookie, "content-type": "application/json" };
    assert.equal(
      (
        await fetch(f.app.origin + "/api/routes", {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        })
      ).status,
      403,
    );
    const outside = await fetch(f.app.origin + "/api/routes", {
      method: "POST",
      headers: { ...headers, origin: f.app.origin },
      body: JSON.stringify({ ...input, origin: { longitude: 0, latitude: 0 } }),
    });
    assert.equal(outside.status, 422);
    assert.equal(f.forwards, 0);
    for (const p of [
      "/%2e%2e/package.json",
      "/package.json",
      "/client.js?secret=x",
      "/api/clock",
    ]) {
      const r = await fetch(f.app.origin + p, {
        headers: { cookie: f.cookie },
      });
      assert.equal(r.status, 404);
    }
    f.body = route;
    const good = await fetch(f.app.origin + "/api/routes", {
      method: "POST",
      headers: { ...headers, origin: f.app.origin },
      body: JSON.stringify(input),
    });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), route);
  } finally {
    await f.close();
  }
});
test("Malformed or private upstream fields cannot cross the same-origin proxy / 잘못된 또는 비공개 상위 응답 필드는 화면으로 전달하지 않음", async () => {
  const f = await fixture();
  try {
    f.body = { ...context, token: "forbidden" };
    const bad = await fetch(f.app.origin + "/api/route-context", {
      headers: { cookie: f.cookie },
    });
    assert.equal(bad.status, 503);
    assert.equal((await bad.text()).includes("forbidden"), false);
    assert.throws(() =>
      validateClientContext({ ...context, high_water: -1 }, graph),
    );
    assert.throws(() =>
      validateClientRoute(
        {
          ...route,
          geometry: {
            type: "LineString",
            coordinates: [
              [NaN, 37],
              [127, 37],
            ],
          },
        },
        graph,
      ),
    );
    assert.throws(() =>
      validateClientRoute({ ...route, native_daemon: { pid: 1 } }, graph),
    );
  } finally {
    await f.close();
  }
});
