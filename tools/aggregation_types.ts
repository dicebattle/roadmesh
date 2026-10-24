import type { StoreConfig } from "./ingestion_types.js";
export type AggregationSource = "CAR" | "BUS" | "SYNTHETIC";
export type TrafficStatus = "LIVE" | "INSUFFICIENT" | "UNKNOWN" | "STALE";
export interface CatalogEdge {
  edge_id: string;
  forward: boolean;
  distance_m: number;
}
export interface AggregationContribution {
  observation_id: string;
  contributor_id: string;
  graph_id: string;
  matching_policy: "seoul-observed-v3";
  source_class: AggregationSource;
  trip_activity: "TRAVEL" | "PARKED";
  edge_id: string;
  forward: boolean;
  entered_at_utc: string;
  exited_at_utc: string;
  distance_m: number;
  duration_s: number;
  available_at_utc: string;
}
export interface AggregationDraft {
  schema_version: "0.1";
  graph_id: string;
  region_id: "seoul-pilot-corridors-v1";
  aggregation_policy: "seoul-window-median-v1";
  window_start: string;
  window_end: string;
  valid_until: string;
  entries: Array<{
    edge_id: string;
    forward: boolean;
    source_class: AggregationSource;
    status: TrafficStatus;
    speed_mps: number | null;
    sample_bucket: "5-9" | "10-19" | "20+" | null;
  }>;
}
export interface AggregationInput {
  namespace: string;
  graph_id: string;
  source_class: AggregationSource;
  window_start: string;
  now_utc: string;
  catalog: CatalogEdge[];
  contributions: AggregationContribution[];
}
export interface SelectionDiagnostic {
  edge_id: string;
  forward: boolean;
  eligible_contributors: number;
  selected_observation_ids: string[];
  median_duration_s: number | null;
}
export interface RejectionDiagnostic {
  observation_id: string;
  reason:
    | "PARKED"
    | "OTHER_WINDOW"
    | "LATE"
    | "REPEATED_CONTRIBUTOR"
    | "OTHER_SOURCE";
}
export type AggregationResult =
  | {
      code: "WINDOW_OPEN" | "RETENTION_EXPIRED";
      draft: null;
      canonical_sha256: null;
      input_sha256: string;
      catalog_sha256: string;
      selections: SelectionDiagnostic[];
      rejections: RejectionDiagnostic[];
    }
  | {
      code: "FINALIZED";
      draft: AggregationDraft;
      canonical_sha256: string;
      input_sha256: string;
      catalog_sha256: string;
      selections: SelectionDiagnostic[];
      rejections: RejectionDiagnostic[];
    };
export interface AggregationStoreConfig {
  store: StoreConfig;
  catalog: CatalogEdge[];
  source_class: "SYNTHETIC";
}
export interface AggregationCandidateRow {
  namespace: string;
  graph_id: string;
  aggregation_policy: "seoul-window-median-v1";
  source_class: "SYNTHETIC";
  window_start: string;
  window_end: string;
  canonical_json: string;
  canonical_sha256: string;
  input_sha256: string;
  catalog_sha256: string;
  finalized_at_utc: string;
}
export interface AggregationInspection {
  candidates: AggregationCandidateRow[];
}
export type AggregationPhase =
  | "AFTER_AGGREGATE_WRITE"
  | "AFTER_AGGREGATE_COMMIT";
export interface AggregationWorkerConfig {
  aggregation: AggregationStoreConfig;
  window_start: string;
  event_time_utc: string;
  pause_at?: AggregationPhase;
}
export type AggregationWorkerMessage =
  | { type: "READY"; kind: "aggregation"; pid: number }
  | { type: "PHASE"; phase: AggregationPhase; pid: number }
  | {
      type: "RESULT";
      code: AggregationResult["code"];
      canonical_sha256: string | null;
    };
