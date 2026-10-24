import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arch } from "node:os";
import { canonical, InputError, parseJson, sha256 } from "./shared.js";
import {
  object,
  items,
  decodeShape,
  type EdgeMapping,
} from "./graph_evidence.js";
import { loadSeoulGraph, mapRegionalLocatedEdges } from "./seoul_bundle.js";
import type { SeoulGraphBundle } from "./seoul_types.js";
import { geodesicSphere } from "./geodesy.js";
import {
  generateSimulation,
  validateSimulation,
  type SimulationSpec,
  type SimulationTruth,
  type Observation,
  type Omission,
  type SimulationAssertion,
} from "./vehicle_simulator.js";
import {
  MatchingSession,
  validateEnvelope,
  type MatchingEnvelope,
  type MatchingResult,
  type MatchingGraph,
  type MatchingHooks,
} from "./matching_evidence.js";
import {
  GraphCommands,
  OwnedGraphContainer,
  engineJson,
} from "./test_graph.js";
import {
  traceRequest,
  evidenceHashes,
  MatchingFailure,
} from "./map_matcher.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";

const write = (directory: string, name: string, value: unknown): void =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
export function seoulSpec(bundle: SeoulGraphBundle): SimulationSpec {
  return {
    schema_version: "0.1",
    simulation_id: "seoul-road-demo",
    fixture_id: bundle.fixture.fixture_id,
    graph_id: bundle.graphId,
    seed: 7,
    start_time_utc: "2026-10-24T00:00:00Z",
    duration_ms: 300000,
    sample_interval_ms: 500,
    vehicles: bundle.routes.flatMap((route) =>
      ["clean", "noise", "gap"].map((mode) => ({
        vehicle_id: `${route.route_id}-${mode}`,
        departure_ms: 0,
        path: route.edge_ids.map((id) => {
          const edge = bundle.edges.find((edge) => edge.edge_id === id);
          if (!edge)
            throw new MatchingFailure(
              "Missing scene edge / 장면 구간이 없습니다",
            );
          return { label: edge.label, forward: edge.forward };
        }),
        speed_profile: [
          { duration_ms: 5000, speed_mps: 0 },
          { duration_ms: 295000, speed_mps: 10 },
        ],
        noise_radius_m: mode === "clean" ? 0 : 3,
        drop_intervals:
          mode === "gap" ? [{ start_ms: 30000, end_ms: 40000 }] : [],
      })),
    ),
  };
}
export function regionalAmbiguous(
  observation: Observation,
  candidates: EdgeMapping[],
): boolean {
  const point = [observation.longitude, observation.latitude],
    close = candidates
      .filter((edge) => edge.car_access)
      .map((edge) => ({
        edge,
        projection: geodesicSphere.project(point, edge.directed_geometry),
      }))
      .filter(
        (value) => value.projection.distance_m <= observation.accuracy_m + 1,
      );
  for (let i = 0; i < close.length; i++)
    for (let j = i + 1; j < close.length; j++) {
      const a = close[i]!,
        b = close[j]!;
      if (a.edge.osm_way_id === b.edge.osm_way_id) continue;
      const endpointsA = [
          a.edge.directed_geometry[0]!,
          a.edge.directed_geometry.at(-1)!,
        ],
        endpointsB = [
          b.edge.directed_geometry[0]!,
          b.edge.directed_geometry.at(-1)!,
        ];
      if (
        endpointsA.some((p) =>
          endpointsB.some((q) => geodesicSphere.distance(p, q) <= 1),
        )
      )
        continue;
      let angle =
        Math.abs(a.projection.tangent_radians - b.projection.tangent_radians) %
        Math.PI;
      angle = Math.min(angle, Math.PI - angle);
      if (angle <= (15 * Math.PI) / 180) return true;
    }
  return false;
}
export function runSeoulMatching(
  bundle: SeoulGraphBundle,
  envelope: MatchingEnvelope,
  output: string,
  mode: "full" | "split" | "overlap" = "full",
): MatchingResult {
  validateEnvelope(envelope, {
    graphId: bundle.graphId,
    edges: [],
    fixture: bundle.fixture,
  });
  const verified = loadSeoulGraph(bundle.directory);
  if (
    verified.graphId !== bundle.graphId ||
    verified.manifestSha256 !== bundle.manifestSha256
  )
    throw new MatchingFailure(
      "Supplied graph differs from verified bundle / 지정 그래프가 검증 묶음과 다릅니다",
    );
  mkdirSync(output);
  mkdirSync(join(output, "requests"));
  write(output, "input.json", envelope);
  write(output, "commands.json", []);
  const commands = new GraphCommands(output),
    container = new OwnedGraphContainer(commands),
    registry = new Map<string, EdgeMapping>(),
    candidates = new Map<string, EdgeMapping[]>();
  let failure: unknown,
    result: MatchingResult | undefined,
    cleanup = false,
    counter = 0;
  const request = (
    action: string,
    body: unknown,
  ): { response: unknown; path: string } => {
    const name = `requests/${String(counter++).padStart(4, "0")}-${action}`;
    write(output, name + ".request.json", body);
    const process = container.exec(
      [
        "valhalla_service",
        "/work/runtime-config.json",
        action,
        `/work/${name}.request.json`,
      ],
      30000,
      true,
    );
    if (process.status !== 0)
      throw new MatchingFailure(
        `Regional engine ${action} failed / 지역 엔진 ${action} 실행이 실패했습니다`,
      );
    const response = engineJson(process.stdout);
    write(output, name + ".response.json", response);
    return { response, path: name + ".response.json" };
  };
  const register = (mapped: EdgeMapping[]): void => {
    for (const edge of mapped) {
      const previous = registry.get(edge.edge_id);
      if (
        previous &&
        !canonical({ ...previous, evidence_path: "" }).equals(
          canonical({ ...edge, evidence_path: "" }),
        )
      )
        throw new MatchingFailure(
          "Inconsistent independent locate geometry / 독립 구간 조회 지형이 일치하지 않습니다",
        );
      if (!previous) registry.set(edge.edge_id, edge);
    }
  };
  try {
    container.start(
      String(object(bundle.manifest.image).id),
      output,
      bundle.directory,
      { memory: "4g" },
    );
    const version = container
      .exec(["valhalla_service", "--version"])
      .stdout.trim();
    if (version !== "3.9.1")
      throw new MatchingFailure(
        "Unexpected engine version / 엔진 버전이 예상과 다릅니다",
      );
    const config = object(
        parseJson(readFileSync(join(bundle.directory, "config.json"))),
      ),
      mjolnir = object(config.mjolnir);
    Object.assign(mjolnir, {
      tile_dir: "/graph/tiles",
      tile_extract: "",
      admin: "/graph/not-provided-admin.sqlite",
      timezone: "/graph/not-provided-timezone.sqlite",
    });
    write(output, "runtime-config.json", config);
    // Candidate collection depends only on observed coordinates, never on authored scene edges.
    // 후보 수집에는 관측 좌표만 사용하며 작성한 장면 구간 목록은 사용하지 않습니다.
    for (let offset = 0; offset < envelope.observations.length; offset += 64) {
      const batch = envelope.observations.slice(offset, offset + 64),
        located = request("locate", {
          locations: batch.map((sample) => ({
            lon: sample.longitude,
            lat: sample.latitude,
            search_cutoff: 50,
            radius: 30,
            minimum_reachability: 0,
          })),
          costing: "auto",
          verbose: true,
        });
      const locations = items(located.response);
      if (locations.length !== batch.length)
        throw new MatchingFailure(
          "Locate count differs from observations / 조회 개수가 관측과 다릅니다",
        );
      locations.forEach((location, index) => {
        const mapped = mapRegionalLocatedEdges([location], located.path);
        register(mapped);
        candidates.set(batch[index]!.sample_id, mapped);
      });
    }
    const graph: MatchingGraph = {
        graphId: bundle.graphId,
        fixture: bundle.fixture,
        edges: [...registry.values()],
      },
      hooks: MatchingHooks = {
        policy_id: "seoul-observed-v1",
        geometry: geodesicSphere,
        connection_tolerance_m: 1,
        ambiguous: (sample) =>
          regionalAmbiguous(sample, candidates.get(sample.sample_id) ?? []),
      };
    const session = new MatchingSession(
      {
        schema_version: "0.1",
        matching_id: envelope.matching_id,
        graph_id: envelope.graph_id,
      },
      graph,
      (run) => {
        const response = request(
            "trace_attributes",
            traceRequest(run),
          ).response,
          data = object(response),
          shape = decodeShape(data.shape);
        for (const raw of items(data.edges)) {
          const edge = object(raw),
            id = String(edge.id);
          if (registry.has(id)) continue;
          const begin = Number(edge.begin_shape_index),
            end = Number(edge.end_shape_index);
          if (
            !Number.isSafeInteger(begin) ||
            !Number.isSafeInteger(end) ||
            begin < 0 ||
            end <= begin ||
            end >= shape.length
          )
            throw new MatchingFailure(
              "Invalid unmatched edge geometry indices / 미등록 구간의 지형 인덱스가 올바르지 않습니다",
            );
          const clipped = shape.slice(begin, end + 1),
            middle = geodesicSphere.position(
              clipped,
              geodesicSphere.length(clipped) / 2,
            ),
            located = request("locate", {
              locations: [
                {
                  lon: middle[0],
                  lat: middle[1],
                  search_cutoff: 30,
                  radius: 30,
                  minimum_reachability: 0,
                },
              ],
              costing: "auto",
              verbose: true,
            });
          register(mapRegionalLocatedEdges(located.response, located.path));
          const actual = registry.get(id);
          if (
            !actual ||
            !actual.car_access ||
            actual.osm_way_id !== edge.way_id
          )
            throw new MatchingFailure(
              "Trace edge not resolved by independent locate / 경로 구간을 독립 조회로 확인하지 못했습니다",
            );
        }
        graph.edges = [...registry.values()];
        return response;
      },
      hooks,
    );
    if (mode !== "full") {
      for (let offset = 0; offset < envelope.observations.length; offset += 137)
        session.append(
          envelope.observations.slice(
            Math.max(0, offset - (mode === "overlap" ? 7 : 0)),
            offset + 137,
          ),
        );
    } else session.append(envelope.observations);
    result = session.finalize();
    const checked = loadSeoulGraph(bundle.directory);
    if (
      checked.graphId !== bundle.graphId ||
      checked.manifestSha256 !== bundle.manifestSha256
    )
      throw new MatchingFailure(
        "Seoul graph changed during matching / 매칭 중 서울 그래프가 변경되었습니다",
      );
  } catch (error) {
    failure =
      error instanceof InputError ? new MatchingFailure(error.message) : error;
  } finally {
    try {
      cleanup = container.cleanup();
    } catch (error) {
      failure = error;
    }
  }
  if (result) write(output, "result.json", result);
  write(output, "candidate-edges.json", [...registry.values()]);
  write(output, "assertions.json", [
    {
      assertion_id: "regional-engine-and-cleanup",
      status: failure ? "FAIL" : "PASS",
      message_en:
        "Actual matching with independent locate candidates and verified cleanup.",
      message_ko: "독립 조회 후보와 정리 확인을 사용하는 실제 매칭입니다.",
      actual: failure ? String(failure) : true,
    },
  ]);
  if (failure) throw failure;
  if (!result || !cleanup)
    throw new MatchingFailure(
      "Regional matching incomplete / 지역 매칭이 완료되지 않았습니다",
    );
  write(output, "manifest.json.tmp", {
    schema_version: "seoul-matching-0.1",
    status: "PASS",
    source: sourceIdentity(),
    graph_id: bundle.graphId,
    graph_manifest_sha256: bundle.manifestSha256,
    policy_id: "seoul-observed-v1",
    geometry_policy: bundle.geometry_policy,
    source_class: "SYNTHETIC",
    engine_executed: true,
    cleanup_verified: true,
    semantic_sha256: result.semantic_sha256,
    output_sha256: evidenceHashes(output),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return result;
}
export interface VehicleEvaluation {
  vehicle_id: string;
  input_samples: number;
  matched_samples: number;
  point_coverage: number;
  correct_points: number;
  boundary_equivalent_points: number;
  point_precision: number;
  truth_traversals: number;
  accepted_traversals: number;
  false_traversals: number;
  missed_traversals: number;
  traversal_coverage: number;
  max_entry_error_ms: number;
  max_exit_error_ms: number;
  gap_bridges: number;
}
export function evaluateSeoul(
  spec: SimulationSpec,
  truth: SimulationTruth,
  observations: Observation[],
  matching: MatchingResult,
  edges: EdgeMapping[],
): VehicleEvaluation[] {
  return spec.vehicles.map((vehicle) => {
    const samples = truth.samples.filter(
        (sample) => sample.vehicle_id === vehicle.vehicle_id,
      ),
      traversals = truth.traversals.filter(
        (item) => item.vehicle_id === vehicle.vehicle_id,
      ),
      points = matching.points.filter(
        (point) =>
          point.vehicle_id === vehicle.vehicle_id && point.status === "MATCHED",
      ),
      accepted = matching.traversals.filter(
        (item) =>
          item.vehicle_id === vehicle.vehicle_id && item.status === "ACCEPTED",
      );
    let correct_points = 0,
      boundary_equivalent_points = 0,
      false_traversals = 0,
      max_entry_error_ms = 0,
      max_exit_error_ms = 0,
      gap_bridges = 0,
      last = -1;
    const used = new Set<number>();
    for (const point of points) {
      const sample = samples.find(
        (item) => item.sample_id === point.sample_id,
      )!;
      if (sample.edge_id === point.edge_id) {
        correct_points++;
        continue;
      }
      const own = traversals.findIndex(
        (item) =>
          item.edge_id === sample.edge_id &&
          sample.offset_ms >= item.entered_at_ms - 1 &&
          sample.offset_ms <= item.exited_at_ms + 1,
      );
      const neighbor = [own - 1, own + 1]
        .filter((index) => index >= 0 && index < traversals.length)
        .find((index) => traversals[index]!.edge_id === point.edge_id);
      if (neighbor !== undefined) {
        const truthEdge = edges.find((edge) => edge.edge_id === sample.edge_id),
          otherEdge = edges.find((edge) => edge.edge_id === point.edge_id);
        if (truthEdge && otherEdge) {
          const boundary =
            neighbor < own
              ? truthEdge.directed_geometry[0]!
              : truthEdge.directed_geometry.at(-1)!;
          const shared = [
            otherEdge.directed_geometry[0]!,
            otherEdge.directed_geometry.at(-1)!,
          ].some((p) => geodesicSphere.distance(p, boundary) <= 1);
          if (
            shared &&
            geodesicSphere.distance(
              [sample.longitude, sample.latitude],
              boundary,
            ) <= 1
          )
            boundary_equivalent_points++;
        }
      }
    }
    for (const candidate of accepted) {
      const index = traversals.findIndex(
        (item, index) =>
          index > last &&
          !used.has(index) &&
          item.edge_id === candidate.edge_id &&
          item.forward === candidate.forward,
      );
      if (index < 0) {
        false_traversals++;
        continue;
      }
      last = index;
      used.add(index);
      const actual = traversals[index]!;
      max_entry_error_ms = Math.max(
        max_entry_error_ms,
        Math.abs(candidate.entered_at_ms! - actual.entered_at_ms),
      );
      max_exit_error_ms = Math.max(
        max_exit_error_ms,
        Math.abs(candidate.exited_at_ms! - actual.exited_at_ms),
      );
      if (
        vehicle.drop_intervals.some(
          (interval) =>
            candidate.entered_at_ms! < interval.end_ms &&
            candidate.exited_at_ms! > interval.start_ms,
        )
      )
        gap_bridges++;
    }
    const input_samples = observations.filter(
      (sample) => sample.vehicle_id === vehicle.vehicle_id,
    ).length;
    return {
      vehicle_id: vehicle.vehicle_id,
      input_samples,
      matched_samples: points.length,
      point_coverage: points.length / input_samples,
      correct_points,
      boundary_equivalent_points,
      point_precision: points.length
        ? (correct_points + boundary_equivalent_points) / points.length
        : 0,
      truth_traversals: traversals.length,
      accepted_traversals: accepted.length,
      false_traversals,
      missed_traversals: traversals.length - used.size,
      traversal_coverage: used.size / traversals.length,
      max_entry_error_ms,
      max_exit_error_ms,
      gap_bridges,
    };
  });
}
export function runSeoulWorkload(
  bundle: SeoulGraphBundle,
  output: string,
): {
  spec: SimulationSpec;
  truth: SimulationTruth;
  observations: Observation[];
  omissions: Omission[];
  matching: MatchingResult;
  assertions: SimulationAssertion[];
} {
  const spec = validateSimulation(seoulSpec(bundle), bundle),
    generated = generateSimulation(spec, bundle),
    source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  mkdirSync(output);
  write(output, "spec.json", spec);
  write(output, "truth.json", generated.truth);
  write(output, "observations.json", generated.observations);
  write(output, "omissions.json", generated.omissions);
  const envelope: MatchingEnvelope = {
    schema_version: "0.1",
    matching_id: "seoul-nine-vehicles",
    graph_id: bundle.graphId,
    observations: generated.observations,
  };
  const matching = runSeoulMatching(bundle, envelope, join(output, "matching")),
    evaluation = evaluateSeoul(
      spec,
      generated.truth,
      generated.observations,
      matching,
      bundle.edges,
    );
  write(output, "evaluation.json", evaluation);
  const assertions = [...generated.assertions],
    check = (
      id: string,
      passed: boolean,
      en: string,
      ko: string,
      expected: unknown,
      actual: unknown,
      path: string,
    ): void => {
      assertions.push({
        assertion_id: id,
        status: passed ? "PASS" : "FAIL",
        message_en: en,
        message_ko: ko,
        expected,
        actual,
        evidence_path: path,
      });
    };
  for (const actual of evaluation) {
    const clean = actual.vehicle_id.endsWith("-clean"),
      bound = clean ? 100 : 1000;
    check(
      actual.vehicle_id + "-accepted-precision",
      actual.false_traversals === 0 &&
        actual.accepted_traversals > 0 &&
        actual.max_entry_error_ms <= bound &&
        actual.max_exit_error_ms <= bound,
      "Accepted directed occurrences and observed-time bounds meet the fixed policy.",
      "수용 방향 통과·관측 시간 경계가 고정 정책을 충족합니다.",
      { false: 0, minimum_accepted: 1, timing_ms: bound },
      actual,
      "evaluation.json",
    );
    if (clean)
      check(
        actual.vehicle_id + "-clean-coverage",
        actual.point_precision >= 0.98 &&
          actual.point_coverage >= 0.9 &&
          actual.traversal_coverage >= 0.7,
        "Clean point correctness and complete-traversal coverage meet fixed thresholds.",
        "깨끗한 표본 정확성과 완전 통과 범위가 고정 기준을 충족합니다.",
        { point_precision: 0.98, point_coverage: 0.9, traversal_coverage: 0.7 },
        actual,
        "evaluation.json",
      );
    check(
      actual.vehicle_id + "-no-gap-bridging",
      actual.gap_bridges === 0,
      "Accepted traversals never bridge a scheduled observation gap.",
      "수용 통과가 예정 관측 누락을 건너지 않습니다.",
      0,
      actual.gap_bridges,
      "evaluation.json",
    );
  }
  const replay = generateSimulation(spec, bundle),
    changed = structuredClone(spec);
  changed.seed = 8;
  const other = generateSimulation(changed, bundle);
  check(
    "seoul-generation-replay",
    canonical(replay).equals(canonical(generated)),
    "Same seeded generation replays exactly.",
    "같은 시드 생성이 정확하게 재생됩니다.",
    true,
    true,
    "truth.json",
  );
  check(
    "seoul-seed-truth-invariance",
    canonical(other.truth).equals(canonical(generated.truth)) &&
      !canonical(other.observations).equals(canonical(generated.observations)),
    "A different seed changes observations while truth stays fixed.",
    "다른 시드는 관측만 바꾸고 정답을 유지합니다.",
    true,
    canonical(other.truth).equals(canonical(generated.truth)),
    "truth.json",
  );
  const split = runSeoulMatching(
    bundle,
    envelope,
    join(output, "split-only"),
    "split",
  );
  const overlap = runSeoulMatching(
    bundle,
    envelope,
    join(output, "split-overlap"),
    "overlap",
  );
  check(
    "seoul-matching-batch-parity",
    matching.semantic_sha256 === split.semantic_sha256 &&
      matching.semantic_sha256 === overlap.semantic_sha256 &&
      canonical(matching).equals(canonical(split)) &&
      canonical(matching).equals(canonical(overlap)),
    "Actual full/split/overlap matching has identical semantic bytes and traversal IDs.",
    "실제 전체·분할·중첩 매칭의 의미 바이트·통과 식별자가 같습니다.",
    matching.semantic_sha256,
    { split: split.semantic_sha256, overlap: overlap.semantic_sha256 },
    "split-overlap/result.json",
  );
  write(output, "assertions.json", assertions);
  writeFileSync(
    join(output, "summary.md"),
    "# Seoul OSM engineering round trip / 서울 OSM 처리 흐름 검사\n\n© OpenStreetMap contributors — https://www.openstreetmap.org/copyright (ODbL).\nLicense / 라이선스: https://opendatacommons.org/licenses/odbl/1-0/\nSource / 원본: https://download.geofabrik.de/asia/south-korea-261023.osm.pbf\nSynthetic vehicles, not real driver traces or reviewed road accuracy.\n합성 차량이며 실주행 기록·검토한 실도로 정확도가 아닙니다.\n",
  );
  if (assertions.some((item) => item.status !== "PASS"))
    throw new MatchingFailure(
      "Fixed Seoul acceptance failed; inspect evaluation.json, no threshold was relaxed. / 서울 고정 기준이 실패했습니다. evaluation.json을 확인하세요. 기준을 완화하지 않았습니다",
    );
  if (implementationFingerprint() !== fingerprint)
    throw new MatchingFailure(
      "Implementation changed during workload / 실행 중 구현이 변경되었습니다",
    );
  write(output, "manifest.json.tmp", {
    schema_version: "seoul-workload-0.1",
    status: "PASS",
    source,
    node: process.versions.node,
    host_architecture: arch(),
    graph_id: bundle.graphId,
    graph_manifest_sha256: bundle.manifestSha256,
    implementation_sha256: fingerprint,
    geometry_policy: bundle.geometry_policy,
    matching_policy: "seoul-observed-v1",
    cleanup_verified: true,
    output_sha256: evidenceHashes(output),
    completed_at_utc: new Date().toISOString(),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return { spec, ...generated, matching, assertions };
}
