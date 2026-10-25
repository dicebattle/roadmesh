/** Local post-matching adapter only. / 매칭 후 로컬 연결기 전용입니다. */
import { DurableObject } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import {
  InputError,
  canonical,
  identifier,
  parseJson,
  record,
  sha256,
} from "../../tools/value_contract.js";
import { utc } from "../../tools/time_validation.js";
import { IngestionError } from "../../tools/ingestion_types.js";
import {
  aggregateWindow,
  windowTimes,
} from "../../tools/traffic_aggregation.js";
import type {
  AggregationContribution,
  AggregationResult,
} from "../../tools/aggregation_types.js";
import {
  AdapterError,
  BODY_LIMIT,
  batchHash,
  configuredScope,
  inputFor,
  invalid,
  noticeValid,
  ownerName,
  validateBatch,
  type MatchedBatch,
  type ParityScope,
  type QueueNotice,
} from "./contracts.js";

type Receipt = {
  id: string;
  hash: string;
  payload: string;
  state: string;
  deliveries: number;
  ack_loss: number;
};
export class LocalTrafficShard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql
        .exec(`CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,hash TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,deliveries INTEGER NOT NULL DEFAULT 0,ack_loss INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS contributions(id TEXT PRIMARY KEY,contributor TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revoked(contributor TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS candidates(window TEXT PRIMARY KEY,payload TEXT NOT NULL,hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS queue_events(id INTEGER PRIMARY KEY AUTOINCREMENT,batch TEXT NOT NULL,hash TEXT NOT NULL,attempt INTEGER NOT NULL,code TEXT NOT NULL);`);
    });
  }
  /** Serialize known errors explicitly across RPC; custom Error prototypes are not a contract. / RPC에서 사용자 오류 원형 대신 명시한 결과를 전달합니다. */
  async run(
    id: string,
    op: string,
    value: unknown,
  ): Promise<
    | { ok: true; json: string }
    | { ok: false; status: number; code: string; en: string; ko: string }
  > {
    try {
      await this.initialize(id);
      let result: unknown;
      if (op === "stage") result = await this.stage(value);
      else if (op === "pending") result = await this.pending();
      else if (op === "arm") result = await this.armAckLoss(value as string);
      else if (op === "apply") {
        record(value, "delivery", ["notice", "attempt"]);
        if (
          typeof value.attempt !== "number" ||
          !Number.isSafeInteger(value.attempt) ||
          value.attempt < 1
        )
          invalid();
        result = await this.apply(value.notice, value.attempt);
      } else if (op === "finalize")
        result = await this.finalize(value as string);
      else if (op === "candidate")
        result = await this.candidate(value as string);
      else if (op === "advance") result = await this.advance(value as string);
      else if (op === "revoke") result = await this.revoke(value as string);
      else if (op === "inspect") result = await this.inspect();
      else invalid();
      return { ok: true, json: JSON.stringify(result ?? null) };
    } catch (e) {
      if (e instanceof AdapterError)
        return {
          ok: false,
          status: e.status,
          code: e.code,
          en: e.en,
          ko: e.ko,
        };
      if (e instanceof InputError)
        return {
          ok: false,
          status: 422,
          code: "INVALID_INPUT",
          en: "Local parity input is invalid.",
          ko: "로컬 비교 입력이 유효하지 않습니다.",
        };
      if (e instanceof IngestionError)
        return {
          ok: false,
          status: e.status,
          code: e.code,
          en: e.message_en,
          ko: e.message_ko,
        };
      throw e;
    }
  }
  private meta(key: string): string | undefined {
    return this.ctx.storage.sql
      .exec<{ v: string }>("SELECT v FROM meta WHERE k=?", key)
      .toArray()[0]?.v;
  }
  private scope(): ParityScope {
    const id = this.meta("scope_id");
    if (!id) invalid();
    const s = configuredScope(this.env.PILOT_SCOPES_JSON, id);
    if (this.meta("identity") !== canonical(s).toString())
      throw new AdapterError(
        409,
        "SCOPE_CHANGED",
        "The durable scope identity changed.",
        "영속 범위 식별이 변경됐습니다.",
      );
    return s;
  }
  private now(): string {
    const now = this.meta("now");
    if (!now) invalid();
    return now;
  }
  private receipt(id: string): Receipt | undefined {
    return this.ctx.storage.sql
      .exec<Receipt>("SELECT * FROM receipts WHERE id=?", id)
      .toArray()[0];
  }
  async initialize(id: string): Promise<void> {
    const s = configuredScope(this.env.PILOT_SCOPES_JSON, id);
    this.ctx.storage.transactionSync(() => {
      const prior = this.meta("identity"),
        bytes = canonical(s).toString();
      if (prior && prior !== bytes)
        throw new AdapterError(
          409,
          "SCOPE_CHANGED",
          "The durable scope identity changed.",
          "영속 범위 식별이 변경됐습니다.",
        );
      if (!prior) {
        this.ctx.storage.sql.exec(
          "INSERT INTO meta(k,v) VALUES(?,?),(?,?),(?,?)",
          "identity",
          bytes,
          "scope_id",
          id,
          "now",
          s.initial_event_time_utc,
        );
      }
    });
  }
  async stage(raw: unknown): Promise<{ code: string; notice: QueueNotice }> {
    return this.ctx.storage.transactionSync(() => {
      const s = this.scope(),
        batch = validateBatch(raw, s, this.now()),
        hash = batchHash(batch),
        prior = this.receipt(batch.batch_id);
      if (prior && prior.hash !== hash)
        throw new AdapterError(
          409,
          "BATCH_CONFLICT",
          "This batch ID has different committed bytes.",
          "같은 배치 ID의 저장 바이트가 다릅니다.",
        );
      if (!prior) {
        const count = this.ctx.storage.sql
          .exec<{ n: number }>("SELECT count(*) AS n FROM receipts")
          .one().n;
        if (count >= 1000)
          throw new AdapterError(
            429,
            "LOCAL_CAPACITY",
            "This bounded local scope is full.",
            "제한된 로컬 범위가 가득 찼습니다.",
          );
        const pending = this.ctx.storage.sql
          .exec<{ n: number }>(
            "SELECT coalesce(sum(json_array_length(payload)),0) AS n FROM receipts WHERE state='PENDING'",
          )
          .one().n;
        const stored = this.ctx.storage.sql
          .exec<{ n: number }>("SELECT count(*) AS n FROM contributions")
          .one().n;
        if (pending + stored + batch.contributions.length > 20000)
          throw new AdapterError(
            429,
            "LOCAL_CAPACITY",
            "This bounded local scope is full.",
            "제한된 로컬 범위가 가득 찼습니다.",
          );
      }
      if (!prior)
        this.ctx.storage.sql.exec(
          "INSERT INTO receipts(id,hash,payload,state) VALUES(?,?,?,?)",
          batch.batch_id,
          hash,
          canonical(batch.contributions).toString(),
          "PENDING",
        );
      return {
        code: prior ? "DUPLICATE" : "ACCEPTED",
        notice: {
          scope_id: s.scope_id,
          batch_id: batch.batch_id,
          sha256: hash,
        },
      };
    });
  }
  async pending(): Promise<QueueNotice[]> {
    const s = this.scope();
    return this.ctx.storage.sql
      .exec<{ id: string; hash: string }>(
        "SELECT id,hash FROM receipts WHERE state='PENDING' ORDER BY id LIMIT 1000",
      )
      .toArray()
      .map((r) => ({ scope_id: s.scope_id, batch_id: r.id, sha256: r.hash }));
  }
  async armAckLoss(id: string): Promise<void> {
    identifier(id, "batch_id");
    this.scope();
    const r = this.receipt(id);
    if (!r || r.state !== "PENDING") invalid();
    this.ctx.storage.sql.exec("UPDATE receipts SET ack_loss=1 WHERE id=?", id);
  }
  async apply(
    raw: unknown,
    attempt: number,
  ): Promise<{ retry: boolean; code: string }> {
    const notice = noticeValid(raw);
    const s = this.scope();
    if (notice.scope_id !== s.scope_id) invalid();
    return this.ctx.storage.transactionSync(() => {
      const r = this.receipt(notice.batch_id);
      let code = "APPLIED",
        retry = false;
      if (!r || r.hash !== notice.sha256) code = "NOTICE_REJECTED";
      else {
        this.ctx.storage.sql.exec(
          "UPDATE receipts SET deliveries=deliveries+1 WHERE id=?",
          r.id,
        );
        if (r.state === "APPLIED" || r.state === "DISCARDED")
          code = "DUPLICATE";
        else {
          const values = parseJson(r.payload) as AggregationContribution[];
          const now = utc(this.now());
          for (const value of values) {
            const start = new Date(
              Math.floor(utc(value.exited_at_utc) / 60000) * 60000,
            ).toISOString();
            if (
              now >= windowTimes(start).retentionUntil ||
              this.ctx.storage.sql
                .exec(
                  "SELECT 1 FROM revoked WHERE contributor=?",
                  value.contributor_id,
                )
                .toArray().length
            )
              continue;
            const payload = canonical(value).toString(),
              prior = this.ctx.storage.sql
                .exec<{ payload: string }>(
                  "SELECT payload FROM contributions WHERE id=?",
                  value.observation_id,
                )
                .toArray()[0];
            if (prior && prior.payload !== payload)
              throw new AdapterError(
                409,
                "OBSERVATION_CONFLICT",
                "Matched observation bytes conflict.",
                "매칭 관측 바이트가 충돌합니다.",
              );
            if (!prior)
              this.ctx.storage.sql.exec(
                "INSERT INTO contributions(id,contributor,payload) VALUES(?,?,?)",
                value.observation_id,
                value.contributor_id,
                payload,
              );
          }
          this.ctx.storage.sql.exec(
            "UPDATE receipts SET state='APPLIED' WHERE id=?",
            r.id,
          );
        }
        if (r.ack_loss > 0) {
          this.ctx.storage.sql.exec(
            "UPDATE receipts SET ack_loss=0 WHERE id=?",
            r.id,
          );
          code = "COMMITTED_ACK_LOST";
          retry = true;
        }
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO queue_events(batch,hash,attempt,code) VALUES(?,?,?,?)",
        notice.batch_id,
        notice.sha256,
        attempt,
        code,
      );
      return { retry, code };
    });
  }
  private contributions(): AggregationContribution[] {
    return this.ctx.storage.sql
      .exec<{ payload: string }>(
        "SELECT payload FROM contributions ORDER BY id",
      )
      .toArray()
      .map((r) => parseJson(r.payload) as AggregationContribution);
  }
  private finalizeNow(window: string): AggregationResult {
    const s = this.scope(),
      now = this.now(),
      result = aggregateWindow(inputFor(s, now, window, this.contributions()));
    if (result.code === "RETENTION_EXPIRED")
      this.ctx.storage.sql.exec(
        "DELETE FROM candidates WHERE window=?",
        window,
      );
    else if (result.code === "FINALIZED")
      this.ctx.storage.sql.exec(
        "INSERT INTO candidates(window,payload,hash) VALUES(?,?,?) ON CONFLICT(window) DO UPDATE SET payload=excluded.payload,hash=excluded.hash",
        window,
        canonical(result.draft).toString(),
        result.canonical_sha256,
      );
    return result;
  }
  async finalize(window: string): Promise<AggregationResult> {
    utc(window);
    return this.ctx.storage.transactionSync(() => this.finalizeNow(window));
  }
  async candidate(window: string): Promise<string | null> {
    utc(window);
    return this.ctx.storage.transactionSync(() => {
      this.scope();
      if (
        !this.ctx.storage.sql
          .exec("SELECT 1 FROM candidates WHERE window=?", window)
          .toArray().length
      )
        return null;
      const result = this.finalizeNow(window);
      return result.code === "FINALIZED"
        ? canonical(result.draft).toString()
        : null;
    });
  }
  async advance(now: string): Promise<string> {
    utc(now);
    return this.ctx.storage.transactionSync(() => {
      this.scope();
      const value = new Date(Math.max(utc(now), utc(this.now()))).toISOString();
      this.ctx.storage.sql.exec("UPDATE meta SET v=? WHERE k='now'", value);
      for (const c of this.contributions()) {
        const start = new Date(
          Math.floor(utc(c.exited_at_utc) / 60000) * 60000,
        ).toISOString();
        if (utc(value) >= windowTimes(start).retentionUntil)
          this.ctx.storage.sql.exec(
            "DELETE FROM contributions WHERE id=?",
            c.observation_id,
          );
      }
      for (const row of this.ctx.storage.sql
        .exec<{ window: string }>("SELECT window FROM candidates")
        .toArray())
        if (utc(value) >= windowTimes(row.window).retentionUntil)
          this.ctx.storage.sql.exec(
            "DELETE FROM candidates WHERE window=?",
            row.window,
          );
      for (const row of this.ctx.storage.sql
        .exec<Receipt>("SELECT * FROM receipts WHERE payload!='[]'")
        .toArray()) {
        const values = parseJson(row.payload) as AggregationContribution[];
        if (
          values.length &&
          values.every(
            (c) =>
              utc(value) >=
              windowTimes(
                new Date(
                  Math.floor(utc(c.exited_at_utc) / 60000) * 60000,
                ).toISOString(),
              ).retentionUntil,
          )
        )
          this.ctx.storage.sql.exec(
            "UPDATE receipts SET state='DISCARDED',payload='[]' WHERE id=?",
            row.id,
          );
      }
      return value;
    });
  }
  async revoke(contributor: string): Promise<void> {
    identifier(contributor, "contributor_id");
    this.ctx.storage.transactionSync(() => {
      this.scope();
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO revoked(contributor) VALUES(?)",
        contributor,
      );
      this.ctx.storage.sql.exec(
        "DELETE FROM contributions WHERE contributor=?",
        contributor,
      );
      for (const row of this.ctx.storage.sql
        .exec<Receipt>("SELECT * FROM receipts WHERE payload!='[]'")
        .toArray()) {
        const values = parseJson(row.payload) as AggregationContribution[],
          kept = values.filter((c) => c.contributor_id !== contributor);
        if (kept.length !== values.length)
          this.ctx.storage.sql.exec(
            "UPDATE receipts SET payload=?,state=? WHERE id=?",
            canonical(kept).toString(),
            row.state === "PENDING" && !kept.length ? "DISCARDED" : row.state,
            row.id,
          );
      }
      this.ctx.storage.sql.exec("DELETE FROM candidates");
    });
  }
  async inspect(): Promise<unknown> {
    const scope = this.scope();
    return {
      scope_id: scope.scope_id,
      namespace: scope.namespace,
      graph_id: scope.graph_id,
      catalog_sha256: sha256(canonical(scope.catalog)),
      now_utc: this.now(),
      receipts: this.ctx.storage.sql
        .exec<Receipt>("SELECT * FROM receipts ORDER BY id")
        .toArray(),
      contributions: this.contributions(),
      revoked: this.ctx.storage.sql
        .exec<{ contributor: string }>(
          "SELECT contributor FROM revoked ORDER BY contributor",
        )
        .toArray(),
      candidates: this.ctx.storage.sql
        .exec<{ window: string; payload: string; hash: string }>(
          "SELECT * FROM candidates ORDER BY window",
        )
        .toArray(),
      queue_events: this.ctx.storage.sql
        .exec<{ batch: string; hash: string; attempt: number; code: string }>(
          "SELECT batch,hash,attempt,code FROM queue_events ORDER BY id",
        )
        .toArray(),
    };
  }
}

async function body(request: Request): Promise<unknown> {
  if (!request.body) invalid();
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      total += v.value.byteLength;
      if (total > BODY_LIMIT) {
        await reader.cancel();
        throw new AdapterError(
          413,
          "BODY_TOO_LARGE",
          "The local request is too large.",
          "로컬 요청이 너무 큽니다.",
        );
      }
      chunks.push(v.value);
    }
  } finally {
    reader.releaseLock();
  }
  return parseJson(Buffer.concat(chunks));
}
function authorized(request: Request, env: Env): boolean {
  if (
    env.PILOT_LOCAL_ONLY !== "true" ||
    !env.PILOT_AUTH_TOKEN ||
    env.PILOT_AUTH_TOKEN.length < 32
  )
    return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    wanted = Buffer.from("Bearer " + env.PILOT_AUTH_TOKEN);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
function failure(e: unknown): Response {
  if (e instanceof AdapterError)
    return response(
      { code: e.code, message_en: e.en, message_ko: e.ko },
      e.status,
    );
  if (e instanceof InputError)
    return response(
      {
        code: "INVALID_INPUT",
        message_en: "Local parity input is invalid.",
        message_ko: "로컬 비교 입력이 유효하지 않습니다.",
      },
      422,
    );
  return response(
    {
      code: "LOCAL_UNAVAILABLE",
      message_en: "The local parity operation did not complete.",
      message_ko: "로컬 비교 작업이 완료되지 않았습니다.",
    },
    503,
  );
}
async function invoke(
  env: Env,
  scope: ParityScope,
  op: string,
  value: unknown = null,
): Promise<unknown> {
  const reply = await env.TRAFFIC_SHARDS.getByName(ownerName(scope)).run(
    scope.scope_id,
    op,
    value,
  );
  if (!reply.ok)
    throw new AdapterError(reply.status, reply.code, reply.en, reply.ko);
  return parseJson(reply.json);
}
const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET")
        return response({
          status: "LOCAL_PARITY_ONLY",
          message_en: "Local post-matching parity adapter.",
          message_ko: "매칭 후 로컬 비교 연결기입니다.",
        });
      if (!authorized(request, env))
        throw new AdapterError(
          401,
          "UNAUTHORIZED",
          "Local internal authorization is required.",
          "로컬 내부 인증이 필요합니다.",
        );
      const match = url.pathname.match(
        /^\/local\/scopes\/([a-z0-9_-]+)\/(batches|flush|advance|finalize|revoke|queue|fault|inspect|candidate)$/,
      );
      if (!match)
        throw new AdapterError(
          404,
          "NOT_FOUND",
          "Local operation not found.",
          "로컬 작업이 없습니다.",
        );
      const scope = configuredScope(env.PILOT_SCOPES_JSON, match[1]!);
      const op = match[2]!;
      if (request.method === "GET" && op === "inspect")
        return response(await invoke(env, scope, "inspect"));
      if (request.method === "GET" && op === "candidate") {
        const window = url.searchParams.get("window_start");
        if (!window) invalid();
        const bytes = await invoke(env, scope, "candidate", window);
        if (bytes !== null && typeof bytes !== "string") invalid();
        return bytes === null
          ? response(
              {
                code: "NO_CANDIDATE",
                message_en: "No current candidate is available.",
                message_ko: "현재 후보가 없습니다.",
              },
              404,
            )
          : new Response(bytes, {
              headers: {
                "content-type": "application/json",
                "cache-control": "no-store",
              },
            });
      }
      if (request.method !== "POST")
        throw new AdapterError(
          405,
          "METHOD_NOT_ALLOWED",
          "This operation requires POST.",
          "이 작업은 POST가 필요합니다.",
        );
      const raw = await body(request);
      if (op === "batches") {
        const result = await invoke(env, scope, "stage", raw);
        record(result, "stage result", ["code", "notice"]);
        const notice = noticeValid(result.notice);
        if ((raw as MatchedBatch).dispatch !== "defer")
          await env.MATCHED_QUEUE.send(notice);
        return response(result, 202);
      }
      if (op === "flush") {
        record(raw, "flush", []);
        const pending = await invoke(env, scope, "pending");
        if (!Array.isArray(pending)) invalid();
        for (const n of pending) await env.MATCHED_QUEUE.send(noticeValid(n));
        return response({ sent: pending.length });
      }
      if (op === "advance") {
        record(raw, "advance", ["now_utc"]);
        return response({
          now_utc: await invoke(env, scope, "advance", raw.now_utc),
        });
      }
      if (op === "finalize") {
        record(raw, "finalize", ["window_start"]);
        return response(await invoke(env, scope, "finalize", raw.window_start));
      }
      if (op === "revoke") {
        record(raw, "revoke", ["contributor_id"]);
        await invoke(env, scope, "revoke", raw.contributor_id);
        return response({ code: "REVOKED" });
      }
      if (op === "queue") {
        const notice = noticeValid(raw);
        if (notice.scope_id !== scope.scope_id) invalid();
        await env.MATCHED_QUEUE.send(notice);
        return response({ code: "ENQUEUED" }, 202);
      }
      if (op === "fault") {
        record(raw, "fault", ["batch_id", "ack_loss_once"]);
        if (raw.ack_loss_once !== true) invalid();
        await invoke(env, scope, "arm", raw.batch_id);
        return response({ code: "ARMED" });
      }
      invalid();
    } catch (e) {
      return failure(e);
    }
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const notice = noticeValid(message.body),
          scope = configuredScope(env.PILOT_SCOPES_JSON, notice.scope_id);
        const result = await invoke(env, scope, "apply", {
          notice,
          attempt: message.attempts,
        });
        record(result, "apply result", ["retry", "code"]);
        if (result.retry === true) message.retry({ delaySeconds: 0 });
        else message.ack();
      } catch {
        message.retry({ delaySeconds: 0 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
export default handler;
