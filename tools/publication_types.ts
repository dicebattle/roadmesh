import type { JWK } from "jose";
import type {
  AggregationDraft,
  AggregationStoreConfig,
  CatalogEdge,
} from "./aggregation_types.js";
import type { StoreConfig } from "./ingestion_types.js";
export interface TrafficSnapshot extends AggregationDraft {
  simulation_namespace: string;
  publisher_id: string;
  sequence: number;
  published_at: string;
}
export interface TrafficManifest {
  schema_version: "0.1";
  simulation_namespace: string;
  publisher_id: string;
  graph_id: string;
  region_id: "seoul-pilot-corridors-v1";
  sequence: number;
  window_start: string;
  window_end: string;
  published_at: string;
  valid_until: string;
  aggregation_policy: "seoul-window-median-v1";
  traffic_snapshot_id: string;
  byte_length: number;
  media_type: "application/json";
}
export interface TrustRoot {
  kid: string;
  public_jwk: JWK;
  publisher_id: string;
  simulation_namespace: string;
  region_id: "seoul-pilot-corridors-v1";
  allowed_graph_ids: string[];
  source_class: "SYNTHETIC";
  valid_from: string;
  valid_until: string;
  revoked: boolean;
}
export interface PublicationSigner {
  kid: string;
  private_jwk: JWK;
}
export interface PublicationStoreConfig {
  aggregation: AggregationStoreConfig;
  publisher_id: string;
}
export interface PublicationRecord {
  simulation_namespace: string;
  publisher_id: string;
  region_id: "seoul-pilot-corridors-v1";
  graph_id: string;
  sequence: number;
  window_start: string;
  window_end: string;
  published_at: string;
  valid_until: string;
  kid: string;
  candidate_sha256: string;
  traffic_snapshot_id: string;
  artifact: Uint8Array;
  jws: string;
}
export type PublishResult =
  | { code: "PUBLISHED" | "UNCHANGED"; publication: PublicationRecord }
  | {
      code: "CANDIDATE_MISSING" | "EXPIRED" | "OLDER_WINDOW";
      publication: null;
    };
export interface PublicationInspection {
  streams: Array<{
    publisher_id: string;
    region_id: string;
    high_water: number;
    current_snapshot_id: string | null;
  }>;
  publications: PublicationRecord[];
}
export interface PublicationServiceConfig {
  publication: PublicationStoreConfig;
  port?: number;
}
export type PublisherPhase =
  | "AFTER_PUBLICATION_WRITE"
  | "AFTER_PUBLICATION_COMMIT";
export interface PublicationWorkerConfig {
  publication: PublicationStoreConfig;
  signer: PublicationSigner;
  window_start: string;
  event_time_utc: string;
  pause_at?: PublisherPhase;
}
export interface ConsumerConfig {
  store: StoreConfig;
  consumer_id: string;
  publisher_id: string;
  region_id: "seoul-pilot-corridors-v1";
  allowed_graph_ids: string[];
  catalogs: Array<{ graph_id: string; edges: CatalogEdge[] }>;
  trust_roots: TrustRoot[];
  origin: string;
}
export interface VerifiedPublication {
  manifest: TrafficManifest;
  snapshot: TrafficSnapshot;
  artifact: Uint8Array;
  jws: string;
  kid: string;
}
export type ConsumerResult =
  | {
      code: "ACCEPTED" | "DUPLICATE";
      high_water: number;
      traffic_snapshot_id: string;
    }
  | {
      code: "REJECTED";
      reason: string;
      high_water: number;
      traffic_snapshot_id: null;
    };
export interface ConsumerStatus {
  high_water: number;
  active: VerifiedPublication | null;
}
export interface AcceptedInspection extends ConsumerStatus {
  checked_at_event_time: string;
}
export type ConsumerPhase = "AFTER_CONSUMER_VERIFY" | "AFTER_CONSUMER_COMMIT";
export interface ConsumerWorkerConfig {
  consumer: ConsumerConfig;
  event_time_utc: string;
  pause_at?: ConsumerPhase;
}
export type PublicationPhase = PublisherPhase | ConsumerPhase;
export type PublicationMessage =
  | {
      type: "READY";
      kind: "publisher" | "publication-service" | "consumer";
      pid: number;
      port?: number;
    }
  | { type: "PHASE"; phase: PublicationPhase; pid: number }
  | {
      type: "RESULT";
      code: string;
      sequence?: number;
      high_water?: number;
      traffic_snapshot_id?: string | null;
      reason?: string;
    };
