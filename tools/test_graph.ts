import { arch, platform } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  canonical,
  cliArguments,
  consoleIO,
  type ConsoleIO,
  fail,
  InputError,
  isMain,
  parseJson,
  ROOT,
  sha256,
} from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import {
  assertRouteExpectation,
  checkNoPathResponse,
  checkTrace,
  items,
  mapLocatedWay,
  object,
  validateFixture,
  type EdgeMapping,
  type GraphFixture,
  type RouteCase,
} from "./graph_evidence.js";

export const BASE_IMAGE =
  "ghcr.io/valhalla/valhalla@sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de";
const DOCKERFILE = join(ROOT, "infra/pilot/Dockerfile");
export interface ProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}
export type Executor = (args: string[], timeout: number) => ProcessResult;
const docker: Executor = (args, timeout) =>
  spawnSync("docker", args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
export class GraphError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}
interface CommandRecord {
  sequence: number;
  args: string[];
  exit_code: number | null;
  elapsed_ms: number;
  stdout: string;
  stderr: string;
}
interface AssertionEvidence {
  assertion_id: string;
  status: "PASS" | "FAIL";
  message_en: string;
  message_ko: string;
  evidence_path: string;
}
export class GraphCommands {
  readonly records: CommandRecord[] = [];
  constructor(
    readonly output: string,
    private readonly execute: Executor = docker,
  ) {
    mkdirSync(join(output, "commands"));
  }
  command(
    args: string[],
    timeout = 30000,
    allowFailure = false,
    environment = false,
  ): ProcessResult {
    const sequence = this.records.length + 1;
    const started = performance.now();
    const result = this.execute(args, timeout);
    const stem = `commands/${String(sequence).padStart(3, "0")}`;
    writeFileSync(
      join(this.output, `${stem}.stdout.txt`),
      result.stdout ?? "",
      "utf8",
    );
    writeFileSync(
      join(this.output, `${stem}.stderr.txt`),
      result.stderr ?? "",
      "utf8",
    );
    this.records.push({
      sequence,
      args,
      exit_code: result.status,
      elapsed_ms: performance.now() - started,
      stdout: `${stem}.stdout.txt`,
      stderr: `${stem}.stderr.txt`,
    });
    writeFileSync(
      join(this.output, "commands.json"),
      JSON.stringify(this.records, null, 2) + "\n",
    );
    if (result.error || (!allowFailure && result.status !== 0)) {
      throw new GraphError(
        `Command failed; inspect ${stem}.stderr.txt. / 명령이 실패했습니다. 오류 기록을 확인하세요. ${String(result.error ?? "")}`,
        environment ? 2 : 1,
      );
    }
    return result;
  }
}
export class OwnedGraphContainer {
  readonly runId = randomUUID();
  readonly name = `routelens-p02-${this.runId}`;
  private attempted = false;
  constructor(private readonly commands: GraphCommands) {}
  start(
    image: string,
    output: string,
    readOnlyGraph?: string,
    options: { memory?: "2g" | "4g"; sourcePath?: string } = {},
  ): void {
    this.attempted = true;
    this.commands.command(
      [
        "create",
        "--name",
        this.name,
        "--label",
        `io.routelens.run_id=${this.runId}`,
        "--network",
        "none",
        "--cpus",
        "2",
        "--memory",
        options.memory ?? "2g",
        "--stop-timeout",
        "1",
        "--mount",
        `type=bind,src=${resolve(output)},dst=/work`,
        ...(readOnlyGraph
          ? [
              "--mount",
              `type=bind,src=${resolve(readOnlyGraph)},dst=/graph,readonly`,
            ]
          : []),
        ...(options.sourcePath
          ? [
              "--mount",
              `type=bind,src=${resolve(options.sourcePath)},dst=/source/source.osm.pbf,readonly`,
            ]
          : []),
        "--entrypoint",
        "/bin/sh",
        image,
        "-c",
        "sleep 900",
      ],
      30000,
      false,
      true,
    );
    this.commands.command(["start", this.name], 30000, false, true);
  }
  exec(
    args: string[],
    timeout = 30000,
    allowFailure = false,
    environment = false,
  ): ProcessResult {
    return this.commands.command(
      ["exec", this.name, ...args],
      timeout,
      allowFailure,
      environment,
    );
  }
  cleanup(): boolean {
    if (!this.attempted) return true;
    const inspected = this.commands.command(
      ["container", "inspect", this.name],
      30000,
      true,
    );
    if (inspected.status !== 0) {
      if (!/No such (?:container|object)/i.test(inspected.stderr))
        throw new GraphError(
          "Cannot verify container absence. / 컨테이너 부재를 확인할 수 없습니다.",
        );
    } else {
      const container = object(items(parseJson(inspected.stdout))[0]);
      const labels = object(object(container.Config).Labels);
      if (labels["io.routelens.run_id"] !== this.runId)
        throw new GraphError(
          "Container ownership mismatch; refusing removal. / 소유권이 다르므로 컨테이너를 삭제하지 않습니다.",
        );
      this.commands.command(["rm", "-f", this.name]);
      const absent = this.commands.command(
        ["container", "inspect", this.name],
        30000,
        true,
      );
      if (
        absent.status === 0 ||
        !/No such (?:container|object)/i.test(absent.stderr)
      )
        throw new GraphError(
          "Container removal was not verified. / 컨테이너 삭제를 확인하지 못했습니다.",
        );
    }
    const listing = this.commands.command([
      "ps",
      "-a",
      "--filter",
      `name=^/${this.name}$`,
      "--format",
      "{{.Names}}",
    ]);
    if (listing.stdout.trim())
      throw new GraphError(
        "Owned container remains. / 소유 컨테이너가 남아 있습니다.",
      );
    return true;
  }
}
export function verifyEngineEvidence<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof InputError) throw new GraphError(error.message);
    throw error;
  }
}
export function engineJson(stdout: string): unknown {
  try {
    return parseJson(stdout);
  } catch {
    for (const line of stdout.trim().split("\n").reverse()) {
      if (!/^[\[{]/.test(line.trim())) continue;
      try {
        return parseJson(line);
      } catch {
        /* Preserve raw logs; only a complete JSON response counts. / 완전한 JSON 응답만 사용합니다. */
      }
    }
  }
  throw new GraphError(
    "Missing complete engine JSON response. / 완전한 엔진 JSON 응답이 없습니다.",
  );
}
function writeJson(output: string, name: string, value: unknown): void {
  writeFileSync(
    join(output, name),
    JSON.stringify(value, null, 2) + "\n",
    "utf8",
  );
}
export function prepareImage(commands: GraphCommands): {
  id: string;
  platform: string;
  dockerfile_sha256: string;
} {
  const digest = sha256(readFileSync(DOCKERFILE));
  const tag = `routelens-p02:${digest.slice(0, 16)}`;
  commands.command(
    ["version", "--format", "{{.Server.Version}}"],
    30000,
    false,
    true,
  );
  commands.command(
    ["build", "--tag", tag, "--file", DOCKERFILE, join(ROOT, "infra/pilot")],
    600000,
    false,
    true,
  );
  const image = object(
    items(
      parseJson(
        commands.command(["image", "inspect", tag], 30000, false, true).stdout,
      ),
    )[0],
  );
  if (typeof image.Id !== "string" || !/^sha256:[0-9a-f]{64}$/.test(image.Id))
    fail("image", "missing actual image ID", "실제 이미지 ID가 없습니다");
  return {
    id: image.Id,
    platform: `${String(image.Os)}/${String(image.Architecture)}`,
    dockerfile_sha256: digest,
  };
}
function effectiveConfig(
  container: OwnedGraphContainer,
  output: string,
): Record<string, unknown> {
  const response = container.exec([
    "valhalla_build_config",
    "--mjolnir-tile-dir",
    "/work/tiles",
    "--mjolnir-tile-extract",
    "/work/unused.tar",
  ]);
  const config = object(engineJson(response.stdout));
  const mjolnir = object(config.mjolnir);
  Object.assign(mjolnir, {
    tile_dir: "/work/tiles",
    tile_extract: "",
    admin: "/work/not-provided-admin.sqlite",
    timezone: "/work/not-provided-timezone.sqlite",
    concurrency: 2,
    id_table_size: 1000000,
    max_cache_size: 67108864,
    hierarchy: false,
    shortcuts: false,
  });
  object(mjolnir.data_processing).use_admin_db = false;
  for (const key of ["mjolnir", "loki", "thor", "odin", "meili"]) {
    const section = object(config[key]);
    section.logging = { type: "std_err", color: false };
  }
  const limits = object(object(config.loki).service_defaults);
  Object.assign(limits, {
    minimum_reachability: 0,
    search_cutoff: 5,
    radius: 2,
  });
  writeJson(output, "config.json", config);
  return config;
}
function request(
  container: OwnedGraphContainer,
  output: string,
  name: string,
  action: string,
  body: unknown,
): { response: unknown; status: number | null } {
  writeJson(output, `${name}.request.json`, body);
  const result = container.exec(
    ["valhalla_service", "/work/config.json", action, JSON.stringify(body)],
    30000,
    true,
  );
  const response = engineJson(result.stdout);
  writeJson(output, `${name}.response.json`, response);
  if (result.status !== 0 && result.status !== 1)
    throw new GraphError(
      `Unexpected engine exit: ${name}. / 예상하지 못한 엔진 종료: ${name}.`,
    );
  return { response, status: result.status };
}
function locateMappings(
  container: OwnedGraphContainer,
  output: string,
  fixture: GraphFixture,
): EdgeMapping[] {
  const mappings: EdgeMapping[] = [];
  for (const way of fixture.ways) {
    const lon = (way.from_coordinate[0]! + way.to_coordinate[0]!) / 2;
    const lat = (way.from_coordinate[1]! + way.to_coordinate[1]!) / 2;
    const name = `locate-${way.label}`;
    const result = request(container, output, name, "locate", {
      locations: [
        { lon, lat, search_cutoff: 5, radius: 2, minimum_reachability: 0 },
      ],
      costing: "pedestrian",
      verbose: true,
    });
    if (result.status !== 0)
      throw new GraphError(
        "Locate process failed. / 구간 조회 프로세스가 실패했습니다.",
      );
    const mapped = verifyEngineEvidence(() =>
      mapLocatedWay(way, result.response, `${name}.response.json`),
    );
    if (
      mapped.some((edge) =>
        mappings.some((existing) => existing.edge_id === edge.edge_id),
      )
    )
      throw new GraphError(
        "Graph ID reused between fixture ways. / 다른 시험 도로에서 같은 그래프 ID가 사용되었습니다.",
      );
    mappings.push(...mapped);
  }
  writeJson(output, "edge-map.json", mappings);
  return mappings;
}
function collapseWays(ways: number[]): number[] {
  return ways.filter((way, index) => index === 0 || way !== ways[index - 1]);
}
function verifyRoute(
  container: OwnedGraphContainer,
  output: string,
  route: RouteCase,
  mappings: EdgeMapping[],
): void {
  const name = `route-${route.id}`;
  const result = request(container, output, name, "route", {
    locations: route.locations,
    costing: "auto",
    shape_format: "polyline6",
  });
  const response = object(result.response);
  if (route.expected_error_code !== undefined) {
    checkNoPathResponse(route, response, result.status);
    return;
  }
  if (result.status !== 0)
    throw new GraphError(
      "Route process failed. / 경로 계산 프로세스가 실패했습니다.",
    );
  const trip = object(response.trip);
  if (trip.status !== 0)
    throw new GraphError(
      "Route was not successful. / 경로 계산이 성공하지 않았습니다.",
    );
  const ordered: number[] = [];
  const legs = items(trip.legs);
  if (!legs.length)
    throw new GraphError("Route legs missing. / 경로 구간이 없습니다.");
  for (let index = 0; index < legs.length; index++) {
    const shape = object(legs[index]).shape;
    const trace = request(
      container,
      output,
      `trace-${route.id}-${index}`,
      "trace_attributes",
      { encoded_polyline: shape, shape_match: "edge_walk", costing: "auto" },
    );
    if (trace.status !== 0)
      throw new GraphError(
        "Trace process failed. / 경로 구간 조회 프로세스가 실패했습니다.",
      );
    ordered.push(...checkTrace(shape, trace.response, mappings));
  }
  const ways = collapseWays(ordered);
  writeJson(output, `${name}.way-sequence.json`, ways);
  assertRouteExpectation(route, ways);
}
export function graphIdentity(inputs: {
  fixture_sha256: string;
  fixture_contract_sha256: string;
  config_sha256: string;
  engine: unknown;
  image_id: string;
  tile_sha256: Record<string, string>;
}): string {
  return sha256(canonical(inputs));
}
function hashes(directory: string, base = directory): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) Object.assign(result, hashes(path, base));
    else result[relative(base, path)] = sha256(readFileSync(path));
  }
  return result;
}
export function runGraph(
  outputPath: string,
  execute: Executor = docker,
): number {
  const started = performance.now(),
    startedAt = new Date().toISOString();
  const fixturePath = join(ROOT, "fixtures/graph/tiny-city.json");
  const fixture = validateFixture(parseJson(readFileSync(fixturePath)));
  const source = sourceIdentity();
  const output = resolve(outputPath);
  mkdirSync(output); // Only this new directory is mounted writable / 새 폴더만 쓰기 가능하게 연결합니다.
  const commands = new GraphCommands(output, execute),
    container = new OwnedGraphContainer(commands);
  const assertions: AssertionEvidence[] = [];
  let image: ReturnType<typeof prepareImage> | undefined;
  let config: Record<string, unknown> | undefined;
  let versions: { valhalla: string; osmium: string } | undefined;
  let tileHashes: Record<string, string> = {};
  let cleanup = false,
    failure: unknown;
  try {
    copyFileSync(
      join(ROOT, "fixtures/graph/tiny-city.osm.xml"),
      join(output, "tiny-city.osm.xml"),
    );
    copyFileSync(fixturePath, join(output, "fixture.json"));
    image = prepareImage(commands);
    container.start(image.id, output);
    const valhalla = container
      .exec(["valhalla_service", "--version"], 30000, false, true)
      .stdout.trim();
    const osmium = container
      .exec(["osmium", "--version"], 30000, false, true)
      .stdout.trim();
    if (
      !/(?:^|\s)(?:valhalla\s+)?3\.9\.1(?:\s|$)/i.test(valhalla) ||
      !/osmium version 1\.16\.0(?:\s|$)/i.test(osmium)
    )
      throw new GraphError(
        "Unexpected executable versions. / 실행 파일 버전이 예상과 다릅니다.",
        2,
      );
    versions = { valhalla, osmium };
    config = effectiveConfig(container, output);
    container.exec(
      [
        "osmium",
        "cat",
        "/work/tiny-city.osm.xml",
        "-o",
        "/work/tiny-city.osm.pbf",
      ],
      30000,
    );
    container.exec(
      [
        "valhalla_build_tiles",
        "-c",
        "/work/config.json",
        "/work/tiny-city.osm.pbf",
      ],
      120000,
    );
    tileHashes = hashes(join(output, "tiles"));
    if (!Object.keys(tileHashes).some((path) => path.endsWith(".gph")))
      throw new GraphError(
        "No built graph tiles. / 생성된 그래프 타일이 없습니다.",
      );
    const mappings = locateMappings(container, output, fixture);
    assertions.push({
      assertion_id: "complete-edge-mapping",
      status: "PASS",
      message_en:
        "All source ways mapped in both directions with verified car access.",
      message_ko: "모든 원본 도로의 양방향과 자동차 접근 허용을 검증했습니다.",
      evidence_path: "edge-map.json",
    });
    for (const route of fixture.routes) {
      verifyEngineEvidence(() =>
        verifyRoute(container, output, route, mappings),
      );
      assertions.push({
        assertion_id: route.id,
        status: "PASS",
        message_en:
          "Independent route expectation matched actual engine evidence.",
        message_ko: "독립 경로 기대값과 실제 엔진 증거가 일치합니다.",
        evidence_path: `route-${route.id}.response.json`,
      });
    }
  } catch (error) {
    failure =
      error instanceof InputError ? new GraphError(error.message) : error;
  } finally {
    try {
      cleanup = container.cleanup();
    } catch (error) {
      failure = error;
    }
  }
  assertions.push({
    assertion_id: "cleanup",
    status: cleanup ? "PASS" : "FAIL",
    message_en: cleanup
      ? "Owned container absence verified."
      : "Cleanup could not be verified.",
    message_ko: cleanup
      ? "소유 컨테이너가 없는 것을 확인했습니다."
      : "정리를 확인하지 못했습니다.",
    evidence_path: "commands.json",
  });
  if (failure)
    assertions.push({
      assertion_id: "execution",
      status: "FAIL",
      message_en: `Execution incomplete: ${String(failure)}`,
      message_ko: `실행이 완료되지 않았습니다: ${String(failure)}`,
      evidence_path: "commands.json",
    });
  writeJson(output, "assertions.json", assertions);
  const summary = `# Synthetic graph evidence / 합성 그래프 증거\n\nResult / 결과: ${failure ? "FAIL" : "PASS"}\n\nElapsed time includes image preparation, graph checks and cleanup. / 경과 시간은 이미지 준비·그래프 검사·정리를 포함합니다.\n\nReal Valhalla execution on original fictional roads; not real-road quality, GPS matching or live traffic proof.\n직접 만든 가상 도로의 실제 Valhalla 실행이며 실제 도로 품질·GPS 매칭·실시간 교통 검증이 아닙니다.\n\n${assertions.map((item) => `- ${item.assertion_id}: ${item.status} — ${item.message_en} / ${item.message_ko}`).join("\n")}\n\nSee assertions.json, edge-map.json and commands.json for relative evidence references.\n상대경로 증거는 assertions.json·edge-map.json·commands.json을 확인하세요.\n`;
  writeFileSync(join(output, "summary.md"), summary, "utf8");
  if (failure) throw failure;
  const fixtureSha = sha256(readFileSync(join(output, "tiny-city.osm.xml"))),
    configSha = sha256(readFileSync(join(output, "config.json")));
  const manifest = {
    schema_version: "0.1",
    run_id: container.runId,
    fixture_id: fixture.fixture_id,
    source,
    host_architecture: arch(),
    host_platform: platform(),
    node: process.versions.node,
    engine_executed: true,
    graph_loaded: true,
    engine: versions,
    image,
    base_image: BASE_IMAGE,
    graph_id: graphIdentity({
      fixture_sha256: fixtureSha,
      fixture_contract_sha256: sha256(readFileSync(fixturePath)),
      config_sha256: configSha,
      engine: versions,
      image_id: image!.id,
      tile_sha256: tileHashes,
    }),
    fixture_sha256: fixtureSha,
    fixture_contract_sha256: sha256(readFileSync(fixturePath)),
    config_sha256: configSha,
    pbf_sha256: sha256(readFileSync(join(output, "tiny-city.osm.pbf"))),
    tile_sha256: tileHashes,
    resource_limits: { cpus: 2, memory_bytes: 2147483648, network: "none" },
    elapsed_ms: performance.now() - started,
    elapsed_includes_image_preparation: true,
    started_at_utc: startedAt,
    completed_at_utc: new Date().toISOString(),
    cleanup_verified: cleanup,
    status: "PASS",
    evidence: {
      assertions: "assertions.json",
      edge_map: "edge-map.json",
      commands: "commands.json",
      summary: "summary.md",
    },
  };
  writeJson(output, "manifest.json.tmp", manifest);
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return 0;
}
export function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): number {
  try {
    const args = cliArguments(argv, "checks");
    if (args.help) {
      io.out(
        "usage / 사용법: npm run graph:check -- --output NEW_DIRECTORY\nBuild original fictional OSM with real Valhalla and verify road legality. / 가상 OSM을 실제 Valhalla로 생성하고 통행 규칙을 검사합니다.\n--output: new evidence directory; existing paths are refused / 새 증거 폴더이며 기존 경로는 거부합니다\nInitial Docker build requires network; graph operations use no network, 2 CPUs and 2 GiB. / 최초 이미지 준비에는 네트워크가 필요하며 그래프 작업은 네트워크 차단·CPU 2개·2GiB로 실행합니다.\nExit 0: assertions and cleanup passed; 1: engine/behavior failure; 2: input/environment/output error. / 종료 코드 0: 검사·정리 통과, 1: 엔진·행동 실패, 2: 입력·환경·출력 오류\n-h, --help: show help / 도움말 표시",
      );
      return 0;
    }
    const code = runGraph(args.output);
    io.out(
      `Graph evidence written: ${args.output}. / 그래프 증거 저장: ${args.output}.`,
    );
    return code;
  } catch (error) {
    io.error(
      `Graph check incomplete; no completion manifest means incomplete evidence. / 그래프 검사가 완료되지 않았으며 완료 목록이 없으면 미완료 증거입니다.\n${String(error)}`,
    );
    return error instanceof GraphError ? error.exitCode : 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = main();
