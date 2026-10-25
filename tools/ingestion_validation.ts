import {
  canonical,
  identifier,
  integer,
  number,
  record,
  sha256,
  text,
} from "./shared.js";
import { validateObservation, validateEnvelope } from "./matching_evidence.js";
import {
  IngestionError,
  type IngestBatch,
  type Principal,
  type StoreConfig,
  type CompletionInput,
} from "./ingestion_types.js";
export function issue(
  status: number,
  code: IngestionError["code"],
  en: string,
  ko: string,
): never {
  throw new IngestionError(status, code, en, ko);
}
export function utc(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    value.startsWith("0000") ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !==
      value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z")
  )
    issue(
      422,
      "OBSERVATION_TIME_INVALID",
      "UTC timestamp is invalid.",
      "UTC 시각이 유효하지 않습니다.",
    );
  return Date.parse(value);
}
export function principalValid(principal: Principal): void {
  identifier(principal.contributor_id, "contributor_id");
  identifier(principal.vehicle_id, "vehicle_id");
  if (principal.vehicle_class !== undefined && !["CAR", "BUS", "OTHER"].includes(principal.vehicle_class))
    issue(422, "INVALID_INPUT", "Vehicle class is unsupported.", "차량 종류를 지원하지 않습니다.");
  if (principal.consent_version !== "pilot-consent-v1")
    issue(
      409,
      "VERSION_MISMATCH",
      "Consent version is unsupported.",
      "동의 버전을 지원하지 않습니다.",
    );
}
export function requireCarPrincipal(principal: Principal): void {
  principalValid(principal);
  if ((principal.vehicle_class ?? "CAR") !== "CAR")
    issue(403, "VEHICLE_NOT_ALLOWED", "Only car observations are admitted to this pilot.", "이 파일럿은 자동차 관측만 접수합니다.");
}
export function batchValid(
  value: unknown,
  principal: Principal,
  config: StoreConfig,
): IngestBatch {
  try {
    requireCarPrincipal(principal);
    record(
      value,
      "batch",
      [
        "schema_version",
        "batch_id",
        "trip_id",
        "batch_seq",
        "is_final",
        "graph_id",
        "matching_policy",
        "consent_version",
        "source_class",
        "trip_start_utc",
        "samples",
      ],
      ["trip_activity"],
    );
    if (
      value.trip_activity !== undefined &&
      value.trip_activity !== "TRAVEL" &&
      value.trip_activity !== "PARKED"
    )
      issue(
        422,
        "INVALID_INPUT",
        "Trip activity is unsupported.",
        "여행 활동을 지원하지 않습니다.",
      );
    if (value.source_class !== "SYNTHETIC")
      issue(
        403,
        "SOURCE_NOT_ALLOWED",
        "Only synthetic pilot observations are allowed.",
        "합성 파일럿 관측만 허용합니다.",
      );
    if (
      value.schema_version !== "0.1" ||
      value.graph_id !== config.graph_id ||
      value.matching_policy !== config.matching_policy ||
      value.consent_version !== principal.consent_version
    )
      issue(
        409,
        "VERSION_MISMATCH",
        "Pinned versions do not match.",
        "고정 버전이 일치하지 않습니다.",
      );
    identifier(value.batch_id, "batch_id");
    identifier(value.trip_id, "trip_id");
    integer(value.batch_seq, "batch_seq", 0, 127);
    if (typeof value.is_final !== "boolean") throw new Error("invalid final");
    const epoch = utc(value.trip_start_utc);
    if (
      !Array.isArray(value.samples) ||
      value.samples.length < 1 ||
      value.samples.length > 60
    )
      throw new Error("invalid samples");
    let previous = -1;
    const ids = new Set<string>();
    for (const raw of value.samples) {
      const sample = validateObservation(raw);
      if (sample.vehicle_id !== principal.vehicle_id)
        issue(
          409,
          "TRIP_CONFLICT",
          "Authenticated vehicle does not match.",
          "인증된 차량과 일치하지 않습니다.",
        );
      if (sample.offset_ms <= previous || ids.has(sample.sample_id))
        throw new Error("sample order");
      previous = sample.offset_ms;
      ids.add(sample.sample_id);
      if (utc(sample.event_time_utc) !== epoch + sample.offset_ms)
        issue(
          422,
          "OBSERVATION_TIME_INVALID",
          "Observation time disagrees with trip start.",
          "관측 시각과 여행 시작이 일치하지 않습니다.",
        );
    }
    return {
      ...value,
      trip_activity: value.trip_activity ?? "TRAVEL",
    } as unknown as IngestBatch;
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    return issue(
      422,
      "INVALID_INPUT",
      "Batch input is invalid.",
      "배치 입력이 유효하지 않습니다.",
    );
  }
}
export const digest = (value: unknown): string => sha256(canonical(value));
export function batchRequestHash(batch: IngestBatch): string {
  const normalized = { ...batch };
  if ((normalized.trip_activity ?? "TRAVEL") === "TRAVEL")
    delete normalized.trip_activity;
  return digest(normalized);
}
export const matchingId = (
  namespace: string,
  contributor: string,
  trip: string,
): string => digest({ namespace, contributor_id: contributor, trip_id: trip });
export function completeValid(value: CompletionInput): void {
  if (!/^[0-9a-f]{64}$/.test(value.semantic_sha256))
    throw new Error("Invalid matching digest / 매칭 해시가 올바르지 않습니다");
  integer(value.matched_samples, "matched_samples", 0, 3001);
  integer(value.excluded_samples, "excluded_samples", 0, 3001);
  if (!Array.isArray(value.accepted) || value.accepted.length > 3001)
    throw new Error("Invalid traversals / 통과 목록이 올바르지 않습니다");
  const ids = new Set<string>();
  for (const item of value.accepted) {
    record(item, "accepted traversal", [
      "traversal_id",
      "edge_id",
      "forward",
      "occurrence",
      "entered_at_utc",
      "exited_at_utc",
      "distance_m",
      "duration_s",
      "source_class",
    ]);
    if (
      !/^[0-9a-f]{64}$/.test(item.traversal_id) ||
      !/^[0-9]+$/.test(item.edge_id) ||
      typeof item.forward !== "boolean" ||
      item.source_class !== "SYNTHETIC" ||
      ids.has(item.traversal_id)
    )
      throw new Error("Invalid traversal / 통과가 올바르지 않습니다");
    ids.add(item.traversal_id);
    integer(item.occurrence, "occurrence", 0, 3000);
    number(item.distance_m, "distance_m", Number.MIN_VALUE, 1000000);
    number(item.duration_s, "duration_s", Number.MIN_VALUE, 300);
    if (
      utc(item.exited_at_utc) <= utc(item.entered_at_utc) ||
      Math.abs(
        (utc(item.exited_at_utc) - utc(item.entered_at_utc)) / 1000 -
          item.duration_s,
      ) > 1e-9
    )
      throw new Error(
        "Invalid traversal duration / 통과 시간이 올바르지 않습니다",
      );
  }
}
