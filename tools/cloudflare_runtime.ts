/** Own a loopback-only Wrangler/workerd fixture and persistent local state. / 로컬 Wrangler·보존 상태의 소유 실행기. */
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { ROOT, parseJson } from "./shared.js";
import {
  processTree,
  identityAlive,
  type ProcessIdentity,
} from "./client_checks.js";
import { pause, portIsOpen } from "./ingestion_runtime.js";
import type { ParityScope } from "../infra/cloudflare/contracts.js";
export class OwnedCloudflareRuntime {
  private child: ChildProcess | undefined;
  private exit:
    Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  private exitResult:
    { code: number | null; signal: NodeJS.Signals | null } | undefined;
  private readonly token = randomBytes(32).toString("hex");
  private readonly identities = new Map<string, ProcessIdentity>();
  private sequence = 0;
  private requestSequence = 0;
  private origin = "";
  private diagnosticFailure = false;
  private readonly privateDirectory: string;
  readonly stateDirectory: string;
  readonly sessions: Array<{
    sequence: number;
    pid: number;
    origin: string;
    exit?: { code: number | null; signal: NodeJS.Signals | null };
    cleanup_verified?: boolean;
  }> = [];
  constructor(
    readonly output: string,
    private readonly configured: ParityScope[],
  ) {
    mkdirSync(output);
    for (const d of ["http", "logs"]) mkdirSync(join(output, d));
    this.privateDirectory = join(output, ".private");
    this.stateDirectory = join(output, "state");
    mkdirSync(this.privateDirectory, { mode: 0o700 });
  }
  private capture(): void {
    if (!this.child?.pid || this.exitResult) return;
    for (const p of processTree(this.child.pid))
      this.identities.set(p.pid + ":" + p.started_at, p);
    writeFileSync(
      join(this.output, "process-identities.json"),
      JSON.stringify([...this.identities.values()], null, 2) + "\n",
    );
  }
  async start(): Promise<void> {
    if (this.child)
      throw new Error(
        "Local fixture already started / 로컬 실행기가 이미 시작됐습니다",
      );
    this.sequence++;
    this.exitResult = undefined;
    this.origin = "";
    const template = parseJson(
      readFileSync(join(ROOT, "infra/cloudflare/wrangler.jsonc")),
    ) as { main: string; vars: Record<string, string> };
    template.main = join(ROOT, "infra/cloudflare/worker.ts");
    template.vars = {
      ...template.vars,
      PILOT_SCOPES_JSON: JSON.stringify(this.configured),
    };
    const config = join(this.privateDirectory, "wrangler.json");
    writeFileSync(config, JSON.stringify(template), { mode: 0o600 });
    writeFileSync(
      join(this.privateDirectory, ".dev.vars"),
      "PILOT_AUTH_TOKEN=" + this.token + "\n",
      { mode: 0o600 },
    );
    const logs: { stdout: string[]; stderr: string[] } = {
      stdout: [],
      stderr: [],
    };
    const child = spawn(
      process.execPath,
      [
        join(ROOT, "node_modules/wrangler/bin/wrangler.js"),
        "dev",
        "--config",
        config,
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        "0",
        "--inspector-port",
        "0",
        "--persist-to",
        this.stateDirectory,
        "--show-interactive-dev-session=false",
      ],
      {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: "false",
          BROWSER: "none",
          NO_COLOR: "1",
        },
      },
    );
    this.child = child;
    this.exit = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        this.exitResult = { code, signal };
        resolve({ code, signal });
      });
    });
    void this.exit.catch(() => {});
    for (const stream of ["stdout", "stderr"] as const)
      child[stream]!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes(this.token)) {
          this.diagnosticFailure = true;
          logs[stream].push(
            "Credential diagnostic rejected / 자격정보 진단을 거부했습니다.\n",
          );
        } else logs[stream].push(text);
        writeFileSync(
          join(this.output, "logs", `session-${this.sequence}-${stream}.txt`),
          logs[stream].join(""),
        );
        const found = logs.stdout
          .join("")
          .match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/);
        if (found) this.origin = found[1]!;
      });
    this.capture();
    let capturedAt = Date.now();
    const until = Date.now() + 45000;
    while (!this.origin) {
      if (Date.now() - capturedAt >= 1000) {
        this.capture();
        capturedAt = Date.now();
      }
      if (this.exitResult || this.diagnosticFailure || Date.now() > until)
        throw new Error(
          "Local workerd startup failed; inspect retained diagnostics / 로컬 workerd 시작 실패·보존 진단을 확인하세요",
        );
      await pause(100);
    }
    this.capture();
    this.sessions.push({
      sequence: this.sequence,
      pid: child.pid!,
      origin: this.origin,
    });
    const health = await fetch(this.origin + "/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (
      health.status !== 200 ||
      ((await health.json()) as { status?: string }).status !==
        "LOCAL_PARITY_ONLY"
    )
      throw new Error(
        "Local Worker readiness mismatch / 로컬 Worker 준비 응답 불일치",
      );
    writeFileSync(
      join(this.output, "sessions.json"),
      JSON.stringify(this.sessions, null, 2) + "\n",
    );
  }
  async request(
    scope: string,
    operation: string,
    payload?: unknown,
    label?: string,
  ): Promise<{ status: number; body: unknown; text: string }> {
    if (!this.origin)
      throw new Error("Local fixture not ready / 로컬 실행기 준비 전");
    const route = `/local/scopes/${encodeURIComponent(scope)}/${operation}`,
      response = await fetch(this.origin + route, {
        method: payload === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer " + this.token,
          ...(payload === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        ...(payload === undefined
          ? {}
          : {
              body:
                typeof payload === "string" ? payload : JSON.stringify(payload),
            }),
        signal: AbortSignal.timeout(15000),
      });
    const text = await response.text();
    if (text.includes(this.token)) {
      this.diagnosticFailure = true;
      throw new Error("Credential response rejected / 자격정보 응답 거부");
    }
    const body = parseJson(text);
    const name =
      String(++this.requestSequence).padStart(4, "0") +
      "-" +
      (label ?? operation.split("?")[0]) +
      ".json";
    writeFileSync(
      join(this.output, "http", name),
      JSON.stringify(
        {
          request: {
            method: payload === undefined ? "GET" : "POST",
            path: route,
            ...(payload === undefined ? {} : { body: payload }),
          },
          response: {
            status: response.status,
            headers: Object.fromEntries(response.headers),
            text,
            body,
          },
        },
        null,
        2,
      ) + "\n",
    );
    return { status: response.status, body, text };
  }
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.capture();
    if (!this.exitResult) child.kill("SIGTERM");
    const until = Date.now() + 8000;
    while (!this.exitResult && Date.now() < until) await pause(100);
    const current = [...this.identities.values()].filter(identityAlive);
    for (const p of current.reverse())
      if (identityAlive(p)) process.kill(p.pid, "SIGTERM");
    for (
      let i = 0;
      i < 30 && [...this.identities.values()].some(identityAlive);
      i++
    )
      await pause(100);
    for (const p of [...this.identities.values()]
      .filter(identityAlive)
      .reverse())
      if (identityAlive(p)) process.kill(p.pid, "SIGKILL");
    await this.exit;
    for (
      let i = 0;
      i < 30 && [...this.identities.values()].some(identityAlive);
      i++
    )
      await pause(100);
    const remaining = [...this.identities.values()].filter(identityAlive),
      port = this.origin ? Number(new URL(this.origin).port) : null,
      closed = port === null || !(await portIsOpen(port));
    const last = this.sessions.at(-1);
    if (last) {
      last.exit = this.exitResult;
      last.cleanup_verified = !remaining.length && closed;
    }
    writeFileSync(
      join(this.output, "sessions.json"),
      JSON.stringify(this.sessions, null, 2) + "\n",
    );
    this.child = undefined;
    this.origin = "";
    if (remaining.length || !closed)
      throw new Error(
        "Owned local Worker resources remain / 소유 로컬 Worker 자원이 남았습니다",
      );
  }
  async close(): Promise<{ cleanup_verified: boolean }> {
    let failed = false;
    try {
      await this.stop();
    } catch {
      failed = true;
    } finally {
      rmSync(this.privateDirectory, { recursive: true, force: true });
    }
    const secretPaths: string[] = [];
    let scannedFiles = 0;
    const scan = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.isFile()) {
          scannedFiles++;
          if (readFileSync(full).includes(Buffer.from(this.token))) {
            this.diagnosticFailure = true;
            secretPaths.push(full.slice(this.output.length + 1));
            const quarantine = join(ROOT, "data", "private-p13-quarantine");
            mkdirSync(quarantine, { recursive: true, mode: 0o700 });
            renameSync(full, join(quarantine, randomUUID() + "-" + entry.name));
          }
        } else
          throw new Error("Nonregular owned evidence / 비정상 소유 근거 파일");
      }
    };
    try {
      scan(this.output);
    } catch {
      failed = true;
    }
    const remaining = [...this.identities.values()].filter(identityAlive),
      result = {
        credential_scan_files: scannedFiles,
        credential_files_quarantined: secretPaths,
        cleanup_verified:
          !failed && !remaining.length && !this.diagnosticFailure,
        remaining_owned_processes: remaining,
        private_configuration_removed: true,
        diagnostic_secret_rejected: this.diagnosticFailure,
        sessions: this.sessions,
        message_en:
          "Only this fixture's original process identities and ports were stopped. Persistent synthetic SQLite state remains as evidence.",
        message_ko:
          "이 실행기의 원래 프로세스 식별자·포트만 종료하고 합성 SQLite 상태는 근거로 보존했습니다.",
      };
    writeFileSync(
      join(this.output, "cleanup.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  }
}
