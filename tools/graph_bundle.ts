import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonical, fail, parseJson, ROOT, sha256, text } from "./shared.js";
import {
  items,
  mapLocatedWay,
  object,
  validateFixture,
  type EdgeMapping,
  type GraphFixture,
} from "./graph_evidence.js";
import { graphIdentity } from "./test_graph.js";

export interface GraphBundle {
  directory: string;
  graphId: string;
  manifest: Record<string, unknown>;
  manifestSha256: string;
  fixture: GraphFixture;
  edges: EdgeMapping[];
}
export function bundlePath(directory: string, name: string): string {
  if (
    !name ||
    isAbsolute(name) ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(
      "bundle path",
      "unsafe relative evidence path",
      "안전하지 않은 증거 상대경로입니다",
    );
  }
  const root = resolve(directory);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory())
    fail(
      "bundle",
      "expected a real directory",
      "심볼릭 링크가 아닌 실제 폴더가 필요합니다",
    );
  let current = root;
  for (const part of name.split("/")) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink())
      fail(
        "bundle path",
        "symlinks are forbidden",
        "심볼릭 링크는 허용되지 않습니다",
      );
  }
  const actual = realpathSync(current),
    parent = realpathSync(root);
  if (
    relative(parent, actual).startsWith(".." + sep) ||
    actual === parent ||
    isAbsolute(relative(parent, actual))
  )
    fail("bundle path", "path escapes bundle", "경로가 묶음 밖으로 벗어납니다");
  return actual;
}
function read(directory: string, name: string): Buffer {
  return readFileSync(bundlePath(directory, name));
}
function hashMatches(directory: string, name: string, expected: unknown): void {
  if (
    typeof expected !== "string" ||
    !/^[0-9a-f]{64}$/.test(expected) ||
    sha256(read(directory, name)) !== expected
  )
    fail(name, "bundle hash mismatch", "묶음 해시가 일치하지 않습니다");
}
function tileFiles(directory: string, prefix = "tiles"): string[] {
  const entries = readdirSync(bundlePath(directory, prefix), {
    withFileTypes: true,
  });
  const paths: string[] = [];
  for (const entry of entries) {
    const name = `${prefix}/${entry.name}`;
    bundlePath(directory, name);
    if (entry.isDirectory()) paths.push(...tileFiles(directory, name));
    else if (entry.isFile()) paths.push(name.slice("tiles/".length));
    else fail(name, "unexpected tile entry", "허용되지 않은 타일 항목입니다");
  }
  return paths.sort();
}
export function loadGraphBundle(directory: string): GraphBundle {
  const raw = read(directory, "manifest.json"),
    manifest = object(parseJson(raw));
  if (
    manifest.schema_version !== "0.1" ||
    manifest.status !== "PASS" ||
    manifest.cleanup_verified !== true ||
    manifest.engine_executed !== true ||
    manifest.graph_loaded !== true ||
    manifest.fixture_id !== "tiny-city-v1"
  )
    fail(
      "graph manifest",
      "completed supported P02 graph required",
      "완료된 지원 P02 그래프가 필요합니다",
    );
  text(manifest.graph_id, "graph_id");
  const bindings = [
    ["tiny-city.osm.xml", "fixture_sha256"],
    ["fixture.json", "fixture_contract_sha256"],
    ["config.json", "config_sha256"],
    ["tiny-city.osm.pbf", "pbf_sha256"],
  ] as const;
  for (const [name, key] of bindings)
    hashMatches(directory, name, manifest[key]);
  // Bind the supported fixture to repository-authored inputs, not a same-named substitute.
  // 같은 이름의 다른 지형이 아니라 저장소에서 직접 작성한 시험자료에 연결합니다.
  if (
    sha256(readFileSync(join(ROOT, "fixtures/graph/tiny-city.osm.xml"))) !==
      manifest.fixture_sha256 ||
    sha256(readFileSync(join(ROOT, "fixtures/graph/tiny-city.json"))) !==
      manifest.fixture_contract_sha256
  )
    fail(
      "fixture",
      "only the authored tiny-city fixture is supported",
      "직접 작성한 tiny-city 시험자료만 지원합니다",
    );
  const fixture = validateFixture(parseJson(read(directory, "fixture.json")));
  for (const way of fixture.ways)
    for (const coordinate of [way.from_coordinate, way.to_coordinate]) {
      if (
        coordinate[0]! < -0.001 ||
        coordinate[0]! > 0.013 ||
        coordinate[1]! < -0.003 ||
        coordinate[1]! > 0.004
      )
        fail(
          "fixture",
          "geometry outside local equatorial bounds",
          "적도 국소 지형 범위를 벗어났습니다",
        );
    }
  const tileHashes = object(manifest.tile_sha256);
  const paths = Object.keys(tileHashes).sort();
  if (
    !paths.length ||
    !paths.some((path) => path.endsWith(".gph")) ||
    JSON.stringify(paths) !== JSON.stringify(tileFiles(directory))
  )
    fail(
      "tiles",
      "incomplete tile hash inventory",
      "타일 해시 목록이 완전하지 않습니다",
    );
  for (const path of paths)
    hashMatches(directory, `tiles/${path}`, tileHashes[path]);
  const image = object(manifest.image);
  text(image.id, "image.id");
  const calculated = graphIdentity({
    fixture_sha256: manifest.fixture_sha256 as string,
    fixture_contract_sha256: manifest.fixture_contract_sha256 as string,
    config_sha256: manifest.config_sha256 as string,
    engine: manifest.engine,
    image_id: image.id,
    tile_sha256: tileHashes as Record<string, string>,
  });
  if (calculated !== manifest.graph_id)
    fail(
      "graph_id",
      "whole graph identity mismatch",
      "전체 그래프 식별자가 일치하지 않습니다",
    );
  const evidence = object(manifest.evidence);
  for (const name of Object.values(evidence)) {
    text(name, "evidence");
    bundlePath(directory, name);
  }
  const assertions = items(
    parseJson(read(directory, String(evidence.assertions))),
  );
  const required = [
    "complete-edge-mapping",
    ...fixture.routes.map((route) => route.id),
    "cleanup",
  ];
  if (
    assertions.length !== required.length ||
    required.some(
      (id) =>
        assertions.filter(
          (value) =>
            object(value).assertion_id === id &&
            object(value).status === "PASS",
        ).length !== 1,
    )
  )
    fail(
      "assertions",
      "complete passing graph checks required",
      "전체 그래프 검사가 통과해야 합니다",
    );
  const declared = items(parseJson(read(directory, String(evidence.edge_map))));
  const derived: EdgeMapping[] = [];
  for (const way of fixture.ways) {
    const selected = declared.filter(
      (value) => object(value).label === way.label,
    );
    if (selected.length !== 2)
      fail(
        "edge-map",
        "missing directed way mapping",
        "방향별 도로 대응이 없습니다",
      );
    const reference = object(selected[0]).evidence_path;
    text(reference, "edge evidence");
    if (selected.some((value) => object(value).evidence_path !== reference))
      fail(
        "edge-map",
        "inconsistent locate evidence",
        "구간 조회 증거가 일치하지 않습니다",
      );
    const mapped = mapLocatedWay(
      way,
      parseJson(read(directory, reference)),
      reference,
    );
    for (const edge of mapped) {
      const match = selected.find(
        (value) => object(value).edge_id === edge.edge_id,
      );
      if (!match || !canonical(match).equals(canonical(edge)))
        fail(
          "edge-map",
          "mapping differs from original locate response",
          "구간 대응이 원본 조회 응답과 다릅니다",
        );
      if (derived.some((value) => value.edge_id === edge.edge_id))
        fail("edge-map", "duplicate edge ID", "구간 식별자가 중복되었습니다");
      derived.push(edge);
    }
  }
  if (declared.length !== derived.length)
    fail(
      "edge-map",
      "unexpected extra mappings",
      "허용되지 않은 추가 구간 대응입니다",
    );
  return {
    directory: resolve(directory),
    graphId: manifest.graph_id,
    manifest,
    manifestSha256: sha256(raw),
    fixture,
    edges: derived,
  };
}
