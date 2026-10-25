import { test } from "node:test";
import assert from "node:assert/strict";
import { bindProviderNodeEvidence, matchesPublicMappingNodes, mapPublicRoads, type OfficialRoadGeometry, type OfficialRoadLink } from "../tools/public_speed_geometry.js";
import { normalizeItsResponse } from "../tools/public_speed_source.js";
import { canonical } from "../tools/shared.js";
import type { EdgeMapping } from "../tools/graph_evidence.js";

const graph = "a".repeat(64);
const line = [[127, 37.5], [127.001, 37.5]];
const link: OfficialRoadLink = {link_id: "1010000001", start_node_id: "1010000010", end_node_id: "1010000020",
  road_name: "Authored straight road / 자체 직선 도로", road_rank: "107", road_type: "000", updated_date: "20261014",
  source_length_m: 88.217, coordinates: line};
const geometry = (links: OfficialRoadLink[] = [link]): OfficialRoadGeometry => ({
  schema_version: "kr-standard-links-0.1", provider: "kr-its", revision: "2026-10-14", bounds: [126.98, 37.46, 127.1, 37.56],
  projection_wkt: "fixture", source_files: [], total_link_records: links.length, total_node_records: 2,
  selected_link_records: links.length, rejected_geometry_records: 0, rejected_node_records: 0, links,
});
const edge = (coordinates = [[127.0001, 37.5], [127.0009, 37.5]]): EdgeMapping => ({
  label: "authored", osm_way_id: 1, edge_id: "100", forward: true, engine_forward: true,
  car_access: true, source_geometry: coordinates, directed_geometry: coordinates, evidence_path: "fixture",
});
test("whole directed edge maps only within one official link / 공식 단일 링크 안의 전체 방향 구간만 대응", () => {
  const r = mapPublicRoads(graph, [edge()], geometry());
  assert.equal(r.entries.length, 1); assert.equal(r.excluded.length, 0);
  assert.equal(r.entries[0]!.link_id, link.link_id);
  assert.ok(Math.abs(r.entries[0]!.start_fraction - 0.1) < 1e-6);
  assert.ok(Math.abs(r.entries[0]!.end_fraction - 0.9) < 1e-6);
  assert.ok(r.entries[0]!.max_distance_m < 0.001);
  assert.match(r.geometry_sha256, /^[a-f0-9]{64}$/);
});
test("reverse, crossing and midpoint-only overlap cannot acquire speed / 역방향·교차·중점만 겹친 도로 거부", () => {
  const cases = [edge([...edge().directed_geometry].reverse()),
    edge([[127.0005, 37.4997], [127.0005, 37.5003]]),
    edge([[126.9995, 37.5], [127.0015, 37.5]])];
  for (const e of cases) assert.equal(mapPublicRoads(graph, [e], geometry()).entries.length, 0);
});
test("opposite official direction is not treated as the same road / 반대 공식 방향을 동일 도로로 취급하지 않음", () => {
  const reverse: OfficialRoadLink = {...link, link_id: "1010000002", start_node_id: link.end_node_id,
    end_node_id: link.start_node_id, coordinates: [...line].reverse()};
  const r = mapPublicRoads(graph, [edge()], geometry([link, reverse]));
  assert.equal(r.entries.length, 1); assert.equal(r.entries[0]!.link_id, link.link_id);
});
test("parallel candidates are withheld rather than selected by nearest midpoint / 평행 후보는 가까운 중점으로 선택하지 않고 보류", () => {
  const parallel: OfficialRoadLink = {...link, link_id: "1010000003", coordinates: [[127, 37.50005], [127.001, 37.50005]]};
  const r = mapPublicRoads(graph, [edge()], geometry([link, parallel]));
  assert.equal(r.entries.length, 0); assert.equal(r.excluded[0]!.reason, "AMBIGUOUS");
});
test("curve interior and local direction are inspected, not just endpoints / 곡선 내부·국소 방향 검사", () => {
  const bend = edge([[127.0001, 37.5], [127.0005, 37.5003], [127.0009, 37.5]]);
  assert.equal(mapPublicRoads(graph, [bend], geometry()).entries.length, 0);
  const doubled = edge([[127.0001, 37.5], [127.0008, 37.5], [127.0002, 37.5], [127.0009, 37.5]]);
  assert.equal(mapPublicRoads(graph, [doubled], geometry()).entries.length, 0);
});
test("unsupported and unmapped edges remain in the full denominator / 미지원·미대응 구간 분모 유지", () => {
  const short = {...edge([[127, 37.5], [127.00001, 37.5]]), edge_id: "101"};
  const noCar = {...edge(), edge_id: "102", car_access: false};
  const outside = {...edge([[127.01, 37.5], [127.011, 37.5]]), edge_id: "103"};
  const r = mapPublicRoads(graph, [edge(), short, noCar, outside], geometry());
  assert.equal(r.entries.length, 1); assert.equal(r.excluded.length, 3);
  assert.equal(r.excluded.filter(e => e.reason === "UNSUPPORTED").length, 2);
});
test("graph, source and directed-edge bytes bind the mapping identity / 지도·출처·방향 원문에 대응 식별 연결", () => {
  const a = mapPublicRoads(graph, [edge()], geometry());
  const b = mapPublicRoads(graph, [edge()], {...geometry(), revision: "2026-09-14"});
  assert.notEqual(a.geometry_sha256, b.geometry_sha256);
  const c = mapPublicRoads(graph, [{...edge(), forward: false}], geometry());
  assert.notEqual(a.graph_edges_sha256, c.graph_edges_sha256);
  assert.throws(() => mapPublicRoads("old-graph", [edge()], geometry()), /INVALID_MAPPING_GRAPH/);
  assert.throws(() => mapPublicRoads(graph, [edge(), edge()], geometry()), /INVALID_MAPPING_GRAPH/);
});

const providerBatch = () => normalizeItsResponse(canonical({header: {resultCode: 0, resultMsg: "SUCCESS"}, body: {totalCount: 1,
  items: [{linkId: link.link_id, startNodeId: "1010000011", endNodeId: "1010000022", roadName: link.road_name,
    speed: "30", travelTime: "10", createdDate: "20261025230000"}]}}), "2026-10-25T14:01:10.000Z", [126.98,37.46,127.10,37.56]);
const proof = (coordinates = line) => ({link_id: link.link_id, response: {type: "FeatureCollection", features: [{
  type: "Feature", properties: {link_id: link.link_id, road_name: link.road_name},
  geometry: {type: "MultiLineString", coordinates: [coordinates]}}],
  crs: {type: "name", properties: {name: "urn:ogc:def:crs:EPSG::4326"}}}});
test("different provider node IDs require exact link and independent ordered geometry / 다른 노드는 같은 공식 링크·별도 방향 지형 필요", () => {
  const m = mapPublicRoads(graph, [edge()], geometry()), e = m.entries[0]!;
  assert.equal(matchesPublicMappingNodes(m, e, "1010000011", "1010000022"), false);
  const reviewed = bindProviderNodeEvidence(m, geometry(), providerBatch(), [proof()]);
  assert.equal(matchesPublicMappingNodes(reviewed, e, "1010000011", "1010000022"), true);
  assert.equal(matchesPublicMappingNodes(reviewed, e, "1010000022", "1010000011"), false);
  assert.equal(matchesPublicMappingNodes(reviewed, e, "1010000012", "1010000022"), false);
  assert.equal(matchesPublicMappingNodes({...reviewed, geometry_sha256: "0".repeat(64)}, e, "1010000011", "1010000022"), false);
});
test("map proof cannot approve a reversed, extended, offset or duplicate feature / 지도 근거의 역방향·확장·오프셋·중복 승인 금지", () => {
  const m = mapPublicRoads(graph, [edge()], geometry());
  for (const coordinates of [[...line].reverse(), [[127,37.5], [127.002,37.5]],
    [[127,37.501], [127.001,37.501]]])
    assert.throws(() => bindProviderNodeEvidence(m, geometry(), providerBatch(), [proof(coordinates)]), /PROVIDER_GEOMETRY_MISMATCH/);
  const duplicate = proof(); duplicate.response.features.push(duplicate.response.features[0]!);
  assert.throws(() => bindProviderNodeEvidence(m, geometry(), providerBatch(), [duplicate]), /AMBIGUOUS_PROVIDER_GEOMETRY/);
  const wrong = proof(); wrong.response.features[0]!.properties.link_id = "1010000009";
  assert.throws(() => bindProviderNodeEvidence(m, geometry(), providerBatch(), [wrong]), /AMBIGUOUS_PROVIDER_GEOMETRY/);
});
