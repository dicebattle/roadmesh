import { arch, platform } from "node:os";
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  canonical,
  consoleIO,
  type ConsoleIO,
  fail,
  InputError,
  integer,
  isMain,
  parseJson,
  sha256,
} from "./shared.js";
import {
  bundlePath,
  loadGraphBundle,
  type GraphBundle,
} from "./graph_bundle.js";
import { object } from "./graph_evidence.js";
import {
  GraphCommands,
  GraphError,
  OwnedGraphContainer,
  engineJson,
  type Executor,
} from "./test_graph.js";
import { sourceIdentity } from "./pilot_runner.js";
import {
  MatchingSession,
  MATCHING_POLICY,
  MAX_MATCHING_SAMPLES,
  validateEnvelope,
  splitContinuousRuns,
  type ContinuousRun,
  type MatchingEnvelope,
  type MatchingResult,
} from "./matching_evidence.js";

export const MAX_MATCHING_BYTES = 32 * 1024 * 1024;
export interface MatchingOptions {
  batch_size?: number;
  overlap?: number;
  execute?: Executor;
}
export class MatchingFailure extends Error {
  readonly exitCode = 1;
}
function writeJson(directory: string, name: string, value: unknown): void {
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
}
export function traceRequest(run: ContinuousRun): Record<string, unknown> {
  return {
    shape: run.observations.map((observation) => ({
      lon: observation.longitude,
      lat: observation.latitude,
      time: observation.offset_ms / 1000,
    })),
    shape_match: "map_snap",
    costing: "auto",
    trace_options: {
      gps_accuracy: 5,
      search_radius: 30,
      interpolation_distance: 0,
    },
    filters: {
      action: "include",
      attributes: [
        "edge.id",
        "edge.way_id",
        "edge.length",
        "edge.begin_shape_index",
        "edge.end_shape_index",
        "matched.point",
        "matched.type",
        "matched.edge_index",
        "matched.begin_route_discontinuity",
        "matched.end_route_discontinuity",
        "matched.distance_along_edge",
        "matched.distance_from_trace_point",
        "shape",
      ],
    },
  };
}
export function loadMatchingInput(
  path: string,
  bundle: GraphBundle,
): { envelope: MatchingEnvelope; input_sha256: string } {
  const descriptor = openSync(path, "r"),
    buffer = Buffer.alloc(MAX_MATCHING_BYTES + 1);
  let length = 0;
  try {
    while (length < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!count) break;
      length += count;
    }
  } finally {
    closeSync(descriptor);
  }
  if (length > MAX_MATCHING_BYTES)
    fail("matching input", "input exceeds 32 MiB", "입력이 32MiB를 초과합니다");
  const raw = buffer.subarray(0, length);
  return {
    envelope: validateEnvelope(parseJson(raw), bundle),
    input_sha256: sha256(raw),
  };
}
export function runMatching(
  inputPath: string,
  graphDirectory: string,
  output: string,
  options: MatchingOptions = {},
): MatchingResult {
  const bundle = loadGraphBundle(graphDirectory),
    { envelope, input_sha256 } = loadMatchingInput(inputPath, bundle);
  if (options.batch_size !== undefined)
    integer(options.batch_size, "batch_size", 1, MAX_MATCHING_SAMPLES);
  if (options.overlap !== undefined)
    integer(
      options.overlap,
      "overlap",
      0,
      (options.batch_size ?? MAX_MATCHING_SAMPLES) - 1,
    );
  const source = sourceIdentity();
  mkdirSync(output);
  mkdirSync(join(output, "requests"));
  writeJson(output, "input.json", envelope);
  writeJson(output, "commands.json", []);
  const commands = new GraphCommands(output, options.execute),
    container = new OwnedGraphContainer(commands);
  const eligibleRuns = splitContinuousRuns(envelope, bundle).runs.filter(
    (run) => run.observations.length >= 2,
  );
  let result: MatchingResult | undefined,
    failure: unknown,
    cleanup = false,
    engineExecuted = false,
    runtimeConfigSha: string | null = null;
  try {
    if (eligibleRuns.length) {
      const image = object(bundle.manifest.image),
        id = image.id;
      if (typeof id !== "string" || !/^sha256:[0-9a-f]{64}$/.test(id))
        fail(
          "image",
          "invalid graph image identity",
          "그래프 이미지 식별자가 올바르지 않습니다",
        );
      container.start(id, output, bundle.directory);
      engineExecuted = true;
      const version = container
        .exec(["valhalla_service", "--version"], 30000, false, true)
        .stdout.trim();
      if (version !== "3.9.1")
        throw new MatchingFailure(
          "Unexpected pinned Valhalla version / 고정 Valhalla 버전이 다릅니다",
        );
      const config = object(
          parseJson(readFileSync(bundlePath(bundle.directory, "config.json"))),
        ),
        mjolnir = object(config.mjolnir);
      Object.assign(mjolnir, {
        tile_dir: "/graph/tiles",
        tile_extract: "",
        admin: "/graph/not-provided-admin.sqlite",
        timezone: "/graph/not-provided-timezone.sqlite",
      });
      writeJson(output, "runtime-config.json", config);
      runtimeConfigSha = sha256(
        readFileSync(join(output, "runtime-config.json")),
      );
    }
    const session = new MatchingSession(
      {
        schema_version: "0.1",
        matching_id: envelope.matching_id,
        graph_id: envelope.graph_id,
      },
      bundle,
      (run) => {
        const name = `requests/${run.vehicle_id}-${run.index}`,
          request = traceRequest(run);
        writeJson(output, name + ".request.json", request);
        const process = container.exec(
          [
            "valhalla_service",
            "/work/runtime-config.json",
            "trace_attributes",
            `/work/${name}.request.json`,
          ],
          30000,
          true,
        );
        if (process.status !== 0)
          throw new MatchingFailure(
            `Engine matching failed for ${run.vehicle_id}/${run.index}; exclusions cannot hide an engine failure. / ${run.vehicle_id}/${run.index} 엔진 매칭이 실패했으며 제외 처리로 숨기지 않습니다.`,
          );
        const response = engineJson(process.stdout);
        writeJson(output, name + ".response.json", response);
        return response;
      },
    );
    const size = options.batch_size ?? envelope.observations.length,
      overlap = options.overlap ?? 0;
    for (
      let offset = 0;
      offset < envelope.observations.length;
      offset += size
    ) {
      const begin = offset === 0 ? 0 : Math.max(0, offset - overlap);
      session.append(
        envelope.observations.slice(
          begin,
          Math.min(envelope.observations.length, offset + size),
        ),
      );
    }
    result = session.finalize();
    try {
      const verified = loadGraphBundle(graphDirectory);
      if (
        verified.manifestSha256 !== bundle.manifestSha256 ||
        verified.graphId !== bundle.graphId
      )
        throw new Error("Graph identity changed");
    } catch (error) {
      throw new MatchingFailure(
        `Graph recheck failed / 그래프 재검사가 실패했습니다: ${String(error)}`,
      );
    }
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
  const assertions = [
    {
      assertion_id: "matching-execution",
      status: failure ? "FAIL" : "PASS",
      message_en: failure
        ? "Matching execution/evidence failed."
        : "Matching completed; exclusions are not accepted traversals.",
      message_ko: failure
        ? "매칭 실행·증거가 실패했습니다."
        : "매칭 실행을 완료했으며 제외는 통과 수용이 아닙니다.",
      evidence_path: "result.json",
    },
    {
      assertion_id: "matching-cleanup",
      status: cleanup ? "PASS" : "FAIL",
      message_en: cleanup
        ? "Owned container absence verified."
        : "Container cleanup unverified.",
      message_ko: cleanup
        ? "소유 컨테이너 부재를 확인했습니다."
        : "컨테이너 정리를 확인하지 못했습니다.",
      evidence_path: "commands.json",
    },
  ];
  writeJson(output, "assertions.json", assertions);
  if (result) writeJson(output, "result.json", result);
  writeFileSync(
    join(output, "summary.md"),
    `# Bounded synthetic matching / 제한된 합성 매칭\n\n${failure ? "FAIL / 실패" : "PASS / 통과"}\n\nPolicy: ${MATCHING_POLICY}; synthetic 1 s observations only. The 3 s gap policy is not the production sampling contract.\n정책: ${MATCHING_POLICY}, 합성 1초 관측 전용입니다. 3초 누락 정책은 운영 관측 간격 계약이 아닙니다.\n\n${result ? `Input ${result.input_samples}; matched ${result.matched_samples}; excluded ${result.excluded_samples}; accepted traversals ${result.accepted_traversals}; excluded candidates ${result.excluded_traversals}.\n입력 ${result.input_samples}개, 대응 ${result.matched_samples}개, 제외 ${result.excluded_samples}개, 수용 통과 ${result.accepted_traversals}개, 제외 후보 ${result.excluded_traversals}개.` : String(failure)}\n\nNo truth, engine ETA or clipped engine edge length was used for traversal timing.\n통과 시각에 정답·엔진 예상시간·잘린 반환 구간 길이를 사용하지 않았습니다.\n`,
  );
  if (failure) throw failure;
  if (!result || !cleanup)
    throw new MatchingFailure(
      "Incomplete matching/cleanup evidence / 매칭·정리 증거가 완전하지 않습니다",
    );
  const outputs = evidenceHashes(output);
  const manifest = {
    schema_version: "0.1",
    matching_id: envelope.matching_id,
    policy_id: MATCHING_POLICY,
    source,
    node: process.versions.node,
    host_architecture: arch(),
    host_platform: platform(),
    graph_id: bundle.graphId,
    graph_manifest_sha256: bundle.manifestSha256,
    input_sha256,
    semantic_sha256: result.semantic_sha256,
    status: "PASS",
    cleanup_verified: cleanup,
    engine_executed: engineExecuted,
    image: bundle.manifest.image,
    base_image: bundle.manifest.base_image,
    runtime_config_sha256: runtimeConfigSha,
    graph_mount: "read-only",
    resource_limits: { cpus: 2, memory_bytes: 2147483648, network: "none" },
    batch_context: {
      mode: "bounded-finalize-once",
      batch_size: sizeForManifest(envelope, options),
      overlap: options.overlap ?? 0,
    },
    output_sha256: outputs,
    completed_at_utc: new Date().toISOString(),
  };
  writeJson(output, "manifest.json.tmp", manifest);
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return result;
}
export function evidenceHashes(
  directory: string,
  prefix = "",
): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const name of readdirSync(join(directory, prefix)).sort()) {
    const relative = prefix ? prefix + "/" + name : name;
    if (relative === "manifest.json" || relative === "manifest.json.tmp")
      continue;
    const path = join(directory, relative),
      entry = lstatSync(path);
    if (entry.isSymbolicLink())
      throw new MatchingFailure(
        "Evidence symlink refused / 증거 심볼릭 링크를 거부합니다",
      );
    if (entry.isDirectory())
      Object.assign(hashes, evidenceHashes(directory, relative));
    else if (entry.isFile()) hashes[relative] = sha256(readFileSync(path));
    else
      throw new MatchingFailure(
        "Non-regular evidence refused / 일반 파일이 아닌 증거를 거부합니다",
      );
  }
  return hashes;
}
function sizeForManifest(
  envelope: MatchingEnvelope,
  options: MatchingOptions,
): number {
  return options.batch_size ?? envelope.observations.length;
}
export function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): number {
  try {
    let input = "",
      graph = "",
      output = "",
      batch_size: number | undefined,
      overlap: number | undefined,
      help = false;
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index]!;
      if (arg === "--help" || arg === "-h") help = true;
      else if (arg === "--graph" && !graph) graph = argv[++index] ?? "";
      else if (arg === "--output" && !output) output = argv[++index] ?? "";
      else if (arg === "--batch-size" && batch_size === undefined)
        batch_size = Number(argv[++index]);
      else if (arg === "--overlap" && overlap === undefined)
        overlap = Number(argv[++index]);
      else if (!arg.startsWith("-") && !input) input = arg;
      else
        fail(
          "arguments",
          "unknown or duplicate argument",
          "알 수 없거나 중복된 인자입니다",
        );
    }
    if (help) {
      io.out(
        "usage / 사용법: npm run match -- INPUT --graph P02_BUNDLE --output NEW_DIRECTORY [--batch-size N --overlap N]\nBounded SYNTHETIC observations only, input <=32 MiB, no truth edge IDs. / 제한된 합성 관측만 사용하며 입력 최대32MiB, 정답 구간 식별자는 받지 않습니다.\nExit0: execution completed (exclusions allowed);1:engine/evidence failure;2:invalid input. / 종료0: 실행 완료(제외 가능), 1: 엔진·증거 실패, 2: 입력 오류",
      );
      return 0;
    }
    if (
      !input ||
      !graph ||
      !output ||
      graph.startsWith("-") ||
      output.startsWith("-")
    )
      fail(
        "arguments",
        "INPUT, --graph and --output required",
        "INPUT·--graph·--output이 필요합니다",
      );
    runMatching(input, graph, output, { batch_size, overlap });
    return 0;
  } catch (error) {
    io.error(`Matching incomplete / 매칭 미완료: ${String(error)}`);
    return error instanceof MatchingFailure || error instanceof GraphError
      ? 1
      : 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = main();
