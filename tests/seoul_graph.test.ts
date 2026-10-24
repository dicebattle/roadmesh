import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mapRegionalLocatedEdges,
  selectContext,
  seoulGraphIdentity,
  verifySource,
  loadSeoulGraph,
} from "../tools/seoul_bundle.js";

function encode(points: number[][]): string {
  let lat = 0,
    lon = 0,
    result = "";
  for (const point of points) {
    const y = Math.round(point[1]! * 1e6),
      x = Math.round(point[0]! * 1e6);
    for (const diff of [y - lat, x - lon]) {
      let value = diff < 0 ? -diff * 2 - 1 : diff * 2;
      while (value >= 32) {
        result += String.fromCharCode((value % 32) + 95);
        value = Math.floor(value / 32);
      }
      result += String.fromCharCode(value + 63);
    }
    lat = y;
    lon = x;
  }
  return result;
}
const geometry = [
  [127, 37.5],
  [127.0002, 37.5001],
  [127.0004, 37.5],
];
function located(forward = true, car = true, id = 123): unknown {
  return [
    {
      edges: [
        {
          edge_id: { value: id },
          edge_info: { way_id: 55, shape: encode(geometry) },
          edge: { forward, access: { car } },
        },
      ],
    },
  ];
}
test("regional mapping preserves full curved geometry and engine direction / 지역 구간 전체 곡선·엔진 방향", () => {
  const [edge] = mapRegionalLocatedEdges(located(false), "locate.json");
  assert.equal(edge!.forward, false);
  assert.equal(edge!.engine_forward, false);
  assert.equal(edge!.label, "edge-123");
  assert.deepEqual(edge!.directed_geometry, [...geometry].reverse());
  assert.deepEqual(edge!.source_geometry, geometry);
});
test("regional mapping keeps split way IDs distinct and preserves access / 분할 구간·접근 값 보존", () => {
  const a = located() as Array<{ edges: unknown[] }>;
  const b = located(true, false, 124) as Array<{ edges: unknown[] }>;
  const edges = mapRegionalLocatedEdges([...a, ...b], "locate.json");
  assert.equal(edges.length, 2);
  assert.equal(edges[1]!.car_access, false);
  assert.equal(edges[0]!.osm_way_id, edges[1]!.osm_way_id);
});
test("regional mapping rejects malformed and conflicting original evidence / 잘못되거나 충돌하는 원문 거부", () => {
  assert.throws(() =>
    mapRegionalLocatedEdges(
      [
        {
          edges: [
            {
              edge_id: { value: 1 },
              edge_info: { way_id: 2, shape: "bad" },
              edge: { forward: true, access: { car: true } },
            },
          ],
        },
      ],
      "locate.json",
    ),
  );
  assert.throws(
    () =>
      mapRegionalLocatedEdges(
        [...(located() as unknown[]), ...(located(false) as unknown[])],
        "locate.json",
      ),
    /conflicting/,
  );
});
test("context geometry is selected from exact decoded export with transparent counts / 실제 내보내기 배경·개수", () => {
  const route = {
    route_id: "test",
    name_en: "Test",
    name_ko: "검사",
    edge_ids: ["123"],
    bounds: [127, 37.5, 127.0004, 37.5001] as [number, number, number, number],
  };
  const raw = `2026-10-24 10:00:00 [INFO] Exporting edges\n${encode(geometry)}\tCurved road\n${encode(
    [
      [128, 38],
      [128.01, 38.01],
    ],
  )}\tFar road\n`;
  const context = selectContext(raw, [route]);
  assert.equal(context.full_count, 2);
  assert.equal(context.skipped_log_lines, 1);
  assert.equal(context.roads.length, 1);
  assert.deepEqual(context.roads[0]!.coordinates, geometry);
  assert.throws(() => selectContext("broken\trow\n", [route]));
});
test("actual tile bytes affect graph identity / 실제 타일 바이트 식별 연결", () => {
  const base = {
    source_lock_sha256: "lock",
    source_sha256: "source",
    pbf_sha256: "pbf",
    config_sha256: "config",
    image: { id: "image" },
    engine: { version: "3.9.1" },
    tile_sha256: { "0/a.gph": "one" },
  };
  assert.notEqual(
    seoulGraphIdentity(base),
    seoulGraphIdentity({ ...base, tile_sha256: { "0/a.gph": "two" } }),
  );
});
test("wrong source and incomplete bundle fail closed / 잘못된 원본·미완료 묶음 거부", () => {
  const path = mkdtempSync(join(tmpdir(), "routelens-seoul-unit-"));
  try {
    writeFileSync(join(path, "wrong.pbf"), "wrong");
    assert.throws(() => verifySource(join(path, "wrong.pbf")), /source/);
    writeFileSync(join(path, "manifest.json"), "{}");
    assert.throws(() => loadSeoulGraph(path), /completed Seoul/);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
