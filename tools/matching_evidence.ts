import {
  canonical,
  fail,
  integer,
  number,
  record,
  sha256,
  text,
} from "./shared.js";
import {
  decodeShape,
  items,
  object,
  type EdgeMapping,
} from "./graph_evidence.js";
import type { GraphBundle } from "./graph_bundle.js";
import { localDistance, type Observation } from "./vehicle_simulator.js";

export const MATCHING_POLICY = "tiny-city-matching-v1";
export const MAX_MATCHING_SAMPLES = 60020;
export const GAP_MS = 3000;
export type Reason =
  | "AMBIGUOUS_PARALLEL"
  | "PARTIAL_ENTRY"
  | "PARTIAL_EXIT"
  | "OBSERVATION_GAP"
  | "DISCONTINUITY"
  | "UNMATCHED"
  | "DISTANCE_EXCEEDED"
  | "INSUFFICIENT_POINTS";
const descriptions: Record<Reason, [string, string]> = {
  AMBIGUOUS_PARALLEL: [
    "Multiple physical parallel ways are compatible with positional accuracy.",
    "위치 정확도 범위에 서로 다른 평행도로가 있습니다.",
  ],
  PARTIAL_ENTRY: [
    "No observed evidence of full edge entry.",
    "전체 구간 진입의 관측 근거가 없습니다.",
  ],
  PARTIAL_EXIT: [
    "No observed evidence of full edge exit.",
    "전체 구간 진출의 관측 근거가 없습니다.",
  ],
  OBSERVATION_GAP: [
    "Observation gap exceeds the synthetic 3000 ms continuity policy.",
    "관측 누락이 합성 전용 3000밀리초 연속성 정책을 초과합니다.",
  ],
  DISCONTINUITY: [
    "Reversal or disconnected matching prevents traversal timing.",
    "역행 또는 대응 단절로 통과 시각을 계산할 수 없습니다.",
  ],
  UNMATCHED: [
    "Engine returned an unmatched point.",
    "엔진이 대응되지 않은 점을 반환했습니다.",
  ],
  DISTANCE_EXCEEDED: [
    "Match distance exceeds declared accuracy plus one metre.",
    "대응 거리가 선언 정확도와 1미터 여유를 초과합니다.",
  ],
  INSUFFICIENT_POINTS: [
    "Insufficient observed points for a complete traversal.",
    "완전 통과를 확인할 관측 표본이 부족합니다.",
  ],
};
export const reasonMessages = (codes: Reason[]) =>
  codes.map((code) => ({
    reason_code: code,
    message_en: descriptions[code][0],
    message_ko: descriptions[code][1],
  }));
export interface MatchingEnvelope {
  schema_version: "0.1";
  matching_id: string;
  graph_id: string;
  observations: Observation[];
}
export interface MatchingPoint {
  sample_id: string;
  vehicle_id: string;
  offset_ms: number;
  longitude: number;
  latitude: number;
  edge_id: string | null;
  status: "MATCHED" | "EXCLUDED";
  reason_codes: Reason[];
  matched_type?: string;
  fraction?: number;
  distance_m?: number;
  reason_messages?: ReturnType<typeof reasonMessages>;
}
export interface BoundaryBracket {
  before_sample_id: string;
  after_sample_id: string;
  before_offset_ms: number;
  after_offset_ms: number;
  interpolated_at_ms: number;
}
export interface MatchedTraversal {
  traversal_id: string;
  vehicle_id: string;
  edge_id: string;
  label: string;
  forward: boolean;
  status: "ACCEPTED" | "EXCLUDED";
  entered_at_ms: number | null;
  exited_at_ms: number | null;
  reason_codes: Reason[];
  source_sample_ids: string[];
  entry_bracket: BoundaryBracket | null;
  exit_bracket: BoundaryBracket | null;
  reason_messages: ReturnType<typeof reasonMessages>;
}
export interface MatchingResult {
  policy_id: string;
  matching_id: string;
  graph_id: string;
  input_samples: number;
  matched_samples: number;
  excluded_samples: number;
  accepted_traversals: number;
  excluded_traversals: number;
  points: MatchingPoint[];
  traversals: MatchedTraversal[];
  semantic_sha256: string;
}
export interface ContinuousRun {
  vehicle_id: string;
  index: number;
  observations: Observation[];
  start_reason?: Reason;
  end_reason?: Reason;
}
export function validateObservation(value: unknown): Observation {
  record(value, "observation", [
    "sample_id",
    "vehicle_id",
    "offset_ms",
    "event_time_utc",
    "longitude",
    "latitude",
    "accuracy_m",
    "source_class",
  ]);
  text(value.sample_id, "sample_id");
  if (value.sample_id.length > 256)
    fail("sample_id", "identifier is too long", "식별자가 너무 깁니다");
  if (
    typeof value.vehicle_id !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value.vehicle_id)
  )
    fail(
      "vehicle_id",
      "expected lowercase identifier",
      "소문자 식별자가 필요합니다",
    );
  integer(value.offset_ms, "offset_ms", 0, 300000);
  number(value.longitude, "longitude", -180, 180);
  number(value.latitude, "latitude", -90, 90);
  number(value.accuracy_m, "accuracy_m", 0.01, 10000);
  if (value.source_class !== "SYNTHETIC")
    fail(
      "source_class",
      "only SYNTHETIC observations supported",
      "합성 관측만 지원합니다",
    );
  const time = value.event_time_utc;
  if (
    typeof time !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(time) ||
    !Number.isFinite(Date.parse(time)) ||
    new Date(time).toISOString() !==
      time.replace(/Z$/, time.includes(".") ? "Z" : ".000Z")
  )
    fail(
      "event_time_utc",
      "invalid UTC timestamp",
      "유효한 UTC 시각이 필요합니다",
    );
  return value as unknown as Observation;
}
export function validateEnvelope(
  value: unknown,
  bundle: GraphBundle,
): MatchingEnvelope {
  record(value, "matching", [
    "schema_version",
    "matching_id",
    "graph_id",
    "observations",
  ]);
  if (value.schema_version !== "0.1" || value.graph_id !== bundle.graphId)
    fail(
      "matching",
      "schema or graph identity mismatch",
      "규격 또는 그래프 식별자가 다릅니다",
    );
  if (
    typeof value.matching_id !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value.matching_id)
  )
    fail(
      "matching_id",
      "expected lowercase identifier",
      "소문자 식별자가 필요합니다",
    );
  const observations = items(value.observations);
  if (!observations.length || observations.length > MAX_MATCHING_SAMPLES)
    fail(
      "observations",
      "expected 1..60020 observations",
      "관측이 1~60020개 필요합니다",
    );
  const ids = new Set<string>(),
    times = new Map<string, number>(),
    counts = new Map<string, number>();
  let epoch: number | undefined;
  for (const raw of observations) {
    const observation = validateObservation(raw);
    if (ids.has(observation.sample_id))
      fail("sample_id", "duplicate sample ID", "표본 식별자가 중복되었습니다");
    ids.add(observation.sample_id);
    const previous = times.get(observation.vehicle_id);
    if (previous !== undefined && observation.offset_ms <= previous)
      fail(
        "offset_ms",
        "duplicate or decreasing vehicle timestamp",
        "차량 시각이 중복되거나 역순입니다",
      );
    times.set(observation.vehicle_id, observation.offset_ms);
    counts.set(
      observation.vehicle_id,
      (counts.get(observation.vehicle_id) ?? 0) + 1,
    );
    if (counts.get(observation.vehicle_id)! > 3001)
      fail(
        "vehicle observations",
        "at most 3001 observations per vehicle",
        "차량별 관측은 최대3001개입니다",
      );
    const origin =
      Date.parse(observation.event_time_utc) - observation.offset_ms;
    if (epoch !== undefined && origin !== epoch)
      fail(
        "timestamp",
        "UTC epoch and offsets disagree",
        "UTC 기준 시각과 경과 시간이 일치하지 않습니다",
      );
    epoch = origin;
  }
  if (times.size > 20)
    fail(
      "vehicles",
      "at most 20 vehicles supported",
      "차량은 최대20대만 지원합니다",
    );
  return value as unknown as MatchingEnvelope;
}
function distanceToSegment(point: number[], a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!,
    dy = b[1]! - a[1]!,
    denominator = dx * dx + dy * dy;
  const fraction = denominator
    ? Math.max(
        0,
        Math.min(
          1,
          ((point[0]! - a[0]!) * dx + (point[1]! - a[1]!) * dy) / denominator,
        ),
      )
    : 0;
  return localDistance(point, [a[0]! + fraction * dx, a[1]! + fraction * dy]);
}
export function ambiguousParallel(
  observation: Observation,
  bundle: GraphBundle,
): boolean {
  const ways = bundle.fixture.ways.filter(
    (way) =>
      bundle.edges.some(
        (edge) => edge.osm_way_id === way.osm_way_id && edge.car_access,
      ) &&
      distanceToSegment(
        [observation.longitude, observation.latitude],
        way.from_coordinate,
        way.to_coordinate,
      ) <=
        observation.accuracy_m + 1,
  );
  for (let i = 0; i < ways.length; i++)
    for (let j = i + 1; j < ways.length; j++) {
      const a = ways[i]!,
        b = ways[j]!;
      if (
        a.from === b.from ||
        a.from === b.to ||
        a.to === b.from ||
        a.to === b.to
      )
        continue;
      const angle = (way: typeof a) =>
        Math.atan2(
          way.to_coordinate[1]! - way.from_coordinate[1]!,
          way.to_coordinate[0]! - way.from_coordinate[0]!,
        );
      let difference = Math.abs(angle(a) - angle(b)) % Math.PI;
      difference = Math.min(difference, Math.PI - difference);
      if (difference <= (15 * Math.PI) / 180) return true;
    }
  return false;
}
export function splitContinuousRuns(
  envelope: MatchingEnvelope,
  bundle: GraphBundle,
): { runs: ContinuousRun[]; points: MatchingPoint[] } {
  const runs: ContinuousRun[] = [],
    points: MatchingPoint[] = [];
  const vehicles = [
    ...new Set(envelope.observations.map((sample) => sample.vehicle_id)),
  ].sort();
  for (const vehicle_id of vehicles) {
    let observations: Observation[] = [],
      start_reason: Reason | undefined,
      index = 0;
    const flush = (end_reason?: Reason): void => {
      if (observations.length)
        runs.push({
          vehicle_id,
          index: index++,
          observations,
          start_reason,
          end_reason,
        });
      observations = [];
      start_reason = end_reason;
    };
    for (const observation of envelope.observations.filter(
      (sample) => sample.vehicle_id === vehicle_id,
    )) {
      if (ambiguousParallel(observation, bundle)) {
        flush("AMBIGUOUS_PARALLEL");
        points.push(excludedPoint(observation, "AMBIGUOUS_PARALLEL"));
        continue;
      }
      if (
        observations.length &&
        observation.offset_ms - observations.at(-1)!.offset_ms > GAP_MS
      )
        flush("OBSERVATION_GAP");
      observations.push(observation);
    }
    flush();
  }
  return { runs, points };
}
export function excludedPoint(
  observation: Observation,
  reason: Reason,
): MatchingPoint {
  return {
    sample_id: observation.sample_id,
    vehicle_id: observation.vehicle_id,
    offset_ms: observation.offset_ms,
    longitude: observation.longitude,
    latitude: observation.latitude,
    edge_id: null,
    status: "EXCLUDED",
    reason_codes: [reason],
    reason_messages: reasonMessages([reason]),
  };
}
function edgeId(value: unknown): string {
  if (typeof value === "number") {
    integer(value, "engine edge ID", 0);
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value))
    return BigInt(value).toString();
  return fail(
    "engine edge ID",
    "invalid integer/string ID",
    "유효한 정수·문자열 식별자가 아닙니다",
  );
}
function length(edge: EdgeMapping): number {
  return edge.directed_geometry
    .slice(1)
    .reduce(
      (sum, coordinate, index) =>
        sum + localDistance(edge.directed_geometry[index]!, coordinate),
      0,
    );
}
interface Eligible {
  observation: Observation;
  point: MatchingPoint;
  edge_index: number;
  fraction: number;
  break_before: boolean;
  break_after: boolean;
}
export function interpretRun(
  envelope: MatchingEnvelope,
  bundle: GraphBundle,
  run: ContinuousRun,
  response: unknown,
): { points: MatchingPoint[]; traversals: MatchedTraversal[] } {
  const data = object(response),
    rawEdges = items(data.edges),
    matches = items(data.matched_points),
    shape = decodeShape(data.shape);
  if (matches.length !== run.observations.length || !rawEdges.length)
    fail(
      "engine",
      "matched point/edge count mismatch",
      "대응 표본·구간 개수가 다릅니다",
    );
  const edges = rawEdges.map((raw) => {
    const value = object(raw),
      id = edgeId(value.id),
      edge = bundle.edges.find((candidate) => candidate.edge_id === id);
    if (!edge || !edge.car_access || value.way_id !== edge.osm_way_id)
      fail(
        "engine",
        "unknown or car-prohibited edge",
        "등록되지 않았거나 자동차 통행이 금지된 구간입니다",
      );
    integer(value.begin_shape_index, "begin_shape_index", 0, shape.length - 1);
    integer(value.end_shape_index, "end_shape_index", 0, shape.length - 1);
    if (value.end_shape_index <= value.begin_shape_index)
      fail(
        "engine",
        "invalid geometry index range",
        "지형 인덱스 범위가 올바르지 않습니다",
      );
    const from = edge.directed_geometry[0]!,
      to = edge.directed_geometry.at(-1)!;
    for (const coordinate of shape.slice(
      value.begin_shape_index,
      value.end_shape_index + 1,
    ))
      if (distanceToSegment(coordinate, from, to) > 1)
        fail(
          "engine",
          "returned geometry differs from verified edge",
          "반환 지형이 검증 구간과 다릅니다",
        );
    const a = shape[value.begin_shape_index]!,
      b = shape[value.end_shape_index]!;
    if (
      (b[0]! - a[0]!) * (to[0]! - from[0]!) +
        (b[1]! - a[1]!) * (to[1]! - from[1]!) <
      0
    )
      fail(
        "engine",
        "returned geometry has reversed direction",
        "반환 지형의 방향이 역방향입니다",
      );
    return edge;
  });
  const points: MatchingPoint[] = [],
    eligible: (Eligible | null)[] = [],
    reversal = new Set<number>();
  matches.forEach((raw, index) => {
    const match = object(raw),
      observation = run.observations[index]!;
    if (match.type === "unmatched") {
      points.push(excludedPoint(observation, "UNMATCHED"));
      eligible.push(null);
      return;
    }
    if (match.type !== "matched" && match.type !== "interpolated")
      fail(
        "matched point",
        "unsupported type",
        "지원하지 않는 대응 종류입니다",
      );
    integer(match.edge_index, "edge_index", 0, edges.length - 1);
    number(match.distance_along_edge, "fraction", 0, 1);
    number(
      match.distance_from_trace_point,
      "distance",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    number(match.lon, "matched longitude", -180, 180);
    number(match.lat, "matched latitude", -90, 90);
    for (const field of [
      "begin_route_discontinuity",
      "end_route_discontinuity",
    ])
      if (field in match && typeof match[field] !== "boolean")
        fail(
          "matched point",
          "invalid discontinuity flag",
          "단절 표시가 올바르지 않습니다",
        );
    const edge = edges[match.edge_index]!,
      fraction = match.distance_along_edge,
      from = edge.directed_geometry[0]!,
      to = edge.directed_geometry.at(-1)!,
      predicted = [
        from[0]! + (to[0]! - from[0]!) * fraction,
        from[1]! + (to[1]! - from[1]!) * fraction,
      ];
    if (localDistance([match.lon, match.lat], predicted) > 1)
      fail(
        "matched point",
        "fraction and geometry disagree",
        "비율과 지형이 일치하지 않습니다",
      );
    if (
      match.distance_from_trace_point > observation.accuracy_m + 1 ||
      localDistance(
        [observation.longitude, observation.latitude],
        [match.lon, match.lat],
      ) >
        observation.accuracy_m + 1
    ) {
      points.push(excludedPoint(observation, "DISTANCE_EXCEEDED"));
      eligible.push(null);
      return;
    }
    const point: MatchingPoint = {
      sample_id: observation.sample_id,
      vehicle_id: observation.vehicle_id,
      offset_ms: observation.offset_ms,
      longitude: match.lon,
      latitude: match.lat,
      edge_id: edge.edge_id,
      status: "MATCHED",
      reason_codes: [],
      matched_type: match.type,
      fraction,
      distance_m: match.distance_from_trace_point,
    };
    points.push(point);
    eligible.push({
      observation,
      point,
      edge_index: match.edge_index,
      fraction,
      break_before: match.begin_route_discontinuity === true,
      break_after: match.end_route_discontinuity === true,
    });
  });
  const entries = new Map<number, BoundaryBracket>(),
    exits = new Map<number, BoundaryBracket>(),
    reasons = edges.map(() => new Set<Reason>());
  const bracket = (a: Eligible, b: Eligible, at: number): BoundaryBracket => ({
    before_sample_id: a.observation.sample_id,
    after_sample_id: b.observation.sample_id,
    before_offset_ms: a.observation.offset_ms,
    after_offset_ms: b.observation.offset_ms,
    interpolated_at_ms: Math.round(at),
  });
  const reasonFromBreak = (
    index: number,
    direction: -1 | 1,
  ): Reason | undefined => {
    const adjacent = eligible[index + direction];
    if (adjacent === null) {
      const point = points[index + direction];
      return point?.reason_codes[0] ?? "UNMATCHED";
    }
    return direction === -1
      ? index === 0
        ? run.start_reason
        : undefined
      : index === eligible.length - 1
        ? run.end_reason
        : undefined;
  };
  for (let index = 0; index < eligible.length; index++) {
    const current = eligible[index];
    if (!current) continue;
    const before = eligible[index - 1],
      after = eligible[index + 1];
    if (
      (!before || current.break_before || before.break_after) &&
      current.fraction <= 0.00001 &&
      !current.break_before
    )
      entries.set(
        current.edge_index,
        entries.get(current.edge_index) ??
          bracket(current, current, current.observation.offset_ms),
      );
    if (
      (!after || current.break_after || after.break_before) &&
      current.fraction >= 0.99999 &&
      !current.break_after
    )
      exits.set(
        current.edge_index,
        bracket(current, current, current.observation.offset_ms),
      );
    if (current.break_before || current.break_after)
      reasons[current.edge_index]!.add("DISCONTINUITY");
    if (index > 0 && before === null) {
      reasons[current.edge_index]!.add(
        points[index - 1]!.reason_codes[0] ?? "UNMATCHED",
      );
      reasons[current.edge_index]!.add("DISCONTINUITY");
    }
    if (index < eligible.length - 1 && after === null) {
      reasons[current.edge_index]!.add(
        points[index + 1]!.reason_codes[0] ?? "UNMATCHED",
      );
      reasons[current.edge_index]!.add("DISCONTINUITY");
    }
    if (!before) {
      const reason = reasonFromBreak(index, -1);
      if (reason && !entries.has(current.edge_index))
        reasons[current.edge_index]!.add(reason);
      continue;
    }
    if (before.break_after || current.break_before) {
      reasons[before.edge_index]!.add("DISCONTINUITY");
      reasons[current.edge_index]!.add("DISCONTINUITY");
      continue;
    }
    if (current.edge_index === before.edge_index) {
      if (
        (before.fraction - current.fraction) *
          length(edges[current.edge_index]!) >
        1
      ) {
        reversal.add(current.edge_index);
        reasons[current.edge_index]!.add("DISCONTINUITY");
      }
      continue;
    }
    const previous = edges[before.edge_index]!,
      next = edges[current.edge_index]!;
    if (
      current.edge_index !== before.edge_index + 1 ||
      localDistance(
        previous.directed_geometry.at(-1)!,
        next.directed_geometry[0]!,
      ) > 0.001
    ) {
      reasons[before.edge_index]!.add("DISCONTINUITY");
      reasons[current.edge_index]!.add("DISCONTINUITY");
      for (
        let middle = before.edge_index + 1;
        middle < current.edge_index;
        middle++
      )
        reasons[middle]!.add("INSUFFICIENT_POINTS");
      continue;
    }
    const left = (1 - before.fraction) * length(previous),
      right = current.fraction * length(next);
    if (left + right <= 0) {
      reasons[before.edge_index]!.add("DISCONTINUITY");
      reasons[current.edge_index]!.add("DISCONTINUITY");
      continue;
    }
    const at =
        before.observation.offset_ms +
        ((current.observation.offset_ms - before.observation.offset_ms) *
          left) /
          (left + right),
      proof = bracket(before, current, at);
    exits.set(before.edge_index, proof);
    entries.set(current.edge_index, proof);
  }
  const traversals = edges.map((edge, index): MatchedTraversal => {
    const used = eligible.filter(
        (point): point is Eligible =>
          point !== null && point.edge_index === index,
      ),
      entry = entries.get(index) ?? null,
      exit = exits.get(index) ?? null,
      codes = reasons[index]!;
    if (!used.length) codes.add("INSUFFICIENT_POINTS");
    if (!entry) codes.add("PARTIAL_ENTRY");
    if (!exit) codes.add("PARTIAL_EXIT");
    if (used.length) {
      const first = eligible.indexOf(used[0]!),
        last = eligible.indexOf(used.at(-1)!);
      if (!entry) {
        const reason = reasonFromBreak(first, -1);
        if (reason) codes.add(reason);
      }
      if (!exit) {
        const reason = reasonFromBreak(last, 1);
        if (reason) codes.add(reason);
      }
    }
    if (entry && exit && exit.interpolated_at_ms <= entry.interpolated_at_ms)
      codes.add("INSUFFICIENT_POINTS");
    const source_sample_ids = used.map((point) => point.observation.sample_id),
      reason_codes = [...codes].sort() as Reason[],
      accepted =
        entry !== null &&
        exit !== null &&
        exit.interpolated_at_ms > entry.interpolated_at_ms &&
        reason_codes.length === 0 &&
        !reversal.has(index);
    const traversal_id = sha256(
      canonical({
        policy: MATCHING_POLICY,
        graph_id: bundle.graphId,
        matching_id: envelope.matching_id,
        vehicle_id: run.vehicle_id,
        run_index: run.index,
        edge_occurrence: index,
        edge_id: edge.edge_id,
        boundary_sample_ids: [
          entry?.before_sample_id ?? source_sample_ids[0] ?? null,
          entry?.after_sample_id ?? null,
          exit?.before_sample_id ?? null,
          exit?.after_sample_id ?? source_sample_ids.at(-1) ?? null,
        ],
      }),
    );
    return {
      traversal_id,
      vehicle_id: run.vehicle_id,
      edge_id: edge.edge_id,
      label: edge.label,
      forward: edge.forward,
      status: accepted ? "ACCEPTED" : "EXCLUDED",
      entered_at_ms: entry?.interpolated_at_ms ?? null,
      exited_at_ms: exit?.interpolated_at_ms ?? null,
      reason_codes,
      source_sample_ids,
      entry_bracket: entry,
      exit_bracket: exit,
      reason_messages: reasonMessages(reason_codes),
    };
  });
  return { points, traversals };
}
export type TraceRun = (run: ContinuousRun) => unknown;
export function matchObservations(
  envelope: MatchingEnvelope,
  bundle: GraphBundle,
  trace: TraceRun,
): MatchingResult {
  validateEnvelope(envelope, bundle);
  const split = splitContinuousRuns(envelope, bundle),
    points = [...split.points],
    traversals: MatchedTraversal[] = [];
  for (const run of split.runs) {
    if (run.observations.length < 2) {
      points.push(
        ...run.observations.map((observation) =>
          excludedPoint(observation, "INSUFFICIENT_POINTS"),
        ),
      );
      continue;
    }
    const interpreted = interpretRun(envelope, bundle, run, trace(run));
    points.push(...interpreted.points);
    traversals.push(...interpreted.traversals);
  }
  points.sort(
    (a, b) =>
      (a.vehicle_id < b.vehicle_id
        ? -1
        : a.vehicle_id > b.vehicle_id
          ? 1
          : 0) || a.offset_ms - b.offset_ms,
  );
  const core = {
    policy_id: MATCHING_POLICY,
    matching_id: envelope.matching_id,
    graph_id: bundle.graphId,
    input_samples: envelope.observations.length,
    matched_samples: points.filter((point) => point.status === "MATCHED")
      .length,
    excluded_samples: points.filter((point) => point.status === "EXCLUDED")
      .length,
    accepted_traversals: traversals.filter((item) => item.status === "ACCEPTED")
      .length,
    excluded_traversals: traversals.filter((item) => item.status === "EXCLUDED")
      .length,
    points,
    traversals,
  };
  return { ...core, semantic_sha256: sha256(canonical(core)) };
}
export class MatchingSession {
  private readonly observations: Observation[] = [];
  private readonly byId = new Map<string, Observation>();
  private sealed = false;
  constructor(
    private readonly header: Omit<MatchingEnvelope, "observations">,
    private readonly bundle: GraphBundle,
    private readonly trace: TraceRun,
  ) {}
  append(batch: unknown[]): void {
    if (this.sealed) fail("session", "session is sealed", "세션이 닫혔습니다");
    const fresh: Observation[] = [],
      pending = new Map<string, Observation>();
    for (const value of batch) {
      const observation = validateObservation(value),
        previous =
          this.byId.get(observation.sample_id) ??
          pending.get(observation.sample_id);
      if (previous) {
        if (!canonical(previous).equals(canonical(observation)))
          fail(
            "session",
            "conflicting overlap sample",
            "중첩 표본의 내용이 다릅니다",
          );
        continue;
      }
      const copy = structuredClone(observation);
      fresh.push(copy);
      pending.set(copy.sample_id, copy);
    }
    const combined = [...this.observations, ...fresh];
    if (combined.length)
      validateEnvelope({ ...this.header, observations: combined }, this.bundle);
    for (const observation of fresh) {
      this.observations.push(observation);
      this.byId.set(observation.sample_id, observation);
    }
  }
  finalize(): MatchingResult {
    if (this.sealed)
      fail("session", "session already finalized", "이미 마친 세션입니다");
    this.sealed = true;
    return matchObservations(
      { ...this.header, observations: this.observations },
      this.bundle,
      this.trace,
    );
  }
}
