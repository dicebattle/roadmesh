import test from "node:test";
import assert from "node:assert/strict";
import {
  batchValid,
  batchRequestHash,
  digest,
  matchingId,
} from "../tools/ingestion_validation.js";
import { aggregateWindow } from "../tools/traffic_aggregation.js";
import { contributionInput } from "../tools/ingestion_worker.js";
import type {
  IngestBatch,
  Principal,
  StoreConfig,
  Claim,
} from "../tools/ingestion_types.js";
import type { MatchingResult } from "../tools/matching_evidence.js";
import type {
  AggregationInput,
  AggregationContribution,
} from "../tools/aggregation_types.js";
const graph = "a".repeat(64),
  time = (seconds: number) =>
    new Date(Date.parse("2026-10-24T00:00:00Z") + seconds * 1000).toISOString();
test("Ingestion pins v2 and v3 separately while preserving legacy identifiers and hashes / 수집 정책을 분리하고 기존 식별자와 해시 보존", () => {
  const principal: Principal = {
      contributor_id: "person",
      vehicle_id: "car",
      consent_version: "pilot-consent-v1",
    },
    config: StoreConfig = {
      database_url: "private",
      namespace: "test",
      graph_id: graph,
      matching_policy: "seoul-observed-v2",
    };
  const batch: IngestBatch = {
    schema_version: "0.1",
    batch_id: "batch",
    trip_id: "trip",
    batch_seq: 0,
    is_final: true,
    graph_id: graph,
    matching_policy: "seoul-observed-v2",
    consent_version: "pilot-consent-v1",
    source_class: "SYNTHETIC",
    trip_start_utc: time(0),
    samples: [
      {
        sample_id: "sample",
        vehicle_id: "car",
        offset_ms: 0,
        event_time_utc: time(0),
        longitude: 127,
        latitude: 37,
        accuracy_m: 3,
        source_class: "SYNTHETIC",
      },
    ],
  };
  assert.equal(
    batchRequestHash(batchValid(batch, principal, config)),
    digest(batch),
  );
  assert.throws(() =>
    batchValid(batch, principal, {
      ...config,
      matching_policy: "seoul-observed-v3",
    }),
  );
  const v3 = { ...batch, matching_policy: "seoul-observed-v3" as const };
  assert.equal(
    batchValid(v3, principal, {
      ...config,
      matching_policy: "seoul-observed-v3",
    }).matching_policy,
    "seoul-observed-v3",
  );
  assert.throws(() => batchValid(v3, principal, config));
  assert.equal(
    matchingId("test", "person", "trip"),
    digest({ namespace: "test", contributor_id: "person", trip_id: "trip" }),
  );
});
test("Aggregation requires v3 and rejects positive geometry rounded to zero live speed / 집계는 v3를 요구하고 반올림 후 0인 속도를 거부", () => {
  const rows: AggregationContribution[] = Array.from({ length: 5 }, (_, i) => ({
    observation_id: (i + 1).toString(16).padStart(64, "0"),
    contributor_id: `person-${i}`,
    graph_id: graph,
    matching_policy: "seoul-observed-v3",
    source_class: "SYNTHETIC",
    trip_activity: "TRAVEL",
    edge_id: "1",
    forward: true,
    entered_at_utc: time(10),
    exited_at_utc: time(20),
    available_at_utc: time(80),
    distance_m: 100,
    duration_s: 10,
  }));
  const value: AggregationInput = {
    namespace: "test",
    graph_id: graph,
    source_class: "SYNTHETIC",
    window_start: time(0),
    now_utc: time(90),
    catalog: [{ edge_id: "1", forward: true, distance_m: 100 }],
    contributions: rows,
  };
  assert.equal(aggregateWindow(value).draft!.entries[0]!.status, "LIVE");
  assert.throws(() =>
    aggregateWindow({
      ...value,
      contributions: [
        { ...rows[0]!, matching_policy: "seoul-observed-v2" },
      ] as never,
    }),
  );
  assert.throws(() =>
    aggregateWindow({
      ...value,
      catalog: [{ edge_id: "1", forward: true, distance_m: 1e-9 }],
      contributions: rows.map((row) => ({ ...row, distance_m: 1e-9 })),
    }),
  );
});
test("Worker contribution boundary rejects results from a different pinned policy / 처리자는 다른 고정 정책의 결과를 저장하지 않음", () => {
  const claim: Claim = {
    namespace: "test",
    contributor_id: "person",
    trip_id: "trip",
    vehicle_id: "car",
    graph_id: graph,
    matching_policy: "seoul-observed-v2",
    trip_start_utc: time(0),
    matching_id: "match",
    owner_id: "worker",
    fence: "1",
    attempt: 1,
    lease_until_utc: time(120),
    observations: [],
  };
  const result: MatchingResult = {
    policy_id: "seoul-observed-v2",
    matching_id: "match",
    graph_id: graph,
    input_samples: 0,
    matched_samples: 0,
    excluded_samples: 0,
    accepted_traversals: 0,
    excluded_traversals: 0,
    points: [],
    traversals: [],
    semantic_sha256: "b".repeat(64),
  };
  assert.equal(contributionInput(claim, result, []).accepted.length, 0);
  assert.throws(() =>
    contributionInput(claim, { ...result, policy_id: "seoul-observed-v3" }, []),
  );
  assert.equal(
    contributionInput(
      { ...claim, matching_policy: "seoul-observed-v3" },
      { ...result, policy_id: "seoul-observed-v3" },
      [],
    ).accepted.length,
    0,
  );
});
