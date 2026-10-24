import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateWindow,
  normalizedCatalog,
} from "../tools/traffic_aggregation.js";
import type {
  AggregationInput,
  AggregationContribution,
  AggregationDraft,
} from "../tools/aggregation_types.js";
import {
  batchValid,
  batchRequestHash,
  digest,
} from "../tools/ingestion_validation.js";
import type {
  IngestBatch,
  Principal,
  StoreConfig,
} from "../tools/ingestion_types.js";
const epoch = Date.parse("2026-10-24T00:00:00Z"),
  time = (offset: number) => new Date(epoch + offset).toISOString(),
  graph = "a".repeat(64);
const contribution = (
  index: number,
  change: Partial<AggregationContribution> = {},
): AggregationContribution => ({
  observation_id: index.toString(16).padStart(64, "0"),
  contributor_id: `person-${index}`,
  graph_id: graph,
  matching_policy: "seoul-observed-v3",
  source_class: "SYNTHETIC",
  trip_activity: "TRAVEL",
  edge_id: "101",
  forward: true,
  entered_at_utc: time(10000),
  exited_at_utc: time(20000),
  distance_m: 100,
  duration_s: 10,
  available_at_utc: time(80000),
  ...change,
});
const input = (count = 5): AggregationInput => ({
  namespace: "test-one",
  graph_id: graph,
  source_class: "SYNTHETIC",
  window_start: time(0),
  now_utc: time(90000),
  catalog: [{ edge_id: "101", forward: true, distance_m: 100 }],
  contributions: Array.from({ length: count }, (_, i) => contribution(i + 1)),
});
function draft(value: AggregationInput): AggregationDraft {
  const result = aggregateWindow(value);
  assert.equal(result.code, "FINALIZED");
  assert.ok(result.draft);
  return result.draft;
}
test("UTC exit window is half-open and finalization deadline is exact / UTC 진출 창과 확정 마감 경계를 검사", () => {
  const value = input();
  assert.equal(
    aggregateWindow({ ...value, now_utc: time(89999) }).code,
    "WINDOW_OPEN",
  );
  assert.equal(aggregateWindow(value).code, "FINALIZED");
  const end = contribution(6, {
    entered_at_utc: time(50000),
    exited_at_utc: time(60000),
    available_at_utc: time(80000),
  });
  const result = aggregateWindow({ ...value, contributions: [end] });
  assert.equal(result.selections[0]!.eligible_contributors, 0);
  assert.equal(result.rejections[0]!.reason, "OTHER_WINDOW");
  assert.equal(
    draft({
      ...value,
      window_start: time(60000),
      now_utc: time(150000),
      contributions: [end],
    }).entries[0]!.status,
    "INSUFFICIENT",
  );
});
test("Availability strictly precedes deadline and cannot precede exit / 사용 가능 시각은 진출 이후이며 마감 미만", () => {
  const value = input();
  for (const offset of [90000, 90001]) {
    const result = aggregateWindow({
      ...value,
      contributions: [contribution(1, { available_at_utc: time(offset) })],
    });
    assert.equal(result.rejections[0]!.reason, "LATE");
    assert.equal(result.selections[0]!.eligible_contributors, 0);
  }
  assert.equal(
    aggregateWindow({
      ...value,
      contributions: [contribution(1, { available_at_utc: time(89999) })],
    }).selections[0]!.eligible_contributors,
    1,
  );
  assert.throws(() =>
    aggregateWindow({
      ...value,
      contributions: [contribution(1, { available_at_utc: time(19999) })],
    }),
  );
});
test("Zero, one, four and five unique contributors produce correct statuses / 고유 기여자 0·1·4·5명 상태", () => {
  for (const [count, status] of [
    [0, "UNKNOWN"],
    [1, "INSUFFICIENT"],
    [4, "INSUFFICIENT"],
    [5, "LIVE"],
  ] as const) {
    const entry = draft(input(count)).entries[0]!;
    assert.equal(entry.status, status);
    assert.equal(entry.speed_mps, count >= 5 ? 10 : null);
    assert.equal(entry.sample_bucket, count >= 5 ? "5-9" : null);
  }
});
test("Repeated trips count once by earliest exit, entry and ID / 반복 여행은 진출·진입·ID 순으로 한 번 선택", () => {
  const values = [
    contribution(3, {
      contributor_id: "same",
      entered_at_utc: time(5000),
      exited_at_utc: time(20000),
      duration_s: 15,
    }),
    contribution(2, {
      contributor_id: "same",
      entered_at_utc: time(4000),
      exited_at_utc: time(20000),
      duration_s: 16,
    }),
    contribution(1, {
      contributor_id: "same",
      entered_at_utc: time(4000),
      exited_at_utc: time(20000),
      duration_s: 16,
    }),
    contribution(4, {
      contributor_id: "same",
      entered_at_utc: time(10000),
      exited_at_utc: time(21000),
      duration_s: 11,
    }),
  ];
  const result = aggregateWindow({ ...input(), contributions: values });
  assert.equal(result.selections[0]!.eligible_contributors, 1);
  assert.deepEqual(result.selections[0]!.selected_observation_ids, [
    contribution(1).observation_id,
  ]);
  assert.equal(
    result.rejections.filter((row) => row.reason === "REPEATED_CONTRIBUTOR")
      .length,
    3,
  );
});
test("Exact duplicates collapse; conflicting ID content fails closed / 정확 중복은 합치고 같은 ID의 내용 충돌은 거부", () => {
  const value = input();
  const result = aggregateWindow({
    ...value,
    contributions: [...value.contributions, value.contributions[0]!],
  });
  assert.equal(result.selections[0]!.eligible_contributors, 5);
  assert.throws(() =>
    aggregateWindow({
      ...value,
      contributions: [
        ...value.contributions,
        { ...value.contributions[0]!, contributor_id: "different" },
      ],
    }),
  );
});
test("Median duration includes signal wait and averages even middle values / 신호대기 포함 중앙값과 짝수 중앙값 평균", () => {
  const values = [10, 12, 18, 20, 30, 100].map((duration, i) =>
    contribution(i + 1, {
      entered_at_utc: time(200000 - duration * 1000),
      exited_at_utc: time(200000),
      duration_s: duration,
      available_at_utc: time(260000),
    }),
  );
  const result = aggregateWindow({
    ...input(),
    window_start: time(180000),
    now_utc: time(270000),
    contributions: values,
  });
  assert.equal(result.selections[0]!.median_duration_s, 19);
  assert.equal(result.draft!.entries[0]!.speed_mps, 5.263158);
});
test("Sample buckets switch at ten and twenty / 표본 구간은 10명과 20명에서 전환", () => {
  for (const [count, bucket] of [
    [9, "5-9"],
    [10, "10-19"],
    [19, "10-19"],
    [20, "20+"],
  ] as const)
    assert.equal(draft(input(count)).entries[0]!.sample_bucket, bucket);
});
test("Source classes partition and explicit parked trips do not contribute / 출처별 분리와 명시 주차 여행 제외", () => {
  const value = input(4);
  const additions = [
    contribution(8, { source_class: "BUS" }),
    contribution(9, { source_class: "CAR" }),
    contribution(10, { trip_activity: "PARKED" }),
  ];
  assert.equal(
    draft({ ...value, contributions: [...value.contributions, ...additions] })
      .entries[0]!.status,
    "INSUFFICIENT",
  );
  const bus = draft({
    ...value,
    source_class: "BUS",
    contributions: additions,
  });
  assert.equal(bus.entries[0]!.status, "INSUFFICIENT");
  assert.equal(bus.entries[0]!.source_class, "BUS");
});
test("Only formerly eligible live entries become stale; old callers cannot extend validity / 적격 실시간 값만 만료되며 유효기간 고정", () => {
  for (const count of [0, 1, 4, 5]) {
    const value = { ...input(count), now_utc: time(240000) };
    const entry = draft(value).entries[0]!;
    assert.equal(
      entry.status,
      count >= 5 ? "STALE" : count ? "INSUFFICIENT" : "UNKNOWN",
    );
    assert.equal(entry.speed_mps, null);
    assert.equal(entry.sample_bucket, null);
    assert.equal(draft(value).valid_until, time(240000));
  }
  assert.equal(
    aggregateWindow({ ...input(), now_utc: time(86460000) }).code,
    "RETENTION_EXPIRED",
  );
});
test("New empty window does not inherit previous speed / 새 빈 창은 이전 속도를 상속하지 않음", () => {
  assert.equal(draft(input()).entries[0]!.status, "LIVE");
  assert.equal(
    draft({ ...input(0), window_start: time(60000), now_utc: time(150000) })
      .entries[0]!.status,
    "UNKNOWN",
  );
});
test("Draft canonical bytes are stable and expose strict public whitelist / 후보 정규 바이트 결정성과 공개 필드 제한", () => {
  const value = input();
  value.catalog.push({ edge_id: "20", forward: false, distance_m: 80 });
  const a = aggregateWindow(value),
    b = aggregateWindow({
      ...value,
      contributions: [...value.contributions].reverse(),
      catalog: [...value.catalog].reverse(),
    });
  assert.equal(a.canonical_sha256, b.canonical_sha256);
  assert.equal(a.input_sha256, b.input_sha256);
  assert.equal(a.catalog_sha256, b.catalog_sha256);
  assert.deepEqual(
    Object.keys(a.draft!).sort(),
    [
      "schema_version",
      "graph_id",
      "region_id",
      "aggregation_policy",
      "window_start",
      "window_end",
      "valid_until",
      "entries",
    ].sort(),
  );
  for (const entry of a.draft!.entries)
    assert.deepEqual(
      Object.keys(entry).sort(),
      [
        "edge_id",
        "forward",
        "source_class",
        "status",
        "speed_mps",
        "sample_bucket",
      ].sort(),
    );
  const bytes = JSON.stringify(a.draft);
  for (const privateValue of [
    "person-",
    "observation_id",
    "contributor_id",
    "latitude",
    "longitude",
    "duration_s",
    "eligible_contributors",
  ])
    assert.ok(!bytes.includes(privateValue));
  assert.deepEqual(
    a.draft!.entries.map((row) => row.edge_id),
    ["101", "20"],
  );
});
test("Catalog duplicates, malformed direction, bad geometry and metadata are rejected / 목록 중복·방향·지형·정보 오류 거부", () => {
  assert.throws(() => normalizedCatalog([]));
  for (const change of [
    { distance_m: 0 },
    { distance_m: NaN },
    { distance_m: Infinity },
    { forward: 1 },
  ])
    assert.throws(() =>
      normalizedCatalog([{ ...input().catalog[0]!, ...change }] as never),
    );
  assert.throws(() =>
    normalizedCatalog([...input().catalog, ...input().catalog]),
  );
  for (const change of [
    { graph_id: "b".repeat(64) },
    { matching_policy: "other" },
    { duration_s: 0 },
    { duration_s: Infinity },
    { duration_s: 10.000002 },
    { distance_m: 100.000002 },
    { edge_id: "999" },
    { forward: false },
  ])
    assert.throws(() =>
      aggregateWindow({
        ...input(),
        contributions: [contribution(1, change as never)],
      }),
    );
  assert.throws(() => aggregateWindow({ ...input(), window_start: time(1) }));
});
test("Trip activity defaults normalize to legacy hash; parked remains distinct / 활동 기본값은 기존 해시와 같고 주차는 구분", () => {
  const principal: Principal = {
      contributor_id: "one",
      vehicle_id: "car",
      consent_version: "pilot-consent-v1",
    },
    config: StoreConfig = {
      database_url: "private",
      namespace: "test",
      graph_id: graph,
      matching_policy: "seoul-observed-v2",
    };
  const value: IngestBatch = {
    schema_version: "0.1",
    batch_id: "one",
    trip_id: "one",
    batch_seq: 0,
    is_final: true,
    graph_id: graph,
    matching_policy: "seoul-observed-v2",
    consent_version: "pilot-consent-v1",
    source_class: "SYNTHETIC",
    trip_start_utc: time(0),
    samples: [
      {
        sample_id: "one",
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
  const normalized = batchValid(value, principal, config);
  assert.equal(normalized.trip_activity, "TRAVEL");
  assert.equal(batchRequestHash(normalized), digest(value));
  assert.equal(
    batchRequestHash({ ...value, trip_activity: "TRAVEL" }),
    digest(value),
  );
  assert.notEqual(
    batchRequestHash({ ...value, trip_activity: "PARKED" }),
    digest(value),
  );
  assert.throws(() =>
    batchValid({ ...value, trip_activity: "STOPPED" }, principal, config),
  );
});
