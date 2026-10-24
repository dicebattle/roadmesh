/** Small owned HTTP tests; no native engine is substituted in integrated proof.
 * 작은 소유 HTTP 검사이며 통합 근거의 네이티브 엔진을 대체하지 않습니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { once } from "node:events";
import { createGatewayHttpServer } from "../tools/gateway_service.js";
import { nodeRequestDeadline, readNodeBody } from "../tools/node_service.js";
import { gatewayFailure } from "../tools/gateway_controller.js";
import type { GatewayConfig } from "../tools/gateway_types.js";
const token = "unit-token-00000000000000000000000000";
async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const a = server.address();
  if (!a || typeof a === "string") throw Error();
  return `http://127.0.0.1:${a.port}`;
}
async function close(server: Server) {
  const closed = new Promise<void>((done, fail) =>
    server.close((e) => (e ? fail(e) : done())),
  );
  server.closeAllConnections();
  await closed;
}
test("Native remaining deadline accepts canonical decimal only and absence preserves30s / 네이티브 잔여기한은 정규십진수만 받고 없으면30초", () => {
  assert.equal(nodeRequestDeadline(undefined, 10), 30010);
  assert.equal(nodeRequestDeadline("1", 10), 11);
  assert.equal(nodeRequestDeadline("30000", 10), 30010);
  for (const value of [
    "0",
    "01",
    "+1",
    "1.0",
    " 1",
    "1 ",
    "30001",
    "1e3",
    ["1", "2"],
  ])
    assert.throws(() => nodeRequestDeadline(value, 0), /INVALID_REQUEST/);
});
test("Gateway auth, chunked64KiB cap and no successful body on failure / 중계 인증·청크64KiB제한·실패의 성공본문 부재", async () => {
  let dispatched = 0;
  const server = createGatewayHttpServer({ token } as GatewayConfig, {
    context: async () => ({
      status: 503,
      body: gatewayFailure("STORE_UNAVAILABLE"),
    }),
    route: async () => {
      dispatched++;
      return { status: 503, body: gatewayFailure("NO_HEALTHY_NODE") };
    },
    status: async () => ({
      gateway_id: "unit",
      instance_id: "unit",
      in_flight: 0,
      closing: false,
      high_water: 0,
      snapshot_id: null,
      checked_at_event_time: null,
      reason: "READY",
    }),
  });
  const origin = await listen(server);
  try {
    const denied = await fetch(origin + "/v1/routes", {
      method: "POST",
      body: "{}",
    });
    assert.equal(denied.status, 401);
    assert.equal(((await denied.json()) as any).reason, "AUTH_REQUIRED");
    const response = await new Promise<{ status: number; body: string }>(
      (done, fail) => {
        const request = httpRequest(
          origin + "/v1/routes",
          {
            method: "POST",
            headers: {
              authorization: "Bearer " + token,
              "content-type": "application/json",
            },
          },
          (response) => {
            let body = "";
            response.on("data", (p) => (body += p));
            response.once("end", () =>
              done({ status: response.statusCode!, body }),
            );
          },
        );
        request.on("error", fail);
        request.write("x".repeat(65537));
        request.end();
      },
    );
    assert.equal(response.status, 422);
    assert.equal(JSON.parse(response.body).reason, "INVALID_INPUT");
    assert.equal(dispatched, 0);
    const result = await fetch(origin + "/v1/routes", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(result.status, 503);
    const failure = (await result.json()) as object;
    assert.equal("geometry" in failure, false);
    assert.equal(dispatched, 1);
  } finally {
    await close(server);
  }
});
test("Propagated deadline includes an incomplete native request body / 전달 기한은 네이티브 미완료 본문 수신도 포함", async () => {
  let dispatched = false;
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const deadline = nodeRequestDeadline(
          req.headers["x-routelens-deadline-ms"],
          performance.now(),
        );
        await readNodeBody(req, deadline);
        dispatched = true;
        res.writeHead(200);
        res.end();
      } catch {
        res.writeHead(503);
        res.end("REQUEST_DEADLINE");
      }
    })();
  });
  const origin = await listen(server);
  try {
    const result = await new Promise<number>((done, fail) => {
      const request = httpRequest(
        origin,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-routelens-deadline-ms": "25",
          },
        },
        (response) => {
          response.resume();
          response.once("end", () => {
            request.end();
            done(response.statusCode!);
          });
        },
      );
      request.on("error", fail);
      request.write("{");
    });
    assert.equal(result, 503);
    assert.equal(dispatched, false);
  } finally {
    await close(server);
  }
});
