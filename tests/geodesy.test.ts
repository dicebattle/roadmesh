import assert from "node:assert/strict";
import test from "node:test";
import {
  geodesicSphere,
  polylineLength,
  pointAlong,
  projectPolyline,
  sphericalDistance,
} from "../tools/geodesy.js";

test("sphere preserves independent known distances and latitude scaling / 독립 구면 거리·위도 보정", () => {
  assert.ok(
    Math.abs(sphericalDistance([0, 0], [0.001, 0]) - 111.1950802335329) < 1e-8,
  );
  assert.ok(
    Math.abs(sphericalDistance([0, 60], [0.001, 60]) - 55.5975401168) < 1e-6,
  );
  assert.ok(
    Math.abs(sphericalDistance([127, 37], [127, 38]) - 111195.0802335329) <
      1e-7,
  );
});
test("curved polyline distance and interpolation do not use an endpoint chord / 꺾은선 거리·보간은 끝점 직선을 쓰지 않음", () => {
  const line = [
      [127, 37.5],
      [127.001, 37.5],
      [127.001, 37.501],
    ],
    first = sphericalDistance(line[0]!, line[1]!);
  assert.ok(polylineLength(line) > sphericalDistance(line[0]!, line[2]!) + 40);
  assert.ok(sphericalDistance(pointAlong(line, first), line[1]!) < 1e-6);
  const after = pointAlong(line, first + 30);
  assert.ok(Math.abs(sphericalDistance(line[1]!, after) - 30) < 1e-7);
  assert.ok(Math.abs(after[0]! - 127.001) < 1e-9);
});
test("nearest segment projection retains along-polyline distance and tangent / 가까운 선분의 누적 거리·접선", () => {
  const line = [
      [127, 37.5],
      [127.001, 37.5],
      [127.001, 37.501],
    ],
    first = sphericalDistance(line[0]!, line[1]!),
    on = pointAlong(line, first + 20),
    query = geodesicSphere.offset(on, 5, 0),
    projected = projectPolyline(query, line);
  assert.ok(Math.abs(projected.distance_m - 5) < 0.001);
  assert.ok(
    Math.abs(projected.fraction * polylineLength(line) - (first + 20)) < 0.001,
  );
  assert.ok(Math.abs(projected.tangent_radians) < 1e-8);
});
test("metre noise offsets remain metre-bounded away from equator / 적도 밖 미터 잡음의 거리 범위", () => {
  const start = [127.03, 37.5],
    point = geodesicSphere.offset(start, 3, 4);
  assert.ok(Math.abs(sphericalDistance(start, point) - 5) < 1e-7);
  assert.deepEqual(geodesicSphere.offset(start, 0, 0), start);
  assert.throws(() => sphericalDistance([0, 100], [0, 0]));
  assert.throws(() =>
    projectPolyline(start, [
      [127, 37.5],
      [127, 37.5],
    ]),
  );
});
