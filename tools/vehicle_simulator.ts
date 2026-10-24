import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { arch, platform } from "node:os";
import {
  array,
  canonical,
  consoleIO,
  type ConsoleIO,
  fail,
  identifier,
  integer,
  isMain,
  number,
  parseJson,
  record,
  sha256,
} from "./shared.js";
import { loadGraphBundle, type GraphBundle } from "./graph_bundle.js";
import { PythonRandom } from "./python_random.js";
import { sourceIdentity } from "./pilot_runner.js";
import { geodesicSphere } from "./geodesy.js";
import type { EdgeMapping } from "./graph_evidence.js";

export interface SimulationGraph {
  graphId: string;
  edges: EdgeMapping[];
  fixture: {
    fixture_id: string;
    restriction?: { from_way: number; via_node: number; to_way: number };
  };
  geometry_policy?: "geodesic-sphere-v1";
}
export const EARTH_RADIUS_M = 6371008.8;
export const GENERATOR_POLICY = "tiny-city-kinematics-v1";
export const NOISE_POLICY = "gps-noise-v1";
const METRES_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;
export interface PathSegment {
  label: string;
  forward: boolean;
}
export interface SpeedPeriod {
  duration_ms: number;
  speed_mps: number;
}
export interface DropInterval {
  start_ms: number;
  end_ms: number;
}
export interface SimulationVehicle {
  vehicle_id: string;
  departure_ms: number;
  path: PathSegment[];
  speed_profile: SpeedPeriod[];
  noise_radius_m: number;
  drop_intervals: DropInterval[];
}
export interface SimulationSpec {
  schema_version: "0.1";
  simulation_id: string;
  fixture_id: string;
  graph_id: string;
  seed: number;
  start_time_utc: string;
  duration_ms: number;
  sample_interval_ms: number;
  vehicles: SimulationVehicle[];
}
export interface SampleIdentity {
  sample_id: string;
  vehicle_id: string;
  offset_ms: number;
  event_time_utc: string;
}
export interface TruthSample extends SampleIdentity {
  longitude: number;
  latitude: number;
  edge_id: string;
}
export interface Observation extends SampleIdentity {
  longitude: number;
  latitude: number;
  accuracy_m: number;
  source_class: "SYNTHETIC";
}
export interface Omission extends SampleIdentity {
  reason: "SCHEDULED_DROP";
}
export interface Traversal {
  vehicle_id: string;
  edge_id: string;
  label: string;
  forward: boolean;
  entered_at_ms: number;
  exited_at_ms: number;
  distance_m: number;
}
export interface SimulationTruth {
  samples: TruthSample[];
  traversals: Traversal[];
}
export interface SimulationAssertion {
  assertion_id: string;
  status: "PASS" | "FAIL";
  message_en: string;
  message_ko: string;
  expected: unknown;
  actual: unknown;
  evidence_path: string;
}
export interface SimulationResult {
  truth: SimulationTruth;
  observations: Observation[];
  omissions: Omission[];
  assertions: SimulationAssertion[];
}
export class SimulationFailure extends Error {
  readonly exitCode = 1;
}
export function localDistance(a: number[], b: number[]): number {
  return Math.hypot(
    (b[0]! - a[0]!) * METRES_PER_DEGREE,
    (b[1]! - a[1]!) * METRES_PER_DEGREE,
  );
}
function segmentLength(edge: EdgeMapping, bundle?: SimulationGraph): number {
  if (bundle?.geometry_policy === "geodesic-sphere-v1")
    return geodesicSphere.length(edge.directed_geometry);
  return edge.directed_geometry
    .slice(1)
    .reduce(
      (sum, coordinate, index) =>
        sum + localDistance(edge.directed_geometry[index]!, coordinate),
      0,
    );
}
function pathEdges(
  vehicle: SimulationVehicle,
  bundle: SimulationGraph,
): EdgeMapping[] {
  const edges = vehicle.path.map((segment) => {
    const edge = bundle.edges.find(
      (item) =>
        item.label === segment.label && item.forward === segment.forward,
    );
    if (!edge || !edge.car_access)
      fail(
        "path",
        "unknown or car-prohibited directed edge",
        "등록되지 않았거나 자동차 통행이 금지된 방향입니다",
      );
    return edge;
  });
  for (let index = 1; index < edges.length; index++) {
    const previous = edges[index - 1]!,
      next = edges[index]!;
    if (
      (bundle.geometry_policy === "geodesic-sphere-v1"
        ? geodesicSphere.distance
        : localDistance)(
        previous.directed_geometry.at(-1)!,
        next.directed_geometry[0]!,
      ) > 0.001
    )
      fail(
        "path",
        "disconnected directed path",
        "방향별 경로가 연결되지 않았습니다",
      );
    const restriction = bundle.fixture.restriction;
    if (
      restriction &&
      previous.osm_way_id === restriction.from_way &&
      next.osm_way_id === restriction.to_way &&
      previous.forward &&
      next.forward
    )
      fail("path", "explicit prohibited turn", "명시적으로 금지된 회전입니다");
  }
  return edges;
}
export function validateSimulation(
  value: unknown,
  bundle: SimulationGraph,
): SimulationSpec {
  record(value, "simulation", [
    "schema_version",
    "simulation_id",
    "fixture_id",
    "graph_id",
    "seed",
    "start_time_utc",
    "duration_ms",
    "sample_interval_ms",
    "vehicles",
  ]);
  if (
    value.schema_version !== "0.1" ||
    (value.fixture_id !== "tiny-city-v1" &&
      !(
        value.fixture_id === "seoul-osm-20261023-v1" &&
        bundle.geometry_policy === "geodesic-sphere-v1"
      )) ||
    value.fixture_id !== bundle.fixture.fixture_id ||
    value.graph_id !== bundle.graphId
  )
    fail(
      "simulation",
      "schema, fixture or graph identity mismatch",
      "규격·시험자료·그래프 식별자가 일치하지 않습니다",
    );
  identifier(value.simulation_id, "simulation_id");
  integer(value.seed, "seed", 0, 0xffffffff);
  integer(value.duration_ms, "duration_ms", 1, 300000);
  integer(value.sample_interval_ms, "sample_interval_ms", 100, 5000);
  const start = value.start_time_utc;
  if (
    typeof start !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(start) ||
    start.startsWith("0000") ||
    !Number.isFinite(Date.parse(start)) ||
    new Date(start).toISOString().replace(".000Z", "Z") !== start ||
    Date.parse(start) + value.duration_ms >
      Date.parse("9999-12-31T23:59:59.999Z")
  )
    fail(
      "start_time_utc",
      "invalid whole-second UTC timestamp",
      "유효한 초 단위 UTC 시각이 필요합니다",
    );
  array(value.vehicles, "vehicles", 1, 20);
  const ids = new Set<string>();
  for (const raw of value.vehicles) {
    record(raw, "vehicle", [
      "vehicle_id",
      "departure_ms",
      "path",
      "speed_profile",
      "noise_radius_m",
      "drop_intervals",
    ]);
    identifier(raw.vehicle_id, "vehicle_id");
    if (ids.has(raw.vehicle_id))
      fail(
        "vehicle_id",
        "duplicate vehicle ID",
        "차량 식별자가 중복되었습니다",
      );
    ids.add(raw.vehicle_id);
    integer(raw.departure_ms, "departure_ms", 0, value.duration_ms);
    number(raw.noise_radius_m, "noise_radius_m", 0, 20);
    array(
      raw.path,
      "path",
      1,
      bundle.geometry_policy === "geodesic-sphere-v1" ? 128 : 20,
    );
    for (const segment of raw.path) {
      record(segment, "path segment", ["label", "forward"]);
      identifier(segment.label, "label");
      if (typeof segment.forward !== "boolean")
        fail(
          "forward",
          "expected boolean direction",
          "방향은 boolean 값이어야 합니다",
        );
    }
    array(raw.speed_profile, "speed_profile", 1, 20);
    let profileDuration = 0;
    for (const period of raw.speed_profile) {
      record(period, "speed period", ["duration_ms", "speed_mps"]);
      integer(period.duration_ms, "duration_ms", 1, value.duration_ms);
      number(period.speed_mps, "speed_mps", 0, 30);
      profileDuration += period.duration_ms;
    }
    if (raw.departure_ms + profileDuration > value.duration_ms)
      fail(
        "speed_profile",
        "profile exceeds simulation duration",
        "속도 일정이 시뮬레이션 기간을 초과합니다",
      );
    array(raw.drop_intervals, "drop_intervals", 0);
    let previousEnd = -1;
    const intervals: DropInterval[] = [];
    for (const interval of raw.drop_intervals) {
      record(interval, "drop interval", ["start_ms", "end_ms"]);
      integer(interval.start_ms, "start_ms", 0, value.duration_ms);
      integer(interval.end_ms, "end_ms", 1, value.duration_ms);
      if (interval.start_ms >= interval.end_ms)
        fail(
          "drop interval",
          "expected start before end",
          "시작이 끝보다 빨라야 합니다",
        );
      intervals.push(interval as unknown as DropInterval);
    }
    for (const interval of [...intervals].sort(
      (a, b) => a.start_ms - b.start_ms,
    )) {
      if (interval.start_ms < previousEnd)
        fail("drop_intervals", "overlapping intervals", "누락 구간이 겹칩니다");
      previousEnd = interval.end_ms;
    }
    const vehicle = raw as unknown as SimulationVehicle,
      edges = pathEdges(vehicle, bundle);
    const distance = edges.reduce(
      (sum, edge) => sum + segmentLength(edge, bundle),
      0,
    );
    if (!(distance > 0) || !Number.isFinite(timeAtDistance(vehicle, distance)))
      fail(
        "speed_profile",
        "profile must complete the path",
        "속도 일정 안에 경로를 완료해야 합니다",
      );
  }
  return value as unknown as SimulationSpec;
}
function timeAtDistance(vehicle: SimulationVehicle, target: number): number {
  if (target === 0) return vehicle.departure_ms;
  let distance = 0,
    time = vehicle.departure_ms;
  for (const period of vehicle.speed_profile) {
    const travelled = (period.speed_mps * period.duration_ms) / 1000;
    if (period.speed_mps > 0 && distance + travelled + 1e-9 >= target)
      return time + (Math.max(0, target - distance) / period.speed_mps) * 1000;
    distance += travelled;
    time += period.duration_ms;
  }
  return Infinity;
}
function distanceAtTime(vehicle: SimulationVehicle, offset: number): number {
  let remaining = offset - vehicle.departure_ms,
    distance = 0;
  for (const period of vehicle.speed_profile) {
    if (remaining <= 0) break;
    const elapsed = Math.min(remaining, period.duration_ms);
    distance += (period.speed_mps * elapsed) / 1000;
    remaining -= elapsed;
  }
  return distance;
}
function roundedCoordinate(value: number): number {
  return Number(value.toFixed(9));
}
function positionAtDistance(edge: EdgeMapping, offset: number): number[] {
  let remaining = offset;
  for (let index = 1; index < edge.directed_geometry.length; index++) {
    const a = edge.directed_geometry[index - 1]!,
      b = edge.directed_geometry[index]!,
      length = localDistance(a, b);
    if (remaining <= length || index === edge.directed_geometry.length - 1) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return [
        a[0]! + (b[0]! - a[0]!) * fraction,
        a[1]! + (b[1]! - a[1]!) * fraction,
      ];
    }
    remaining -= length;
  }
  throw new SimulationFailure(
    "No positive-length edge geometry / 길이가 양수인 구간 지형이 없습니다",
  );
}
function noiseSeed(seed: number, vehicleId: string): number {
  return Buffer.from(
    sha256(canonical({ policy: NOISE_POLICY, seed, vehicle_id: vehicleId })),
    "hex",
  ).readUInt32BE(0);
}
export function generateSimulation(
  spec: SimulationSpec,
  bundle: SimulationGraph,
): SimulationResult {
  const truth: SimulationTruth = { samples: [], traversals: [] },
    observations: Observation[] = [],
    omissions: Omission[] = [];
  for (const vehicle of [...spec.vehicles].sort((a, b) =>
    a.vehicle_id < b.vehicle_id ? -1 : 1,
  )) {
    const edges = pathEdges(vehicle, bundle),
      lengths = edges.map((edge) => segmentLength(edge, bundle)),
      total = lengths.reduce((a, b) => a + b, 0),
      arrival = timeAtDistance(vehicle, total),
      arrivalMs = Math.ceil(arrival);
    let distance = 0;
    edges.forEach((edge, index) => {
      const entered = timeAtDistance(vehicle, distance);
      distance += lengths[index]!;
      truth.traversals.push({
        vehicle_id: vehicle.vehicle_id,
        edge_id: edge.edge_id,
        label: edge.label,
        forward: edge.forward,
        entered_at_ms: Math.ceil(entered),
        exited_at_ms: Math.ceil(timeAtDistance(vehicle, distance)),
        distance_m: lengths[index]!,
      });
    });
    const offsets: number[] = [];
    for (
      let offset = vehicle.departure_ms;
      offset <= arrivalMs;
      offset += spec.sample_interval_ms
    )
      offsets.push(offset);
    if (offsets.at(-1) !== arrivalMs) offsets.push(arrivalMs);
    const rng = new PythonRandom(noiseSeed(spec.seed, vehicle.vehicle_id));
    for (const offset of offsets) {
      const travelled = Math.min(
        total,
        distanceAtTime(vehicle, Math.min(offset, arrival)),
      );
      let index = 0,
        preceding = 0;
      while (
        index < edges.length - 1 &&
        travelled >= preceding + lengths[index]! - 1e-9
      ) {
        preceding += lengths[index]!;
        index++;
      }
      const edge = edges[index]!,
        position =
          bundle.geometry_policy === "geodesic-sphere-v1"
            ? geodesicSphere.position(
                edge.directed_geometry,
                travelled - preceding,
              )
            : positionAtDistance(edge, travelled - preceding);
      const identity: SampleIdentity = {
        sample_id: `${spec.simulation_id}:${vehicle.vehicle_id}:${offset}`,
        vehicle_id: vehicle.vehicle_id,
        offset_ms: offset,
        event_time_utc: new Date(
          Date.parse(spec.start_time_utc) + offset,
        ).toISOString(),
      };
      truth.samples.push({
        ...identity,
        longitude: roundedCoordinate(position[0]!),
        latitude: roundedCoordinate(position[1]!),
        edge_id: edge.edge_id,
      });
      // Always consume both draws, including clean and omitted samples / 깨끗한·누락 표본도 난수 두 개를 소비합니다.
      const radius =
          Math.sqrt(rng.randint(1000000) / 1000000) * vehicle.noise_radius_m,
        angle = (2 * Math.PI * rng.randint(1000000)) / 1000000;
      if (
        vehicle.drop_intervals.some(
          (interval) => offset >= interval.start_ms && offset < interval.end_ms,
        )
      )
        omissions.push({ ...identity, reason: "SCHEDULED_DROP" });
      else {
        const noisy =
          bundle.geometry_policy === "geodesic-sphere-v1"
            ? geodesicSphere.offset(
                position,
                radius * Math.cos(angle),
                radius * Math.sin(angle),
              )
            : undefined;
        observations.push({
          ...identity,
          longitude: roundedCoordinate(
            noisy
              ? noisy[0]!
              : position[0]! + (radius * Math.cos(angle)) / METRES_PER_DEGREE,
          ),
          latitude: roundedCoordinate(
            noisy
              ? noisy[1]!
              : position[1]! + (radius * Math.sin(angle)) / METRES_PER_DEGREE,
          ),
          accuracy_m: Math.max(0.01, vehicle.noise_radius_m),
          source_class: "SYNTHETIC",
        });
      }
    }
  }
  const order = (a: SampleIdentity, b: SampleIdentity): number =>
    a.offset_ms - b.offset_ms ||
    (a.vehicle_id < b.vehicle_id ? -1 : a.vehicle_id > b.vehicle_id ? 1 : 0);
  truth.samples.sort(order);
  observations.sort(order);
  omissions.sort(order);
  const sampleMap = new Map(
    truth.samples.map((sample) => [sample.sample_id, sample]),
  );
  const coverage = [...observations, ...omissions].map(
      (sample) => sample.sample_id,
    ),
    unique = new Set(coverage);
  const bounded = observations.every((sample) => {
    const actual = sampleMap.get(sample.sample_id)!,
      vehicle = spec.vehicles.find(
        (item) => item.vehicle_id === sample.vehicle_id,
      )!;
    return (
      (bundle.geometry_policy === "geodesic-sphere-v1"
        ? geodesicSphere.distance
        : localDistance)(
        [actual.longitude, actual.latitude],
        [sample.longitude, sample.latitude],
      ) <=
      vehicle.noise_radius_m + 0.001
    );
  });
  const assertions: SimulationAssertion[] = [];
  const check = (
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
  check(
    "complete-sample-partition",
    coverage.length === truth.samples.length &&
      unique.size === truth.samples.length &&
      coverage.every((id) => sampleMap.has(id)),
    "Every true sample is observed or explicitly omitted.",
    "모든 정답 표본은 관측되거나 누락으로 기록됩니다.",
    truth.samples.length,
    coverage.length,
    "truth.json",
  );
  check(
    "bounded-noise",
    bounded,
    "Observed coordinates stay within the declared noise radius.",
    "관측 좌표가 선언한 잡음 반경 안에 있습니다.",
    true,
    bounded,
    "observations.json",
  );
  const sourceClass = observations.every(
    (sample) => sample.source_class === "SYNTHETIC" && !("edge_id" in sample),
  );
  check(
    "synthetic-observations",
    sourceClass,
    "Observations are synthetic and contain no truth edge IDs.",
    "관측은 합성이며 정답 구간 식별자를 포함하지 않습니다.",
    true,
    sourceClass,
    "observations.json",
  );
  const correctDrops = omissions.every((sample) =>
    spec.vehicles
      .find((vehicle) => vehicle.vehicle_id === sample.vehicle_id)!
      .drop_intervals.some(
        (interval) =>
          sample.offset_ms >= interval.start_ms &&
          sample.offset_ms < interval.end_ms,
      ),
  );
  check(
    "half-open-drops",
    correctDrops,
    "Omissions follow half-open intervals.",
    "누락이 반열린 구간을 따릅니다.",
    true,
    correctDrops,
    "omissions.json",
  );
  const complete = truth.traversals.every(
    (item) =>
      item.exited_at_ms <= spec.duration_ms &&
      item.entered_at_ms <= item.exited_at_ms,
  );
  check(
    "completed-traversals",
    complete,
    "All independently authored paths complete within the scenario.",
    "독립적으로 작성한 모든 경로가 시나리오 안에 완료됩니다.",
    true,
    complete,
    "truth.json",
  );
  return { truth, observations, omissions, assertions };
}
export function loadSimulationSpec(
  path: string,
  bundle: SimulationGraph,
): { spec: SimulationSpec; digest: string } {
  const fd = openSync(path, "r"),
    bytes = Buffer.alloc(1024 * 1024 + 1);
  let length = 0;
  try {
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
  } finally {
    closeSync(fd);
  }
  if (length > 1024 * 1024)
    fail("spec", "input exceeds 1 MiB", "입력이 1MiB를 초과합니다");
  const raw = bytes.subarray(0, length);
  return {
    spec: validateSimulation(parseJson(raw), bundle),
    digest: sha256(raw),
  };
}
export function runSimulation(
  specPath: string,
  graphDirectory: string,
  output: string,
): number {
  const bundle = loadGraphBundle(graphDirectory),
    { spec, digest } = loadSimulationSpec(specPath, bundle),
    result = generateSimulation(spec, bundle);
  mkdirSync(output);
  const files: Record<string, unknown> = {
    "truth.json": result.truth,
    "observations.json": result.observations,
    "omissions.json": result.omissions,
    "assertions.json": result.assertions,
  };
  const outputHashes: Record<string, string> = {};
  for (const [name, value] of Object.entries(files)) {
    const raw = JSON.stringify(value, null, 2) + "\n";
    writeFileSync(join(output, name), raw, { flag: "wx" });
    outputHashes[name] = sha256(Buffer.from(raw));
  }
  const passed = result.assertions.every((item) => item.status === "PASS");
  writeFileSync(
    join(output, "summary.md"),
    `# Vehicle simulation / 차량 시뮬레이션\n\nResult / 결과: ${passed ? "PASS" : "FAIL"}\n\n${spec.vehicles.length} synthetic vehicles; ${result.observations.length} observations; ${result.omissions.length} omissions.\n합성 차량 ${spec.vehicles.length}대, 관측 ${result.observations.length}개, 누락 ${result.omissions.length}개입니다.\n\nLocal equatorial kinematics only; no noisy map-matching, live traffic or mobile behavior claims.\n적도 국소 운동학만 생성하며 잡음 도로 매칭·실시간 교통·모바일 동작 검증을 주장하지 않습니다.\n`,
  );
  outputHashes["summary.md"] = sha256(readFileSync(join(output, "summary.md")));
  if (!passed)
    throw new SimulationFailure(
      "Simulation assertions failed / 시뮬레이션 검사가 실패했습니다",
    );
  const manifest = {
    schema_version: "0.1",
    run_id: randomUUID(),
    simulation_id: spec.simulation_id,
    source: sourceIdentity(),
    node: process.versions.node,
    host_architecture: arch(),
    host_platform: platform(),
    graph_id: bundle.graphId,
    graph_manifest_sha256: bundle.manifestSha256,
    spec_sha256: digest,
    generator_policy: GENERATOR_POLICY,
    noise_policy: NOISE_POLICY,
    distance_model: {
      policy: "equatorial-equirectangular-v1",
      earth_radius_m: EARTH_RADIUS_M,
    },
    boundary_policy: "exit-before-enter",
    truth_sha256: sha256(canonical(result.truth)),
    observations_sha256: sha256(canonical(result.observations)),
    omissions_sha256: sha256(canonical(result.omissions)),
    output_sha256: outputHashes,
    status: "PASS",
    completed_at_utc: new Date().toISOString(),
    source_class: "SYNTHETIC",
    engine_executed: false,
  };
  writeFileSync(
    join(output, "manifest.json.tmp"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return 0;
}
export function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): number {
  try {
    let input = "",
      graph = "",
      output = "",
      help = false;
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index]!;
      if (arg === "--help" || arg === "-h") help = true;
      else if (arg === "--graph" && !graph) {
        graph = argv[++index] ?? "";
        if (!graph || graph.startsWith("-"))
          fail(
            "arguments",
            "missing graph directory",
            "그래프 폴더가 필요합니다",
          );
      } else if (arg === "--output" && !output) {
        output = argv[++index] ?? "";
        if (!output || output.startsWith("-"))
          fail(
            "arguments",
            "missing output directory",
            "출력 폴더가 필요합니다",
          );
      } else if (!arg.startsWith("-") && !input) input = arg;
      else
        fail(
          "arguments",
          "unknown or duplicate argument",
          "알 수 없거나 중복된 인자입니다",
        );
    }
    if (help) {
      io.out(
        "usage / 사용법: npm run simulate -- SPEC --graph P02_BUNDLE --output NEW_DIRECTORY\nGenerate independent synthetic truth and noisy observations. / 독립 합성 정답과 잡음 관측을 생성합니다.\nfixtures/simulation/demo.json is a template; simulation:check binds a fresh graph ID. / demo.json은 틀이며 simulation:check가 새 그래프 식별자를 연결합니다.\nExit 0: completed; 1: failed checks; 2: invalid input/output. / 종료 코드 0: 완료, 1: 검사 실패, 2: 입력·출력 오류",
      );
      return 0;
    }
    if (!input || !graph || !output)
      fail(
        "arguments",
        "required SPEC, --graph and --output; see --help",
        "SPEC·--graph·--output이 필요합니다. --help를 확인하세요",
      );
    return runSimulation(input, graph, output);
  } catch (error) {
    io.error(`Simulation incomplete / 시뮬레이션 미완료: ${String(error)}`);
    return error instanceof SimulationFailure ? 1 : 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = main();
