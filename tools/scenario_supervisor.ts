/** Actual outer supervisor fault fixture; private IPC only. / 실제 상위 감독 장애 자료·비공개 IPC 전용. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  chromium,
  type BrowserServer,
  type Browser,
  type BrowserContext,
  type Video,
} from "@playwright/test";
import { OwnedIngestionRuntime, pause } from "./ingestion_runtime.js";
import {
  processTree,
  identityAlive,
  boundedClientOperation,
  type ProcessIdentity,
} from "./client_checks.js";
import { privateConfig } from "./ingestion_ipc.js";
import { isMain, ROOT } from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";

export interface ScenarioSupervisorConfig {
  graph_directory: string;
  output: string;
}
export async function runScenarioSupervisor(
  config: ScenarioSupervisorConfig,
): Promise<number> {
  const output = config.output;
  mkdirSync(output);
  for (const d of ["browser", "screenshots"]) mkdirSync(join(output, d));
  const write = (name: string, value: unknown) =>
    writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n");
  const owner = new OwnedIngestionRuntime(join(output, "outer"), output);
  let server: BrowserServer | undefined,
    browser: Browser | undefined,
    context: BrowserContext | undefined;
  let video: Video | null = null,
    failureRequested = false;
  let identities: ProcessIdentity[] = [];
  let browserPid = 0;
  let release!: () => void;
  const thrown = new Promise<void>((done) => {
    release = done;
  });
  const onMessage = (m: unknown) => {
    if (
      m &&
      typeof m === "object" &&
      "type" in m &&
      m.type === "THROW_PARENT"
    ) {
      failureRequested = true;
      release();
    }
  };
  process.on("message", onMessage);
  const child = owner.spawn("p12-nested-live-client", "client_serve", {
    graph_directory: config.graph_directory,
    output_directory: join(output, "client"),
    assets_directory: join(ROOT, "dist/web/pilot"),
    clock_mode: "supervised",
    lifetime_ms: 900000,
  });
  owner.setBeforeCleanup(async () => {
    const errors: string[] = [];
    if (browserPid) identities = processTree(browserPid);
    write("browser/ownership.json", {
      root_pid: browserPid,
      processes: identities,
      session_name: "routelens-p12-supervisor-" + owner.runId,
      lifetime_ms: 900000,
    });
    try {
      await boundedClientOperation(context?.close() ?? Promise.resolve(), 5000);
    } catch (e) {
      errors.push(String(e));
    }
    if (video)
      try {
        await boundedClientOperation(
          video.saveAs(join(output, "browser/baseline.webm")),
          5000,
        );
      } catch (e) {
        errors.push(String(e));
      }
    try {
      await boundedClientOperation(browser?.close() ?? Promise.resolve(), 5000);
    } catch (e) {
      errors.push(String(e));
    }
    try {
      await boundedClientOperation(server?.close() ?? Promise.resolve(), 5000);
    } catch (e) {
      errors.push(String(e));
      await server?.kill();
    }
    for (let i = 0; i < 20 && identities.some(identityAlive); i++)
      await pause(100);
    const remaining = identities.filter(identityAlive);
    write("browser/cleanup.json", {
      cleanup_verified:
        browserPid > 0 &&
        identities.length > 0 &&
        remaining.length === 0 &&
        errors.length === 0,
      root_pid: browserPid,
      processes_checked: identities.length,
      remaining,
      errors,
    });
    if (child.child?.connected) {
      child.send({ type: "SHUTDOWN", control_id: randomUUID() });
      await child.message((m) => m.type === "STOPPED", 20000);
      await child.exited(3000);
    }
    write("nested-process.json", {
      pid: child.child?.pid,
      exit: await child.exited(3000),
      messages: child.messages,
      diagnostics: child.diagnostics.join(""),
    });
    if (remaining.length || errors.length)
      throw Error(
        "Supervisor browser cleanup failed / 감독 브라우저 정리 실패",
      );
  }, 30000);
  const watchdog = setTimeout(() => {
    release();
  }, 900000);
  let failed: unknown;
  try {
    const ready = await child.message(
      (m) => m.type === "READY" && m.kind === "route-client",
      300000,
    );
    const origin = String(ready.origin);
    // The owner closes context/video before the server; upstream signal handlers would race that order.
    // 소유자가 문맥·영상 뒤 서버를 닫으며 상위 도구의 신호 처리와 종료 순서가 경쟁하지 않게 합니다.
    server = await chromium.launchServer({
      headless: true,
      timeout: 10000,
      handleSIGTERM: false,
      handleSIGINT: false,
      handleSIGHUP: false,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    browserPid = server.process().pid!;
    identities = processTree(browserPid);
    write("browser/ownership.json", {
      root_pid: browserPid,
      processes: identities,
      session_name: "routelens-p12-supervisor-" + owner.runId,
      lifetime_ms: 900000,
    });
    browser = await chromium.connect(server.wsEndpoint());
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      reducedMotion: "reduce",
      recordVideo: {
        dir: join(output, "browser"),
        size: { width: 1280, height: 720 },
      },
    });
    const page = await context.newPage();
    video = page.video();
    await page.goto(origin);
    await page.waitForFunction(
      () =>
        !!document.querySelector<HTMLInputElement>("#origin-latitude")?.value,
    );
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("#map")?.dataset.ready === "true",
    );
    await page.locator("#request-route").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#result")?.getAttribute("data-state") ===
        "current",
      undefined,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => {
        const proof = JSON.parse(
          document.querySelector("#route-evidence")?.textContent ?? "null",
        );
        return (
          proof?.response?.geometry &&
          JSON.stringify(proof.response.geometry) ===
            JSON.stringify(proof.map_source_geometry)
        );
      },
      undefined,
      { timeout: 10000 },
    );
    const baseline = await page.locator("#route-evidence").textContent();
    const proof = JSON.parse(baseline ?? "null");
    write("browser/candidate.json", proof);
    if (
      !proof?.response?.geometry ||
      proof.response.graph_id !== ready.graph_id ||
      !proof.map_source_geometry
    )
      throw Error("Supervisor baseline missing / 감독 기본 경로 없음");
    await page.screenshot({ path: join(output, "screenshots/baseline.png") });
    write("baseline.json", {
      origin,
      pid: process.pid,
      source: sourceIdentity(),
      implementation_sha256: implementationFingerprint(),
      graph_id: ready.graph_id,
      proof,
    });
    process.send?.({
      type: "BASELINE",
      kind: "scenario-supervisor",
      pid: process.pid,
      origin,
      graph_id: ready.graph_id,
    });
    await thrown;
    throw Error(
      "Deliberate parent failure after actual browser/native baseline / 실제 브라우저·엔진 기본 경로 뒤 의도한 부모 실패",
    );
  } catch (error) {
    failed = error;
    write("failure.json", {
      expected_fault_fixture: failureRequested,
      error: String(error),
    });
  } finally {
    clearTimeout(watchdog);
    process.off("message", onMessage);
    const clean = await owner.cleanup();
    write("parent-result.json", {
      expected_fault_fixture: failureRequested,
      status: "FAIL",
      cleanup_verified: clean,
      error: String(failed),
    });
  }
  return 1;
}
if (isMain(import.meta.url)) {
  void runScenarioSupervisor(
    privateConfig<ScenarioSupervisorConfig>(process.argv.slice(2)),
  ).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(
        "Scenario supervisor failed / 시나리오 감독 실패: " +
          String(error) +
          "\n",
      );
      process.exitCode = 1;
    },
  );
}
