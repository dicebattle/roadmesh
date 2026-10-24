import type { Observation } from "./vehicle_simulator.js";
export type TripState =
  | "WAITING"
  | "READY"
  | "LEASED"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "REVOKED";
export interface IngestBatch {
  schema_version: "0.1";
  batch_id: string;
  trip_id: string;
  batch_seq: number;
  is_final: boolean;
  graph_id: string;
  matching_policy: "seoul-observed-v2" | "seoul-observed-v3";
  consent_version: "pilot-consent-v1";
  source_class: "SYNTHETIC";
  trip_start_utc: string;
  trip_activity?: "TRAVEL" | "PARKED";
  samples: Observation[];
}
export interface StoreConfig {
  database_url: string;
  namespace: string;
  graph_id: string;
  matching_policy: "seoul-observed-v2" | "seoul-observed-v3";
}
export interface Principal {
  contributor_id: string;
  vehicle_id: string;
  consent_version: "pilot-consent-v1";
  vehicle_class?: "CAR" | "BUS" | "OTHER";
}
export interface Acceptance {
  code: "ACCEPTED" | "DUPLICATE";
  trip_id: string;
  state: TripState;
  sample_count: number;
  batch_count: number;
}
export interface Claim {
  namespace: string;
  contributor_id: string;
  trip_id: string;
  vehicle_id: string;
  graph_id: string;
  matching_policy: "seoul-observed-v2" | "seoul-observed-v3";
  trip_start_utc: string;
  matching_id: string;
  owner_id: string;
  fence: string;
  attempt: number;
  lease_until_utc: string;
  observations: Observation[];
}
export interface AcceptedTraversal {
  traversal_id: string;
  edge_id: string;
  forward: boolean;
  occurrence: number;
  entered_at_utc: string;
  exited_at_utc: string;
  distance_m: number;
  duration_s: number;
  source_class: "SYNTHETIC";
}
export interface CompletionInput {
  semantic_sha256: string;
  matched_samples: number;
  excluded_samples: number;
  accepted: AcceptedTraversal[];
}
export interface Completion {
  code: "SUCCEEDED" | "LEASE_LOST";
  stored_count: number;
}
export interface FailureResult {
  code: "RETRY" | "FAILED" | "LEASE_LOST";
  attempt: number;
}
export interface TripInspection {
  contributor_id: string;
  trip_id: string;
  vehicle_id: string;
  state: TripState;
  fence: string;
  owner_id: string | null;
  attempt: number;
  final_seq: number | null;
  first_received_at: string;
  last_activity_at: string;
  raw_expires_at: string;
  tombstone_expires_at: string;
  lease_until_utc: string | null;
  sample_count: number;
  batch_count: number;
  raw_payload_count: number;
  traversal_count: number;
  matching_digest: string | null;
}
export interface StoredTraversal extends AcceptedTraversal {
  observation_id: string;
  namespace: string;
  contributor_id: string;
  trip_id: string;
  graph_id: string;
  matching_policy: "seoul-observed-v2" | "seoul-observed-v3";
}
export interface StoreInspection {
  counts: {
    contributors: number;
    trips: number;
    batches: number;
    samples: number;
    raw_payloads: number;
    traversals: number;
    events: number;
  };
  trips: TripInspection[];
  traversals: StoredTraversal[];
}
export interface SweepResult {
  expired: number;
  deleted: number;
}
export type Phase =
  | "AFTER_LEASE"
  | "AFTER_MATCH"
  | "AFTER_INSERT"
  | "AFTER_ACCEPT_COMMIT";
export type ParentMessage =
  | { type: "RESUME"; phase: Phase }
  | { type: "EVENT_TIME"; event_time_utc: string }
  | { type: "CLOSE" };
export type ChildMessage =
  | { type: "READY"; kind: "service"; port: number }
  | { type: "READY"; kind: "worker"; owner_id: string }
  | { type: "PHASE"; phase: Phase; pid: number }
  | { type: "RESULT"; code: string; stored_count?: number; attempt?: number }
  | { type: "EVENT_TIME_SET"; event_time_utc: string };
export interface ServiceCredential {
  token: string;
  principal: Principal;
}
export interface ServiceConfig {
  store: StoreConfig;
  credentials: ServiceCredential[];
  event_time_utc: string;
  port?: number;
  pause_at?: "AFTER_ACCEPT_COMMIT";
}
export interface WorkerConfig {
  store: StoreConfig;
  graph_directory: string;
  output_root: string;
  event_time_utc: string;
  owner_id?: string;
  lease_ms?: number;
  pause_at?: "AFTER_LEASE" | "AFTER_MATCH" | "AFTER_INSERT";
}
export type ApiCode =
  | "INVALID_JSON"
  | "UNAUTHORIZED"
  | "CONSENT_REVOKED"
  | "SOURCE_NOT_ALLOWED"
  | "VEHICLE_NOT_ALLOWED"
  | "BATCH_CONFLICT"
  | "TRIP_CONFLICT"
  | "VERSION_MISMATCH"
  | "TRIP_EXPIRED"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_INPUT"
  | "OBSERVATION_TIME_INVALID"
  | "CAPACITY_EXCEEDED"
  | "STORE_UNAVAILABLE";
export class IngestionError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiCode,
    readonly message_en: string,
    readonly message_ko: string,
  ) {
    super(message_en);
  }
}
