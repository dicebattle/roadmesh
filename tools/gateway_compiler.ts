/** One owned bounded compiler thread; only exact in-flight preparation is shared.
 * 소유 작업 스레드 하나를 제한하고 정확히 같은 진행 중 준비만 공유합니다. */
import { Worker, type WorkerOptions } from "node:worker_threads";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { canonical, sha256 } from "./shared.js";
import { durableNodeJSON } from "./node_engine.js";
import type { VerifiedPublication } from "./publication_types.js";
import type { TrafficBundle, TrafficGeneration } from "./traffic_types.js";
import type {
  GatewayCompilerJob,
  GatewayCompilerPaths,
} from "./gateway_compile_worker.js";
export interface GatewayCompilerCleanup {
  thread_id: number;
  termination_verified: boolean;
  cleanup_verified: boolean;
  exit_code: number | null;
  failure_reason: string | null;
}
type JobInput =
  | Omit<Extract<GatewayCompilerJob, { operation: "load" }>, "id">
  | Omit<Extract<GatewayCompilerJob, { operation: "prepare" }>, "id">
  | Omit<Extract<GatewayCompilerJob, { operation: "verify" }>, "id">;
type WorkerFactory = (url: URL, options: WorkerOptions) => Worker;
export class GatewayCompilerError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
export class GatewayCompilerAdapter {
  readonly thread_id: number;
  private closed = false;
  private failure: string | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      done: (value: unknown) => void;
      fail: (error: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
      record: Record<string, unknown>;
    }
  >();
  private preparing = new Map<string, Promise<TrafficGeneration>>();
  private records: Record<string, unknown>[] = [];
  private exitCode: number | null = null;
  private exited: Promise<void>;
  private closePromise?: Promise<GatewayCompilerCleanup>;
  private constructor(
    private readonly worker: Worker,
    readonly directory: string,
  ) {
    this.thread_id = worker.threadId;
    this.exited = new Promise((done) =>
      worker.once("exit", (code) => {
        this.exitCode = code;
        if (!this.closed) this.poison("COMPILER_WORKER_EXIT");
        done();
      }),
    );
    worker.on("error", () => this.poison("COMPILER_WORKER_ERROR"));
    worker.on("message", (raw: unknown) => this.receive(raw));
  }
  static async start(
    paths: GatewayCompilerPaths,
    directory: string,
    factory: WorkerFactory = (url, options) => new Worker(url, options),
  ): Promise<GatewayCompilerAdapter> {
    mkdirSync(directory);
    durableNodeJSON(join(directory, "ownership.json"), {
      kind: "gateway-compiler",
      parent_pid: process.pid,
      thread_id: null,
      planned_before_creation: true,
    });
    let adapter: GatewayCompilerAdapter | undefined;
    try {
      const worker = factory(
        new URL("./gateway_compile_worker.js", import.meta.url),
        { workerData: { ...paths, role: "gateway-compiler" } },
      );
      adapter = new GatewayCompilerAdapter(worker, directory);
      durableNodeJSON(join(directory, "ownership.json"), {
        kind: "gateway-compiler",
        parent_pid: process.pid,
        thread_id: adapter.thread_id,
        planned_before_creation: true,
      });
      return adapter;
    } catch (error) {
      if (adapter) await adapter.close();
      else
        durableNodeJSON(join(directory, "cleanup.json"), {
          thread_id: null,
          termination_verified: true,
          cleanup_verified: true,
          started: false,
          failure_reason: "COMPILER_START_FAILED",
        });
      throw error;
    }
  }
  private persist(): void {
    durableNodeJSON(join(this.directory, "jobs.json"), this.records);
  }
  private receive(raw: unknown): void {
    if (this.closed) return;
    if (
      !raw ||
      typeof raw !== "object" ||
      !("id" in raw) ||
      !Number.isSafeInteger(raw.id) ||
      !("ok" in raw) ||
      typeof raw.ok !== "boolean"
    ) {
      this.poison("COMPILER_PROTOCOL_ERROR");
      return;
    }
    const message = raw as {
        id: number;
        ok: boolean;
        result?: unknown;
        reason?: unknown;
      },
      job = this.pending.get(message.id);
    if (!job) {
      this.poison("COMPILER_PROTOCOL_ERROR");
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(job.timer);
    Object.assign(job.record, {
      finished_at_utc: new Date().toISOString(),
      ok: message.ok,
      reason: message.ok
        ? null
        : String(message.reason ?? "COMPILER_JOB_FAILED"),
    });
    try {
      this.persist();
    } catch {
      job.fail(new GatewayCompilerError("COMPILER_EVIDENCE_FAILED"));
      this.poison("COMPILER_EVIDENCE_FAILED");
      return;
    }
    if (message.ok) job.done(message.result);
    else
      job.fail(
        new GatewayCompilerError(
          typeof message.reason === "string"
            ? message.reason
            : "COMPILER_JOB_FAILED",
        ),
      );
  }
  private poison(reason: string): void {
    if (!this.failure) this.failure = reason;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      Object.assign(job.record, {
        ok: false,
        reason: this.failure,
        finished_at_utc: new Date().toISOString(),
      });
      job.fail(new GatewayCompilerError(this.failure));
    }
    this.pending.clear();
    this.preparing.clear();
    try {
      this.persist();
    } catch {
      /* Failure stays closed even when evidence cannot be written. / 기록 불가여도 닫힌 실패 유지. */
    }
    void this.close();
  }
  private submit<T>(input: JobInput): Promise<T> {
    if (this.failure || this.closed)
      return Promise.reject(
        new GatewayCompilerError(this.failure ?? "COMPILER_CLOSED"),
      );
    if (this.pending.size >= 16)
      return Promise.reject(new GatewayCompilerError("COMPILER_CAPACITY"));
    const id = ++this.nextId,
      record = {
        id,
        operation: input.operation,
        queued_at_utc: new Date().toISOString(),
        input_sha256: sha256(canonical(input)),
      };
    this.records.push(record);
    return new Promise<T>((done, fail) => {
      const timer = setTimeout(
        () => this.poison("COMPILER_JOB_DEADLINE"),
        12000,
      );
      this.pending.set(id, { done: (v) => done(v as T), fail, timer, record });
      try {
        this.persist();
        this.worker.postMessage({ ...input, id });
      } catch {
        this.poison("COMPILER_POST_FAILED");
      }
    });
  }
  loadBundle(): Promise<TrafficBundle> {
    return this.submit({ operation: "load" });
  }
  prepare(input: VerifiedPublication | null): Promise<TrafficGeneration> {
    if (this.closed || this.failure)
      return Promise.reject(
        new GatewayCompilerError(this.failure ?? "COMPILER_CLOSED"),
      );
    const full = input
        ? { ...input, artifact: Buffer.from(input.artifact).toString("base64") }
        : null,
      key = sha256(canonical(full)),
      existing = this.preparing.get(key);
    if (existing) return existing;
    const promise = this.submit<TrafficGeneration>({
      operation: "prepare",
      input,
    });
    this.preparing.set(key, promise);
    const forget = () => {
      if (this.preparing.get(key) === promise) this.preparing.delete(key);
    };
    void promise.then(forget, forget);
    return promise;
  }
  verify(generation: TrafficGeneration): Promise<void> {
    return this.submit({ operation: "verify", generation });
  }
  close(): Promise<GatewayCompilerCleanup> {
    return (this.closePromise ??= (async () => {
      this.closed = true;
      for (const job of this.pending.values()) {
        clearTimeout(job.timer);
        job.fail(new GatewayCompilerError(this.failure ?? "COMPILER_CLOSED"));
      }
      this.pending.clear();
      this.preparing.clear();
      let verified = false;
      try {
        await this.worker.terminate();
        await this.exited;
        verified = true;
      } catch {
        this.failure ??= "COMPILER_TERMINATION_FAILED";
      }
      const result = {
        thread_id: this.thread_id,
        termination_verified: verified,
        cleanup_verified: verified,
        exit_code: this.exitCode,
        failure_reason: this.failure,
      };
      try {
        this.persist();
      } catch {
        result.cleanup_verified = false;
        result.failure_reason = "COMPILER_EVIDENCE_FAILED";
      }
      try {
        durableNodeJSON(join(this.directory, "cleanup.json"), result);
      } catch {
        result.cleanup_verified = false;
        result.failure_reason = "COMPILER_EVIDENCE_FAILED";
      }
      return result;
    })());
  }
}
