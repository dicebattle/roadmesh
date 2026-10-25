/** Actual automated browser pilot; only main invokes the expensive run.
 * 실제 자동 브라우저 파일럿이며 비용이 큰 실행은 메인이 호출합니다. */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chromium,
  type BrowserServer,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { ClientRuntime } from "./client_runtime.js";
import { buildClientAssets } from "./client_build.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";
import { evidenceHashes } from "./map_matcher.js";
import {
  canonical,
  sha256,
  isMain,
  consoleIO,
  type ConsoleIO,
} from "./shared.js";
import { pause } from "./ingestion_runtime.js";
import type { GatewaySuccess, GatewayRouteContext } from "./gateway_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
import { GuidanceChecks } from "./guidance_checks.js";
export const CLIENT_CASE_IDS = [
  "fresh-source",
  "bundled-offline",
  "loopback-session",
  "unauthenticated-api",
  "origin-rejected",
  "path-traversal",
  "bootstrap-privacy",
  "authority-clock",
  "map-ready",
  "baseline-request",
  "live-request",
  "route-coverage",
  "primary-kill-failover",
  "unavailable-clears-route",
  "deadline-clears-route",
  "changed-version-rejected",
  "authority-change-invalidates",
  "exact-expiry",
  "input-change-cancels",
  "late-response-ignored",
  "older-authority-ignored",
  "invalid-input",
  "keyboard-submit",
  "english",
  "korean",
  "mobile390",
  "no-external-requests",
  "no-geolocation",
  "reload-state",
  "public-privacy",
  "browser-cleanup",
  "owned-cleanup",
].map((id) => "p11-" + id);
export function requireClientCases(assertions: SimulationAssertion[]): void {
  const ids = assertions.map((a) => a.assertion_id);
  if (
    ids.length !== 32 ||
    new Set(ids).size !== 32 ||
    CLIENT_CASE_IDS.some((id) => !ids.includes(id)) ||
    assertions.some((a) => a.status !== "PASS")
  )
    throw new Error("P11 required cases incomplete / P11 필수 검사 미완료");
}
export interface ClientReport {
  assertions_passed: number;
  assertions_total: number;
  cleanup_verified: boolean;
  browser_version: string;
  screenshots: Array<{ label_en: string; label_ko: string; path: string }>;
  routes: Array<{
    label: string;
    response: GatewaySuccess;
    evidence_path: string;
  }>;
  events: Array<{
    event_id: string;
    state: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }>;
  cases: Array<{
    case_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }>;
  evidence: Array<{ name_en: string; name_ko: string; path: string }>;
}
export async function boundedClientOperation<T>(
  work: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () =>
          reject(
            new Error("Client operation interrupted / 클라이언트 작업 중단"),
          );
        timer = setTimeout(
          () =>
            reject(
              new Error("Client operation deadline / 클라이언트 작업 기한"),
            ),
          timeoutMs,
        );
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export type ProcessIdentity = {
  pid: number;
  parent: number;
  started_at: string;
  command: string;
};
export function processTree(rootPid: number): ProcessIdentity[] {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,lstart=,comm="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    timeout: 1000,
  })
    .trim()
    .split("\n")
    .map((line) => {
      const m = line
        .trim()
        .match(/^(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
      if (!m)
        throw new Error(
          "Process identity parse failed / 프로세스 식별 해석 실패",
        );
      return {
        pid: Number(m[1]),
        parent: Number(m[2]),
        started_at: m[3]!,
        command: m[4]!,
      };
    });
  const ids = new Set([rootPid]);
  for (let count = -1; count !== ids.size; ) {
    count = ids.size;
    for (const row of rows) if (ids.has(row.parent)) ids.add(row.pid);
  }
  return rows.filter((row) => ids.has(row.pid));
}
export function identityAlive(p: ProcessIdentity): boolean {
  const result = spawnSync("ps", ["-p", String(p.pid), "-o", "lstart=,comm="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    timeout: 1000,
  });
  if (result.status === 1) return false;
  if (result.status !== 0)
    throw new Error(
      "Process identity inspection failed / 프로세스 식별 검사 실패",
    );
  return (
    result.stdout.trim().replace(/\s+/g, " ") ===
    `${p.started_at} ${p.command}`.replace(/\s+/g, " ")
  );
}
const write = (root: string, file: string, data: unknown) =>
  writeFileSync(join(root, file), JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
export async function runClientChecks(
  graphDirectory: string,
  outputPath: string,
): Promise<{ client: ClientReport; assertions: SimulationAssertion[]; navigation: SimulationAssertion[] }> {
  const output = resolve(outputPath);
  mkdirSync(output);
  for (const dir of [
    "browser",
    "screenshots",
    "requests",
    "states",
    "negative",
  ])
    mkdirSync(join(output, dir));
  const source = sourceIdentity(),
    fingerprint = implementationFingerprint(),
    assertions: SimulationAssertion[] = [],
    screenshots: ClientReport["screenshots"] = [],
    routes: ClientReport["routes"] = [],
    events: ClientReport["events"] = [],
    network: Array<any> = [],
    consoleEvents: Array<any> = [],
    apiResponses: Array<any> = [],
    pendingResponses: Promise<void>[] = [];
  const guidance = new GuidanceChecks(output);
  let cumulativeGeoCalls = 0;
  let runtime: ClientRuntime | undefined,
    browserServer: BrowserServer | undefined,
    browserLaunch: Promise<BrowserServer> | undefined,
    browser: Browser | undefined,
    context: BrowserContext | undefined,
    page: Page | undefined,
    failure: unknown,
    browserCleanup = false,
    ownedCleanup = false,
    browserVersion = "",
    ownerPid = 0;
  const ownedProcesses = new Map<string, ProcessIdentity>();
  const captureProcesses = () => {
    if (!ownerPid) return;
    for (const p of processTree(ownerPid))
      ownedProcesses.set(p.pid + ":" + p.started_at, p);
    writeFileSync(
      join(output, "browser/ownership.json"),
      JSON.stringify(
        {
          root_pid: ownerPid,
          processes: [...ownedProcesses.values()],
          recorded_at_utc: new Date().toISOString(),
          launches: 1,
        },
        null,
        2,
      ) + "\n",
    );
  };
  const sessionAbort = new AbortController();
  let watchdog: ReturnType<typeof setTimeout> | undefined,
    browserClose: Promise<void> | undefined;
  const closeBrowser = (): Promise<void> =>
    (browserClose ??= (async () => {
      const collectionErrors: string[] = [];
      try {
        captureProcesses();
      } catch (error) {
        collectionErrors.push(String(error));
        failure ??= error;
      }
      const closings = await Promise.allSettled([
        boundedClientOperation(
          Promise.resolve().then(() => context?.close()),
          5000,
        ),
        boundedClientOperation(
          Promise.resolve().then(() => browser?.close()),
          5000,
        ),
        boundedClientOperation(
          Promise.resolve().then(() => browserServer?.close()),
          5000,
        ),
      ]);
      if (closings.some((r) => r.status === "rejected"))
        try {
          await boundedClientOperation(
            Promise.resolve().then(() => browserServer?.kill()),
            3000,
          );
        } catch (error) {
          collectionErrors.push(String(error));
        }
      let remaining = [...ownedProcesses.values()];
      try {
        for (let attempt = 0; attempt < 20; attempt++) {
          remaining = [...ownedProcesses.values()].filter(identityAlive);
          if (!remaining.length) break;
          await pause(100);
        }
      } catch (error) {
        collectionErrors.push(String(error));
        failure ??= error;
      }
      browserCleanup =
        ownerPid > 0 &&
        ownedProcesses.size > 0 &&
        remaining.length === 0 &&
        collectionErrors.length === 0;
      write(output, "browser/cleanup.json", {
        cleanup_verified: browserCleanup,
        root_pid: ownerPid,
        owned_processes_checked: ownedProcesses.size,
        remaining_owned_processes: remaining,
        collection_errors: collectionErrors,
        launches: ownerPid ? 1 : 0,
        browser_version: browserVersion,
        software_webgl: true,
        message_en:
          "The single owned browser server and original PID/start identities were checked after bounded closure; software rendering is not hardware performance evidence.",
        message_ko:
          "제한된 종료 뒤 단일 소유 브라우저와 원 PID·시작 식별자를 확인하며 소프트웨어 렌더링은 하드웨어 성능 근거가 아닙니다.",
      });
      if (!browserCleanup)
        throw new Error(
          "Owned browser cleanup incomplete / 소유 브라우저 정리 미완료",
        );
    })());
  const interrupted = () => {
    failure ??= new Error("Browser pilot interrupted / 브라우저 파일럿 중단");
    sessionAbort.abort();
    if (ownerPid)
      void closeBrowser().catch((error) => {
        failure ??= error;
      });
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  const check = (
    id: string,
    ok: boolean,
    en: string,
    ko: string,
    actual: unknown,
    path: string,
  ) => {
    assertions.push({
      assertion_id: "p11-" + id,
      status: ok ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected: true,
      actual,
      evidence_path: path,
    });
    writeFileSync(
      join(output, "assertions-current.json"),
      JSON.stringify(assertions, null, 2) + "\n",
    );
    if (!ok) throw new Error("P11 criterion failed / P11 기준 미달: " + id);
  };
  try {
    const assets = await buildClientAssets();
    runtime = await ClientRuntime.start(
      {
        graph_directory: graphDirectory,
        output_directory: join(output, "fixture"),
        assets_directory: assets,
        clock_mode: "supervised",
        lifetime_ms: 900000,
      },
      sessionAbort.signal,
    );
    const pilot = runtime;
    const expected = JSON.parse(
        readFileSync(join(output, "fixture/source/expected.json"), "utf8"),
      ),
      stored = JSON.parse(
        readFileSync(join(output, "fixture/source/db.json"), "utf8"),
      );
    check(
      "fresh-source",
      expected.trips.length === 15 && stored.traversals.length === 15,
      "A fresh actual HTTP/P05/P06 source authors fifteen Seoul trips for this browser run.",
      "이번 브라우저 실행에 새 실제 HTTP·P05·P06 서울15여행을 생성합니다.",
      { trips: expected.trips.length, stored: stored.traversals.length },
      "fixture/source/db.json",
    );
    const built = JSON.parse(
      readFileSync(join(assets, "build-manifest.json"), "utf8"),
    );
    write(output, "browser/assets.json", built);
    check(
      "bundled-offline",
      ["index.html", "client.js", "client.css", "maplibre-worker.js"].every(
        (name) =>
          built.files_sha256[name] === sha256(readFileSync(join(assets, name))),
      ),
      "The frontend, stylesheet and map worker are locally bundled with exact original hashes.",
      "화면·스타일·지도 작업자를 로컬에 묶고 정확한 원문 해시를 확인합니다.",
      built,
      "browser/assets.json",
    );
    pilot.owner.setBeforeCleanup(async () => {
      sessionAbort.abort();
      if (browserLaunch && !browserServer) {
        try {
          browserServer = await boundedClientOperation(browserLaunch, 12000);
          ownerPid = browserServer.process().pid!;
        } catch (error) {
          failure ??= error;
        }
      }
      await closeBrowser();
    }, 30000);
    browserLaunch = chromium.launchServer({
      headless: true,
      timeout: 10000,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    browserServer = await browserLaunch;
    ownerPid = browserServer.process().pid!;
    if (sessionAbort.signal.aborted)
      throw new Error("Browser startup interrupted / 브라우저 준비 중단");
    watchdog = setTimeout(() => {
      failure ??= new Error(
        "Browser lifetime exceeded fifteen minutes / 브라우저 수명15분 초과",
      );
      sessionAbort.abort();
      void closeBrowser().catch((error) => {
        failure ??= error;
      });
    }, 900000);
    captureProcesses();
    browser = await chromium.connect(browserServer.wsEndpoint());
    browserVersion = browser.version();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
      locale: "en-US",
    });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(15000);
    await context.addInitScript(() => {
      (window as any).__geolocationCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition() {
            (window as any).__geolocationCalls++;
            throw Error("Real location collection disabled in regression");
          },
          watchPosition() {
            (window as any).__geolocationCalls++;
            throw Error("Real location collection disabled in regression");
          },
          clearWatch() {},
        },
      });
    });
    page = await context.newPage();
    const p = page;
    p.on("console", (message) =>
      consoleEvents.push({ type: message.type(), text: message.text() }),
    );
    p.on("pageerror", (error) =>
      consoleEvents.push({ type: "pageerror", text: String(error) }),
    );
    p.on("request", (request) =>
      network.push({
        event: "request",
        url: request.url(),
        method: request.method(),
        resource_type: request.resourceType(),
        ...(request.url().endsWith("/api/routes")
          ? { body: request.postDataJSON() }
          : {}),
      }),
    );
    p.on("requestfailed", (request) =>
      network.push({
        event: "requestfailed",
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText,
      }),
    );
    p.on("response", (response) => {
      if (!new URL(response.url()).pathname.startsWith("/api/")) return;
      const task = (async () => {
        let body: unknown;
        try {
          body = await boundedClientOperation(
            response.json(),
            5000,
            sessionAbort.signal,
          );
        } catch {
          return;
        }
        const item = {
          url: response.url(),
          status: response.status(),
          request:
            response.request().method() === "POST"
              ? response.request().postDataJSON()
              : null,
          body,
        };
        apiResponses.push(item);
        write(
          output,
          "requests/http-" +
            String(apiResponses.length).padStart(4, "0") +
            ".json",
          item,
        );
      })();
      pendingResponses.push(
        task.catch((error) => {
          failure ??= error;
        }),
      );
    });
    await p.goto(pilot.origin, { waitUntil: "load" });
    await p.locator("#origin-latitude").waitFor();
    await p.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>("#origin-latitude")?.value !==
        "",
    );
    const snapshot = async (label: string) => {
      const data = await p.evaluate(() => ({
        lang: document.documentElement.lang,
        state: document.getElementById("result")?.dataset.state,
        request_id: document.getElementById("result")?.dataset.requestId,
        map_ready: document.getElementById("map")?.dataset.ready,
        map_active_route: document.getElementById("map")?.dataset.activeRoute,
        map_request_id: document.getElementById("map")?.dataset.routeRequestId,
        map_rendered_request_id:
          document.getElementById("map")?.dataset.renderedRouteRequestId,
        status: document.getElementById("route-status")?.textContent,
        summary: document.getElementById("route-summary")?.textContent,
        maneuvers: [...document.querySelectorAll("#maneuvers li p")].map(el => el.textContent ?? ""),
        guidance_hidden: document.getElementById("guidance")?.hidden,
        evidence: JSON.parse(
          document.getElementById("route-evidence")?.textContent ?? "{}",
        ),
        scroll_width: document.documentElement.scrollWidth,
        viewport_width: innerWidth,
      }));
      write(output, "states/" + label + ".json", data);
      events.push({
        event_id: label,
        state: data.state ?? "unknown",
        message_en: "Observed browser state: " + label,
        message_ko: "관측한 브라우저 상태: " + label,
        evidence_path: "states/" + label + ".json",
      });
      return data;
    };
    const screen = async (label: string, en: string, ko: string) => {
      const path = "screenshots/" + label + ".png";
      await p.screenshot({ path: join(output, path), fullPage: true });
      screenshots.push({ label_en: en, label_ko: ko, path });
    };
    const waitState = async (state: string) =>
      p.waitForFunction(
        (expected) =>
          document.getElementById("result")?.dataset.state === expected,
        state,
        { timeout: 20000 },
      );
    const calculate = async (
      label: string,
      preset: "short" | "long" = "short",
      keyboard = false,
    ) => {
      await p.locator("#preset").selectOption(preset);
      const responsePromise = p.waitForResponse(
        (r) =>
          r.url() === pilot.origin + "/api/routes" &&
          r.request().method() === "POST",
        { timeout: 20000 },
      );
      if (keyboard) await p.locator("#destination-longitude").press("Enter");
      else await p.locator("#request-route").click();
      const response = await responsePromise,
        body = await response.json();
      await waitState(
        response.status() === 200
          ? "current"
          : body.reason === "DEADLINE_EXCEEDED"
            ? "timeout"
            : body.reason === "TRAFFIC_CHANGED" ||
                body.reason === "VERSION_MISMATCH"
              ? "unverified"
              : "unavailable",
      );
      if (response.status() === 200)
        await p.waitForFunction(
          (id) =>
            document.getElementById("map")?.dataset.renderedRouteRequestId ===
            id,
          body.request_id,
          { timeout: 10000 },
        );
      const state = await snapshot(label);
      if (response.status() === 200) {
        const input = response.request().postDataJSON();
        if (
          body.request_id !== input.request_id ||
          body.request_sha256 !== sha256(canonical(input)) ||
          state.request_id !== body.request_id ||
          state.map_request_id !== body.request_id ||
          !canonical(state.evidence.response.geometry).equals(
            canonical(body.geometry),
          ) ||
          !canonical(state.evidence.map_source_geometry).equals(
            canonical(body.geometry),
          )
        )
          throw new Error(
            "Browser/native response binding mismatch / 브라우저·엔진 응답 결합 불일치",
          );
        routes.push({
          label,
          response: body,
          evidence_path: "states/" + label + ".json",
        });
      }
      return { status: response.status(), body: body as any, state };
    };
    const gate = async (message: any) =>
      boundedClientOperation(
        pilot.gatewayControl({ ...message, control_id: randomUUID() }),
        180000,
        sessionAbort.signal,
      );
    const gatewayPhase = async (phase: string, cursor: number) =>
      boundedClientOperation(
        pilot.gateway.message(
          (m) =>
            pilot.gateway.messages.indexOf(m) >= cursor &&
            m.type === "PHASE" &&
            m.phase === phase,
          180000,
        ),
        180000,
        sessionAbort.signal,
      );
    const cookies = await context.cookies();
    write(
      output,
      "browser/session.json",
      cookies.map((c) => ({
        name: c.name,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        domain: c.domain,
        path: c.path,
      })),
    );
    check(
      "loopback-session",
      cookies.length === 1 &&
        cookies[0]!.httpOnly &&
        cookies[0]!.sameSite === "Strict" &&
        cookies[0]!.domain === "127.0.0.1",
      "One HttpOnly Strict loopback session is issued to the actual browser.",
      "실제 브라우저에 HttpOnly·Strict 로컬 세션 하나를 발급합니다.",
      cookies.map((c) => ({
        name: c.name,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      })),
      "browser/session.json",
    );
    const cookie = cookies.map((c) => c.name + "=" + c.value).join("; ");
    const unauth = await fetch(pilot.origin + "/api/route-context", {
        signal: AbortSignal.any([
          sessionAbort.signal,
          AbortSignal.timeout(5000),
        ]),
      }),
      unauthBody = await unauth.json();
    write(output, "negative/unauthenticated.json", {
      status: unauth.status,
      body: unauthBody,
    });
    check(
      "unauthenticated-api",
      unauth.status === 403,
      "API access without the local session is refused.",
      "로컬 세션이 없는 API 접근을 거부합니다.",
      unauthBody,
      "negative/unauthenticated.json",
    );
    const cross = await fetch(pilot.origin + "/api/routes", {
      signal: AbortSignal.any([sessionAbort.signal, AbortSignal.timeout(5000)]),
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:1",
        "content-type": "application/json",
      },
      body: "{}",
    });
    write(output, "negative/origin.json", {
      status: cross.status,
      body: await cross.json(),
    });
    check(
      "origin-rejected",
      cross.status === 403,
      "An authenticated request with a foreign origin is rejected.",
      "세션이 있어도 다른 출처의 요청을 거부합니다.",
      cross.status,
      "negative/origin.json",
    );
    const traversal = await fetch(pilot.origin + "/%2e%2e%2fpackage.json", {
      signal: AbortSignal.any([sessionAbort.signal, AbortSignal.timeout(5000)]),
    });
    write(output, "negative/path.json", { status: traversal.status });
    check(
      "path-traversal",
      traversal.status === 404,
      "Static path traversal cannot read repository files.",
      "정적 경로 이탈로 저장소 파일을 읽을 수 없습니다.",
      traversal.status,
      "negative/path.json",
    );
    const bootstrap = await p.request.get(pilot.origin + "/api/bootstrap"),
      boot = await bootstrap.json();
    write(output, "browser/bootstrap.json", boot);
    const privateKeys = [
      "token",
      "gateway_origin",
      "database_url",
      "consumer",
      "runtime_root",
      "private_jwk",
      "contributor_id",
    ];
    check(
      "bootstrap-privacy",
      bootstrap.status() === 200 &&
        boot.graph_id === pilot.bootstrap.graph_id &&
        !privateKeys.some((k) => JSON.stringify(boot).includes('"' + k + '"')),
      "Bootstrap exposes only public roads, authored presets and provenance.",
      "초기 화면 자료는 공개 도로·합성 좌표·출처만 포함합니다.",
      { keys: Object.keys(boot) },
      "browser/bootstrap.json",
    );
    await p.waitForFunction(
      () => document.getElementById("map")?.dataset.ready === "true",
      undefined,
      { timeout: 30000 },
    );
    const mapState = await snapshot("map-ready");
    await screen(
      "desktop-baseline",
      "Actual local Seoul map",
      "실제 로컬 서울 지도",
    );
    check(
      "map-ready",
      mapState.map_ready === "true" &&
        (await p.locator("#map canvas").count()) === 1,
      "MapLibre renders the locally served original Seoul road geometry using explicit software WebGL.",
      "명시한 소프트웨어 WebGL로 로컬 원래 서울 도로를 MapLibre에 표시합니다.",
      mapState,
      "states/map-ready.json",
    );
    const english = await snapshot("english");
    check(
      "english",
      english.lang === "en" &&
        (await p.locator("h1").innerText()) === "Choose your route",
      "Initial UI uses readable English labels and status.",
      "초기 화면은 읽을 수 있는 영어 이름·상태를 사용합니다.",
      english,
      "states/english.json",
    );
    const baseline = await calculate("baseline", "long");
    check(
      "baseline-request",
      baseline.status === 200 &&
        baseline.body.snapshot_id === null &&
        baseline.body.traffic_mode === "BASE_ONLY" &&
        baseline.state.map_active_route === "true",
      "The browser baseline request reaches the real gateway and native route engine.",
      "브라우저 기본 경로 요청이 실제 중계와 지속 엔진까지 도달합니다.",
      baseline.body,
      "states/baseline.json",
    );
    guidance.route("native-baseline-en", baseline.body, "en-US", false, baseline.state.maneuvers);
    const legacyInput = { schema_version:"0.1",request_id:"nav01-legacy-"+randomUUID(),
      ...pilot.bootstrap.presets.long, profile:"car",traffic_policy:"prefer_live" };
    const legacyResponse = await p.request.post(pilot.origin+"/api/routes", {headers:{origin:pilot.origin},data:legacyInput});
    const legacy = await legacyResponse.json();
    guidance.check("legacy-wire", legacyResponse.status()===200 && !Object.hasOwn(legacy,"guidance") &&
      legacy.request_sha256===sha256(canonical(legacyInput)),
      "Unguided HTTP requests retain the original public wire contract.", "안내 없는 HTTP 요청의 기존 공개 전송 계약 유지.", {request:legacyInput,status:legacyResponse.status(),body:legacy});
    const badInput={...legacyInput,request_id:"nav01-locale-"+randomUUID(),guidance_language:"ja-JP"};
    const badResponse=await p.request.post(pilot.origin+"/api/routes",{headers:{origin:pilot.origin},data:badInput});
    const bad=await badResponse.json();
    guidance.check("unknown-locale",badResponse.status()===422 && bad.reason==="INVALID_INPUT" &&
      !readdirSync(join(output,"fixture/gateway/runtime/requests")).some(n=>n.startsWith(badInput.request_id+"-")),
      "Unsupported locale is rejected before routing.","지원하지 않는 언어를 경로 계산 전에 거부.",{request:badInput,status:badResponse.status(),body:bad});
    await p.locator("#language").click();
    const languageReset=await snapshot("guidance-language-reset");
    guidance.check("language-reset", languageReset.state==="empty" && languageReset.maneuvers.length===0 &&
      languageReset.guidance_hidden===true && languageReset.map_active_route==="false",
      "Language changes clear the route and instructions before recalculation.","언어 변경 때 재계산 전 경로·안내를 제거.",languageReset);
    const baselineKo=await calculate("guidance-baseline-ko","long");
    guidance.route("native-baseline-ko",baselineKo.body,"ko-KR",false,baselineKo.state.maneuvers);
    await p.locator("#origin-latitude").fill(String(pilot.bootstrap.presets.long.origin.latitude + 0.000001));
    const inputCleared=await snapshot("guidance-input-cleared");
    guidance.check("input-clears",inputCleared.maneuvers.length===0 && inputCleared.guidance_hidden===true && inputCleared.map_active_route==="false",
      "Editing coordinates removes every former instruction and route line.","좌표 변경 때 이전 안내 전체·경로선을 제거.",inputCleared);
    await p.locator("#language").click();
    await boundedClientOperation(
      pilot.publishLive(),
      180000,
      sessionAbort.signal,
    );
    const live = await calculate("live", "short");
    check(
      "live-request",
      live.status === 200 &&
        live.body.traffic_mode === "LIVE_MIXED" &&
        live.body.live_coverage_ratio > 0 &&
        live.body.snapshot_id !== null,
      "The browser requests and displays an actual accepted-live partial route.",
      "브라우저가 실제 수용 교통의 부분 경로를 요청하고 표시합니다.",
      live.body,
      "states/live.json",
    );
    guidance.route("native-traffic-en",live.body,"en-US",true,live.state.maneuvers);
    const firstContext = (await (
      await p.request.get(pilot.origin + "/api/route-context")
    ).json()) as GatewayRouteContext;
    check(
      "authority-clock",
      live.body.clock_basis === "SIMULATION_EVENT_TIME" &&
        live.body.source_class === "SYNTHETIC" &&
        live.state.summary?.includes("Traffic age · simulation time: 0.0 s") ===
          true &&
        Date.parse(live.body.checked_at_event_time) !==
          Date.parse(live.body.calculated_at),
      "Traffic age uses authoritative simulation event time, not the browser wall clock or calculation timestamp.",
      "교통정보 나이는 브라우저 실제 시각·계산시각 대신 승인된 모의 관측시각을 사용합니다.",
      live.state,
      "states/live.json",
    );
    const detour = await calculate("detour", "long");
    check(
      "route-coverage",
      live.body.live_coverage_ratio > 0 &&
        detour.body.live_coverage_ratio === 0 &&
        detour.body.traffic_mode === "BASE_ONLY" &&
        detour.state.summary?.includes("0.00%") === true,
      "The UI separates accepted snapshot identity from actual returned-route coverage.",
      "화면이 수용 스냅샷 식별과 실제 반환 경로 적용률을 구분합니다.",
      { live: live.body, detour: detour.body },
      "states/detour.json",
    );
    await boundedClientOperation(
      pilot.nodeKill(pilot.nodes[0]!.node_id),
      180000,
      sessionAbort.signal,
    );
    const failover = await calculate("failover", "short");
    check(
      "primary-kill-failover",
      failover.status === 200 &&
        failover.body.node_id === pilot.nodes[1]!.node_id,
      "An actual killed primary process fails over to the second native node through the browser.",
      "첫 프로세스 실제 종료 뒤 브라우저 요청이 두 번째 지속 엔진 노드로 전환됩니다.",
      failover.body,
      "states/failover.json",
    );
    await boundedClientOperation(
      pilot.nodeKill(pilot.nodes[1]!.node_id),
      180000,
      sessionAbort.signal,
    );
    const unavailable = await calculate("unavailable", "short");
    check(
      "unavailable-clears-route",
      unavailable.status === 503 &&
        unavailable.state.map_active_route === "false" &&
        unavailable.state.evidence.response === null,
      "Both native nodes unavailable clears the preceding route line and shows a retry action.",
      "두 지속 노드가 사용 불가하면 이전 경로선을 지우고 재시도 행동을 표시합니다.",
      unavailable,
      "states/unavailable.json",
    );
    await boundedClientOperation(
      pilot.restartNode(pilot.nodes[0]!.node_id),
      180000,
      sessionAbort.signal,
    );
    await boundedClientOperation(
      pilot.restartNode(pilot.nodes[1]!.node_id),
      180000,
      sessionAbort.signal,
    );
    await gate({ type: "SET_GATEWAY_PAUSE", phase: "AFTER_GATEWAY_SELECTION" });
    let cursor = pilot.gateway.messages.length;
    const deadlinePending = calculate("deadline", "short");
    await gatewayPhase("AFTER_GATEWAY_SELECTION", cursor);
    const deadline = await deadlinePending;
    await gate({ type: "RESUME", phase: "AFTER_GATEWAY_SELECTION" });
    await gate({ type: "SET_GATEWAY_PAUSE", phase: null });
    check(
      "deadline-clears-route",
      deadline.status === 504 &&
        deadline.body.reason === "DEADLINE_EXCEEDED" &&
        deadline.state.map_active_route === "false" &&
        deadline.state.state === "timeout",
      "A confirmed held real request reaches its deadline and leaves no current route line.",
      "확인된 실제 요청 대기가 기한에 도달하면 현재 경로선을 남기지 않습니다.",
      deadline,
      "states/deadline.json",
    );
    // An ordinary input change must actually abort the preceding same-origin request.
    // 일반 입력 변경은 앞선 같은 출처 요청을 실제로 취소해야 합니다.
    await gate({ type: "SET_GATEWAY_PAUSE", phase: "AFTER_GATEWAY_SELECTION" });
    cursor = pilot.gateway.messages.length;
    await p.locator("#preset").selectOption("short");
    await p.locator("#request-route").click();
    const held = await gatewayPhase("AFTER_GATEWAY_SELECTION", cursor);
    await p
      .locator("#origin-latitude")
      .fill(String(pilot.bootstrap.presets.short.origin.latitude + 0.000001));
    await waitState("empty");
    const cancelled = await snapshot("input-change"),
      cancelledStarted = performance.now();
    let active: any;
    do {
      active = await gate({ type: "STATUS" });
      if (active.status.in_flight === 0) break;
      await pause(20);
    } while (performance.now() - cancelledStarted < 1000);
    await gate({ type: "RESUME", phase: "AFTER_GATEWAY_SELECTION" });
    await gate({ type: "SET_GATEWAY_PAUSE", phase: null });
    write(output, "browser/input-abort.json", {
      phase: held,
      gateway_status: active.status,
      elapsed_ms: performance.now() - cancelledStarted,
    });
    check(
      "input-change-cancels",
      cancelled.state === "empty" &&
        cancelled.map_active_route === "false" &&
        active.status.in_flight === 0,
      "Editing a coordinate cancels a phase-confirmed request and removes its active route.",
      "좌표 수정이 확인된 단계의 요청을 취소하고 활성 경로를 제거합니다.",
      cancelled,
      "browser/input-abort.json",
    );
    // Explicit browser transport test proxy: ignore abort only for this delayed/out-of-order regression.
    // 이 지연·순서 역전 검사에서만 취소 신호를 전달하지 않는 명시 브라우저 전송 시험대리입니다.
    await p.evaluate(() => {
      const w = window as any;
      w.__originalRouteFetch = window.fetch;
      w.__lateTransportCompleted = [];
      window.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.endsWith("/api/routes")) {
          const response = await w.__originalRouteFetch(input, {
            ...init,
            signal: undefined,
          });
          w.__lateTransportCompleted.push(
            JSON.parse(init?.body as string).request_id,
          );
          return response;
        }
        return w.__originalRouteFetch(input, init);
      };
    });
    let first = true,
      releaseLate!: () => void,
      gotDelayed!: () => void;
    const delayedReady = new Promise<void>((ok) => {
        gotDelayed = ok;
      }),
      lateBarrier = new Promise<void>((ok) => {
        releaseLate = ok;
      });
    let delayedId = "";
    const delayedProxy = async (route: any) => {
      if (!first) {
        await route.continue();
        return;
      }
      first = false;
      delayedId = route.request().postDataJSON().request_id;
      const response = await route.fetch();
      gotDelayed();
      await boundedClientOperation(lateBarrier, 20000, sessionAbort.signal);
      await route.fulfill({ response });
    };
    await p.route("**/api/routes", delayedProxy);
    await p.locator("#preset").selectOption("short");
    await p.locator("#request-route").click();
    await boundedClientOperation(delayedReady, 20000, sessionAbort.signal);
    const newer = await calculate("newer-response", "long");
    releaseLate();
    await p.waitForFunction(
      (id) => (window as any).__lateTransportCompleted.includes(id),
      delayedId,
    );
    await p.unroute("**/api/routes", delayedProxy);
    await p.evaluate(() => {
      window.fetch = (window as any).__originalRouteFetch;
      delete (window as any).__originalRouteFetch;
    });
    const lateState = await snapshot("late-response");
    write(output, "browser/transport-delay.json", {
      test_proxy: true,
      normal_native_success_claim: false,
      ignored_abort_for_test_only: true,
      delayed_request_id: delayedId,
      current_request_id: newer.body.request_id,
      state: lateState,
    });
    check(
      "late-response-ignored",
      lateState.request_id === newer.body.request_id &&
        lateState.request_id !== delayedId &&
        lateState.map_request_id === newer.body.request_id,
      "An explicitly delayed transport response cannot replace the newer input or route.",
      "명시적으로 지연한 전송 응답이 새 입력·경로를 덮을 수 없습니다.",
      lateState,
      "browser/transport-delay.json",
    );
    await gate({
      type: "SET_GATEWAY_PAUSE",
      phase: "AFTER_GATEWAY_NODE_RESULT",
    });
    cursor = pilot.gateway.messages.length;
    const changedPending = calculate("changed-version", "short");
    const changedPhase = await gatewayPhase(
      "AFTER_GATEWAY_NODE_RESULT",
      cursor,
    );
    await boundedClientOperation(
      pilot.publishLive(),
      180000,
      sessionAbort.signal,
    );
    await gate({ type: "RESUME", phase: "AFTER_GATEWAY_NODE_RESULT" });
    await gate({ type: "SET_GATEWAY_PAUSE", phase: null });
    const changed = await changedPending;
    write(output, "browser/changed-version.json", {
      phase: changedPhase,
      response: changed,
    });
    check(
      "changed-version-rejected",
      changed.status === 409 &&
        changed.body.reason === "TRAFFIC_CHANGED" &&
        changed.state.evidence.response === null &&
        changed.state.map_active_route === "false",
      "A real route calculated before publication changes is rejected and never left visible as current.",
      "게시 교체 전 계산한 실제 경로는 거부하고 현재 경로처럼 표시하지 않습니다.",
      changed,
      "browser/changed-version.json",
    );
    await calculate("before-authority-change", "short");
    await boundedClientOperation(
      pilot.publishLive(),
      180000,
      sessionAbort.signal,
    );
    await waitState("unverified");
    const invalidated = await snapshot("authority-change");
    check(
      "authority-change-invalidates",
      invalidated.map_active_route === "false" &&
        invalidated.evidence.response === null,
      "The nonoverlapping context poll clears a route when durable authority changes.",
      "중첩하지 않는 문맥 확인이 영속 승인이 바뀌면 경로를 제거합니다.",
      invalidated,
      "states/authority-change.json",
    );
    const current = await calculate("current-before-old-authority", "short");
    let deliveredOld!: () => void;
    const oldDelivered = new Promise<void>((ok) => {
      deliveredOld = ok;
    });
    const oldAuthorityProxy = async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(firstContext),
      });
      deliveredOld();
    };
    await p.route("**/api/route-context", oldAuthorityProxy);
    await boundedClientOperation(oldDelivered, 5000, sessionAbort.signal);
    await p.waitForFunction(
      (water) =>
        JSON.parse(document.getElementById("route-evidence")!.textContent!)
          .authority.high_water === water,
      current.body.high_water,
    );
    const monotonic = await snapshot("older-authority");
    await p.unroute("**/api/route-context", oldAuthorityProxy);
    write(output, "browser/older-authority-proxy.json", {
      test_proxy: true,
      served_original_older_context: firstContext,
      state: monotonic,
    });
    check(
      "older-authority-ignored",
      monotonic.evidence.authority.high_water === current.body.high_water &&
        monotonic.request_id === current.body.request_id &&
        monotonic.state === "current",
      "A recorded older context served by an explicit test proxy cannot lower browser authority.",
      "명시 시험대리서버로 보낸 기록된 옛 문맥이 브라우저 승인 순번을 낮추지 못합니다.",
      monotonic,
      "browser/older-authority-proxy.json",
    );
    const requestCount = apiResponses.filter((r) =>
      r.url.endsWith("/api/routes"),
    ).length;
    await p.locator("#origin-latitude").fill("91");
    await p.locator("#request-route").click();
    await waitState("invalid");
    const invalid = await snapshot("invalid-input");
    check(
      "invalid-input",
      invalid.evidence.response === null &&
        invalid.map_active_route === "false" &&
        apiResponses.filter((r) => r.url.endsWith("/api/routes")).length ===
          requestCount,
      "Invalid coordinates produce a concrete correction action without a route request.",
      "유효하지 않은 좌표는 경로를 요청하지 않고 수정 행동을 안내합니다.",
      invalid,
      "states/invalid-input.json",
    );
    const keyboard = await calculate("keyboard", "short", true);
    check(
      "keyboard-submit",
      keyboard.status === 200 && keyboard.state.state === "current",
      "Keyboard Enter submits the same real route flow as the button.",
      "키보드 Enter가 버튼과 같은 실제 경로 흐름을 실행합니다.",
      keyboard.state,
      "states/keyboard.json",
    );
    await p.locator("#language").click();
    const koreanRoute=await calculate("guidance-traffic-ko","short");
    guidance.route("native-traffic-ko",koreanRoute.body,"ko-KR",true,koreanRoute.state.maneuvers);
    const korean = await snapshot("korean");
    await screen(
      "korean-live",
      "Korean accepted-live route",
      "한국어 교통 적용 경로",
    );
    check(
      "korean",
      korean.lang === "ko" &&
        (await p.locator("h1").innerText()) === "경로를 선택하세요" &&
        korean.summary?.includes("경로 실시간 적용률") === true &&
        (await p
          .locator(".maplibregl-ctrl-zoom-in")
          .getAttribute("aria-label")) === "지도 확대" &&
        (await p.locator(".maplibregl-ctrl-zoom-out").getAttribute("title")) ===
          "지도 축소",
      "Korean labels and native guidance remain readable after recalculating in Korean.",
      "한국어로 재계산한 뒤 한국어 화면·엔진 안내·경로 상태를 읽을 수 있습니다.",
      korean,
      "states/korean.json",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    const mobile = await snapshot("mobile390");
    await screen(
      "mobile390-live",
      "390px Korean route client",
      "390픽셀 한국어 경로 화면",
    );
    check(
      "mobile390",
      mobile.viewport_width === 390 &&
        mobile.scroll_width === 390 &&
        (await p.locator("#request-route").isVisible()),
      "At390 pixels the form and result precede a usable original-road map without horizontal overflow.",
      "390픽셀에서 입력·결과 뒤에 원래 도로 지도를 두고 가로 넘침 없이 사용합니다.",
      mobile,
      "states/mobile390.json",
    );
    guidance.check("mobile-readable",mobile.scroll_width===390 && mobile.maneuvers.length===koreanRoute.body.guidance.maneuvers.length && mobile.guidance_hidden===false,
      "Ordered Korean native guidance remains readable at390px without horizontal overflow.","390픽셀에서 한국어 원 안내 목록을 가로 넘침 없이 읽습니다.",mobile);
    // Real consent deletion and new signed correction precede exact expiry; old LIVE bytes are never restored.
    // 실제 동의 삭제·새 서명 정정 뒤 만료로 진행하며 옛 LIVE 바이트를 복원하지 않습니다.
    await boundedClientOperation(
      pilot.publishCorrection(),
      180000,
      sessionAbort.signal,
    );
    await waitState("unverified");
    const correction = await calculate("correction", "short");
    await boundedClientOperation(
      pilot.advance(419999),
      180000,
      sessionAbort.signal,
    );
    await calculate("before-expiry", "short");
    await boundedClientOperation(
      pilot.advance(420000),
      180000,
      sessionAbort.signal,
    );
    await waitState("expired");
    const expired = await snapshot("expired");
    const expiry = await calculate("expiry-baseline", "long");
    check(
      "exact-expiry",
      expired.map_active_route === "false" &&
        expired.state === "expired" &&
        expiry.body.snapshot_id === null &&
        expiry.body.traffic_mode === "BASE_ONLY" &&
        canonical(expiry.body.geometry).equals(
          canonical(baseline.body.geometry),
        ) &&
        correction.body.live_coverage_ratio === 0,
      "Exact simulation expiry clears the active line and a fresh browser request restores the original baseline.",
      "정확한 모의 만료에 활성선을 지우고 새 브라우저 요청으로 원래 기본 경로를 복구합니다.",
      { expired, response: expiry.body },
      "states/expired.json",
    );
    await screen(
      "mobile390-expired",
      "Exact expiry and restored baseline",
      "정확한 만료와 기본 경로 복구",
    );
    cumulativeGeoCalls += await p.evaluate(
      () => (window as any).__geolocationCalls,
    );
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(
      () => document.getElementById("map")?.dataset.ready === "true",
    );
    const reloaded = await snapshot("reload");
    check(
      "reload-state",
      reloaded.lang === "ko" &&
        reloaded.evidence.response === null &&
        reloaded.map_active_route === "false" &&
        reloaded.state !== "current",
      "Reload preserves language preference but never resurrects an old route as current.",
      "새로 고침은 언어 선택을 유지하되 옛 경로를 현재 결과로 복원하지 않습니다.",
      reloaded,
      "states/reload.json",
    );
    const external = network.filter((r) => {
      try {
        const u = new URL(r.url);
        return (
          ["http:", "https:"].includes(u.protocol) && u.origin !== pilot.origin
        );
      } catch {
        return true;
      }
    });
    write(output, "browser/network.json", network);
    check(
      "no-external-requests",
      external.length === 0,
      "Browser map, worker, assets and APIs use only the owned local origin.",
      "브라우저 지도·작업자·자료·API가 소유 로컬 출처만 사용합니다.",
      external,
      "browser/network.json",
    );
    const geo =
      cumulativeGeoCalls +
      (await p.evaluate(() => (window as any).__geolocationCalls));
    write(output, "browser/geolocation.json", {
      calls: geo,
      real_collection_disabled_by_test: true,
    });
    check(
      "no-geolocation",
      geo === 0,
      "No geolocation permission or actual location collection is requested.",
      "위치 권한이나 실제 위치 수집을 요청하지 않습니다.",
      geo,
      "browser/geolocation.json",
    );
    await boundedClientOperation(
      Promise.all(pendingResponses),
      5000,
      sessionAbort.signal,
    );
    const forbidden = [
      "token",
      "database_url",
      "private_jwk",
      "runtime_root",
      "consumer_id",
      "contributor_id",
      "native_daemon",
      "engine_result",
    ];
    const publicBodies = apiResponses.filter(
      (r) => r.url.endsWith("/api/routes") && r.status === 200,
    );
    write(output, "browser/public-privacy.json", {
      responses: publicBodies.length,
      forbidden_keys: forbidden,
      cookie_values_logged: false,
    });
    check(
      "public-privacy",
      publicBodies.length > 0 &&
        publicBodies.every(
          (r) =>
            !forbidden.some((key) =>
              JSON.stringify(r.body).includes('"' + key + '"'),
            ),
        ) &&
        consoleEvents.every((r) => r.type !== "pageerror"),
      "Public browser responses and console outcomes expose no private routing identity or credentials.",
      "공개 브라우저 응답·콘솔 결과에 비공개 경로 식별·인증값을 노출하지 않습니다.",
      { responses: publicBodies.length, console: consoleEvents },
      "browser/public-privacy.json",
    );
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(watchdog);
    sessionAbort.abort();
    try {
      if (page)
        await boundedClientOperation(
          page.screenshot({
            path: join(output, "screenshots/final-state.png"),
            fullPage: true,
          }),
          2000,
        );
    } catch {}
    try {
      await closeBrowser();
    } catch (error) {
      failure ??= error;
    }
    try {
      await boundedClientOperation(Promise.allSettled(pendingResponses), 3000);
    } catch (error) {
      failure ??= error;
    }
    try {
      ownedCleanup = runtime ? await runtime.close() : false;
    } catch (error) {
      failure ??= error;
    }
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
    write(output, "browser/network-final.json", network);
    write(output, "browser/console.json", consoleEvents);
  }
  if (failure || !browserCleanup || !ownedCleanup) {
    write(output, "failure.json", {
      status: "FAIL",
      error: String(failure),
      browser_cleanup_verified: browserCleanup,
      cleanup_verified: ownedCleanup,
      message_en:
        "Actual P11 browser pilot incomplete; original failure evidence is preserved.",
      message_ko:
        "실제 P11 브라우저 파일럿 미완료이며 원래 실패 근거를 보존합니다.",
    });
    throw (
      failure ?? new Error("Client cleanup incomplete / 클라이언트 정리 미완료")
    );
  }
  check(
    "browser-cleanup",
    browserCleanup,
    "The single owned browser and original process identities are absent after close.",
    "단일 소유 브라우저·원 프로세스 식별자가 종료 뒤 남지 않습니다.",
    browserCleanup,
    "browser/cleanup.json",
  );
  check(
    "owned-cleanup",
    ownedCleanup,
    "Client, gateway, native nodes, database and private configuration resources are removed.",
    "클라이언트·중계·지속노드·DB·비공개 설정 자원을 제거했습니다.",
    ownedCleanup,
    "fixture/cleanup.json",
  );
  requireClientCases(assertions);
  const navigation=guidance.finish();
  const report: ClientReport = {
    assertions_passed: assertions.length,
    assertions_total: CLIENT_CASE_IDS.length,
    cleanup_verified: true,
    browser_version: browserVersion,
    screenshots,
    routes,
    events,
    cases: assertions.map((a) => ({
      case_id: a.assertion_id,
      status: a.status,
      message_en: a.message_en,
      message_ko: a.message_ko,
      evidence_path: a.evidence_path,
    })),
    evidence: [
      {
        name_en: "Actual browser network and console",
        name_ko: "실제 브라우저 통신·콘솔",
        path: "browser/network-final.json",
      },
      {
        name_en: "Fresh authored matching source",
        name_ko: "새 합성 매칭 원본",
        path: "fixture/source/db.json",
      },
      {
        name_en: "Original browser process cleanup",
        name_ko: "원래 브라우저 프로세스 정리",
        path: "browser/cleanup.json",
      },
    ],
  };
  write(output, "report-client.json", report);
  write(output, "assertions.json", assertions);
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error(
      "Source changed during browser run / 브라우저 실행 중 소스 변경",
    );
  const fixtureManifest = JSON.parse(
    readFileSync(join(output, "fixture/bundle/manifest.json"), "utf8"),
  );
  write(output, "manifest.json.tmp", {
    schema_version: "0.1",
    source,
    graph_id: fixtureManifest.graph_id,
    graph_manifest_sha256: fixtureManifest.graph_manifest_sha256,
    implementation_sha256: fingerprint,
    status: "PASS",
    cleanup_verified: true,
    output_sha256: evidenceHashes(output),
    completed_at_utc: new Date().toISOString(),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return { client: report, assertions, navigation };
}
export async function main(
  args = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    let graph = "",
      output = "";
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--graph" && !graph) graph = args[++i] ?? "";
      else if (args[i] === "--output" && !output) output = args[++i] ?? "";
      else if (args[i] === "--help") {
        io.out(
          "Usage / 사용법: client:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY",
        );
        return 0;
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!graph || !output || graph.startsWith("-") || output.startsWith("-"))
      throw new Error("Graph and new output required / 지도·새 출력 필요");
    await runClientChecks(graph, output);
    return 0;
  } catch (error) {
    io.error("P11 incomplete / P11 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
