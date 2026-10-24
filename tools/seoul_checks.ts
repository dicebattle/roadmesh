/** Whole implemented-system entrypoint: immutable tiny regression, then actual Seoul roads. */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import {
  canonical,
  consoleIO,
  type ConsoleIO,
  isMain,
  parseJson,
  sha256,
} from "./shared.js";
import { object } from "./graph_evidence.js";
import { bundlePath } from "./graph_bundle.js";
import { sourceIdentity } from "./pilot_runner.js";
import {
  runChecks as runTinyChecks,
  IntegrationFailure,
} from "./simulation_checks.js";
import { runSeoulGraph } from "./seoul_graph.js";
import { runSeoulWorkload } from "./seoul_simulation.js";
import type { SeoulGraphBundle } from "./seoul_types.js";
import { implementationFingerprint } from "./media_manifest.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "./simulation_report.js";
const write = (root: string, path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
export function verifyRegionalChild(
  directory: string,
  source: { commit: string; dirty: boolean },
  graphId?: string,
): Record<string, unknown> {
  const manifest = object(
    parseJson(readFileSync(join(directory, "manifest.json"))),
  );
  if (
    manifest.status !== "PASS" ||
    !canonical(manifest.source).equals(canonical(source)) ||
    (graphId && manifest.graph_id !== graphId)
  )
    throw new IntegrationFailure(
      "Regional child source/status/graph mismatch / 지역 하위 실행 출처·상태·그래프 불일치",
    );
  const hashes = object(manifest.output_sha256 ?? manifest.files_sha256);
  if (!Object.keys(hashes).length)
    throw new IntegrationFailure(
      "Regional child hashes missing / 지역 하위 실행 해시 누락",
    );
  const root = realpathSync(directory);
  for (const [path, hash] of Object.entries(hashes)) {
    const full = bundlePath(root, path);
    const rel = relative(root, full);
    if (
      isAbsolute(path) ||
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      lstatSync(full).isSymbolicLink() ||
      sha256(readFileSync(full)) !== hash
    )
      throw new IntegrationFailure(
        "Regional evidence changed or escaped / 지역 증거 변경·경로 탈출",
      );
  }
  return manifest;
}
export function buildSeoulReportData(
  source: { commit: string; dirty: boolean },
  graph: SeoulGraphBundle,
  workload: ReturnType<typeof runSeoulWorkload>,
  stages: SimulationReportData["stages"],
  fingerprint: string,
): SimulationReportData {
  const { spec, truth, observations, omissions, matching, assertions } =
    workload;
  const counts = {
    full_export_roads: graph.manifest.context_full_count,
    selected_display_roads: graph.manifest.context_selected_count,
    scene_edges: graph.edges.length,
  };
  if (
    !Number.isSafeInteger(counts.full_export_roads) ||
    !Number.isSafeInteger(counts.selected_display_roads) ||
    counts.selected_display_roads !== graph.context_roads.length
  )
    throw new IntegrationFailure(
      "Regional display inventory missing or inconsistent / 지역 표시 목록 누락·불일치",
    );
  return {
    schema_version: "0.1",
    source,
    graph_id: graph.graphId,
    generated_at_utc: new Date().toISOString(),
    implementation_sha256: fingerprint,
    summary: {
      status: assertions.every((a) => a.status === "PASS") ? "PASS" : "FAIL",
      assertions_passed: assertions.filter((a) => a.status === "PASS").length,
      assertions_total: assertions.length,
      vehicle_count: spec.vehicles.length,
      observation_count: observations.length,
      omission_count: omissions.length,
      duration_ms: spec.duration_ms,
    },
    stages,
    region: {
      profile_id: graph.fixture.fixture_id,
      name_en: "Seoul road network",
      name_ko: "서울 도로망",
      source_date: "2026-10-23",
      source_url:
        "https://download.geofabrik.de/asia/south-korea-261023.osm.pbf",
      bounds: [126.7, 37.4, 127.25, 37.75],
      attribution: "© OpenStreetMap contributors",
      license_url: "https://www.openstreetmap.org/copyright",
      graph_counts: counts,
      display_road_count: graph.context_roads.length,
    },
    context_roads: graph.context_roads,
    routes: graph.routes.map((r) => ({
      ...r,
      vehicle_ids: spec.vehicles
        .filter((v) => v.vehicle_id.startsWith(r.route_id + "-"))
        .map((v) => v.vehicle_id),
    })),
    roads: graph.edges.map((edge) => ({
      label: edge.label,
      edge_id: edge.edge_id,
      forward: edge.forward,
      car_access: edge.car_access,
      coordinates: edge.directed_geometry,
    })),
    vehicles: spec.vehicles.map((v) => ({
      vehicle_id: v.vehicle_id,
      truth: truth.samples
        .filter((p) => p.vehicle_id === v.vehicle_id)
        .map(({ offset_ms, longitude, latitude, edge_id }) => ({
          offset_ms,
          longitude,
          latitude,
          edge_id,
        })),
      observations: observations
        .filter((p) => p.vehicle_id === v.vehicle_id)
        .map(({ offset_ms, longitude, latitude, accuracy_m }) => ({
          offset_ms,
          longitude,
          latitude,
          accuracy_m,
        })),
      omissions: omissions
        .filter((p) => p.vehicle_id === v.vehicle_id)
        .map(({ offset_ms, reason }) => ({ offset_ms, reason })),
      traversals: truth.traversals
        .filter((t) => t.vehicle_id === v.vehicle_id)
        .map(({ vehicle_id, ...rest }) => rest),
    })),
    matching: {
      ...matching,
      cases: spec.vehicles.map((v) => {
        const route = graph.routes.find((r) =>
          v.vehicle_id.startsWith(r.route_id + "-"),
        );
        const points = matching.points.filter(
            (p) => p.vehicle_id === v.vehicle_id,
          ),
          traversals = matching.traversals.filter(
            (t) => t.vehicle_id === v.vehicle_id,
          );
        return {
          case_id: v.vehicle_id,
          name_en:
            (route?.name_en ?? v.vehicle_id) +
            " / " +
            (v.vehicle_id.endsWith("-clean")
              ? "Clean"
              : v.vehicle_id.endsWith("-gap")
                ? "Noise and gap"
                : "Bounded noise"),
          name_ko:
            (route?.name_ko ?? v.vehicle_id) +
            " / " +
            (v.vehicle_id.endsWith("-clean")
              ? "깨끗한 관측"
              : v.vehicle_id.endsWith("-gap")
                ? "잡음·누락"
                : "제한 잡음"),
          status: "RECORDED",
          input_samples: points.length,
          matched_samples: points.filter((p) => p.status === "MATCHED").length,
          excluded_samples: points.filter((p) => p.status === "EXCLUDED")
            .length,
          accepted_traversals: traversals.filter((t) => t.status === "ACCEPTED")
            .length,
          excluded_traversals: traversals.filter((t) => t.status === "EXCLUDED")
            .length,
        };
      }),
    },
    assertions,
    limitations: [
      {
        message_en:
          "Actual OSM roads; vehicles, stops, speeds and GPS are SYNTHETIC. Same-engine route/matching round trip is not independent real-road accuracy or reviewed 100/100 corpus evidence.",
        message_ko:
          "실제 OSM 도로이며 차량·정지·속도·GPS는 합성입니다. 같은 엔진 경로/매칭 왕복 검사는 독립 실도로 정확도·검토한100/100자료 증거가 아닙니다.",
      },
      {
        message_en:
          "Envelope includes adjacent boundary roads, not an administrative polygon. Full graph, selected scene edges and display subset have different counts. P05–P14 remain incomplete.",
        message_ko:
          "범위는 인접 경계 도로를 포함하는 사각형이며 행정구역 폴리곤이 아닙니다. 전체 그래프·선택 경로·표시 부분집합 개수는 다릅니다. P05~P14는 미완료입니다.",
      },
    ],
  };
}
export function runSeoulChecks(
  outputPath: string,
  sourcePath?: string,
): number {
  const output = resolve(outputPath);
  const source = sourceIdentity();
  if (!source.commit || source.dirty === null)
    throw new Error("Source identity unavailable / 소스 식별 확인 불가");
  const verified = { commit: source.commit, dirty: source.dirty },
    fingerprint = implementationFingerprint();
  mkdirSync(output);
  const stages: SimulationReportData["stages"] = [];
  const stage = <T>(
    id: string,
    en: string,
    ko: string,
    path: string,
    fn: () => T,
  ): T => {
    const start = performance.now();
    let status = "FAIL";
    try {
      const result = fn();
      status = "PASS";
      return result;
    } finally {
      stages.push({
        id,
        name_en: en,
        name_ko: ko,
        status,
        evidence_path: path,
        duration_ms: performance.now() - start,
      });
      writeFileSync(
        join(output, "stages.json"),
        JSON.stringify(stages, null, 2) + "\n",
      );
    }
  };
  try {
    stage(
      "tiny-regression",
      "Preserved tiny-city whole-system regression",
      "기존 tiny-city 전체 회귀",
      "tiny/manifest.json",
      () => {
        runTinyChecks(join(output, "tiny"));
        const m = verifyRegionalChild(join(output, "tiny"), verified);
        const a = parseJson(
          readFileSync(join(output, "tiny/assertions.json")),
        ) as { status: string }[];
        if (
          a.length !== 48 ||
          a.some((item) => item.status !== "PASS") ||
          m.cleanup_verified !== true
        )
          throw new IntegrationFailure(
            "All 48 tiny assertions are required / tiny 검사48개 전체 통과 필요",
          );
      },
    );
    const graph = stage(
      "seoul-graph",
      "Pinned OSM source and fresh Seoul graph",
      "고정 OSM 원본·새 서울 그래프",
      "graph/manifest.json",
      () => {
        const graph = runSeoulGraph(join(output, "graph"), sourcePath);
        verifyRegionalChild(graph.directory, verified, graph.graphId);
        if (graph.manifest.cleanup_verified !== true)
          throw new IntegrationFailure(
            "Graph cleanup missing / 그래프 정리 누락",
          );
        return graph;
      },
    );
    const workload = stage(
      "seoul-workload",
      "Nine synthetic vehicles on actual Seoul roads",
      "실제 서울 도로의 합성 차량9대",
      "workload/manifest.json",
      () => {
        const result = runSeoulWorkload(graph, join(output, "workload"));
        const m = verifyRegionalChild(
          join(output, "workload"),
          verified,
          graph.graphId,
        );
        if (
          m.cleanup_verified !== true ||
          m.graph_manifest_sha256 !== graph.manifestSha256 ||
          m.implementation_sha256 !== fingerprint ||
          result.spec.vehicles.length !== 9 ||
          graph.routes.length !== 3 ||
          result.spec.seed !== 7 ||
          result.spec.sample_interval_ms !== 500 ||
          result.spec.duration_ms !== 300000 ||
          result.matching.input_samples !== result.observations.length ||
          !result.assertions.length ||
          result.assertions.some((a) => a.status !== "PASS")
        )
          throw new IntegrationFailure(
            "Workload evidence incomplete / 차량 실행 증거 불완전",
          );
        for (const [path, value] of [
          ["spec.json", result.spec],
          ["truth.json", result.truth],
          ["observations.json", result.observations],
          ["omissions.json", result.omissions],
          ["matching/result.json", result.matching],
        ] as const)
          if (
            !canonical(
              parseJson(readFileSync(join(output, "workload", path))),
            ).equals(canonical(value))
          )
            throw new IntegrationFailure(
              "Returned workload differs from saved evidence / 반환 차량 실행값과 저장 증거가 다릅니다",
            );
        return result;
      },
    );
    verifyRegionalChild(graph.directory, verified, graph.graphId);
    if (
      implementationFingerprint() !== fingerprint ||
      !canonical(sourceIdentity()).equals(canonical(verified))
    )
      throw new IntegrationFailure(
        "Source changed during integration / 통합 실행 중 소스 변경",
      );
    const data = buildSeoulReportData(
      verified,
      graph,
      workload,
      stages,
      fingerprint,
    );
    data.assertions = data.assertions.map((a) => ({
      ...a,
      evidence_path: "workload/" + a.evidence_path,
    }));
    write(output, "report-data.json", data);
    writeFileSync(join(output, "report.html"), renderSimulationReport(data), {
      flag: "wx",
    });
    write(output, "assertions.json", data.assertions);
    writeFileSync(
      join(output, "summary.md"),
      "# Seoul whole-system simulation / 서울 전체 통합 시뮬레이션\n\nPASS: 48 tiny regression assertions, fresh Seoul graph, nine SYNTHETIC vehicles and matching.\n통과: tiny회귀48검사·새 서울그래프·합성차량9대·매칭.\n\nActual OSM roads, synthetic movement; not independent real-road accuracy.\n실제 OSM도로·합성이동이며 독립 실도로 정확도 검증이 아닙니다.\n",
    );
    const hashes = Object.fromEntries(
      [
        "tiny/manifest.json",
        "graph/manifest.json",
        "workload/manifest.json",
        "report-data.json",
        "report.html",
        "assertions.json",
        "summary.md",
        "stages.json",
      ].map((p) => [p, sha256(readFileSync(join(output, p)))]),
    );
    if (
      implementationFingerprint() !== fingerprint ||
      !canonical(sourceIdentity()).equals(canonical(verified))
    )
      throw new IntegrationFailure(
        "Source changed before completion / 완료 전 소스 변경",
      );
    write(output, "manifest.json.tmp", {
      schema_version: "0.1",
      status: "PASS",
      source: verified,
      graph_id: graph.graphId,
      implementation_sha256: fingerprint,
      cleanup_verified: true,
      stages,
      output_sha256: hashes,
      completed_at_utc: new Date().toISOString(),
    });
    renameSync(
      join(output, "manifest.json.tmp"),
      join(output, "manifest.json"),
    );
    return 0;
  } catch (error) {
    writeFileSync(
      join(output, "summary.md"),
      "# Integration incomplete / 통합 실행 미완료\n\nFAIL / 실패: " +
        String(error) +
        "\n",
    );
    throw error instanceof IntegrationFailure
      ? error
      : new IntegrationFailure(String(error));
  }
}
export function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): number {
  try {
    let output = "",
      source: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--help") {
        io.out(
          "Usage / 사용법: simulation:check -- --output NEW_DIRECTORY [--source PINNED_PBF]\nFresh tiny regression, verified Seoul source, graph and synthetic matching. / tiny회귀·서울원본·그래프·합성매칭을 새로 실행합니다.",
        );
        return 0;
      } else if (arg === "--output" && !output) output = argv[++i] ?? "";
      else if (arg === "--source" && !source) {
        source = argv[++i];
        if (!source || source.startsWith("-"))
          throw new Error("Source file required / 원본 파일 필요");
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!output || output.startsWith("-") || source?.startsWith("-"))
      throw new Error("New output directory required / 새 출력폴더 필요");
    return runSeoulChecks(output, source);
  } catch (error) {
    io.error(
      "Seoul integration incomplete / 서울 통합 미완료: " + String(error),
    );
    return error instanceof IntegrationFailure ? 1 : 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = main();
