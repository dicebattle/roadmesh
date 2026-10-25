/** Shared native route policy and bounded domain failures / 공통 엔진 경로 정책·제한된 업무 실패. */
import { lstatSync, readFileSync } from "node:fs";
import { parseJson, record } from "./shared.js";
import { trafficReject } from "./traffic_bundle.js";
import type { TrafficRouteRequest } from "./traffic_types.js";

export type RouteRejectionReason = "NO_SUITABLE_ROAD" | "NO_PATH";
export type RouteNativeCode = 170 | 171 | 442;
export function routeRejectionReason(
  code: number,
): RouteRejectionReason | null {
  return code === 171
    ? "NO_SUITABLE_ROAD"
    : code === 170 || code === 442
      ? "NO_PATH"
      : null;
}
export class NativeRouteRejection extends Error {
  readonly reason: RouteRejectionReason;
  constructor(readonly native_code: RouteNativeCode) {
    super("The engine rejected this route / 엔진이 이 경로를 거부했습니다");
    this.reason = routeRejectionReason(native_code)!;
  }
}
export function nativeRouteRequest(
  request: Pick<TrafficRouteRequest, "locations" | "snap_policy" | "guidance_language">,
) {
  return {
    locations:
      request.snap_policy === "nearest_road_100m"
        ? request.locations.map((p) => ({
            ...p,
            search_cutoff: 100,
            minimum_reachability: 0,
          }))
        : request.locations,
    costing: "auto",
    units: "kilometers",
    language: request.guidance_language ?? "en-US",
    date_time: { type: 0 },
  };
}
/** Only original route HTTP400 may become a domain rejection; upstream text stays private.
 * 실제 경로 HTTP400만 업무 거부로 바꾸며 상위 오류 문장은 비공개로 유지합니다. */
export function readNativeRouteRejection(
  path: string,
  status: string,
): NativeRouteRejection {
  if (status !== "400") trafficReject("ENGINE_HTTP_ERROR");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    trafficReject("ENGINE_RESPONSE_LIMIT");
  try {
    const value = parseJson(readFileSync(path));
    record(value, "native error", [
      "error_code",
      "error",
      "status_code",
      "status",
    ]);
    if (
      value.status_code !== 400 ||
      value.status !== "Bad Request" ||
      typeof value.error !== "string" ||
      !value.error.length ||
      typeof value.error_code !== "number" ||
      !Number.isSafeInteger(value.error_code) ||
      !routeRejectionReason(value.error_code)
    )
      throw Error();
    return new NativeRouteRejection(value.error_code as RouteNativeCode);
  } catch {
    trafficReject("ENGINE_HTTP_ERROR");
  }
}
