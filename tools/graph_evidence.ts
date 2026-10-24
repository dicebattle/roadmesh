import { fail, identifier, integer, number, record, text } from "./shared.js";
export interface Way {
  label: string;
  osm_way_id: number;
  from: number;
  to: number;
  oneway: boolean;
  from_coordinate: number[];
  to_coordinate: number[];
}
export interface GraphLocation {
  lon: number;
  lat: number;
  search_cutoff: number;
  radius: number;
  minimum_reachability: number;
}
export interface RouteCase {
  id: string;
  locations: GraphLocation[];
  expected_ways?: number[];
  expected_error_code?: number;
  first_way?: number;
  last_way?: number;
  forbidden_transition?: number[];
}
export interface GraphFixture {
  schema_version: string;
  fixture_id: string;
  ways: Way[];
  restriction: { from_way: number; via_node: number; to_way: number };
  routes: RouteCase[];
}
export interface EdgeMapping {
  label: string;
  osm_way_id: number;
  edge_id: string;
  forward: boolean;
  engine_forward: boolean;
  car_access: boolean;
  source_geometry: number[][];
  directed_geometry: number[][];
  evidence_path: string;
}
export function object(
  value: unknown,
  path = "engine",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "missing object evidence", "객체 증거가 없습니다");
  return value as Record<string, unknown>;
}
export function items(value: unknown, path = "engine"): unknown[] {
  if (!Array.isArray(value))
    fail(path, "missing array evidence", "배열 증거가 없습니다");
  return value;
}
export function decodeShape(encoded: unknown): number[][] {
  text(encoded, "shape");
  const polyline = encoded;
  const coordinates: number[][] = [];
  let index = 0,
    latitude = 0,
    longitude = 0;
  function component(): number {
    let shift = 0,
      result = 0,
      byte: number;
    do {
      if (index >= polyline.length || shift > 30)
        fail(
          "shape",
          "invalid encoded geometry",
          "인코딩된 지형이 올바르지 않습니다",
        );
      byte = polyline.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63)
        fail(
          "shape",
          "invalid encoded geometry",
          "인코딩된 지형이 올바르지 않습니다",
        );
      result += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return result % 2 ? -(result + 1) / 2 : result / 2;
  }
  while (index < polyline.length) {
    latitude += component();
    longitude += component();
    coordinates.push([longitude / 1e6, latitude / 1e6]);
  }
  if (coordinates.length < 2)
    fail(
      "shape",
      "at least two geometry points required",
      "지형 좌표가 두 개 이상 필요합니다",
    );
  return coordinates;
}
function near(
  a: number[] | undefined,
  b: number[] | undefined,
  tolerance = 0.000002,
): boolean {
  return (
    !!a &&
    !!b &&
    Math.abs(a[0]! - b[0]!) <= tolerance &&
    Math.abs(a[1]! - b[1]!) <= tolerance
  );
}
export function mapLocatedWay(
  way: Way,
  response: unknown,
  evidencePath: string,
): EdgeMapping[] {
  const locations = items(response, "locate");
  if (locations.length !== 1)
    fail("locate", "expected one location", "조회 위치가 하나여야 합니다");
  const edges = items(object(locations[0]).edges, "locate.edges"),
    mapped: EdgeMapping[] = [];
  for (const raw of edges) {
    const located = object(raw),
      info = object(located.edge_info),
      edge = object(located.edge),
      access = object(edge.access);
    if (info.way_id !== way.osm_way_id)
      fail(
        "locate",
        "unexpected neighboring OSM way",
        "다른 인접 OSM 도로가 조회되었습니다",
      );
    const id = object(located.edge_id).value;
    integer(id, "edge_id.value", 0);
    if (typeof edge.forward !== "boolean" || typeof access.car !== "boolean")
      fail(
        "locate",
        "missing direction/access evidence",
        "방향·자동차 접근 증거가 없습니다",
      );
    const shape = decodeShape(info.shape);
    const sourceForward =
      near(shape[0], way.from_coordinate) &&
      near(shape.at(-1), way.to_coordinate);
    const sourceReverse =
      near(shape[0], way.to_coordinate) &&
      near(shape.at(-1), way.from_coordinate);
    if (!sourceForward && !sourceReverse)
      fail(
        "locate",
        "geometry does not match original OSM endpoints",
        "지형이 원본 OSM 끝점과 일치하지 않습니다",
      );
    const directed = edge.forward ? shape : [...shape].reverse();
    const fixtureForward = near(directed[0], way.from_coordinate);
    const expectedCar = !way.oneway || fixtureForward;
    if (access.car !== expectedCar)
      fail(
        "locate",
        "unexpected car access",
        "자동차 접근 허용 값이 예상과 다릅니다",
      );
    if (
      mapped.some(
        (item) =>
          item.forward === fixtureForward || item.edge_id === String(id),
      )
    )
      fail("locate", "duplicate directed edge", "방향별 구간이 중복되었습니다");
    mapped.push({
      label: way.label,
      osm_way_id: way.osm_way_id,
      edge_id: String(id),
      forward: fixtureForward,
      engine_forward: edge.forward,
      car_access: access.car,
      source_geometry: shape,
      directed_geometry: directed,
      evidence_path: evidencePath,
    });
  }
  if (
    mapped.length !== 2 ||
    !mapped.some((edge) => edge.forward) ||
    !mapped.some((edge) => !edge.forward)
  )
    fail(
      "locate",
      "incomplete bidirectional mapping",
      "양방향 구간 대응이 완전하지 않습니다",
    );
  return mapped;
}
export function checkTrace(
  routeShape: unknown,
  traceValue: unknown,
  mappings: EdgeMapping[],
): number[] {
  const routeGeometry = decodeShape(routeShape),
    trace = object(traceValue),
    traceGeometry = decodeShape(trace.shape),
    edges = items(trace.edges, "trace.edges");
  if (
    routeGeometry.length !== traceGeometry.length ||
    routeGeometry.some(
      (point, index) => !near(point, traceGeometry[index], 0.000001),
    )
  )
    fail(
      "trace",
      "trace does not preserve exact route geometry",
      "구간 조회가 정확한 경로 지형을 보존하지 않았습니다",
    );
  if (!edges.length)
    fail("trace", "empty edge sequence", "구간 순서가 비어 있습니다");
  let previousEnd = 0;
  const wayIds: number[] = [];
  for (const raw of edges) {
    const edge = object(raw);
    integer(edge.id, "trace.edge.id", 0);
    const mapping = mappings.find((item) => item.edge_id === String(edge.id));
    if (!mapping || mapping.osm_way_id !== edge.way_id || !mapping.car_access)
      fail(
        "trace",
        "edge is absent from verified car-access mapping",
        "검증된 자동차 접근 구간 대응에 없는 구간입니다",
      );
    integer(
      edge.begin_shape_index,
      "begin_shape_index",
      0,
      routeGeometry.length - 1,
    );
    integer(
      edge.end_shape_index,
      "end_shape_index",
      0,
      routeGeometry.length - 1,
    );
    if (
      edge.begin_shape_index !== previousEnd ||
      edge.end_shape_index <= edge.begin_shape_index
    )
      fail(
        "trace",
        "noncontiguous geometry index sequence",
        "지형 인덱스 순서가 연속되지 않습니다",
      );
    const from = mapping.directed_geometry[0]!,
      to = mapping.directed_geometry.at(-1)!;
    const actualFrom = routeGeometry[edge.begin_shape_index]!,
      actualTo = routeGeometry[edge.end_shape_index]!;
    const dx = to[0]! - from[0]!,
      dy = to[1]! - from[1]!;
    if (
      (actualTo[0]! - actualFrom[0]!) * dx +
        (actualTo[1]! - actualFrom[1]!) * dy <=
      0
    )
      fail(
        "trace",
        "route direction disagrees with mapped edge",
        "경로 방향이 대응된 구간 방향과 다릅니다",
      );
    previousEnd = edge.end_shape_index;
    wayIds.push(mapping.osm_way_id);
  }
  if (previousEnd !== routeGeometry.length - 1)
    fail(
      "trace",
      "edge sequence does not cover complete route",
      "구간 순서가 전체 경로를 포함하지 않습니다",
    );
  return wayIds;
}
export function assertRouteExpectation(
  route: RouteCase,
  orderedWays: number[],
): void {
  if (!route.expected_ways && route.first_way === undefined)
    fail(
      route.id,
      "missing independent route expectation",
      "독립 경로 기대값이 없습니다",
    );
  if (
    route.expected_ways &&
    JSON.stringify(orderedWays) !== JSON.stringify(route.expected_ways)
  )
    fail(
      route.id,
      "preferred OSM way sequence differs",
      "기대하는 OSM 도로 순서와 다릅니다",
    );
  if (
    route.first_way !== undefined &&
    (orderedWays[0] !== route.first_way ||
      orderedWays.at(-1) !== route.last_way ||
      orderedWays.length < 3)
  )
    fail(
      route.id,
      "missing valid detour endpoints",
      "유효한 우회의 시작·끝 구간이 없습니다",
    );
  if (
    route.forbidden_transition &&
    orderedWays.some(
      (way, index) =>
        way === route.forbidden_transition![0] &&
        orderedWays[index + 1] === route.forbidden_transition![1],
    )
  )
    fail(route.id, "forbidden turn found", "금지된 회전이 발견되었습니다");
}
export function checkNoPathResponse(
  route: RouteCase,
  response: unknown,
  exitCode: number | null,
): void {
  const error = object(response);
  if (
    exitCode !== 1 ||
    route.expected_error_code !== 442 ||
    error.error_code !== 442 ||
    error.status_code !== 400 ||
    typeof error.error !== "string" ||
    !/path/i.test(error.error) ||
    error.trip !== undefined
  )
    fail(
      route.id,
      "expected explicit no-path response and engine exit 1",
      "명시적인 경로 없음 응답과 엔진 종료 코드 1이 필요합니다",
    );
}
export function validateFixture(value: unknown): GraphFixture {
  record(value, "fixture", [
    "schema_version",
    "fixture_id",
    "description_en",
    "description_ko",
    "ways",
    "restriction",
    "routes",
  ]);
  const fixture = value;
  if (fixture.schema_version !== "0.1")
    fail("fixture", "unsupported version", "지원하지 않는 버전입니다");
  identifier(fixture.fixture_id, "fixture_id");
  text(fixture.description_en, "description_en");
  text(fixture.description_ko, "description_ko");
  const ways = items(fixture.ways, "ways");
  if (!ways.length) fail("fixture", "missing ways", "도로가 없습니다");
  const ids = new Set<number>(),
    labels = new Set<string>();
  for (const raw of ways) {
    record(raw, "way", [
      "label",
      "osm_way_id",
      "from",
      "to",
      "oneway",
      "from_coordinate",
      "to_coordinate",
    ]);
    const way = raw;
    identifier(way.label, "label");
    integer(way.osm_way_id, "way_id", 1);
    integer(way.from, "from", 1);
    integer(way.to, "to", 1);
    if (
      ids.has(way.osm_way_id) ||
      labels.has(way.label) ||
      typeof way.oneway !== "boolean" ||
      way.from === way.to
    )
      fail(
        "fixture",
        "invalid or duplicate way",
        "잘못되거나 중복된 도로입니다",
      );
    ids.add(way.osm_way_id);
    labels.add(way.label);
    for (const coordinate of [way.from_coordinate, way.to_coordinate]) {
      const pair = items(coordinate);
      if (pair.length !== 2)
        fail(
          "fixture",
          "expected longitude/latitude pair",
          "경도·위도 쌍이 필요합니다",
        );
      number(pair[0], "longitude", -180, 180);
      number(pair[1], "latitude", -90, 90);
    }
    if (near(way.from_coordinate as number[], way.to_coordinate as number[], 0))
      fail("fixture", "way endpoints must differ", "도로 끝점은 달라야 합니다");
  }
  record(fixture.restriction, "restriction", [
    "from_way",
    "via_node",
    "to_way",
  ]);
  const restriction = fixture.restriction;
  integer(restriction.from_way, "from_way", 1);
  integer(restriction.to_way, "to_way", 1);
  integer(restriction.via_node, "via_node", 1);
  const from = ways
    .map((raw) => object(raw))
    .find((way) => way.osm_way_id === restriction.from_way);
  const to = ways
    .map((raw) => object(raw))
    .find((way) => way.osm_way_id === restriction.to_way);
  if (
    !from ||
    !to ||
    from === to ||
    from.to !== restriction.via_node ||
    to.from !== restriction.via_node
  )
    fail(
      "restriction",
      "missing connected from/via/to references",
      "연결된 from·via·to 참조가 없습니다",
    );
  const routes = items(fixture.routes, "routes");
  const required = new Set([
    "baseline",
    "upper-alternative",
    "restriction-detour",
    "oneway-forward",
    "oneway-reverse",
    "disconnected",
  ]);
  if (routes.length !== required.size)
    fail(
      "fixture",
      "six required route checks needed",
      "필수 경로 검사 여섯 개가 필요합니다",
    );
  for (const raw of routes) {
    record(
      raw,
      "route",
      ["id", "locations"],
      [
        "expected_ways",
        "expected_error_code",
        "first_way",
        "last_way",
        "forbidden_transition",
      ],
    );
    const route = raw;
    identifier(route.id, "route.id");
    if (!required.delete(route.id))
      fail(
        "route.id",
        "unknown or duplicate required route",
        "알 수 없거나 중복된 필수 경로입니다",
      );
    const locations = items(route.locations);
    if (locations.length < 2)
      fail(
        "route",
        "at least two locations required",
        "위치가 두 개 이상 필요합니다",
      );
    for (const rawLocation of locations) {
      record(rawLocation, "location", [
        "lon",
        "lat",
        "search_cutoff",
        "radius",
        "minimum_reachability",
      ]);
      const location = rawLocation;
      number(location.lon, "lon", -180, 180);
      number(location.lat, "lat", -90, 90);
      if (
        location.minimum_reachability !== 0 ||
        location.search_cutoff !== 5 ||
        location.radius !== 2
      )
        fail(
          "fixture",
          "unsafe snapping policy",
          "도로 연결 탐색 범위 설정이 올바르지 않습니다",
        );
    }
    if (route.id === "oneway-reverse" || route.id === "disconnected") {
      if (
        route.expected_error_code !== 442 ||
        Object.keys(route).some((key) =>
          [
            "expected_ways",
            "first_way",
            "last_way",
            "forbidden_transition",
          ].includes(key),
        )
      )
        fail(
          "route",
          "explicit no-path expectation required",
          "명시적인 경로 없음 기대값이 필요합니다",
        );
    } else if (route.id === "restriction-detour") {
      if (
        route.first_way !== restriction.from_way ||
        route.last_way !== restriction.to_way ||
        JSON.stringify(route.forbidden_transition) !==
          JSON.stringify([restriction.from_way, restriction.to_way]) ||
        "expected_ways" in route ||
        "expected_error_code" in route
      )
        fail(
          "route",
          "complete independent detour expectation required",
          "독립적인 우회 기대값이 모두 필요합니다",
        );
    } else {
      const expected = items(route.expected_ways, "expected_ways");
      if (
        !expected.length ||
        expected.some((id) => typeof id !== "number" || !ids.has(id)) ||
        Object.keys(route).some((key) =>
          [
            "expected_error_code",
            "first_way",
            "last_way",
            "forbidden_transition",
          ].includes(key),
        )
      )
        fail(
          "route",
          "known expected way sequence required",
          "등록된 기대 도로 순서가 필요합니다",
        );
    }
  }
  const routeObjects = routes.map((raw) => object(raw));
  const baseline = items(
    routeObjects.find((route) => route.id === "baseline")!.locations,
  );
  const alternative = items(
    routeObjects.find((route) => route.id === "upper-alternative")!.locations,
  );
  if (
    JSON.stringify(baseline[0]) !== JSON.stringify(alternative[0]) ||
    JSON.stringify(baseline.at(-1)) !== JSON.stringify(alternative.at(-1))
  )
    fail(
      "routes",
      "alternatives must share origin and destination",
      "두 대안의 출발지와 목적지는 같아야 합니다",
    );
  return fixture as unknown as GraphFixture;
}
