/** Dependency-free native/public guidance boundary, shared by gateway, server and browser.
 * 중계·서버·브라우저가 공유하는 외부 의존 없는 엔진/공개 안내 경계입니다. */
export type GuidanceLanguage = "en-US" | "ko-KR";
export interface RouteGuidance {
  schema_version: "0.1";
  language: GuidanceLanguage;
  maneuvers: Array<{
    index: number;
    native_type: number;
    instruction: string;
    distance_m: number;
    duration_s: number;
    begin_shape_index: number;
    end_shape_index: number;
  }>;
}
export function isGuidanceLanguage(value: unknown): value is GuidanceLanguage {
  return value === "en-US" || value === "ko-KR";
}
const invalid = (): never => {
  throw Error("Invalid route guidance / 경로 안내 오류");
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
};
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).length !== expected.length || expected.some(k => !Object.hasOwn(value, k))) invalid();
}
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const start = (type: number) => type >= 1 && type <= 3;
const arrival = (type: number) => type >= 4 && type <= 6;
/** The first increment supports driving maneuvers only; unsupported modes fail closed.
 * 첫 구현은 자동차 안내만 지원하며 다른 이동 수단은 명시적으로 거부합니다. */
export function validateRouteGuidance(
  value: unknown,
  language: GuidanceLanguage,
  shapeCount: number,
  distanceM: number,
  durationS: number,
): asserts value is RouteGuidance {
  const g = object(value);
  keys(g, ["schema_version", "language", "maneuvers"]);
  if (!isGuidanceLanguage(language) || g.schema_version !== "0.1" || g.language !== language ||
      !Number.isSafeInteger(shapeCount) || shapeCount < 2 || !nonnegative(distanceM) || !nonnegative(durationS) ||
      !Array.isArray(g.maneuvers) || g.maneuvers.length < 2 || g.maneuvers.length > 512) invalid();
  let end = 0, distance = 0, time = 0;
  for (const [index, entry] of (g.maneuvers as unknown[]).entries()) {
    const m = object(entry);
    keys(m, ["index", "native_type", "instruction", "distance_m", "duration_s", "begin_shape_index", "end_shape_index"]);
    const t = m.native_type as number, last = index === (g.maneuvers as unknown[]).length - 1;
    if (m.index !== index || !Number.isInteger(t) || !((t >= 1 && t <= 27) || t === 37 || t === 38) ||
        (index === 0 ? !start(t) : start(t)) || (last ? !arrival(t) : arrival(t)) ||
        typeof m.instruction !== "string" || !m.instruction.trim() || m.instruction.length > 1024 ||
        /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u.test(m.instruction) ||
        !nonnegative(m.distance_m) || !nonnegative(m.duration_s) ||
        !Number.isSafeInteger(m.begin_shape_index) || !Number.isSafeInteger(m.end_shape_index) ||
        m.begin_shape_index !== end || Number(m.end_shape_index) < end || Number(m.end_shape_index) >= shapeCount ||
        (last && (m.distance_m !== 0 || m.duration_s !== 0 || m.begin_shape_index !== shapeCount - 1 || m.end_shape_index !== shapeCount - 1))) invalid();
    end = m.end_shape_index as number;
    distance += m.distance_m as number;
    time += m.duration_s as number;
  }
  const count = (g.maneuvers as unknown[]).length;
  // Independent rounded summaries: 0.001 km and 0.001 s in pinned 3.9.1.
  // 고정3.9.1의 각 안내·요약 독립 반올림 오차입니다.
  if (end !== shapeCount - 1 || Math.abs(distance - distanceM) > (count + 1) * 0.5 + 1e-6 ||
      Math.abs(time - durationS) > (count + 1) * 0.0005 + 1e-6) invalid();
}
export function nativeRouteGuidance(
  tripValue: unknown,
  language: GuidanceLanguage,
  shapeCount: number,
  distanceM: number,
  durationS: number,
): RouteGuidance {
  const trip = object(tripValue);
  if (trip.status !== 0 || trip.units !== "kilometers" || trip.language !== language ||
      !Array.isArray(trip.legs) || trip.legs.length !== 1) invalid();
  const leg = object((trip.legs as unknown[])[0]);
  if (!Array.isArray(leg.maneuvers) || leg.maneuvers.length > 512) invalid();
  const maneuvers = (leg.maneuvers as unknown[]).map((entry, index) => {
    const m = object(entry);
    if (m.travel_mode !== "drive" || m.travel_type !== "car" || !nonnegative(m.length)) invalid();
    return {
      index, native_type: m.type as number, instruction: m.instruction as string,
      distance_m: (m.length as number) * 1000, duration_s: m.time as number,
      begin_shape_index: m.begin_shape_index as number, end_shape_index: m.end_shape_index as number,
    };
  });
  const guidance: RouteGuidance = { schema_version: "0.1", language, maneuvers };
  validateRouteGuidance(guidance, language, shapeCount, distanceM, durationS);
  return guidance;
}
/** A request without guidance may not acquire unexpected guidance from upstream.
 * 안내 없는 요청에 상위 응답이 임의의 안내를 붙일 수 없습니다. */
export function validateRequestedGuidance(
  route: { guidance?: unknown; geometry: { coordinates: unknown[] }; distance_m: number; duration_s: number },
  language?: GuidanceLanguage,
): void {
  if (language === undefined) {
    if (Object.hasOwn(route, "guidance")) invalid();
  } else validateRouteGuidance(route.guidance, language, route.geometry.coordinates.length, route.distance_m, route.duration_s);
}
