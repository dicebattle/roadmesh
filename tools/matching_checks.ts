/** Fresh P04 engine cases. Truth is consumed only by the post-match evaluator. */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { canonical, parseJson, sha256, InputError } from "./shared.js";
import { object } from "./graph_evidence.js";
import { bundlePath, type GraphBundle } from "./graph_bundle.js";
import {
  runMatching,
  MatchingFailure,
  evidenceHashes,
  type MatchingOptions,
} from "./map_matcher.js";
import {
  type MatchingEnvelope,
  type MatchingResult,
} from "./matching_evidence.js";
import {
  runSimulation,
  type Observation,
  type SimulationSpec,
  type SimulationTruth,
  type SimulationAssertion,
} from "./vehicle_simulator.js";
import type { SimulationReportData } from "./simulation_report.js";
import { GraphError } from "./test_graph.js";
const write = (root: string, path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
export function verifyMatchingEvidence(
  directory: string,
  inputPath: string,
  graph: GraphBundle,
  source: { commit: string; dirty: boolean },
  result: MatchingResult,
): void {
  const m = object(parseJson(readFileSync(join(directory, "manifest.json"))));
  if (
    m.status !== "PASS" ||
    m.cleanup_verified !== true ||
    m.graph_id !== graph.graphId ||
    m.graph_manifest_sha256 !== graph.manifestSha256 ||
    m.input_sha256 !== sha256(readFileSync(inputPath)) ||
    !canonical(m.source).equals(canonical(source))
  )
    throw new Error(
      "P04 source, graph, input or cleanup mismatch / P04 출처·그래프·입력·정리 불일치",
    );
  const hashes = object(m.output_sha256);
  for (const required of [
    "input.json",
    "result.json",
    "assertions.json",
    "commands.json",
    "summary.md",
  ])
    if (typeof hashes[required] !== "string")
      throw new Error("Missing P04 evidence hash / P04 증거 해시 누락");
  if (!canonical(hashes).equals(canonical(evidenceHashes(directory))))
    throw new Error(
      "P04 raw evidence hash mismatch / P04 원본 증거 해시 불일치",
    );
  for (const [path, expected] of Object.entries(hashes))
    if (sha256(readFileSync(bundlePath(directory, path))) !== expected)
      throw new Error("P04 file changed / P04 파일 변경");
  const { semantic_sha256, ...core } = result;
  if (
    semantic_sha256 !== sha256(canonical(core)) ||
    m.semantic_sha256 !== semantic_sha256 ||
    !canonical(result).equals(
      canonical(parseJson(readFileSync(join(directory, "result.json")))),
    )
  )
    throw new Error("P04 semantic result mismatch / P04 결과 의미 해시 불일치");
}
export function evaluateTraversals(
  result: MatchingResult,
  truth: SimulationTruth,
  vehicle: string,
  tolerance: number,
  labels?: string[],
): {
  passed: boolean;
  expected: number;
  accepted: number;
  false_traversals: number;
  missed_traversals: number;
  boundary_errors_ms: number[];
} {
  const expected = truth.traversals.filter(
    (t) => t.vehicle_id === vehicle && (!labels || labels.includes(t.label)),
  );
  const accepted = result.traversals.filter(
    (t) =>
      t.vehicle_id === vehicle &&
      t.status === "ACCEPTED" &&
      (!labels || labels.includes(t.label)),
  );
  const remaining = [...expected];
  const errors: number[] = [];
  let falseCount = 0;
  for (const got of accepted) {
    const index = remaining.findIndex((t) => t.edge_id === got.edge_id);
    if (index < 0 || got.entered_at_ms === null || got.exited_at_ms === null) {
      falseCount++;
      continue;
    }
    const want = remaining.splice(index, 1)[0]!;
    errors.push(
      Math.abs(got.entered_at_ms - want.entered_at_ms),
      Math.abs(got.exited_at_ms - want.exited_at_ms),
    );
  }
  return {
    passed:
      expected.length > 0 &&
      falseCount === 0 &&
      remaining.length === 0 &&
      errors.every((e) => e <= tolerance),
    expected: expected.length,
    accepted: accepted.length,
    false_traversals: falseCount,
    missed_traversals: remaining.length,
    boundary_errors_ms: errors,
  };
}
export function checkRejectedMatching(
  inputPath: string,
  graphDirectory: string,
  output: string,
): { rejected: boolean; error: string; completion_absent: boolean } {
  let rejected = false,
    error = "";
  try {
    runMatching(inputPath, graphDirectory, output);
  } catch (cause) {
    rejected = cause instanceof InputError;
    error = String(cause);
  }
  return {
    rejected,
    error,
    completion_absent: !existsSync(join(output, "manifest.json")),
  };
}
export function runMatchingChecks(
  output: string,
  graph: GraphBundle,
  spec: SimulationSpec,
  observations: Observation[],
  truth: SimulationTruth,
  source: { commit: string; dirty: boolean },
): {
  matching: NonNullable<SimulationReportData["matching"]>;
  assertions: SimulationAssertion[];
} {
  const root = join(output, "matching");
  mkdirSync(root);
  const assertions: SimulationAssertion[] = [];
  const cases: NonNullable<SimulationReportData["matching"]>["cases"] = [];
  const check = (
    id: string,
    pass: boolean,
    en: string,
    ko: string,
    expected: unknown,
    actual: unknown,
    evidence: string,
  ) => {
    const assertion: SimulationAssertion = {
      assertion_id: "p04-" + id,
      status: pass ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected,
      actual,
      evidence_path: "matching/" + evidence,
    };
    assertions.push(assertion);
    writeFileSync(
      join(root, "checks.json"),
      JSON.stringify(assertions, null, 2) + "\n",
    );
    if (!pass) throw new MatchingFailure(en + " / " + ko);
  };
  const envelope = (id: string, samples: Observation[]): MatchingEnvelope => ({
    schema_version: "0.1",
    matching_id: id,
    graph_id: graph.graphId,
    observations: samples,
  });
  const run = (
    name: string,
    input: MatchingEnvelope,
    options: MatchingOptions = {},
    engine = true,
  ) => {
    const path = name + ".input.json";
    write(root, path, input);
    const result = runMatching(
      join(root, path),
      graph.directory,
      join(root, name),
      options,
    );
    verifyMatchingEvidence(
      join(root, name),
      join(root, path),
      graph,
      source,
      result,
    );
    const manifest = object(
      parseJson(readFileSync(join(root, name, "manifest.json"))),
    );
    check(
      name + "-coverage",
      result.input_samples === input.observations.length &&
        result.matched_samples + result.excluded_samples ===
          input.observations.length &&
        manifest.engine_executed === engine,
      "Every input has a recorded outcome; required engine execution and cleanup are verified.",
      "모든 입력의 결과와 필요한 실제 엔진 실행·정리를 확인했습니다.",
      input.observations.length,
      result.matched_samples + result.excluded_samples,
      name + "/manifest.json",
    );
    return result;
  };
  const addCase = (
    id: string,
    en: string,
    ko: string,
    result: MatchingResult,
  ) =>
    cases.push({
      case_id: id,
      name_en: en,
      name_ko: ko,
      status: "PASS",
      input_samples: result.input_samples,
      matched_samples: result.matched_samples,
      excluded_samples: result.excluded_samples,
      accepted_traversals: result.accepted_traversals,
      excluded_traversals: result.excluded_traversals,
    });
  const baseline = run("baseline", envelope("p04-baseline", observations));
  for (const [id, count] of [
    ["baseline-clean", 2],
    ["upper-waiting", 4],
  ] as const) {
    const evaluation = evaluateTraversals(baseline, truth, id, 5);
    write(root, id + ".evaluation.json", evaluation);
    check(
      id + "-complete",
      evaluation.passed && evaluation.expected === count,
      "Clean traversal boundaries agree with independent truth within 5 ms.",
      "깨끗한 통과 경계가 독립 정답의 5밀리초 이내입니다.",
      { count, tolerance_ms: 5 },
      evaluation,
      id + ".evaluation.json",
    );
  }
  const waiting = baseline.traversals.find(
    (t) =>
      t.vehicle_id === "upper-waiting" &&
      t.label.toLowerCase() === "ad" &&
      t.status === "ACCEPTED",
  );
  check(
    "waiting-retained",
    waiting?.entered_at_ms === 0 &&
      waiting.exited_at_ms !== null &&
      waiting.exited_at_ms >= 5000,
    "Initial stationary five seconds remain in observed traversal timing.",
    "관측 통과 시간에 초기 정지 5초가 남아 있습니다.",
    true,
    waiting ?? null,
    "baseline/result.json",
  );
  const gap = baseline.traversals.filter(
    (t) => t.vehicle_id === "baseline-noisy",
  );
  check(
    "gap-no-complete",
    gap.every((t) => t.status === "EXCLUDED") &&
      gap.some((t) => t.reason_codes.includes("OBSERVATION_GAP")),
    "The gap vehicle creates no complete traversal and retains its gap reason.",
    "누락 차량은 완전 통과를 만들지 않고 누락 사유를 보존합니다.",
    0,
    gap.filter((t) => t.status === "ACCEPTED").length,
    "baseline/result.json",
  );
  write(
    root,
    "baseline.all-vehicle-evaluation.json",
    [...new Set(observations.map((p) => p.vehicle_id))].map((vehicle_id) => ({
      vehicle_id,
      tolerance_ms: 5,
      ...evaluateTraversals(baseline, truth, vehicle_id, 5),
    })),
  );
  addCase(
    "baseline",
    "Baseline clean, waiting and gap vehicles",
    "기본 깨끗한·정지·누락 차량",
    baseline,
  );
  const noisySpec = structuredClone(spec);
  noisySpec.simulation_id = "p04-continuous-noise";
  noisySpec.vehicles = [
    structuredClone(
      spec.vehicles.find((v) => v.vehicle_id === "upper-waiting")!,
    ),
  ];
  const vehicle = noisySpec.vehicles[0]!;
  vehicle.vehicle_id = "continuous-noisy";
  vehicle.noise_radius_m = 3;
  vehicle.drop_intervals = [];
  vehicle.speed_profile = vehicle.speed_profile.filter((p) => p.speed_mps > 0);
  write(root, "continuous-noisy.spec.json", noisySpec);
  write(root, "continuous-noisy.policy.json", {
    message_en:
      "Upper route, 3 m noise, no drops; initial stationary period removed to isolate continuous bounded-noise matching.",
    message_ko:
      "상단 경로·3m 잡음·누락 없음이며 연속 잡음 매칭을 분리 검사하기 위해 초기 정지를 제거했습니다.",
    boundary_tolerance_ms: 750,
  });
  runSimulation(
    join(root, "continuous-noisy.spec.json"),
    graph.directory,
    join(root, "continuous-noisy-simulation"),
  );
  const noisyManifest = object(
    parseJson(
      readFileSync(join(root, "continuous-noisy-simulation/manifest.json")),
    ),
  );
  if (
    noisyManifest.status !== "PASS" ||
    noisyManifest.graph_id !== graph.graphId ||
    noisyManifest.graph_manifest_sha256 !== graph.manifestSha256 ||
    !canonical(noisyManifest.source).equals(canonical(source)) ||
    noisyManifest.spec_sha256 !==
      sha256(readFileSync(join(root, "continuous-noisy.spec.json")))
  )
    throw new MatchingFailure(
      "Noisy simulation provenance mismatch / 잡음 시뮬레이션 출처 불일치",
    );
  for (const [path, hash] of Object.entries(
    object(noisyManifest.output_sha256),
  ))
    if (
      sha256(
        readFileSync(
          bundlePath(join(root, "continuous-noisy-simulation"), path),
        ),
      ) !== hash
    )
      throw new MatchingFailure(
        "Noisy simulation hash mismatch / 잡음 시뮬레이션 해시 불일치",
      );
  const noisyTruth = parseJson(
    readFileSync(join(root, "continuous-noisy-simulation/truth.json")),
  ) as SimulationTruth;
  const noisyObs = parseJson(
    readFileSync(join(root, "continuous-noisy-simulation/observations.json")),
  ) as Observation[];
  const noisy = run(
    "continuous-noisy",
    envelope("p04-continuous-noisy", noisyObs),
  );
  write(root, "continuous-noisy.all-edge-evaluation.json", {
    tolerance_ms: 750,
    ...evaluateTraversals(noisy, noisyTruth, "continuous-noisy", 750),
  });
  const noisyEvaluation = evaluateTraversals(
    noisy,
    noisyTruth,
    "continuous-noisy",
    750,
    ["DE", "EF", "de", "ef"],
  );
  write(root, "continuous-noisy.evaluation.json", noisyEvaluation);
  check(
    "continuous-noise-boundaries",
    noisyEvaluation.passed && noisyEvaluation.expected === 2,
    "Continuous bounded-noise internal traversals agree within 750 ms.",
    "연속 제한 잡음의 내부 통과가 750밀리초 이내로 일치합니다.",
    { internal_edges: 2, tolerance_ms: 750 },
    noisyEvaluation,
    "continuous-noisy.evaluation.json",
  );
  addCase(
    "continuous-noisy",
    "Continuous upper route with 3 m noise",
    "3m 잡음의 연속 상단 경로",
    noisy,
  );
  const epoch = Date.parse(spec.start_time_utc);
  const midpoint = Array.from(
    { length: 21 },
    (_, i): Observation => ({
      sample_id: "p04-midpoint:parallel:" + i * 1000,
      vehicle_id: "parallel",
      offset_ms: i * 1000,
      event_time_utc: new Date(epoch + i * 1000).toISOString(),
      longitude: 0.0001 + i * 0.00009,
      latitude: 0.00005,
      accuracy_m: 6,
      source_class: "SYNTHETIC",
    }),
  );
  const parallel = run(
    "parallel-midpoint",
    envelope("p04-parallel", midpoint),
    {},
    false,
  );
  check(
    "parallel-excluded",
    parallel.excluded_samples === 21 &&
      parallel.matched_samples === 0 &&
      parallel.accepted_traversals === 0 &&
      parallel.points.every((p) =>
        p.reason_codes.includes("AMBIGUOUS_PARALLEL"),
      ),
    "All 21 parallel-midpoint points are explicitly excluded for ambiguity.",
    "평행도로 중간 21개 표본을 모호성으로 명시적으로 제외했습니다.",
    21,
    parallel.excluded_samples,
    "parallel-midpoint/result.json",
  );
  addCase(
    "parallel-midpoint",
    "Ambiguous parallel midpoint",
    "모호한 평행도로 중간점",
    parallel,
  );
  for (const [name, options] of [
    ["split", { batch_size: 37 }],
    ["overlap", { batch_size: 37, overlap: 5 }],
  ] as const) {
    const result = run(name, envelope("p04-baseline", observations), options);
    check(
      name + "-parity",
      result.semantic_sha256 === baseline.semantic_sha256 &&
        canonical(result.traversals.map((t) => t.traversal_id)).equals(
          canonical(baseline.traversals.map((t) => t.traversal_id)),
        ),
      "Full and split/overlap batches preserve semantic hashes and traversal identities.",
      "전체·분할/중첩 배치가 의미 해시와 통과 식별자를 보존합니다.",
      baseline.semantic_sha256,
      result.semantic_sha256,
      name + "/result.json",
    );
    addCase(
      name,
      name === "split" ? "Split batch parity" : "Overlap batch parity",
      name === "split" ? "분할 배치 동일성" : "중첩 배치 동일성",
      result,
    );
  }
  const rejects: [string, MatchingEnvelope, string][] = [
    [
      "reversed",
      envelope("p04-reversed", [...observations].reverse()),
      graph.directory,
    ],
    [
      "duplicate",
      envelope("p04-duplicate", [...observations, observations[0]!]),
      graph.directory,
    ],
    [
      "wrong-graph",
      { ...envelope("p04-wrong", observations), graph_id: "wrong-graph" },
      graph.directory,
    ],
  ];
  cpSync(graph.directory, join(root, "tampered-graph"), { recursive: true });
  writeFileSync(join(root, "tampered-graph/config.json"), "\n", { flag: "a" });
  rejects.push([
    "tampered-graph",
    envelope("p04-tampered", observations),
    join(root, "tampered-graph"),
  ]);
  for (const [name, input, bundle] of rejects) {
    write(root, name + ".input.json", input);
    const rejectedOutput = join(root, "rejected-" + name);
    const { rejected, error, completion_absent } = checkRejectedMatching(
      join(root, name + ".input.json"),
      bundle,
      rejectedOutput,
    );
    write(root, name + ".rejection.json", {
      status: rejected ? "EXPECTED_REJECTION" : "FAIL",
      error,
      graph_directory: bundle,
      output_directory: rejectedOutput,
      completion_absent,
      message_en: "Invalid input rejection, not successful matching.",
      message_ko: "잘못된 입력 거부이며 성공한 매칭이 아닙니다.",
    });
    check(
      name + "-rejected",
      rejected && completion_absent,
      "Invalid input or tampered graph is refused before successful evidence.",
      "잘못된 입력·변조 그래프를 성공 증거 전에 거부했습니다.",
      true,
      rejected,
      name + ".rejection.json",
    );
  }
  const far = midpoint.slice(0, 2).map((p, i) => ({
    ...p,
    sample_id: "p04-far:" + i,
    vehicle_id: "far",
    longitude: 1 + i * 0.0001,
    latitude: 1,
    accuracy_m: 1,
  }));
  write(root, "engine-error.input.json", envelope("p04-engine-error", far));
  let engineFailed = false;
  let engineError = "";
  try {
    runMatching(
      join(root, "engine-error.input.json"),
      graph.directory,
      join(root, "engine-error"),
    );
  } catch (cause) {
    engineFailed =
      cause instanceof MatchingFailure || cause instanceof GraphError;
    engineError = String(cause);
  }
  write(root, "engine-error.expected.json", {
    expected_exit: 1,
    failed: engineFailed,
    error: engineError,
  });
  const failureAssertions = parseJson(
    readFileSync(join(root, "engine-error/assertions.json")),
  ) as { assertion_id: string; status: string }[];
  const failureCommands = parseJson(
    readFileSync(join(root, "engine-error/commands.json")),
  ) as { args: string[] }[];
  check(
    "actual-engine-error",
    failureCommands.some((command) =>
      command.args.includes("trace_attributes"),
    ) &&
      engineFailed &&
      !existsSync(join(root, "engine-error/manifest.json")) &&
      failureAssertions.some(
        (a) => a.assertion_id === "matching-cleanup" && a.status === "PASS",
      ) &&
      failureAssertions.some(
        (a) => a.assertion_id === "matching-execution" && a.status === "FAIL",
      ),
    "Actual upstream map_snap failure produces no PASS manifest and its container is removed.",
    "실제 엔진 map_snap 실패는 통과 목록을 만들지 않으며 컨테이너가 제거됩니다.",
    true,
    { engineFailed, failureAssertions },
    "engine-error/assertions.json",
  );
  write(root, "cases.json", cases);
  write(root, "manifest.json", {
    status: "PASS",
    source,
    graph_id: graph.graphId,
    cleanup_verified: true,
    output_sha256: evidenceHashes(root),
  });
  return { matching: { ...baseline, cases }, assertions };
}
