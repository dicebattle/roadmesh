/** Preserve ingestion error type and UTC semantics without importing matching. / 매칭 의존성 없이 기존 수집 오류·UTC 의미 보존. */
import { IngestionError } from "./ingestion_types.js";
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
