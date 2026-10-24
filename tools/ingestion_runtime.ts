/** Owned local PostgreSQL/process lifetime. Private credentials never enter evidence. */
import { fork, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createConnection } from "node:net";
import { GraphCommands } from "./test_graph.js";
import { ROOT } from "./shared.js";
export function confirmedAbsent(result: {
  status: number | null;
  stderr: string;
}): boolean {
  return (
    result.status !== 0 &&
    /No such (?:container|object|volume)/i.test(result.stderr)
  );
}
export const POSTGRES_IMAGE =
  "postgres:18.6-bookworm@sha256:bbf83594798e144bff365a9c191c5d779f181fb3135902064ab8ff11918020fc";
export const pause = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));
export async function portIsOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    for (const event of ["error", "timeout"])
      socket.once(event, () => {
        socket.destroy();
        done(false);
      });
  });
}
const liveRuntimes = new Set<OwnedIngestionRuntime>();
const interrupt = () => {
  void (async () => {
    for (const owner of [...liveRuntimes].reverse())
      await owner.cleanup().catch(() => false);
    process.exit(130);
  })();
};
export class OwnedIngestionRuntime {
  readonly runId = randomUUID();
  readonly name = "routelens-p05-" + this.runId;
  readonly volume = this.name + "-db";
  readonly privateDirectory = mkdtempSync(join(tmpdir(), "routelens-private-"));
  readonly commands: GraphCommands;
  readonly processes: OwnedIngestionProcess[] = [];
  private password = randomBytes(32).toString("hex");
  private port = 0;
  private cleanupPromise?: Promise<boolean>;
  constructor(
    readonly output: string,
    readonly ownedRoot = resolve(output, ".."),
  ) {
    mkdirSync(output);
    this.commands = new GraphCommands(output);
    this.ownership();
    if (!liveRuntimes.size) {
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", interrupt);
    }
    liveRuntimes.add(this);
  }
  private ownership(): void {
    writeFileSync(
      join(this.output, "ownership.json"),
      JSON.stringify(
        {
          run_id: this.runId,
          container: this.name,
          volume: this.volume,
          planned_before_creation: true,
          owned_output_root: this.ownedRoot,
          processes: this.processes.map((p) => ({
            role: p.role,
            pid: p.child?.pid ?? null,
            spawn_recorded_before_start: true,
            exited:
              !!p.child &&
              (p.child.exitCode !== null || p.child.signalCode !== null),
          })),
        },
        null,
        2,
      ) + "\n",
    );
  }
  private async ready(): Promise<void> {
    const start = performance.now();
    while (performance.now() - start < 60000) {
      if (
        this.commands.command(
          [
            "exec",
            this.name,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
            "-d",
            "routelens",
          ],
          10000,
          true,
        ).status === 0
      )
        return;
      await pause(200);
    }
    throw new Error(
      "PostgreSQL readiness timed out / PostgreSQL 준비 시간 초과",
    );
  }
  async start(): Promise<string> {
    const format = "{{.Id}}|{{.Os}}|{{.Architecture}}";
    let image = this.commands.command(
      ["image", "inspect", "--format", format, POSTGRES_IMAGE],
      10000,
      true,
    );
    if (image.status !== 0) {
      this.commands.command(["pull", POSTGRES_IMAGE], 300000);
      image = this.commands.command([
        "image",
        "inspect",
        "--format",
        format,
        POSTGRES_IMAGE,
      ]);
    }
    writeFileSync(
      join(this.privateDirectory, "postgres.env"),
      "POSTGRES_PASSWORD=" + this.password + "\nPOSTGRES_DB=routelens\n",
      { mode: 0o600 },
    );
    this.commands.command([
      "volume",
      "create",
      "--label",
      "io.routelens.ingestion-run=" + this.runId,
      this.volume,
    ]);
    this.commands.command([
      "create",
      "--name",
      this.name,
      "--label",
      "io.routelens.ingestion-run=" + this.runId,
      "--publish",
      "127.0.0.1::5432",
      "--cpus",
      "1",
      "--memory",
      "536870912",
      "--env-file",
      join(this.privateDirectory, "postgres.env"),
      "--mount",
      "type=volume,src=" + this.volume + ",dst=/var/lib/postgresql",
      POSTGRES_IMAGE,
    ]);
    this.commands.command(["start", this.name]);
    await this.ready();
    const mapped = this.commands
      .command(["port", this.name, "5432/tcp"])
      .stdout.trim();
    const match = /^127\.0\.0\.1:(\d+)$/.exec(mapped);
    if (!match)
      throw new Error(
        "PostgreSQL is not loopback-only / PostgreSQL이 로컬 전용이 아닙니다",
      );
    this.port = Number(match[1]);
    const settings = this.commands
      .command([
        "exec",
        this.name,
        "psql",
        "-U",
        "postgres",
        "-d",
        "routelens",
        "-At",
        "-c",
        "SELECT current_setting('fsync'),current_setting('synchronous_commit'),current_setting('full_page_writes'),current_setting('server_version');",
      ])
      .stdout.trim()
      .split("|");
    if (settings.slice(0, 3).join("|") !== "on|on|on")
      throw new Error(
        "PostgreSQL durability disabled / PostgreSQL 내구성 설정 꺼짐",
      );
    const [id, os, architecture] = image.stdout.trim().split("|");
    writeFileSync(
      join(this.output, "database.json"),
      JSON.stringify(
        {
          requested_image: POSTGRES_IMAGE,
          actual_image_id: id,
          platform: { os, architecture },
          server_version: settings[3],
          loopback_only: true,
          settings: {
            fsync: "on",
            synchronous_commit: "on",
            full_page_writes: "on",
          },
          named_volume: this.volume,
        },
        null,
        2,
      ) + "\n",
    );
    return this.databaseUrl;
  }
  get databaseUrl(): string {
    if (!this.port) throw new Error("Database not ready / DB 준비 전");
    return (
      "postgresql://postgres:" +
      this.password +
      "@127.0.0.1:" +
      this.port +
      "/routelens"
    );
  }
  assertSafe(text: string): void {
    if (text.includes(this.password))
      throw new Error(
        "Private database credential detected / 비공개 DB 인증값 감지",
      );
  }
  async restartDatabase(): Promise<void> {
    const before = this.commands
      .command(["inspect", "--format", "{{.Id}}", this.name])
      .stdout.trim();
    this.commands.command(["restart", "--time", "10", this.name], 30000);
    await this.ready();
    const after = this.commands
      .command(["inspect", "--format", "{{.Id}}", this.name])
      .stdout.trim();
    if (before !== after)
      throw new Error(
        "Database container unexpectedly replaced / DB 컨테이너가 예기치 않게 교체됨",
      );
    writeFileSync(
      join(this.output, "database-restart.json"),
      JSON.stringify(
        {
          same_container_id: true,
          same_named_volume: this.volume,
          restarted: true,
        },
        null,
        2,
      ) + "\n",
    );
  }
  spawn(role: string, script: string, config: unknown): OwnedIngestionProcess {
    return this.spawnOwned(
      new OwnedIngestionProcess(role, this.privateDirectory, script, config),
    );
  }
  spawnCommand(
    role: string,
    script: string,
    args: string[],
  ): OwnedIngestionProcess {
    return this.spawnOwned(
      new OwnedIngestionProcess(
        role,
        this.privateDirectory,
        script,
        null,
        args,
      ),
    );
  }
  private spawnOwned(child: OwnedIngestionProcess): OwnedIngestionProcess {
    this.processes.push(child);
    this.ownership();
    child.start();
    this.ownership();
    return child;
  }
  cleanup(): Promise<boolean> {
    return (this.cleanupPromise ??= this.finishCleanup());
  }
  private async finishCleanup(): Promise<boolean> {
    const failures: string[] = [];
    for (const child of this.processes)
      try {
        await child.stop();
      } catch {
        failures.push("process:" + child.role);
      }
    const listed = this.commands.command(
      [
        "ps",
        "-a",
        "--filter",
        "label=io.routelens.run_id",
        "--format",
        "{{.ID}}",
      ],
      10000,
      true,
    );
    if (listed.status !== 0) failures.push("engine-inventory");
    else
      for (const id of listed.stdout.trim().split(/\s+/).filter(Boolean)) {
        try {
          const raw = this.commands
            .command([
              "inspect",
              "--format",
              '{{json .Mounts}}|{{.Name}}|{{ index .Config.Labels "io.routelens.run_id" }}',
              id,
            ])
            .stdout.trim();
          const [mountJson, name, label] = raw.split("|");
          const mounts = JSON.parse(mountJson!) as {
            Source: string;
            Destination: string;
          }[];
          const root = resolve(this.ownedRoot);
          if (
            name === "/routelens-p02-" + label &&
            /^[a-f0-9-]{36}$/.test(label ?? "") &&
            mounts.some(
              (m) =>
                m.Destination === "/work" &&
                (resolve(m.Source) === root ||
                  resolve(m.Source).startsWith(root + "/")),
            )
          ) {
            this.commands.command(["rm", "-f", id], 30000, true);
            if (
              !confirmedAbsent(
                this.commands.command(
                  ["inspect", "--format", "{{.Id}}", id],
                  10000,
                  true,
                ),
              )
            )
              failures.push("engine:" + id);
          }
        } catch {
          failures.push("engine-inspection");
        }
      }
    const container = this.commands.command(
      [
        "inspect",
        "--format",
        '{{ index .Config.Labels "io.routelens.ingestion-run" }}',
        this.name,
      ],
      10000,
      true,
    );
    if (container.status === 0) {
      if (container.stdout.trim() === this.runId)
        this.commands.command(["rm", "-f", this.name], 30000, true);
      else failures.push("database-owner-mismatch");
    }
    if (
      !confirmedAbsent(
        this.commands.command(
          ["inspect", "--format", "{{.Id}}", this.name],
          10000,
          true,
        ),
      )
    )
      failures.push("database");
    const volume = this.commands.command(
      [
        "volume",
        "inspect",
        "--format",
        '{{ index .Labels "io.routelens.ingestion-run" }}',
        this.volume,
      ],
      10000,
      true,
    );
    if (volume.status === 0) {
      if (volume.stdout.trim() === this.runId)
        this.commands.command(["volume", "rm", this.volume], 30000, true);
      else failures.push("volume-owner-mismatch");
    }
    if (
      !confirmedAbsent(
        this.commands.command(
          ["volume", "inspect", "--format", "{{.Name}}", this.volume],
          10000,
          true,
        ),
      )
    )
      failures.push("volume");
    if (this.port && (await portIsOpen(this.port)))
      failures.push("database-port");
    for (const p of this.processes)
      for (const message of p.messages) {
        const m = message as { type?: string; kind?: string; port?: number };
        if (
          m.type === "READY" &&
          m.kind === "service" &&
          m.port &&
          (await portIsOpen(m.port))
        )
          failures.push("service-port");
      }
    this.assertSafe(JSON.stringify(this.commands.records));
    rmSync(this.privateDirectory, { recursive: true, force: true });
    this.ownership();
    liveRuntimes.delete(this);
    if (!liveRuntimes.size) {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
    writeFileSync(
      join(this.output, "cleanup.json"),
      JSON.stringify(
        {
          cleanup_verified: failures.length === 0,
          failures,
          private_files_removed: true,
          processes_exited: this.processes.every(
            (p) =>
              !!p.child &&
              (p.child.exitCode !== null || p.child.signalCode !== null),
          ),
        },
        null,
        2,
      ) + "\n",
    );
    return failures.length === 0;
  }
}
export class OwnedIngestionProcess {
  child?: ChildProcess;
  readonly messages: unknown[] = [];
  readonly diagnostics: string[] = [];
  private readonly configPath: string;
  constructor(
    readonly role: string,
    private privateDirectory: string,
    private script: string,
    config: unknown,
    private directArgs?: string[],
  ) {
    this.configPath = join(
      privateDirectory,
      role + "-" + randomUUID() + ".json",
    );
    writeFileSync(this.configPath, JSON.stringify(config), { mode: 0o600 });
  }
  start(): void {
    this.child = fork(
      join(ROOT, "dist/tools", this.script + ".js"),
      this.directArgs ?? ["--config", this.configPath],
      {
        execPath: process.execPath,
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        detached: true,
      },
    );
    this.child.on("message", (message) => this.messages.push(message));
    for (const stream of [this.child.stdout, this.child.stderr])
      stream?.on("data", (chunk) => this.diagnostics.push(String(chunk)));
  }
  async message(
    predicate: (value: any) => boolean,
    timeout = 120000,
  ): Promise<any> {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      const found = this.messages.find(predicate);
      if (found !== undefined) return found;
      if (
        this.child &&
        (this.child.exitCode !== null || this.child.signalCode !== null)
      )
        throw new Error(
          "Owned child exited before expected event / 소유 자식이 예상 이벤트 전 종료됨",
        );
      await pause(10);
    }
    throw new Error("Owned child IPC timed out / 소유 자식 통신 시간 초과");
  }
  send(message: unknown): void {
    if (!this.child?.connected)
      throw new Error("Child IPC unavailable / 자식 통신 불가");
    this.child.send(message as any);
  }
  async exited(
    timeout = 120000,
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    const start = performance.now();
    while (
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null &&
      performance.now() - start < timeout
    )
      await pause(20);
    if (
      !this.child ||
      (this.child.exitCode === null && this.child.signalCode === null)
    )
      throw new Error("Owned child exit timed out / 소유 자식 종료 시간 초과");
    return { code: this.child.exitCode, signal: this.child.signalCode };
  }
  async stop(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    if (
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    ) {
      try {
        process.kill(-this.child.pid!, signal);
      } catch {
        this.child.kill(signal);
      }
      try {
        await this.exited(3000);
      } catch {
        try {
          process.kill(-this.child.pid!, "SIGKILL");
        } catch {
          this.child.kill("SIGKILL");
        }
        await this.exited(10000);
      }
    }
  }
}
