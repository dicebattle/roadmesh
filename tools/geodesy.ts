import { fail } from "./input_error.js";
export const SPHERE_RADIUS_M = 6371008.8;
const rad = Math.PI / 180,
  deg = 180 / Math.PI;
export interface Projection {
  distance_m: number;
  fraction: number;
  coordinate: number[];
  tangent_radians: number;
}
export interface GeometryStrategy {
  distance(a: number[], b: number[]): number;
  length(line: number[][]): number;
  position(line: number[][], offset_m: number): number[];
  offset(point: number[], east_m: number, north_m: number): number[];
  project(point: number[], line: number[][]): Projection;
}
function valid(point: number[]): void {
  if (
    point.length !== 2 ||
    !point.every(Number.isFinite) ||
    Math.abs(point[0]!) > 180 ||
    Math.abs(point[1]!) > 90
  )
    fail(
      "geometry",
      "invalid geographic coordinate",
      "유효하지 않은 지리 좌표입니다",
    );
}
export function sphericalDistance(a: number[], b: number[]): number {
  valid(a);
  valid(b);
  const p = a[1]! * rad,
    q = b[1]! * rad,
    dLat = q - p,
    dLon = (b[0]! - a[0]!) * rad,
    h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(p) * Math.cos(q) * Math.sin(dLon / 2) ** 2;
  return (
    2 *
    SPHERE_RADIUS_M *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
function bearing(a: number[], b: number[]): number {
  const p = a[1]! * rad,
    q = b[1]! * rad,
    dl = (b[0]! - a[0]!) * rad;
  return Math.atan2(
    Math.sin(dl) * Math.cos(q),
    Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(dl),
  );
}
function destination(
  point: number[],
  distance: number,
  heading: number,
): number[] {
  const p = point[1]! * rad,
    l = point[0]! * rad,
    d = distance / SPHERE_RADIUS_M,
    q = Math.asin(
      Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(heading),
    ),
    r =
      l +
      Math.atan2(
        Math.sin(heading) * Math.sin(d) * Math.cos(p),
        Math.cos(d) - Math.sin(p) * Math.sin(q),
      );
  return [((r * deg + 540) % 360) - 180, q * deg];
}
export function polylineLength(line: number[][]): number {
  if (line.length < 2)
    fail(
      "geometry",
      "polyline needs two points",
      "꺾은선 좌표가 두 개 이상 필요합니다",
    );
  return line
    .slice(1)
    .reduce((sum, p, index) => sum + sphericalDistance(line[index]!, p), 0);
}
export function pointAlong(line: number[][], offset: number): number[] {
  let remaining = Math.max(0, offset);
  for (let index = 1; index < line.length; index++) {
    const a = line[index - 1]!,
      b = line[index]!,
      length = sphericalDistance(a, b);
    if (remaining <= length && length > 0)
      return remaining === 0
        ? [...a]
        : destination(a, remaining, bearing(a, b));
    remaining -= length;
  }
  return [...line.at(-1)!];
}
export function projectPolyline(point: number[], line: number[][]): Projection {
  valid(point);
  const total = polylineLength(line);
  if (!(total > 0))
    fail("geometry", "zero-length polyline", "길이가0인 꺾은선입니다");
  let cumulative = 0,
    best: Projection | undefined;
  for (let index = 1; index < line.length; index++) {
    const a = line[index - 1]!,
      b = line[index]!,
      length = sphericalDistance(a, b);
    if (!length) continue;
    const distance = sphericalDistance(a, point) / SPHERE_RADIUS_M,
      delta = bearing(a, point) - bearing(a, b),
      along =
        Math.atan2(Math.sin(distance) * Math.cos(delta), Math.cos(distance)) *
        SPHERE_RADIUS_M,
      clamped = Math.max(0, Math.min(length, along)),
      coordinate =
        clamped === 0
          ? [...a]
          : clamped === length
            ? [...b]
            : destination(a, clamped, bearing(a, b)),
      distance_m = sphericalDistance(point, coordinate);
    if (!best || distance_m < best.distance_m)
      best = {
        distance_m,
        fraction: (cumulative + clamped) / total,
        coordinate,
        tangent_radians: bearing(a, b),
      };
    cumulative += length;
  }
  return best!;
}
export const geodesicSphere: GeometryStrategy = {
  distance: sphericalDistance,
  length: polylineLength,
  position: pointAlong,
  offset: (point, east, north) => {
    valid(point);
    const d = Math.hypot(east, north);
    return d ? destination(point, d, Math.atan2(east, north)) : [...point];
  },
  project: projectPolyline,
};
