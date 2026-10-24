/** Deterministic lifetime boundaries with no Docker/native execution.
 * Docker·네이티브 실행 없는 결정적 수명 경계 검사입니다. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as turn } from "node:timers/promises";
import { ClientRuntime } from "../tools/client_runtime.js";
import { OwnedIngestionRuntime } from "../tools/ingestion_runtime.js";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function temporary() {
  const root = mkdtempSync(join(tmpdir(), "routelens-client-lifecycle-"));
  return {
    root,
    config: {
      graph_directory: "/unit/graph",
      output_directory: join(root, "pilot"),
      assets_directory: "/unit/assets",
      clock_mode: "supervised" as const,
    },
  };
}
/** Only tests replace the command boundary. No container or database exists.
 * 시험에서만 명령 경계를 대체하며 실제 컨테이너·DB는 없습니다. */
function dry(owner: OwnedIngestionRuntime) {
  const commands: string[][] = [];
  owner.commands.command = ((args: string[]) => {
    commands.push(args);
    return {
      status: args[0] === "ps" ? 0 : 1,
      stdout: "",
      stderr: args[0] === "ps" ? "" : "No such container or volume",
    };
  }) as typeof owner.commands.command;
  return commands;
}
test("Startup failure still cleans when its failure record cannot be written / 시작 실패 기록 불가여도 소유 정리", async () => {
  const tmp = temporary(),
    prototype = ClientRuntime.prototype as any,
    initialize = prototype.initialize,
    record = prototype.record;
  let runtime: any;
  prototype.initialize = async function () {
    runtime = this;
    dry(this.owner);
    throw Error("startup fixture");
  };
  prototype.record = function (code: string, ...rest: unknown[]) {
    if (code === "START_FAILED") throw Error("record fixture");
    return record.call(this, code, ...rest);
  };
  try {
    await assert.rejects(ClientRuntime.start(tmp.config), /startup fixture/);
    assert.equal(await runtime.ended, true);
    assert.equal(existsSync(runtime.owner.privateDirectory), false);
    assert.equal(
      JSON.parse(
        readFileSync(
          join(tmp.config.output_directory, "runtime/cleanup.json"),
          "utf8",
        ),
      ).cleanup_verified,
      true,
    );
  } finally {
    prototype.initialize = initialize;
    prototype.record = record;
    await runtime?.close();
    rmSync(tmp.root, { recursive: true, force: true });
  }
});
test("Startup cancellation prevents a late helper from spawning new resources / 준비 취소 뒤 늦은 원본 작업은 새 자원을 만들지 않음", async () => {
  const tmp = temporary(),
    prototype = ClientRuntime.prototype as any,
    initialize = prototype.initialize,
    gate = deferred();
  let runtime: any,
    commands: string[][] = [];
  prototype.initialize = async function () {
    runtime = this;
    commands = dry(this.owner);
    this.source = {};
    this.owner.setBeforeCleanup(async () => gate.resolve());
    await gate.promise;
    this.owner.spawn("late", "ingestion_service", {});
  };
  try {
    const abort = new AbortController(),
      work = ClientRuntime.start(tmp.config, abort.signal),
      rejected = assert.rejects(work, /cancelled|closing/);
    await turn();
    abort.abort();
    await rejected;
    await runtime.ended;
    assert.equal(runtime.owner.processes.length, 0);
    assert.ok(
      commands.every((a) => !["create", "start", "pull"].includes(a[0]!)),
    );
    assert.equal(existsSync(runtime.owner.privateDirectory), false);
  } finally {
    prototype.initialize = initialize;
    gate.resolve();
    await runtime?.close();
    rmSync(tmp.root, { recursive: true, force: true });
  }
});
test("Closing bounds active mutations, collects late rejection and skips queued work / 종료는 진행 작업을 제한하고 늦은 거부를 수거하며 대기 작업을 건너뜀", async (t) => {
  const tmp = temporary(),
    runtime = new (ClientRuntime as any)(tmp.config),
    gate = deferred();
  runtime.source = {};
  dry(runtime.owner);
  let lateSteps = 0;
  runtime.owner.setBeforeCleanup(async () => gate.resolve());
  const active = runtime.mutate(async () => {
      await gate.promise;
      runtime.guard();
      lateSteps++;
    }),
    queued = runtime.mutate(async () => {
      lateSteps++;
    });
  const rejectedActive = assert.rejects(active, /closing/),
    rejectedQueued = assert.rejects(queued, /closing/);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await turn();
    const close = runtime.close();
    await turn();
    t.mock.timers.tick(3001);
    assert.equal(await close, false);
    assert.equal(await runtime.ended, false);
    await Promise.all([rejectedActive, rejectedQueued]);
    assert.equal(lateSteps, 0);
    assert.equal(existsSync(runtime.owner.privateDirectory), false);
  } finally {
    gate.resolve();
    t.mock.timers.reset();
    await runtime.close();
    rmSync(tmp.root, { recursive: true, force: true });
  }
});
test("Final evidence failures resolve ended as false after exact resource cleanup / 마지막 근거 실패도 소유 정리 후 ended를 실패로 확정", async () => {
  const tmp = temporary(),
    runtime = new (ClientRuntime as any)(tmp.config);
  dry(runtime.owner);
  mkdirSync(join(tmp.config.output_directory, "process-events.json"));
  mkdirSync(join(tmp.config.output_directory, "cleanup.json"));
  const cleanup = runtime.owner.cleanup.bind(runtime.owner);
  runtime.owner.cleanup = async () => {
    const result = await cleanup();
    runtime.owner.assertSafe = () => {
      throw Error("safety fixture");
    };
    return result;
  };
  try {
    assert.equal(await runtime.close(), false);
    assert.equal(await runtime.ended, false);
    assert.equal(existsSync(runtime.owner.privateDirectory), false);
  } finally {
    await runtime.close();
    rmSync(tmp.root, { recursive: true, force: true });
  }
});
for (const mode of ["success", "failure", "timeout"] as const)
  test(`Owned before-cleanup hook ${mode} never skips owner cleanup / 정리 전 훅 ${mode}에서도 소유 정리 유지`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), "routelens-cleanup-hook-")),
      owner = new OwnedIngestionRuntime(join(root, "runtime"), root),
      commands = dry(owner);
    let called = 0;
    owner.setBeforeCleanup(async () => {
      called++;
      assert.equal(commands.length, 0);
      if (mode === "failure") throw Error("hook fixture");
      if (mode === "timeout") await new Promise(() => {});
    }, 25);
    assert.throws(() => owner.setBeforeCleanup(async () => {}));
    if (mode === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const work = owner.cleanup();
      if (mode === "timeout") {
        await turn();
        t.mock.timers.tick(26);
      }
      assert.equal(await work, mode === "success");
      assert.equal(called, 1);
      assert.ok(commands.length > 0);
      assert.equal(existsSync(owner.privateDirectory), false);
      const evidence = JSON.parse(
        readFileSync(join(root, "runtime/cleanup.json"), "utf8"),
      );
      assert.equal(evidence.before_cleanup_completed, mode === "success");
      if (mode !== "success")
        assert.ok(evidence.failures.includes("before-cleanup"));
    } finally {
      if (mode === "timeout") t.mock.timers.reset();
      await owner.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  });
