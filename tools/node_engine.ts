/** One actual asynchronous persistent native HTTP engine / 실제 비동기 지속 HTTP 엔진 한 개. */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonical, parseJson, sha256 } from "./shared.js";
import {
  boundedTrafficFile,
  TrafficError,
  trafficReject,
} from "./traffic_bundle.js";
import { verifyTrafficGeneration } from "./traffic_compiler.js";
import { validateTrafficRequest } from "./traffic_runtime.js";
import { nativeRouteRequest, readNativeRouteRejection } from "./route_contract.js";
import type {
  TrafficBundle,
  TrafficGeneration,
  TrafficRouteRequest,
} from "./traffic_types.js";
import type { NativeEngineIdentity, NodeNativeEngine } from "./node_types.js";

export function durableNodeJSON(path: string, value: unknown): void {
  const temporary = path + ".tmp-" + randomUUID(),
    fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  const parent = openSync(resolve(path, ".."), "r");
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}
export function parseNativeIdentity(stdout: string): {
  pid: number;
  start_ticks: string;
} {
  const m = /^(\d+) \(([^)]+)\) (.+)$/.exec(stdout.trim());
  if (!m) trafficReject("ENGINE_IDENTITY");
  const fields = m[3]!.split(/\s+/),
    pid = Number(m[1]);
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 1 ||
    !m[2]!.startsWith("valhalla_servic") ||
    fields[0] === "Z" ||
    fields[0] === "X" ||
    !/^\d+$/.test(fields[19] ?? "")
  )
    trafficReject("ENGINE_IDENTITY");
  return { pid, start_ticks: fields[19]! };
}
export function nativeLoopbackReadyCommand(): string {
  return 'test -s /work/daemon.pid || exit 2; p=$(cat /work/daemon.pid); kill -0 "$p" || exit 3; awk \'($2=="0100007F:1F42" || $2=="0000000000000000FFFF00000100007F:1F42") && $4=="0A" {found=1; print} END{exit !found}\' /proc/net/tcp /proc/net/tcp6';
}
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done, reject) => {
    if (signal?.aborted) {
      reject(new TrafficError("NODE_CLOSING"));
      return;
    }
    const timer = setTimeout(finish, ms);
    function finish() {
      signal?.removeEventListener("abort", abort);
      done();
    }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new TrafficError("NODE_CLOSING"));
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}
interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
class PersistentNativeEngine implements NodeNativeEngine {
  readonly ownerId = randomUUID();
  readonly name = "routelens-p02-" + this.ownerId;
  readonly directory: string;
  private records: Array<Record<string, unknown>> = [];
  private currentIdentity?: NativeEngineIdentity;
  private stopPromise?: Promise<void>;
  private startupSignal?: AbortSignal;
  constructor(
    readonly bundle: TrafficBundle,
    readonly generation: TrafficGeneration,
    root: string,
  ) {
    this.directory = join(resolve(root), "engines", this.ownerId);
    mkdirSync(this.directory, { recursive: true });
    this.ownership(false);
  }
  get identity(): NativeEngineIdentity {
    if (!this.currentIdentity) trafficReject("ENGINE_NOT_READY");
    return { ...this.currentIdentity };
  }
  private ownership(cleaned: boolean): void {
    durableNodeJSON(join(this.directory, "ownership.json"), {
      schema_version: "p09-engine-0.1",
      owner_id: this.ownerId,
      container_name: this.name,
      container_id: this.currentIdentity?.container_id ?? null,
      owner_label: "io.routelens.run_id=" + this.ownerId,
      work_directory: this.directory,
      graph_directory: this.bundle.graph_directory,
      generation_id: this.generation.generation_id,
      native_daemon: this.currentIdentity
        ? {
            pid: this.currentIdentity.pid,
            start_ticks: this.currentIdentity.start_ticks,
          }
        : null,
      planned_before_creation: true,
      cleanup_verified: cleaned,
    });
  }
  private command(
    args: string[],
    timeout: number,
    signal?: AbortSignal,
    allow = false,
  ): Promise<CommandResult> {
    const sequence = this.records.length + 1,
      stem = String(sequence).padStart(4, "0"),
      record: Record<string, unknown> = {
        sequence,
        args,
        started_at_utc: new Date().toISOString(),
        status: null,
        stdout: stem + ".stdout.log",
        stderr: stem + ".stderr.log",
      };
    this.records.push(record);
    durableNodeJSON(join(this.directory, "commands.json"), this.records);
    return new Promise((done, reject) => {
      let stdout = "",
        stderr = "",
        settled = false,
        timedOut = false;
      const child = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(
        () => {
          timedOut = true;
          child.kill("SIGKILL");
        },
        Math.max(1, timeout),
      );
      const abort = () => child.kill("SIGKILL");
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      const finish = (status: number | null, error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        writeFileSync(join(this.directory, stem + ".stdout.log"), stdout);
        writeFileSync(join(this.directory, stem + ".stderr.log"), stderr);
        Object.assign(record, {
          status,
          completed_at_utc: new Date().toISOString(),
          timed_out: timedOut,
          aborted: signal?.aborted ?? false,
        });
        durableNodeJSON(join(this.directory, "commands.json"), this.records);
        if (timedOut || signal?.aborted) {
          reject(
            new TrafficError(
              signal?.aborted ? "REQUEST_ABORTED" : "ENGINE_DEADLINE",
            ),
          );
          return;
        }
        if (!allow && (error || status !== 0)) {
          reject(new TrafficError("ENGINE_UNAVAILABLE"));
          return;
        }
        done({ status, stdout, stderr });
      };
      child.stdout.on("data", (part) => {
        stdout += part;
        if (Buffer.byteLength(stdout) > 16 * 1024 * 1024) child.kill("SIGKILL");
      });
      child.stderr.on("data", (part) => {
        stderr += part;
        if (Buffer.byteLength(stderr) > 1024 * 1024) child.kill("SIGKILL");
      });
      child.once("error", (e) => finish(null, e));
      child.once("close", (code) => finish(code));
    });
  }
  private exec(
    args: string[],
    timeout = 5000,
    signal?: AbortSignal,
    allow = false,
  ): Promise<CommandResult> {
    return this.command(["exec", this.name, ...args], timeout, signal, allow);
  }
  async inspect(signal?: AbortSignal): Promise<NativeEngineIdentity> {
    const r = await this.exec(
        [
          "/bin/sh",
          "-c",
          'p=$(cat /work/daemon.pid); kill -0 "$p" && cat "/proc/$p/stat"',
        ],
        5000,
        signal,
      ),
      native = parseNativeIdentity(r.stdout),
      id = this.identity;
    if (native.pid !== id.pid || native.start_ticks !== id.start_ticks)
      trafficReject("ENGINE_IDENTITY");
    return id;
  }
  async start(
    request: TrafficRouteRequest,
    signal?: AbortSignal,
  ): Promise<this> {
    this.startupSignal = signal;
    try {
      verifyTrafficGeneration(this.generation);
      const data = boundedTrafficFile(this.generation.traffic_path);
      if (sha256(data) !== this.generation.traffic_sha256)
        trafficReject("GENERATION_CONFLICT");
      writeFileSync(join(this.directory, "traffic.tar"), data, { flag: "wx" });
      const config = parseJson(
        readFileSync(join(this.bundle.graph_directory, "config.json")),
      ) as {
        mjolnir: Record<string, unknown>;
        httpd: { service: Record<string, unknown> };
      };
      Object.assign(config.mjolnir, {
        tile_dir: "/graph/tiles",
        tile_extract: "",
        traffic_extract: "/work/traffic.tar",
        admin: "/graph/no-admin.sqlite",
        timezone: "/graph/no-timezone.sqlite",
      });
      config.httpd.service.listen = "tcp://127.0.0.1:8002";
      config.httpd.service.drain_seconds = 0;
      config.httpd.service.shutdown_seconds = 0;
      writeFileSync(
        join(this.directory, "service-config.json"),
        JSON.stringify(config, null, 2) + "\n",
      );
      writeFileSync(
        join(this.directory, "start-service.sh"),
        '#!/bin/sh\nvalhalla_service /work/service-config.json 1 > /work/daemon.stdout.log 2> /work/daemon.stderr.log &\np=$!\necho "$p" > /work/daemon.pid\nwait "$p"\ns=$?\necho "$s" > /work/daemon.exit\nexit "$s"\n',
      );
      await this.command(
        [
          "create",
          "--name",
          this.name,
          "--label",
          "io.routelens.run_id=" + this.ownerId,
          "--network",
          "none",
          "--cpus",
          "2",
          "--memory",
          "4g",
          "--stop-timeout",
          "1",
          "--mount",
          "type=bind,src=" + this.directory + ",dst=/work",
          "--mount",
          "type=bind,src=" +
            this.bundle.graph_directory +
            ",dst=/graph,readonly",
          "--entrypoint",
          "/bin/sh",
          this.bundle.image_id,
          "-c",
          "exec sleep infinity",
        ],
        30000,
        signal,
      );
      const inspected = JSON.parse(
        (await this.command(["inspect", this.name], 10000, signal)).stdout,
      )[0];
      if (
        inspected.Name !== "/" + this.name ||
        inspected.Config.Labels["io.routelens.run_id"] !== this.ownerId ||
        !inspected.Mounts.some(
          (m: { Destination: string; Source: string; RW: boolean }) =>
            m.Destination === "/work" && m.Source === this.directory,
        ) ||
        !inspected.Mounts.some(
          (m: { Destination: string; Source: string; RW: boolean }) =>
            m.Destination === "/graph" &&
            m.Source === this.bundle.graph_directory &&
            !m.RW,
        ) ||
        inspected.HostConfig.NetworkMode !== "none" ||
        inspected.HostConfig.Memory !== 4294967296 ||
        inspected.HostConfig.NanoCpus !== 2000000000 ||
        Object.keys(inspected.HostConfig.PortBindings ?? {}).length
      )
        trafficReject("ENGINE_OWNERSHIP");
      this.currentIdentity = {
        container_id: String(inspected.Id),
        container_name: this.name,
        owner_id: this.ownerId,
        pid: 0,
        start_ticks: "0",
      };
      this.ownership(false);
      await this.command(["start", this.name], 30000, signal);
      const version = await this.exec(
        ["valhalla_service", "--version"],
        5000,
        signal,
      );
      if (version.stdout.trim() !== "3.9.1") trafficReject("ENGINE_IDENTITY");
      await this.command(
        ["exec", "-d", this.name, "/bin/sh", "/work/start-service.sh"],
        10000,
        signal,
      );
      const deadline = performance.now() + 30000;
      let listening = false;
      while (performance.now() < deadline) {
        const r = await this.exec(
          ["/bin/sh", "-c", nativeLoopbackReadyCommand()],
          5000,
          signal,
          true,
        );
        if (r.status === 0) {
          listening = true;
          break;
        }
        if (r.status === 3) break;
        await pause(100, signal);
      }
      if (!listening) trafficReject("ENGINE_NOT_READY");
      const native = parseNativeIdentity(
        (
          await this.exec(
            ["/bin/sh", "-c", 'cat "/proc/$(cat /work/daemon.pid)/stat"'],
            5000,
            signal,
          )
        ).stdout,
      );
      this.currentIdentity = { ...this.currentIdentity, ...native };
      this.ownership(false);
      const readySignal = signal ?? new AbortController().signal;
      await this.route(request, readySignal, performance.now() + 30000);
      this.ownership(false);
      return this;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async route(
    request: TrafficRouteRequest,
    signal: AbortSignal,
    deadline = performance.now() + 30000,
  ): Promise<{ request: unknown; route: unknown; trace: unknown }> {
    validateTrafficRequest(request, this.bundle.graph_id);
    const before = await this.inspect(signal),
      id = randomUUID(),
      directory = join(this.directory, "requests", id);
    mkdirSync(directory, { recursive: true });
    const native = nativeRouteRequest(request);
    const call = async (
      action: "route" | "trace_attributes",
      input: unknown,
    ) => {
      const left = deadline - performance.now();
      if (left <= 0 || signal.aborted) trafficReject("REQUEST_DEADLINE");
      writeFileSync(
        join(directory, action + ".request.json"),
        JSON.stringify(input, null, 2) + "\n",
      );
      // Host cancellation stops docker exec; native curl also owns the same remaining wall-clock bound.
      // 호스트 취소와 별개로 컨테이너 curl도 같은 남은 실제시간 상한을 갖습니다.
      const r = await this.exec(
        [
          "curl",
          "--silent",
          "--show-error",
          "--connect-timeout",
          "2",
          "--max-time",
          String(Math.max(0.001, left / 1000)),
          "--request",
          "POST",
          "--header",
          "Content-Type: application/json",
          "--data-binary",
          "@/work/requests/" + id + "/" + action + ".request.json",
          "--dump-header",
          "/work/requests/" + id + "/" + action + ".headers.txt",
          "--output",
          "/work/requests/" + id + "/" + action + ".response.json",
          "--write-out",
          "%{http_code}",
          "http://127.0.0.1:8002/" + action,
        ],
        Math.max(1, left),
        signal,
      );
      const responsePath = join(directory, action + ".response.json");
      if (r.stdout.trim() !== "200") {
        if (action !== "route") trafficReject("ENGINE_HTTP_ERROR");
        const rejected = readNativeRouteRejection(responsePath, r.stdout.trim());
        const after = await this.inspect(signal);
        if (!canonical(before).equals(canonical(after))) trafficReject("ENGINE_IDENTITY");
        durableNodeJSON(join(directory, "identity.json"), { before, after });
        throw rejected;
      }
      const
        stat = lstatSync(responsePath);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 8 * 1024 * 1024
      )
        trafficReject("ENGINE_RESPONSE_LIMIT");
      return parseJson(readFileSync(responsePath));
    };
    const route = (await call("route", native)) as {
      trip?: {
        status: number;
        summary: { time: number; length: number; cost: number };
        legs: Array<{ shape: string }>;
      };
    };
    if (
      route.trip?.status !== 0 ||
      route.trip.legs.length !== 1 ||
      typeof route.trip.legs[0]?.shape !== "string" ||
      ![
        route.trip.summary.time,
        route.trip.summary.length,
        route.trip.summary.cost,
      ].every(Number.isFinite)
    )
      trafficReject("INVALID_ENGINE_RESPONSE");
    const trace = (await call("trace_attributes", {
      encoded_polyline: route.trip.legs[0].shape,
      shape_match: "edge_walk",
      costing: "auto",
      date_time: { type: 0 },
      filters: {
        action: "include",
        attributes: ["edge.id", "edge.length", "edge.speed", "shape"],
      },
    })) as { edges?: unknown[] };
    if (!Array.isArray(trace.edges) || !trace.edges.length)
      trafficReject("INVALID_ENGINE_RESPONSE");
    const after = await this.inspect(signal);
    if (!canonical(before).equals(canonical(after)))
      trafficReject("ENGINE_IDENTITY");
    durableNodeJSON(join(directory, "identity.json"), { before, after });
    return { request: native, route, trace };
  }
  stop(): Promise<void> {
    return (this.stopPromise ??= (async () => {
      const inspected = await this.command(
        ["inspect", this.name],
        5000,
        undefined,
        true,
      );
      let termSent = false,
        nativeExited = false,
        exitCode: string | null = null;
      if (inspected.status === 0) {
        const c = JSON.parse(inspected.stdout)[0];
        if (
          c.Config.Labels["io.routelens.run_id"] !== this.ownerId ||
          c.Name !== "/" + this.name ||
          !c.Mounts.some(
            (m: { Destination: string; Source: string }) =>
              m.Destination === "/work" && m.Source === this.directory,
          )
        )
          trafficReject("ENGINE_OWNERSHIP");
        if (this.currentIdentity && this.currentIdentity.pid > 1) {
          const current = await this.exec(
            [
              "/bin/sh",
              "-c",
              'p=$(cat /work/daemon.pid); test -e "/proc/$p/stat" && cat "/proc/$p/stat"',
            ],
            2000,
            undefined,
            true,
          );
          if (current.status === 0) {
            const native = parseNativeIdentity(current.stdout);
            if (
              native.pid !== this.currentIdentity.pid ||
              native.start_ticks !== this.currentIdentity.start_ticks
            )
              trafficReject("ENGINE_IDENTITY");
            await this.exec(
              ["/bin/sh", "-c", 'kill -TERM "$(cat /work/daemon.pid)"'],
              2000,
              undefined,
              true,
            );
            termSent = true;
            const until = performance.now() + 5000;
            while (performance.now() < until) {
              const gone = await this.exec(
                [
                  "/bin/sh",
                  "-c",
                  'p=$(cat /work/daemon.pid); test ! -e "/proc/$p/stat"',
                ],
                1000,
                undefined,
                true,
              );
              if (gone.status === 0) {
                nativeExited = true;
                break;
              }
              await pause(100);
            }
          } else nativeExited = true;
          const exited = await this.exec(
            [
              "/bin/sh",
              "-c",
              "test -f /work/daemon.exit && cat /work/daemon.exit",
            ],
            1000,
            undefined,
            true,
          );
          if (exited.status === 0) exitCode = exited.stdout.trim();
        }
        await this.command(["rm", "-f", this.name], 5000);
      } else if (!/No such (?:object|container)/i.test(inspected.stderr))
        trafficReject("ENGINE_CLEANUP");
      const gone = await this.command(
        ["container", "inspect", this.name],
        5000,
        undefined,
        true,
      );
      if (
        gone.status === 0 ||
        !/No such (?:object|container)/i.test(gone.stderr)
      )
        trafficReject("ENGINE_CLEANUP");
      this.ownership(true);
      durableNodeJSON(join(this.directory, "cleanup.json"), {
        cleanup_verified: true,
        term_sent_to_verified_daemon: termSent,
        native_exited_before_container_removal: nativeExited,
        native_exit_code: exitCode,
        forced_container_removal: !nativeExited,
        native_stopped_with_owned_container: true,
      });
    })());
  }
}
export async function startNodeEngine(
  bundle: TrafficBundle,
  generation: TrafficGeneration,
  runtimeRoot: string,
  request: TrafficRouteRequest,
  signal?: AbortSignal,
): Promise<NodeNativeEngine> {
  return new PersistentNativeEngine(bundle, generation, runtimeRoot).start(
    request,
    signal,
  );
}
