import {
  canonical,
  identifier,
  number,
  record,
  sha256,
} from "./value_contract.js";
import { utc } from "./time_validation.js";
import type {
  AggregationInput,
  AggregationResult,
  AggregationContribution,
  CatalogEdge,
  SelectionDiagnostic,
  RejectionDiagnostic,
  AggregationDraft,
  AggregationSource,
} from "./aggregation_types.js";
export const AGGREGATION_POLICY = "seoul-window-median-v1" as const;
export const WINDOW_MS = 60000;
export const DEADLINE_DELAY_MS = 30000;
export const VALIDITY_MS = 180000;
export const RETENTION_MS = 86400000;
function invalid(): never {
  throw new Error(
    "Invalid aggregation metadata or inconsistent graph geometry / 집계 정보 또는 그래프 지형이 일치하지 않습니다",
  );
}
export function normalizedCatalog(catalog: CatalogEdge[]): CatalogEdge[] {
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 10000)
    invalid();
  const seen = new Set<string>();
  return catalog
    .map((edge) => {
      record(edge, "catalog edge", ["edge_id", "forward", "distance_m"]);
      if (
        typeof edge.edge_id !== "string" ||
        !/^\d+$/.test(edge.edge_id) ||
        typeof edge.forward !== "boolean"
      )
        invalid();
      number(edge.distance_m, "distance_m", Number.MIN_VALUE, 1000000);
      const key = edgeKey(edge);
      if (seen.has(key)) invalid();
      seen.add(key);
      return { ...edge };
    })
    .sort(edgeCompare);
}
export const edgeKey = (edge: { edge_id: string; forward: boolean }): string =>
  `${edge.edge_id}:${edge.forward ? 1 : 0}`;
export function edgeCompare(
  a: { edge_id: string; forward: boolean },
  b: { edge_id: string; forward: boolean },
): number {
  return a.edge_id < b.edge_id
    ? -1
    : a.edge_id > b.edge_id
      ? 1
      : Number(a.forward) - Number(b.forward);
}
export function windowTimes(start: string): {
  start: number;
  end: number;
  deadline: number;
  validUntil: number;
  retentionUntil: number;
} {
  const value = utc(start);
  if (value % WINDOW_MS !== 0) invalid();
  return {
    start: value,
    end: value + WINDOW_MS,
    deadline: value + WINDOW_MS + DEADLINE_DELAY_MS,
    validUntil: value + WINDOW_MS + VALIDITY_MS,
    retentionUntil: value + WINDOW_MS + RETENTION_MS,
  };
}
function validateContribution(
  value: AggregationContribution,
  graphId: string,
  catalog: Map<string, CatalogEdge>,
): void {
  record(value, "contribution", [
    "observation_id",
    "contributor_id",
    "graph_id",
    "matching_policy",
    "source_class",
    "trip_activity",
    "edge_id",
    "forward",
    "entered_at_utc",
    "exited_at_utc",
    "distance_m",
    "duration_s",
    "available_at_utc",
  ]);
  if (
    typeof value.observation_id !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.observation_id) ||
    value.graph_id !== graphId ||
    value.matching_policy !== "seoul-observed-v3" ||
    !["CAR", "BUS", "SYNTHETIC"].includes(value.source_class) ||
    !["TRAVEL", "PARKED"].includes(value.trip_activity) ||
    typeof value.forward !== "boolean"
  )
    invalid();
  identifier(value.contributor_id, "contributor_id");
  number(value.distance_m, "distance_m", Number.MIN_VALUE, 1000000);
  number(value.duration_s, "duration_s", Number.MIN_VALUE, 300);
  const entered = utc(value.entered_at_utc),
    exited = utc(value.exited_at_utc),
    available = utc(value.available_at_utc);
  if (
    exited <= entered ||
    available < exited ||
    Math.abs((exited - entered) / 1000 - value.duration_s) > 1e-6
  )
    invalid();
  const edge = catalog.get(edgeKey(value));
  if (!edge || Math.abs(edge.distance_m - value.distance_m) > 1e-6) invalid();
}
export function aggregateWindow(input: AggregationInput): AggregationResult {
  identifier(input.namespace, "namespace");
  if (
    !/^[a-f0-9]{64}$/.test(input.graph_id) ||
    !["CAR", "BUS", "SYNTHETIC"].includes(input.source_class)
  )
    invalid();
  const times = windowTimes(input.window_start),
    now = utc(input.now_utc),
    catalog = normalizedCatalog(input.catalog),
    catalogByKey = new Map(catalog.map((edge) => [edgeKey(edge), edge]));
  if (
    !Array.isArray(input.contributions) ||
    input.contributions.length > 100000
  )
    invalid();
  const unique = new Map<string, AggregationContribution>();
  for (const value of input.contributions) {
    validateContribution(value, input.graph_id, catalogByKey);
    const previous = unique.get(value.observation_id);
    if (previous && !canonical(previous).equals(canonical(value))) invalid();
    unique.set(value.observation_id, value);
  }
  const contributions = [...unique.values()].sort((a, b) =>
      a.observation_id < b.observation_id
        ? -1
        : a.observation_id > b.observation_id
          ? 1
          : 0,
    ),
    catalogSha = sha256(canonical(catalog)),
    inputSha = sha256(
      canonical({
        namespace: input.namespace,
        graph_id: input.graph_id,
        aggregation_policy: AGGREGATION_POLICY,
        source_class: input.source_class,
        window_start: new Date(times.start).toISOString(),
        catalog_sha256: catalogSha,
        contributions,
      }),
    );
  const selections: SelectionDiagnostic[] = [],
    rejections: RejectionDiagnostic[] = [];
  const common = {
    input_sha256: inputSha,
    catalog_sha256: catalogSha,
    selections,
    rejections,
  };
  if (now < times.deadline)
    return {
      code: "WINDOW_OPEN",
      draft: null,
      canonical_sha256: null,
      ...common,
    };
  if (now >= times.retentionUntil)
    return {
      code: "RETENTION_EXPIRED",
      draft: null,
      canonical_sha256: null,
      ...common,
    };
  const eligible = new Map<string, AggregationContribution[]>();
  for (const value of contributions) {
    let reason: RejectionDiagnostic["reason"] | undefined;
    if (value.source_class !== input.source_class) reason = "OTHER_SOURCE";
    else if (value.trip_activity === "PARKED") reason = "PARKED";
    else if (
      utc(value.exited_at_utc) < times.start ||
      utc(value.exited_at_utc) >= times.end
    )
      reason = "OTHER_WINDOW";
    else if (utc(value.available_at_utc) >= times.deadline) reason = "LATE";
    if (reason) {
      rejections.push({ observation_id: value.observation_id, reason });
      continue;
    }
    const key = edgeKey(value),
      values = eligible.get(key) ?? [];
    values.push(value);
    eligible.set(key, values);
  }
  const entries: AggregationDraft["entries"] = catalog.map((edge) => {
    const ordered = (eligible.get(edgeKey(edge)) ?? []).sort(
      (a, b) =>
        utc(a.exited_at_utc) - utc(b.exited_at_utc) ||
        utc(a.entered_at_utc) - utc(b.entered_at_utc) ||
        (a.observation_id < b.observation_id
          ? -1
          : a.observation_id > b.observation_id
            ? 1
            : 0),
    );
    const contributors = new Set<string>(),
      selected: AggregationContribution[] = [];
    for (const value of ordered) {
      if (contributors.has(value.contributor_id))
        rejections.push({
          observation_id: value.observation_id,
          reason: "REPEATED_CONTRIBUTOR",
        });
      else {
        contributors.add(value.contributor_id);
        selected.push(value);
      }
    }
    const durations = selected
        .map((value) => value.duration_s)
        .sort((a, b) => a - b),
      count = durations.length,
      median = count
        ? (durations[Math.floor((count - 1) / 2)]! +
            durations[Math.floor(count / 2)]!) /
          2
        : null;
    selections.push({
      edge_id: edge.edge_id,
      forward: edge.forward,
      eligible_contributors: count,
      selected_observation_ids: selected.map((value) => value.observation_id),
      median_duration_s: median,
    });
    const live = count >= 5,
      stale = live && now >= times.validUntil,
      speed = live ? Math.round((edge.distance_m / median!) * 1e6) / 1e6 : null;
    if (live && (!Number.isFinite(speed) || speed! <= 0)) invalid();
    return {
      edge_id: edge.edge_id,
      forward: edge.forward,
      source_class: input.source_class,
      status: stale
        ? "STALE"
        : live
          ? "LIVE"
          : count
            ? "INSUFFICIENT"
            : "UNKNOWN",
      speed_mps: live && !stale ? speed : null,
      sample_bucket:
        live && !stale
          ? count < 10
            ? "5-9"
            : count < 20
              ? "10-19"
              : "20+"
          : null,
    };
  });
  const draft: AggregationDraft = {
    schema_version: "0.1",
    graph_id: input.graph_id,
    region_id: "seoul-pilot-corridors-v1",
    aggregation_policy: AGGREGATION_POLICY,
    window_start: new Date(times.start).toISOString(),
    window_end: new Date(times.end).toISOString(),
    valid_until: new Date(times.validUntil).toISOString(),
    entries,
  };
  return {
    code: "FINALIZED",
    draft,
    canonical_sha256: sha256(canonical(draft)),
    ...common,
  };
}
