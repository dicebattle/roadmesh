import {
  canonical,
  identifier,
  parseJson,
  record,
  sha256,
} from "../../tools/value_contract.js";
import { utc } from "../../tools/time_validation.js";
import {
  aggregateWindow,
  normalizedCatalog,
  windowTimes,
} from "../../tools/traffic_aggregation.js";
import type {
  AggregationContribution,
  AggregationInput,
  CatalogEdge,
} from "../../tools/aggregation_types.js";
export const BODY_LIMIT = 2097152;
export interface ParityScope {
  scope_id: string;
  namespace: string;
  graph_id: string;
  shard_id: string;
  catalog: CatalogEdge[];
  initial_event_time_utc: string;
}
export interface QueueNotice {
  scope_id: string;
  batch_id: string;
  sha256: string;
}
export interface MatchedBatch {
  batch_id: string;
  contributions: AggregationContribution[];
  dispatch?: "send" | "defer";
}
export class AdapterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly en: string,
    readonly ko: string,
  ) {
    super(`${en} / ${ko}`);
  }
}
export function invalid(): never {
  throw new AdapterError(
    422,
    "INVALID_INPUT",
    "Local parity input is invalid.",
    "로컬 비교 입력이 유효하지 않습니다.",
  );
}
export function scopes(raw: string): ParityScope[] {
  const list = parseJson(raw);
  if (!Array.isArray(list) || !list.length || list.length > 32) invalid();
  const ids = new Set<string>(),
    owners = new Set<string>();
  return list.map((value) => {
    record(value, "scope", [
      "scope_id",
      "namespace",
      "graph_id",
      "shard_id",
      "catalog",
      "initial_event_time_utc",
    ]);
    for (const k of ["scope_id", "namespace", "shard_id"])
      identifier(value[k], k);
    if (
      typeof value.graph_id !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.graph_id)
    )
      invalid();
    utc(value.initial_event_time_utc);
    const catalog = normalizedCatalog(value.catalog as CatalogEdge[]);
    const v: ParityScope = {
      scope_id: value.scope_id as string,
      namespace: value.namespace as string,
      graph_id: value.graph_id,
      shard_id: value.shard_id as string,
      catalog,
      initial_event_time_utc: value.initial_event_time_utc as string,
    };
    const key = ownerName(v);
    if (ids.has(v.scope_id) || owners.has(key)) invalid();
    ids.add(v.scope_id);
    owners.add(key);
    return v;
  });
}
export const ownerName = (s: ParityScope) =>
  `${s.namespace}/${s.graph_id}/shard-v1/${s.shard_id}`;
export function configuredScope(raw: string, id: string): ParityScope {
  const s = scopes(raw).find((s) => s.scope_id === id);
  if (!s)
    throw new AdapterError(
      404,
      "UNKNOWN_SCOPE",
      "This local scope is not configured.",
      "설정되지 않은 로컬 범위입니다.",
    );
  return s;
}
export const inputFor = (
  s: ParityScope,
  now: string,
  window: string,
  contributions: AggregationContribution[],
): AggregationInput => ({
  namespace: s.namespace,
  graph_id: s.graph_id,
  source_class: "SYNTHETIC",
  window_start: window,
  now_utc: now,
  catalog: s.catalog,
  contributions,
});
export function validateBatch(
  raw: unknown,
  s: ParityScope,
  now: string,
): MatchedBatch {
  record(raw, "matched batch", ["batch_id", "contributions"], ["dispatch"]);
  identifier(raw.batch_id, "batch_id");
  if (
    raw.dispatch !== undefined &&
    raw.dispatch !== "send" &&
    raw.dispatch !== "defer"
  )
    invalid();
  if (!Array.isArray(raw.contributions) || raw.contributions.length > 2000)
    invalid();
  const values = raw.contributions as AggregationContribution[];
  for (const c of values) {
    if (c.source_class !== "SYNTHETIC")
      throw new AdapterError(
        403,
        "SOURCE_NOT_ALLOWED",
        "Only synthetic matched pilot data is allowed.",
        "합성 매칭 파일럿 자료만 허용합니다.",
      );
    if (utc(c.available_at_utc) > utc(now)) invalid();
    if (
      utc(now) >=
      windowTimes(
        new Date(
          Math.floor(utc(c.exited_at_utc) / 60000) * 60000,
        ).toISOString(),
      ).retentionUntil
    )
      throw new AdapterError(
        410,
        "RETENTION_EXPIRED",
        "Matched data is past its retention boundary.",
        "매칭 자료의 보관 기한이 지났습니다.",
      );
  }
  // The same core validates full metadata even for an open window. / 열린 창에서도 같은 규칙으로 전체 정보를 검사합니다.
  try {
    aggregateWindow(
      inputFor(
        s,
        now,
        new Date(Math.floor(utc(now) / 60000) * 60000).toISOString(),
        values,
      ),
    );
  } catch {
    invalid();
  }
  return {
    batch_id: raw.batch_id,
    contributions: values,
    ...(raw.dispatch ? { dispatch: raw.dispatch } : {}),
  } as MatchedBatch;
}
export function noticeValid(raw: unknown): QueueNotice {
  record(raw, "queue notice", ["scope_id", "batch_id", "sha256"]);
  identifier(raw.scope_id, "scope_id");
  identifier(raw.batch_id, "batch_id");
  if (typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.sha256))
    invalid();
  return { scope_id: raw.scope_id, batch_id: raw.batch_id, sha256: raw.sha256 };
}
export const batchHash = (batch: MatchedBatch) =>
  sha256(
    canonical({ batch_id: batch.batch_id, contributions: batch.contributions }),
  );
