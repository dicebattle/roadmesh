import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeLoopbackReadyCommand,
  parseNativeIdentity,
} from "../tools/node_engine.js";
import { NodePhaseBarriers } from "../tools/node_service.js";
import type { NodePhaseDetail } from "../tools/node_types.js";
test("Native identity rejects dead states and loopback readiness checks both socket tables / 네이티브 식별은 종료 상태를 거부하고 양쪽 소켓 표 검사", () => {
  const fields = Array(30).fill("0");
  fields[0] = "S";
  fields[19] = "123456";
  assert.deepEqual(
    parseNativeIdentity("24 (valhalla_servic) " + fields.join(" ")),
    { pid: 24, start_ticks: "123456" },
  );
  for (const state of ["Z", "X"]) {
    fields[0] = state;
    assert.throws(
      () => parseNativeIdentity("24 (valhalla_servic) " + fields.join(" ")),
      /ENGINE_IDENTITY/,
    );
  }
  assert.throws(() => parseNativeIdentity("bad"));
  const command = nativeLoopbackReadyCommand();
  assert.ok(command.includes("/proc/net/tcp /proc/net/tcp6"));
  assert.ok(
    command.includes("0100007F:1F42") &&
      command.includes("0000000000000000FFFF00000100007F:1F42") &&
      command.includes('$4=="0A"') &&
      command.includes("kill -0"),
  );
});
test("Private request-specific barriers can hold several requests and cancel on deadline / 비공개 요청별 대기는 여러 요청을 고정하고 시간초과에서 취소", async () => {
  const old = process.send;
  process.send = ((_message: unknown) => true) as typeof process.send;
  const barriers = new NodePhaseBarriers(),
    base: NodePhaseDetail = {
      node_id: "node",
      instance_id: "instance",
      generation_id: "a".repeat(64),
      engine_container: "unit-only",
      engine_run_directory: "/unit",
    };
  try {
    barriers.set("AFTER_NODE_ENGINE_RESULT");
    let a = false,
      b = false;
    const first = barriers
        .wait("AFTER_NODE_ENGINE_RESULT", { ...base, request_id: "first" })
        .then(() => {
          a = true;
        }),
      abort = new AbortController(),
      second = barriers
        .wait(
          "AFTER_NODE_ENGINE_RESULT",
          { ...base, request_id: "second" },
          abort.signal,
        )
        .then(() => {
          b = true;
        });
    barriers.resume("AFTER_NODE_ENGINE_RESULT", "first");
    await first;
    assert.equal(a, true);
    assert.equal(b, false);
    abort.abort("REQUEST_DEADLINE");
    await assert.rejects(second, /REQUEST_DEADLINE/);
    barriers.resume("AFTER_NODE_ENGINE_RESULT", "second");
    assert.equal(b, false);
  } finally {
    barriers.close();
    process.send = old;
  }
});

test("Chunked oversized body receives422 without request iterator destroying its socket / 청크 초과본문은 소켓을 파괴하지 않고422반환", async () => {
  const { createServer, request } = await import("node:http"),
    { performance } = await import("node:perf_hooks"),
    { readNodeBody } = await import("../tools/node_service.js");
  let hadContentLength = true;
  const server = createServer((incoming, response) => {
    hadContentLength = incoming.headers["content-length"] !== undefined;
    void readNodeBody(incoming, performance.now() + 1000).then(
      () => {
        response.writeHead(200);
        response.end();
      },
      (error) => {
        response.writeHead(error.reason === "BODY_TOO_LARGE" ? 422 : 503);
        response.end(error.reason);
      },
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const result = await new Promise<{ status: number; body: string }>(
      (done, reject) => {
        const outgoing = request(
          {
            host: "127.0.0.1",
            port: address.port,
            method: "POST",
            headers: {
              "content-type": "application/json",
              "transfer-encoding": "chunked",
            },
          },
          (incoming) => {
            let body = "";
            incoming.on("data", (b) => {
              body += b;
            });
            incoming.on("end", () =>
              done({ status: incoming.statusCode!, body }),
            );
          },
        );
        outgoing.on("error", reject);
        outgoing.end(Buffer.alloc(65537, 32));
      },
    );
    assert.equal(hadContentLength, false);
    assert.deepEqual(result, { status: 422, body: "BODY_TOO_LARGE" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
test("Incomplete HTTP body expires before dispatch and returns explicit deadline / 미완료HTTP본문은 전달전에만료되고명시적시간초과반환", async () => {
  const { createServer, request } = await import("node:http"),
    { performance } = await import("node:perf_hooks"),
    { readNodeBody } = await import("../tools/node_service.js");
  let dispatched = false;
  const server = createServer((incoming, response) => {
    void readNodeBody(incoming, performance.now() + 25).then(
      () => {
        dispatched = true;
        response.writeHead(200);
        response.end();
      },
      (error) => {
        response.writeHead(503);
        response.end(error.reason);
      },
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const result = await new Promise<{ status: number; body: string }>(
      (done, reject) => {
        const outgoing = request(
          {
            host: "127.0.0.1",
            port: address.port,
            method: "POST",
            headers: {
              "content-type": "application/json",
              "transfer-encoding": "chunked",
            },
          },
          (incoming) => {
            let body = "";
            incoming.on("data", (b) => {
              body += b;
            });
            incoming.on("end", () => {
              outgoing.end();
              done({ status: incoming.statusCode!, body });
            });
          },
        );
        outgoing.on("error", reject);
        outgoing.write('{"request_id":');
      },
    );
    assert.equal(dispatched, false);
    assert.deepEqual(result, { status: 503, body: "REQUEST_DEADLINE" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
