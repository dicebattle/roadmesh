import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import {
  canonical,
  fail,
  integer,
  number,
  parseJson,
  ROOT,
  sha256,
  text,
} from "./shared.js";
import {
  decodeShape,
  items,
  object,
  type EdgeMapping,
} from "./graph_evidence.js";
import { bundlePath } from "./graph_bundle.js";
import type { SeoulGraphBundle } from "./seoul_types.js";

export const SOURCE_LOCK = join(ROOT, "fixtures/seoul/source.lock.json");
export const SCENES = join(ROOT, "fixtures/seoul/scenes.json");
export function fileSha256(path: string): string {
  const descriptor = openSync(path, "r"),
    hash = createHash("sha256"),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    let count: number;
    while ((count = readSync(descriptor, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, count));
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}
export function verifySource(path: string): void {
  const lock = object(parseJson(readFileSync(SOURCE_LOCK)));
  if (
    !lstatSync(path).isFile() ||
    statSync(path).size !== lock.size_bytes ||
    fileSha256(path) !== lock.sha256
  )
    fail(
      "source",
      "pinned source size/hash mismatch",
      "고정 원본의 크기·해시가 다릅니다",
    );
}
export function inventory(
  directory: string,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(directory, prefix), {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, inventory(directory, name));
    else if (entry.isFile()) result[name] = fileSha256(join(directory, name));
    else
      fail(name, "non-file bundle entry", "일반 파일이 아닌 묶음 항목입니다");
  }
  return result;
}
export function seoulGraphIdentity(value: {
  source_lock_sha256: unknown;
  source_sha256: unknown;
  pbf_sha256: unknown;
  config_sha256: unknown;
  image: unknown;
  engine: unknown;
  tile_sha256: unknown;
}): string {
  return sha256(canonical(value));
}

/** Shapes follow stored edge-info order; engine forward selects directed order.
 * 저장 지형 순서에서 엔진 방향에 따라 전체 방향 지형을 얻습니다. */
export function mapRegionalLocatedEdges(
  response: unknown,
  evidencePath: string,
): EdgeMapping[] {
  text(evidencePath, "locate evidence");
  const mapped = new Map<string, EdgeMapping>();
  for (const location of items(response, "locate")) {
    for (const raw of items(object(location).edges, "locate.edges")) {
      const value = object(raw),
        info = object(value.edge_info),
        edge = object(value.edge),
        access = object(edge.access),
        id = object(value.edge_id).value;
      integer(id, "edge_id.value", 0);
      integer(info.way_id, "way_id", 1);
      if (typeof edge.forward !== "boolean" || typeof access.car !== "boolean")
        fail(
          "locate",
          "missing direction/access",
          "방향·자동차 접근 값이 없습니다",
        );
      const shape = decodeShape(info.shape);
      for (const point of shape) {
        number(point[0], "longitude", -180, 180);
        number(point[1], "latitude", -90, 90);
      }
      const mapping: EdgeMapping = {
        label: `edge-${id}`,
        osm_way_id: info.way_id,
        edge_id: String(id),
        forward: edge.forward,
        engine_forward: edge.forward,
        car_access: access.car,
        source_geometry: shape,
        directed_geometry: edge.forward ? shape : [...shape].reverse(),
        evidence_path: evidencePath,
      };
      const previous = mapped.get(mapping.edge_id);
      if (previous && !canonical(previous).equals(canonical(mapping)))
        fail(
          "locate",
          "conflicting repeated directed edge",
          "반복된 방향 구간의 증거가 다릅니다",
        );
      mapped.set(mapping.edge_id, mapping);
    }
  }
  return [...mapped.values()];
}
export function boundsOf(
  coordinates: number[][],
): [number, number, number, number] {
  if (!coordinates.length)
    fail("geometry", "empty coordinates", "좌표가 없습니다");
  return [
    Math.min(...coordinates.map((p) => p[0]!)),
    Math.min(...coordinates.map((p) => p[1]!)),
    Math.max(...coordinates.map((p) => p[0]!)),
    Math.max(...coordinates.map((p) => p[1]!)),
  ];
}
export function deriveScene(
  scene: Record<string, unknown>,
  routeValue: unknown,
  traceValue: unknown,
  locateValue: unknown,
  evidencePath: string,
): { route: SeoulGraphBundle["routes"][number]; edges: EdgeMapping[] } {
  const trip = object(object(routeValue).trip),
    legs = items(trip.legs);
  if (trip.status !== 0 || legs.length !== 1)
    fail(
      "route",
      "one successful leg required",
      "성공한 경로 구간 하나가 필요합니다",
    );
  const routeShape = decodeShape(object(legs[0]).shape),
    trace = object(traceValue),
    shape = decodeShape(trace.shape),
    rawEdges = items(trace.edges);
  if (
    routeShape.length !== shape.length ||
    routeShape.some((point, index) =>
      point.some(
        (value, axis) => Math.abs(value - shape[index]![axis]!) > 0.00000101,
      ),
    ) ||
    rawEdges.length < 3
  )
    fail(
      "trace",
      "route geometry/edge sequence mismatch",
      "경로 지형·구간 순서가 다릅니다",
    );
  const all = mapRegionalLocatedEdges(locateValue, evidencePath),
    selected: EdgeMapping[] = [];
  let previousIndex = 0;
  for (let index = 0; index < rawEdges.length; index++) {
    const edge = object(rawEdges[index]);
    integer(edge.id, "trace.id", 0);
    integer(edge.way_id, "trace.way_id", 1);
    integer(edge.begin_shape_index, "trace.begin", 0, shape.length - 1);
    integer(edge.end_shape_index, "trace.end", 1, shape.length - 1);
    if (
      edge.begin_shape_index !== previousIndex ||
      edge.end_shape_index <= previousIndex
    )
      fail(
        "trace",
        "noncontiguous shape indices",
        "지형 인덱스가 연속되지 않습니다",
      );
    previousIndex = edge.end_shape_index;
    if (index === 0 || index === rawEdges.length - 1) continue;
    const mapping = all.find((item) => item.edge_id === String(edge.id));
    if (
      !mapping ||
      !mapping.car_access ||
      mapping.osm_way_id !== edge.way_id ||
      mapping.engine_forward !== edge.forward
    )
      fail(
        "trace",
        "missing verified full directed car edge",
        "검증된 전체 방향 자동차 구간이 없습니다",
      );
    const clipped = shape.slice(
      edge.begin_shape_index,
      edge.end_shape_index + 1,
    );
    if (!canonical(clipped).equals(canonical(mapping.directed_geometry)))
      fail(
        "trace",
        "interior shape differs from located full geometry",
        "내부 구간 지형이 실제 조회 전체 지형과 다릅니다",
      );
    selected.push(mapping);
  }
  if (previousIndex !== shape.length - 1 || selected.length > 128)
    fail(
      "trace",
      "incomplete/oversized regional route",
      "지역 경로가 불완전하거나 너무 깁니다",
    );
  const coordinates = selected.flatMap((edge) => edge.directed_geometry);
  return {
    route: {
      route_id: String(scene.route_id),
      name_en: String(scene.name_en),
      name_ko: String(scene.name_ko),
      edge_ids: selected.map((e) => e.edge_id),
      bounds: boundsOf(coordinates),
    },
    edges: selected,
  };
}
export function selectContext(
  raw: string,
  routes: SeoulGraphBundle["routes"],
): {
  roads: SeoulGraphBundle["context_roads"];
  full_count: number;
  skipped_log_lines: number;
} {
  const roads: SeoulGraphBundle["context_roads"] = [];
  let full_count = 0,
    skipped_log_lines = 0;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const [encoded, ...names] = line.split("\t");
    if (!encoded || !/^[?-~]+$/.test(encoded)) {
      if (
        /^\d{4}-\d\d-\d\d .*\[(?:INFO|WARN|ERROR)\]/.test(
          line.replace(/\x1b\[[0-9;]*m/g, ""),
        )
      ) {
        skipped_log_lines++;
        continue;
      }
      fail(
        "export",
        "invalid non-polyline export row",
        "도로 내보내기에 잘못된 줄이 있습니다",
      );
    }
    const coordinates = decodeShape(encoded);
    for (const point of coordinates) {
      number(point[0], "export.lon", -180, 180);
      number(point[1], "export.lat", -90, 90);
    }
    full_count++;
    const b = boundsOf(coordinates);
    if (
      routes.some(
        ({ bounds: r }) =>
          b[2] >= r[0] - 0.003 &&
          b[0] <= r[2] + 0.003 &&
          b[3] >= r[1] - 0.003 &&
          b[1] <= r[3] + 0.003,
      )
    )
      roads.push({ name: names.join(" / "), coordinates });
  }
  if (!full_count || !roads.length)
    fail("export", "empty context geometry", "배경 도로 지형이 비어 있습니다");
  return { roads, full_count, skipped_log_lines };
}
export function loadSeoulGraph(directory: string): SeoulGraphBundle {
  directory = resolve(directory);
  const read = (name: string) => readFileSync(bundlePath(directory, name));
  const raw = read("manifest.json"),
    m = object(parseJson(raw));
  if (
    m.schema_version !== "seoul-0.1" ||
    m.fixture_id !== "seoul-osm-20261023-v1" ||
    m.status !== "PASS" ||
    m.cleanup_verified !== true ||
    m.engine_executed !== true ||
    m.graph_loaded !== true ||
    m.geometry_policy !== "geodesic-sphere-v1" ||
    m.direction_basis !== "engine_forward"
  )
    fail(
      "manifest",
      "completed Seoul graph required",
      "완료된 서울 그래프가 필요합니다",
    );
  const files = object(m.files_sha256),
    actual = inventory(directory);
  delete actual["manifest.json"];
  if (
    !canonical(Object.keys(files).sort()).equals(
      canonical(Object.keys(actual).sort()),
    )
  )
    fail(
      "manifest",
      "incomplete file inventory",
      "파일 목록이 완전하지 않습니다",
    );
  for (const [name, expected] of Object.entries(files)) {
    if (actual[name] !== expected)
      fail(name, "bundle hash mismatch", "묶음 해시가 다릅니다");
    bundlePath(directory, name);
  }
  if (
    sha256(read("source.lock.json")) !== sha256(readFileSync(SOURCE_LOCK)) ||
    sha256(read("scenes.json")) !== sha256(readFileSync(SCENES))
  )
    fail(
      "source lock",
      "unsupported source/scenes",
      "지원하지 않는 원본·장면입니다",
    );
  const source = object(m.map_source);
  const lock = object(parseJson(read("source.lock.json")));
  const verification = object(parseJson(read("source-verification.json")));
  if (
    m.source_verified_at_build !== true ||
    source.source_id !== lock.source_id ||
    source.file_name !== lock.file_name ||
    source.url !== lock.url ||
    verification.sha256 !== lock.sha256 ||
    verification.size_bytes !== lock.size_bytes ||
    verification.source_id !== lock.source_id ||
    typeof verification.verified_before_extract_utc !== "string" ||
    typeof verification.verified_after_build_utc !== "string"
  )
    fail(
      "source verification",
      "missing build source verification",
      "생성 시 원본 검증 증거가 없습니다",
    );
  if (
    source.sha256 !== lock.sha256 ||
    source.size_bytes !== lock.size_bytes ||
    m.source_lock_sha256 !== files["source.lock.json"] ||
    m.pbf_sha256 !== files["seoul.osm.pbf"] ||
    m.config_sha256 !== files["config.json"]
  )
    fail(
      "source",
      "source/extract/config binding mismatch",
      "원본·추출·설정 연결이 다릅니다",
    );
  const tile_sha256 = object(m.tile_sha256),
    tileFiles = Object.fromEntries(
      Object.entries(actual)
        .filter(([p]) => p.startsWith("tiles/"))
        .map(([p, h]) => [p.slice(6), h]),
    );
  if (
    !Object.keys(tileFiles).some((p) => p.endsWith(".gph")) ||
    !canonical(tileFiles).equals(canonical(tile_sha256))
  )
    fail("tiles", "tile inventory mismatch", "타일 목록이 다릅니다");
  const graphId = seoulGraphIdentity({
    source_lock_sha256: m.source_lock_sha256,
    source_sha256: source.sha256,
    pbf_sha256: m.pbf_sha256,
    config_sha256: m.config_sha256,
    image: m.image,
    engine: m.engine,
    tile_sha256,
  });
  if (graphId !== m.graph_id)
    fail(
      "graph_id",
      "actual graph bytes identity mismatch",
      "실제 그래프 바이트 식별자가 다릅니다",
    );
  const routes: SeoulGraphBundle["routes"] = [],
    edgeMap = new Map<string, EdgeMapping>();
  const scenes = items(object(parseJson(read("scenes.json"))).scenes);
  for (const item of scenes) {
    const scene = object(item),
      id = String(scene.route_id);
    const expectedRequest = {
      locations: scene.locations,
      costing: "auto",
      units: "kilometers",
      language: "en-US",
    };
    if (
      !canonical(parseJson(read(`route-${id}.request.json`))).equals(
        canonical(expectedRequest),
      )
    )
      fail(
        "route",
        "request differs from fixed scene",
        "요청이 고정 장면과 다릅니다",
      );
    const routeResponse = parseJson(read(`route-${id}.response.json`)),
      trace = parseJson(read(`trace-${id}.response.json`));
    const routeShape = object(
      items(object(object(routeResponse).trip).legs)[0],
    ).shape;
    if (
      !canonical(parseJson(read(`trace-${id}.request.json`))).equals(
        canonical(regionalTraceRequest(routeShape)),
      ) ||
      !canonical(parseJson(read(`locate-${id}.request.json`))).equals(
        canonical(regionalLocateRequest(trace)),
      )
    )
      fail(
        "engine requests",
        "trace/locate request reconstruction mismatch",
        "경로·조회 요청 재구성이 다릅니다",
      );
    const derived = deriveScene(
      scene,
      routeResponse,
      trace,
      parseJson(read(`locate-${id}.response.json`)),
      `locate-${id}.response.json`,
    );
    routes.push(derived.route);
    for (const edge of derived.edges) {
      const previous = edgeMap.get(edge.edge_id);
      if (
        previous &&
        !canonical({ ...previous, evidence_path: "" }).equals(
          canonical({ ...edge, evidence_path: "" }),
        )
      )
        fail("edges", "conflicting scene edge", "장면 구간 증거가 다릅니다");
      if (!previous) edgeMap.set(edge.edge_id, edge);
    }
  }
  const edges = [...edgeMap.values()];
  if (
    !canonical(parseJson(read("routes.json"))).equals(canonical(routes)) ||
    !canonical(parseJson(read("edge-map.json"))).equals(canonical(edges))
  )
    fail(
      "inventory",
      "scene inventory differs from original evidence",
      "장면 목록이 원본 증거와 다릅니다",
    );
  const context = selectContext(
    read("context-edges.tsv").toString("utf8"),
    routes,
  );
  if (
    !canonical(parseJson(read("context-roads.json"))).equals(
      canonical(context.roads),
    ) ||
    m.context_full_count !== context.full_count ||
    m.context_selected_count !== context.roads.length ||
    m.context_skipped_log_lines !== context.skipped_log_lines
  )
    fail(
      "context",
      "display geometry differs from raw export",
      "표시 지형이 원본 내보내기와 다릅니다",
    );
  return {
    directory,
    graphId,
    manifest: m,
    manifestSha256: sha256(raw),
    fixture: { fixture_id: "seoul-osm-20261023-v1" },
    geometry_policy: "geodesic-sphere-v1",
    edges,
    routes,
    context_roads: context.roads,
  };
}

export function regionalTraceRequest(shape: unknown): Record<string, unknown> {
  return {
    encoded_polyline: shape,
    shape_match: "edge_walk",
    costing: "auto",
    filters: {
      action: "include",
      attributes: [
        "edge.id",
        "edge.way_id",
        "edge.names",
        "edge.length",
        "edge.begin_shape_index",
        "edge.end_shape_index",
        "edge.forward",
        "shape",
      ],
    },
  };
}
export function regionalLocateRequest(
  traceValue: unknown,
): Record<string, unknown> {
  const trace = object(traceValue),
    shape = decodeShape(trace.shape),
    edges = items(trace.edges);
  const locations = edges.slice(1, -1).map((raw) => {
    const edge = object(raw),
      begin = Number(edge.begin_shape_index),
      end = Number(edge.end_shape_index);
    let selected = begin,
      max = -1;
    for (let i = begin; i < end; i++) {
      const a = shape[i]!,
        b = shape[i + 1]!,
        distance =
          (a[0]! - b[0]!) ** 2 * Math.cos((a[1]! * Math.PI) / 180) ** 2 +
          (a[1]! - b[1]!) ** 2;
      if (distance > max) {
        max = distance;
        selected = i;
      }
    }
    const a = shape[selected]!,
      b = shape[selected + 1]!;
    return {
      lon: (a[0]! + b[0]!) / 2,
      lat: (a[1]! + b[1]!) / 2,
      radius: 30,
      search_cutoff: 50,
      minimum_reachability: 0,
    };
  });
  return { locations, costing: "auto", verbose: true };
}
