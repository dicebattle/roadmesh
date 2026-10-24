import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { arch, platform } from "node:os";
import {
  canonical,
  cliArguments,
  consoleIO,
  type ConsoleIO,
  isMain,
  parseJson,
  ROOT,
  sha256,
} from "./shared.js";
import { object, items } from "./graph_evidence.js";
import {
  bundlePath,
  loadGraphBundle,
  type GraphBundle,
} from "./graph_bundle.js";
import { sourceIdentity } from "./pilot_runner.js";
import { runGraph } from "./test_graph.js";
import {
  type SimulationSpec,
  type SimulationTruth,
  type Observation,
  type Omission,
  type SimulationAssertion,
} from "./vehicle_simulator.js";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "./simulation_report.js";
import { runMatchingChecks } from "./matching_checks.js";
import { implementationFingerprint } from "./media_manifest.js";

export interface StageProcess {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}
export type StageExecutor = (
  script: string,
  args: string[],
  timeout: number,
) => StageProcess;
const executeStage: StageExecutor = (script, args, timeout) =>
  spawnSync(
    process.execPath,
    [join(ROOT, "dist/tools", script + ".js"), ...args],
    { cwd: ROOT, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024 },
  );
export class IntegrationFailure extends Error {
  readonly exitCode = 1;
}
interface Command {
  id: string;
  script: string;
  args: string[];
  expected_exit: number;
  actual_exit: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
}
function writeJson(directory: string, name: string, value: unknown): void {
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
}
function readJson(directory: string, name: string): unknown {
  return parseJson(readFileSync(join(directory, name)));
}
export function verifySimulationManifest(
  directory: string,
  manifest: Record<string, unknown>,
  source: { commit: string; dirty: boolean },
): void {
  if (!canonical(manifest.source).equals(canonical(source)))
    throw new IntegrationFailure(
      "Child source identity differs / 하위 실행 소스 식별자가 다릅니다",
    );
  const outputHashes = object(manifest.output_sha256);
  for (const required of [
    "truth.json",
    "observations.json",
    "omissions.json",
    "assertions.json",
    "summary.md",
  ])
    if (typeof outputHashes[required] !== "string")
      throw new IntegrationFailure(
        "Missing child output hash / 하위 출력 해시가 없습니다",
      );
  for (const [path, expected] of Object.entries(outputHashes))
    if (sha256(readFileSync(bundlePath(directory, path))) !== expected)
      throw new IntegrationFailure(
        "Child output hash mismatch / 하위 출력 해시가 다릅니다",
      );
  for (const [file, key] of [
    ["truth.json", "truth_sha256"],
    ["observations.json", "observations_sha256"],
    ["omissions.json", "omissions_sha256"],
  ])
    if (sha256(canonical(readJson(directory, file!))) !== manifest[key!])
      throw new IntegrationFailure(
        "Child semantic hash mismatch / 하위 의미 해시가 다릅니다",
      );
}
function requirePass(directory: string): Record<string, unknown> {
  const manifest = object(readJson(directory, "manifest.json"));
  if (manifest.status !== "PASS")
    throw new IntegrationFailure(
      "Stage completion is missing or unsuccessful / 단계 완료가 없거나 성공하지 않았습니다",
    );
  return manifest;
}
export function buildReportData(
  source: { commit: string; dirty: boolean },
  graph: GraphBundle,
  spec: SimulationSpec,
  truth: SimulationTruth,
  observations: Observation[],
  omissions: Omission[],
  stages: SimulationReportData["stages"],
  assertions: SimulationAssertion[],
  fingerprint: string,
  matching?: SimulationReportData["matching"],
): SimulationReportData {
  return {
    schema_version: "0.1",
    source,
    graph_id: graph.graphId,
    generated_at_utc: new Date().toISOString(),
    implementation_sha256: fingerprint,
    summary: {
      status: assertions.every((item) => item.status === "PASS")
        ? "PASS"
        : "FAIL",
      assertions_passed: assertions.filter((item) => item.status === "PASS")
        .length,
      assertions_total: assertions.length,
      vehicle_count: spec.vehicles.length,
      observation_count: observations.length,
      omission_count: omissions.length,
      duration_ms: spec.duration_ms,
    },
    stages,
    roads: graph.fixture.ways.map((way) => {
      const edge = graph.edges.find(
        (value) => value.label === way.label && value.forward,
      )!;
      return {
        label: edge.label,
        edge_id: edge.edge_id,
        forward: true,
        car_access: edge.car_access,
        coordinates: edge.directed_geometry,
      };
    }),
    vehicles: [...spec.vehicles]
      .sort((a, b) => (a.vehicle_id < b.vehicle_id ? -1 : 1))
      .map((vehicle) => ({
        vehicle_id: vehicle.vehicle_id,
        truth: truth.samples
          .filter((sample) => sample.vehicle_id === vehicle.vehicle_id)
          .map(({ offset_ms, longitude, latitude, edge_id }) => ({
            offset_ms,
            longitude,
            latitude,
            edge_id,
          })),
        observations: observations
          .filter((sample) => sample.vehicle_id === vehicle.vehicle_id)
          .map(({ offset_ms, longitude, latitude, accuracy_m }) => ({
            offset_ms,
            longitude,
            latitude,
            accuracy_m,
          })),
        omissions: omissions
          .filter((sample) => sample.vehicle_id === vehicle.vehicle_id)
          .map(({ offset_ms, reason }) => ({ offset_ms, reason })),
        traversals: truth.traversals
          .filter((traversal) => traversal.vehicle_id === vehicle.vehicle_id)
          .map(({ vehicle_id: _, ...rest }) => rest),
      })),
    assertions,
    ...(matching ? { matching } : {}),
    limitations: [
      {
        message_en:
          "Original fictional equatorial roads and controlled kinematics; not real-road accuracy or driver behavior.",
        message_ko:
          "직접 만든 가상의 적도 도로와 통제된 운동학이며 실제 도로 정확도·운전자 행동 검증이 아닙니다.",
      },
      {
        message_en: matching
          ? "Synthetic-only batch matching; no real-road accuracy, traffic aggregation/publication, distributed-node or mobile execution proof."
          : "No noisy map-matching, traffic aggregation/publication, distributed-node or mobile execution proof yet.",
        message_ko: matching
          ? "합성 전용 배치 매칭이며 실제 도로 정확도·교통 집계/게시·분산 노드·모바일 실행은 검증하지 않았습니다."
          : "잡음 도로 매칭·교통 집계/게시·분산 노드·모바일 실행은 아직 검증하지 않았습니다.",
      },
      {
        message_en:
          "Current implemented-module integration, not the full P12/P14b fault matrix or complete navigation client.",
        message_ko:
          "현재 구현 모듈의 통합 검사이며 P12/P14b 전체 장애 행렬이나 완전한 내비게이션 클라이언트가 아닙니다.",
      },
    ],
  };
}
export function runChecks(
  outputPath: string,
  execute: StageExecutor = executeStage,
): number {
  const output = resolve(outputPath),
    source = sourceIdentity();
  if (!source.commit || source.dirty === null)
    throw new Error(
      "Source identity unavailable / 소스 식별 정보를 확인할 수 없습니다",
    );
  const verifiedSource = { commit: source.commit, dirty: source.dirty },
    fingerprint = implementationFingerprint();
  mkdirSync(output);
  const stages: SimulationReportData["stages"] = [],
    commands: Command[] = [],
    assertions: SimulationAssertion[] = [];
  const stage = (
    id: string,
    nameEn: string,
    nameKo: string,
    evidence: string,
    run: () => void,
  ): void => {
    const started = performance.now();
    let success = false;
    try {
      run();
      success = true;
    } finally {
      stages.push({
        id,
        name_en: nameEn,
        name_ko: nameKo,
        status: success ? "PASS" : "FAIL",
        evidence_path: evidence,
        duration_ms: performance.now() - started,
      });
    }
  };
  const command = (
    id: string,
    script: string,
    args: string[],
    expected = 0,
  ): StageProcess => {
    const started = performance.now(),
      process = execute(script, args, 650000),
      stdout = `${id}.stdout.txt`,
      stderr = `${id}.stderr.txt`;
    writeFileSync(join(output, stdout), process.stdout ?? "");
    writeFileSync(join(output, stderr), process.stderr ?? "");
    commands.push({
      id,
      script,
      args,
      expected_exit: expected,
      actual_exit: process.status,
      duration_ms: performance.now() - started,
      stdout,
      stderr,
    });
    writeFileSync(
      join(output, "commands.json"),
      JSON.stringify(commands, null, 2) + "\n",
    );
    if (process.error || process.status !== expected)
      throw new IntegrationFailure(
        `Fresh stage ${id} returned ${process.status}, expected ${expected}. / 새 단계 ${id}의 종료 코드가 ${process.status}이며 기대값은 ${expected}입니다.`,
      );
    return process;
  };
  const check = (
    id: string,
    passed: boolean,
    en: string,
    ko: string,
    expected: unknown,
    actual: unknown,
    evidence: string,
  ): void => {
    assertions.push({
      assertion_id: id,
      status: passed ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected,
      actual,
      evidence_path: evidence,
    });
    if (!passed) throw new IntegrationFailure(`${en} / ${ko}`);
  };
  try {
    stage(
      "corpus",
      "Synthetic corpus validation",
      "합성 자료 검사",
      "corpus/report.json",
      () => {
        mkdirSync(join(output, "corpus"));
        const path = join(ROOT, "fixtures/evaluation/synthetic-seoul.json");
        const normal = command("corpus-valid", "evaluation_corpus", [path]);
        const strict = command(
          "corpus-strict",
          "evaluation_corpus",
          [path, "--require-ready"],
          1,
        );
        const report = object(parseJson(strict.stdout));
        writeJson(output, "corpus/report.json", report);
        check(
          "synthetic-quota-refusal",
          report.ready_for_m0_measurement === false &&
            canonical(parseJson(normal.stdout)).equals(canonical(report)),
          "Synthetic corpus is valid but cannot satisfy the real-road quota.",
          "합성 자료는 유효하지만 실제 도로 사례 기준을 충족하지 않습니다.",
          false,
          report.ready_for_m0_measurement,
          "corpus/report.json",
        );
      },
    );
    stage(
      "p01",
      "Fresh schedule replay and required checks",
      "새 일정 재생·필수 검사",
      "p01/checks.json",
      () => {
        command("p01", "pilot_checks", ["--output", join(output, "p01")]);
        const checks = items(readJson(output, "p01/checks.json"));
        for (const name of [
          "success-a",
          "success-b",
          "failed",
          "unsupported",
        ]) {
          const manifest = object(
            readJson(output, "p01/" + name + "/manifest.json"),
          );
          if (
            !canonical(manifest.source).equals(canonical(verifiedSource)) ||
            manifest.scenario_sha256 !==
              sha256(readFileSync(join(output, "p01/" + name + ".json"))) ||
            manifest.event_sha256 !==
              sha256(
                canonical(readJson(output, "p01/" + name + "/events.json")),
              )
          )
            throw new IntegrationFailure(
              "P01 provenance/hash mismatch / P01 출처·해시 불일치",
            );
        }
        check(
          "p01-replay-failure-skip",
          checks.length === 5 &&
            checks.every((value) => object(value).status === "PASS"),
          "Fresh P01 replay, deliberate failure, skip and invalid-input checks passed.",
          "새 P01 재생·의도적 실패·생략·잘못된 입력 검사가 통과했습니다.",
          5,
          checks.length,
          "p01/checks.json",
        );
      },
    );
    let bundle: GraphBundle | undefined;
    stage(
      "p02",
      "Fresh real-engine graph and routing",
      "실제 엔진의 새 그래프·경로",
      "graph/manifest.json",
      () => {
        runGraph(join(output, "graph"));
        bundle = loadGraphBundle(join(output, "graph"));
        if (
          !canonical(bundle.manifest.source).equals(canonical(verifiedSource))
        )
          throw new IntegrationFailure(
            "P02 source identity differs / P02 소스 식별자가 다릅니다",
          );
        check(
          "p02-cleanup-and-graph",
          bundle.manifest.cleanup_verified === true,
          "Fresh real Valhalla graph, road legality and container cleanup verified.",
          "새 실제 Valhalla 그래프·통행 규칙·컨테이너 정리를 확인했습니다.",
          true,
          bundle.manifest.cleanup_verified,
          "graph/manifest.json",
        );
      },
    );
    const graph = bundle!,
      spec = object(
        parseJson(readFileSync(join(ROOT, "fixtures/simulation/demo.json"))),
      ) as unknown as SimulationSpec;
    spec.graph_id = graph.graphId;
    writeJson(output, "simulation-spec.json", spec);
    let manifest: Record<string, unknown> = {};
    stage(
      "p03",
      "Seeded geographic truth and observations",
      "시드 기반 지리 정답·관측",
      "simulation/manifest.json",
      () => {
        command("simulation", "vehicle_simulator", [
          join(output, "simulation-spec.json"),
          "--graph",
          join(output, "graph"),
          "--output",
          join(output, "simulation"),
        ]);
        manifest = requirePass(join(output, "simulation"));
        verifySimulationManifest(
          join(output, "simulation"),
          manifest,
          verifiedSource,
        );
        if (
          manifest.spec_sha256 !==
            sha256(readFileSync(join(output, "simulation-spec.json"))) ||
          manifest.graph_manifest_sha256 !== graph.manifestSha256
        )
          throw new IntegrationFailure(
            "P03 input provenance mismatch / P03 입력 출처가 다릅니다",
          );
        check(
          "p02-p03-graph-binding",
          manifest.graph_id === graph.graphId,
          "Simulation uses this run’s verified graph identity.",
          "시뮬레이션이 이번 실행에서 검증한 그래프 식별자를 사용합니다.",
          graph.graphId,
          manifest.graph_id,
          "simulation/manifest.json",
        );
        const expected = object(
            parseJson(
              readFileSync(
                join(ROOT, "fixtures/simulation/demo-expectations.json"),
              ),
            ),
          ),
          truth = readJson(output, "simulation/truth.json") as SimulationTruth,
          observations = readJson(
            output,
            "simulation/observations.json",
          ) as Observation[],
          omissions = readJson(
            output,
            "simulation/omissions.json",
          ) as Omission[];
        for (const [id, want, actual] of [
          ["truth-count", expected.truth_count, truth.samples.length],
          [
            "observation-count",
            expected.observation_count,
            observations.length,
          ],
          ["omission-count", expected.omission_count, omissions.length],
          [
            "traversal-count",
            expected.traversal_count,
            truth.traversals.length,
          ],
        ] as const)
          check(
            "authored-" + id,
            want === actual,
            "Counts match independent hand calculations.",
            "개수가 독립 수작업 계산과 일치합니다.",
            want,
            actual,
            "simulation/truth.json",
          );
        for (const id of ["baseline-clean", "baseline-noisy"]) {
          const samples = truth.samples.filter(
              (sample) => sample.vehicle_id === id,
            ),
            traversals = truth.traversals.filter(
              (item) => item.vehicle_id === id,
            );
          check(
            "authored-arrival-" + id,
            samples.at(-1)?.offset_ms === expected.baseline_arrival_ms,
            "Arrival matches independent distance/speed calculation.",
            "도착 시각이 독립 거리·속도 계산과 일치합니다.",
            expected.baseline_arrival_ms,
            samples.at(-1)?.offset_ms,
            "simulation/truth.json",
          );
          check(
            "authored-ab-exit-" + id,
            traversals[0]?.exited_at_ms === expected.baseline_ab_exit_ms,
            "AB exit matches hand calculation.",
            "AB 진출이 수작업 계산과 일치합니다.",
            expected.baseline_ab_exit_ms,
            traversals[0]?.exited_at_ms,
            "simulation/truth.json",
          );
        }
        const upper = truth.traversals.filter(
            (item) => item.vehicle_id === "upper-waiting",
          ),
          upperExits = upper.map((item) => item.exited_at_ms),
          waiting = truth.samples.filter(
            (sample) =>
              sample.vehicle_id === "upper-waiting" && sample.offset_ms <= 5000,
          );
        check(
          "authored-upper-exits",
          canonical(upperExits).equals(canonical(expected.upper_exit_ms)),
          "Upper crossings match independently calculated wait and distance.",
          "상단 통과 시각이 독립 대기·거리 계산과 일치합니다.",
          expected.upper_exit_ms,
          upperExits,
          "simulation/truth.json",
        );
        const waited =
          upper[0]?.entered_at_ms === 0 &&
          waiting.length === 6 &&
          waiting.every(
            (sample) => sample.longitude === 0 && sample.latitude === 0,
          );
        check(
          "authored-zero-speed-wait",
          waited,
          "Upper vehicle remains still through the initial five seconds.",
          "상단 차량이 처음 5초 동안 정지합니다.",
          true,
          waited,
          "simulation/truth.json",
        );
        const dropped = omissions
            .filter((sample) => sample.vehicle_id === "baseline-noisy")
            .map((sample) => sample.offset_ms),
          atEnd = observations.some(
            (sample) =>
              sample.vehicle_id === "baseline-noisy" &&
              sample.offset_ms === 25000,
          );
        check(
          "authored-drop-boundaries",
          canonical(dropped).equals(canonical(expected.noisy_omission_ms)) &&
            atEnd,
          "Independent half-open drop times and 25 s observation match.",
          "독립 반열린 누락 시각과 25초 관측이 일치합니다.",
          expected.noisy_omission_ms,
          dropped,
          "simulation/omissions.json",
        );
        for (const assertion of items(
          readJson(output, "simulation/assertions.json"),
        )) {
          const item = object(assertion) as unknown as SimulationAssertion;
          if (item.status !== "PASS")
            throw new IntegrationFailure(
              "P03 required assertion failed / P03 필수 검사가 실패했습니다",
            );
          assertions.push({
            ...item,
            assertion_id: `p03-${item.assertion_id}`,
            evidence_path: `simulation/${item.evidence_path}`,
          });
        }
      },
    );
    stage(
      "replay",
      "Fresh replay and fault invariance",
      "새 재생·장애 불변성",
      "replay/checks.json",
      () => {
        mkdirSync(join(output, "replay"));
        const variants: { name: string; spec: SimulationSpec }[] = [
          { name: "same-seed", spec: structuredClone(spec) },
          { name: "clean", spec: structuredClone(spec) },
          { name: "other-seed", spec: structuredClone(spec) },
          { name: "reordered", spec: structuredClone(spec) },
        ];
        variants[1]!.spec.vehicles.forEach((vehicle) => {
          vehicle.noise_radius_m = 0;
          vehicle.drop_intervals = [];
        });
        variants[2]!.spec.seed = 8;
        variants[3]!.spec.vehicles.reverse();
        for (const variant of variants) {
          const path = `replay/${variant.name}.spec.json`;
          writeJson(output, path, variant.spec);
          command(`replay-${variant.name}`, "vehicle_simulator", [
            join(output, path),
            "--graph",
            join(output, "graph"),
            "--output",
            join(output, "replay", variant.name),
          ]);
          const other = requirePass(join(output, "replay", variant.name));
          verifySimulationManifest(
            join(output, "replay", variant.name),
            other,
            verifiedSource,
          );
          if (
            other.graph_id !== graph.graphId ||
            other.spec_sha256 !== sha256(readFileSync(join(output, path))) ||
            other.graph_manifest_sha256 !== graph.manifestSha256
          )
            throw new IntegrationFailure(
              "Replay input provenance mismatch / 재생 입력 출처가 다릅니다",
            );
          check(
            `truth-invariance-${variant.name}`,
            other.truth_sha256 === manifest.truth_sha256,
            "Replay/fault changes preserve independent truth.",
            "재생·장애 변경이 독립 정답을 보존합니다.",
            manifest.truth_sha256,
            other.truth_sha256,
            `replay/${variant.name}/manifest.json`,
          );
          if (variant.name === "same-seed" || variant.name === "reordered")
            check(
              `observation-replay-${variant.name}`,
              other.observations_sha256 === manifest.observations_sha256 &&
                other.omissions_sha256 === manifest.omissions_sha256,
              "Same seeded observations and omissions replay exactly.",
              "같은 시드의 관측·누락이 정확히 재생됩니다.",
              manifest.observations_sha256,
              other.observations_sha256,
              `replay/${variant.name}/manifest.json`,
            );
          if (variant.name === "other-seed")
            check(
              "noise-seed-changes",
              other.observations_sha256 !== manifest.observations_sha256,
              "A different seed changes noise, while truth remains fixed.",
              "다른 시드는 잡음만 바꾸고 정답은 유지합니다.",
              true,
              other.observations_sha256 !== manifest.observations_sha256,
              `replay/${variant.name}/manifest.json`,
            );
        }
        const truth = readJson(
          output,
          "simulation/truth.json",
        ) as SimulationTruth;
        const normalized = (id: string) =>
          truth.samples
            .filter((sample) => sample.vehicle_id === id)
            .map(({ sample_id: _, vehicle_id: __, ...rest }) => rest);
        const pairedEqual = canonical(normalized("baseline-clean")).equals(
          canonical(normalized("baseline-noisy")),
        );
        check(
          "clean-noisy-paired-truth",
          pairedEqual,
          "Authored clean/noisy vehicle pair has identical independent truth.",
          "직접 작성한 깨끗한·잡음 차량 쌍의 독립 정답이 같습니다.",
          true,
          pairedEqual,
          "simulation/truth.json",
        );
        const invalid = structuredClone(spec);
        invalid.vehicles[0]!.path = [{ label: "unknown-road", forward: true }];
        writeJson(output, "replay/invalid-path.spec.json", invalid);
        command(
          "invalid-path",
          "vehicle_simulator",
          [
            join(output, "replay/invalid-path.spec.json"),
            "--graph",
            join(output, "graph"),
            "--output",
            join(output, "replay/invalid-path"),
          ],
          2,
        );
        check(
          "invalid-path-rejected",
          !existsSync(join(output, "replay/invalid-path/manifest.json")),
          "Invalid authored path was rejected; no successful simulation produced.",
          "잘못된 작성 경로를 거부했으며 성공 시뮬레이션을 만들지 않았습니다.",
          false,
          existsSync(join(output, "replay/invalid-path/manifest.json")),
          "invalid-path.stderr.txt",
        );
        cpSync(join(output, "graph"), join(output, "replay/tampered-graph"), {
          recursive: true,
        });
        writeFileSync(join(output, "replay/tampered-graph/config.json"), "\n", {
          flag: "a",
        });
        command(
          "tampered-bundle",
          "vehicle_simulator",
          [
            join(output, "simulation-spec.json"),
            "--graph",
            join(output, "replay/tampered-graph"),
            "--output",
            join(output, "replay/tampered-simulation"),
          ],
          2,
        );
        check(
          "tampered-graph-rejected",
          !existsSync(join(output, "replay/tampered-simulation/manifest.json")),
          "Tampered graph bundle was rejected; no successful simulation produced.",
          "변조된 그래프 묶음을 거부했으며 성공 시뮬레이션을 만들지 않았습니다.",
          false,
          existsSync(join(output, "replay/tampered-simulation/manifest.json")),
          "tampered-bundle.stderr.txt",
        );
        writeJson(
          output,
          "replay/checks.json",
          assertions.filter(
            (item) =>
              item.assertion_id.includes("invariance") ||
              item.assertion_id.includes("replay") ||
              item.assertion_id.includes("rejected") ||
              item.assertion_id.includes("paired"),
          ),
        );
      },
    );
    let matching: SimulationReportData["matching"];
    stage(
      "p04",
      "Actual engine matching and conservative traversal evidence",
      "실제 엔진 매칭·보수적인 통과 증거",
      "matching/manifest.json",
      () => {
        let result: ReturnType<typeof runMatchingChecks>;
        try {
          result = runMatchingChecks(
            output,
            graph,
            spec,
            readJson(output, "simulation/observations.json") as Observation[],
            readJson(output, "simulation/truth.json") as SimulationTruth,
            verifiedSource,
          );
        } catch (error) {
          throw new IntegrationFailure(
            `P04 stage failed / P04 단계 실패: ${String(error)}`,
          );
        }
        matching = result.matching;
        assertions.push(...result.assertions);
      },
    );
    if (implementationFingerprint() !== fingerprint)
      throw new IntegrationFailure(
        "Implementation changed during run / 실행 중 구현이 변경되었습니다",
      );
    const truth = readJson(output, "simulation/truth.json") as SimulationTruth,
      observations = readJson(
        output,
        "simulation/observations.json",
      ) as Observation[],
      omissions = readJson(output, "simulation/omissions.json") as Omission[];
    const data = buildReportData(
      verifiedSource,
      graph,
      spec,
      truth,
      observations,
      omissions,
      stages,
      assertions,
      fingerprint,
      matching,
    );
    writeJson(output, "report-data.json", data);
    writeFileSync(join(output, "report.html"), renderSimulationReport(data), {
      flag: "wx",
    });
    writeJson(output, "assertions.json", assertions);
    writeFileSync(
      join(output, "summary.md"),
      `# Implemented-module integration / 구현 모듈 통합 검사\n\nPASS: fresh corpus → P01 → real Docker P02 → P03 → replay/fault checks → P04 matching/exclusions.\n통과: 새 자료 검사 → P01 → 실제 Docker P02 → P03 → 재생·장애 검사 → P04 매칭·제외.\n\nNot the complete P01–P14 pilot or full P12/P14b fault matrix.\nP01~P14 전체 파일럿이나 P12/P14b 전체 장애 행렬의 완료는 아닙니다.\n\n[Offline report / 오프라인 보고서](report.html)\n`,
    );
    const outputs = Object.fromEntries(
      [
        "report-data.json",
        "report.html",
        "assertions.json",
        "summary.md",
        "commands.json",
        "matching/manifest.json",
      ].map((path) => [path, sha256(readFileSync(join(output, path)))]),
    );
    writeJson(output, "manifest.json.tmp", {
      schema_version: "0.1",
      source: verifiedSource,
      node: process.versions.node,
      host_architecture: arch(),
      host_platform: platform(),
      graph_id: graph.graphId,
      implementation_sha256: fingerprint,
      status: "PASS",
      stages,
      output_sha256: outputs,
      cleanup_verified: graph.manifest.cleanup_verified,
      completed_at_utc: new Date().toISOString(),
    });
    renameSync(
      join(output, "manifest.json.tmp"),
      join(output, "manifest.json"),
    );
    return 0;
  } catch (error) {
    assertions.push({
      assertion_id: "integration-incomplete",
      status: "FAIL",
      message_en: `Fresh integration did not complete: ${String(error)}`,
      message_ko: `새 통합 실행이 완료되지 않았습니다: ${String(error)}`,
      expected: "all required stages PASS",
      actual: "incomplete",
      evidence_path: "commands.json",
    });
    if (!existsSync(join(output, "assertions.json")))
      writeJson(output, "assertions.json", assertions);
    writeFileSync(
      join(output, "summary.md"),
      `# Integration incomplete / 통합 실행 미완료\n\nFAIL / 실패: ${String(error)}\n\nNo completion manifest; partial evidence only.\n완료 목록이 없으며 일부 증거만 남아 있습니다.\n`,
    );
    throw error;
  }
}
export function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): number {
  try {
    const args = cliArguments(argv, "checks");
    if (args.help) {
      io.out(
        "usage / 사용법: npm run simulation:check -- --output NEW_DIRECTORY\nFresh corpus, schedule, real Docker graph, simulation, replay, matching and rejection checks. / 자료·일정·실제 Docker 그래프·시뮬레이션·재생·매칭·거부 검사를 새로 실행합니다.\nExit 0: completed integration; 1: failed stage; 2: input/environment/output error. / 종료 코드 0: 통합 완료, 1: 단계 실패, 2: 입력·환경·출력 오류",
      );
      return 0;
    }
    return runChecks(args.output);
  } catch (error) {
    io.error(
      `Integrated simulation incomplete / 통합 시뮬레이션 미완료: ${String(error)}`,
    );
    return error instanceof IntegrationFailure ? 1 : 2;
  }
}
export const runTinyChecks = runChecks;
if (isMain(import.meta.url)) process.exitCode = main();
