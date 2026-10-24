import assert from "node:assert/strict";
import test from "node:test";
import {
  ambiguousParallel,
  interpretRun,
  matchObservations,
  MatchingSession,
  splitContinuousRuns,
  validateEnvelope,
  type ContinuousRun,
} from "../tools/matching_evidence.js";
import { InputError } from "../tools/shared.js";
import { object, objects } from "./helpers.js";
import {
  matchingEnvelope,
  midpointObservations,
  probeObservations,
  probes,
  unitBundle,
} from "./matching_helpers.js";
import type { Observation } from "../tools/vehicle_simulator.js";

test("pinned clean/waiting responses produce six observed-time traversals / 고정 깨끗한·정지 응답의 관측 시각 통과 여섯 개", () => {
  const observations = [
      ...probeObservations("upper-waiting"),
      ...probeObservations("baseline-clean"),
    ],
    envelope = matchingEnvelope(observations);
  const result = matchObservations(
    envelope,
    unitBundle,
    (run) => probes[run.vehicle_id]!.response,
  );
  assert.equal(result.accepted_traversals, 6);
  assert.equal(result.excluded_traversals, 0);
  assert.equal(result.matched_samples, observations.length);
  const expected: Record<string, number[]> = {
    "baseline-clean": [22240, 44479],
    "upper-waiting": [27240, 49479, 71718, 93957],
  };
  for (const vehicle of Object.keys(expected)) {
    const traversals = result.traversals.filter(
      (item) => item.vehicle_id === vehicle,
    );
    traversals.forEach((item, index) => {
      assert.ok(Math.abs(item.exited_at_ms! - expected[vehicle]![index]!) <= 5);
      assert.ok(item.source_sample_ids.length > 0);
      assert.ok(item.entry_bracket && item.exit_bracket);
    });
    assert.equal(traversals[0]!.entered_at_ms, 0);
  }
});
test("physical parallel ambiguity excludes all 21 midpoints before engine calls / 물리 평행도로 중간점21개 사전 제외", () => {
  const observations = midpointObservations();
  assert.ok(
    observations.every((point) => ambiguousParallel(point, unitBundle)),
  );
  let called = false;
  const result = matchObservations(
    matchingEnvelope(observations),
    unitBundle,
    () => {
      called = true;
      throw new Error("must not execute");
    },
  );
  assert.equal(called, false);
  assert.equal(result.excluded_samples, 21);
  assert.equal(result.accepted_traversals, 0);
  assert.ok(
    result.points.every(
      (point) => point.reason_codes[0] === "AMBIGUOUS_PARALLEL",
    ),
  );
  assert.equal(
    ambiguousParallel(probeObservations("baseline-clean")[3]!, unitBundle),
    false,
  );
});
test("gap policy splits only above 3000 ms and retains causes / 3000밀리초 초과만 분리하고 누락 원인 보존", () => {
  const input = probeObservations("baseline-clean").slice(0, 3);
  input[1]!.offset_ms = 3000;
  input[1]!.event_time_utc = "2026-01-01T00:00:03.000Z";
  input[2]!.offset_ms = 6001;
  input[2]!.event_time_utc = "2026-01-01T00:00:06.001Z";
  const runs = splitContinuousRuns(matchingEnvelope(input), unitBundle).runs;
  assert.equal(runs.length, 2);
  assert.equal(runs[0]!.observations.length, 2);
  assert.equal(runs[0]!.end_reason, "OBSERVATION_GAP");
  assert.equal(runs[1]!.start_reason, "OBSERVATION_GAP");
});
function oneEdgeFixture(middle: "unmatched" | "distance"): {
  observations: Observation[];
  response: unknown;
} {
  const observations = probeObservations("baseline-clean").slice(0, 3);
  observations[0]!.longitude = 0;
  observations[1]!.longitude = 0.001;
  observations[2]!.longitude = 0.002;
  const raw = structuredClone(probes["baseline-clean"]!.response) as Record<
      string,
      unknown
    >,
    edge = objects(raw.edges)[0]!;
  edge.begin_shape_index = 0;
  edge.end_shape_index = 1;
  raw.edges = [edge];
  raw.shape = "???_|B";
  raw.matched_points = [
    {
      lon: 0,
      lat: 0,
      type: "matched",
      edge_index: 0,
      distance_along_edge: 0,
      distance_from_trace_point: 0,
    },
    middle === "unmatched"
      ? { type: "unmatched" }
      : {
          lon: 0.001,
          lat: 0,
          type: "matched",
          edge_index: 0,
          distance_along_edge: 0.5,
          distance_from_trace_point: 10,
        },
    {
      lon: 0.002,
      lat: 0,
      type: "matched",
      edge_index: 0,
      distance_along_edge: 1,
      distance_from_trace_point: 0,
    },
  ];
  return { observations, response: raw };
}
test("unmatched middle cannot join known same-edge entry and exit / 같은 구간 중간 미대응을 건너 완전 통과 금지", () => {
  const value = oneEdgeFixture("unmatched"),
    result = matchObservations(
      matchingEnvelope(value.observations),
      unitBundle,
      () => value.response,
    );
  assert.equal(result.accepted_traversals, 0);
  assert.equal(result.excluded_traversals, 1);
  assert.ok(result.traversals[0]!.reason_codes.includes("UNMATCHED"));
  assert.ok(result.traversals[0]!.reason_codes.includes("DISCONTINUITY"));
});
test("distance exclusion also breaks same-edge timing continuity / 거리 초과 제외도 동일 구간 시각 연속성 단절", () => {
  const value = oneEdgeFixture("distance"),
    result = matchObservations(
      matchingEnvelope(value.observations),
      unitBundle,
      () => value.response,
    );
  assert.equal(result.accepted_traversals, 0);
  assert.ok(result.traversals[0]!.reason_codes.includes("DISTANCE_EXCEEDED"));
  assert.equal(result.excluded_samples, 1);
});
test("single-point runs are explicitly insufficient / 한 점 구간의 표본 부족 명시", () => {
  const result = matchObservations(
    matchingEnvelope(probeObservations("baseline-clean").slice(0, 1)),
    unitBundle,
    () => {
      throw new Error("must not run");
    },
  );
  assert.equal(result.excluded_samples, 1);
  assert.deepEqual(result.points[0]!.reason_codes, ["INSUFFICIENT_POINTS"]);
});
test("engine cost and clipped returned length never determine timings / 엔진 비용·잘린 반환 길이로 통과 시각 계산 금지", () => {
  const input = matchingEnvelope(),
    base = matchObservations(
      input,
      unitBundle,
      () => probes["baseline-clean"]!.response,
    ),
    changed = structuredClone(probes["baseline-clean"]!.response);
  for (const edge of objects(object(changed).edges))
    Object.assign(edge, {
      length: 0.001,
      speed: 999,
      end_node: { elapsed_time: 999999 },
    });
  assert.deepEqual(
    matchObservations(input, unitBundle, () => changed),
    base,
  );
});
test("large fraction reversal excludes affected occurrence only / 큰 비율 역행은 해당 구간 통과만 제외", () => {
  const response = structuredClone(probes["baseline-clean"]!.response),
    points = objects(object(response).matched_points);
  points[10]!.distance_along_edge = points[8]!.distance_along_edge;
  points[10]!.lon = points[8]!.lon;
  const input = probeObservations("baseline-clean");
  input[10]!.longitude = Number(points[10]!.lon);
  const result = matchObservations(
    matchingEnvelope(input),
    unitBundle,
    () => response,
  );
  assert.equal(result.traversals[0]!.status, "EXCLUDED");
  assert.ok(result.traversals[0]!.reason_codes.includes("DISCONTINUITY"));
  assert.equal(result.traversals[1]!.status, "ACCEPTED");
});
test("run gap cause is not attached to unrelated internal partial edges / 누락 원인을 무관한 내부 일부 구간에 붙이지 않음", () => {
  const observations = probeObservations("upper-waiting"),
    run: ContinuousRun = {
      vehicle_id: "upper-waiting",
      index: 0,
      observations,
      start_reason: "OBSERVATION_GAP",
    };
  const response = structuredClone(probes["upper-waiting"]!.response),
    points = objects(object(response).matched_points);
  const first = points.findIndex((point) => point.edge_index === 1);
  points[first]!.begin_route_discontinuity = true;
  const result = interpretRun(
    matchingEnvelope(observations),
    unitBundle,
    run,
    response,
  );
  assert.ok(!result.traversals[1]!.reason_codes.includes("OBSERVATION_GAP"));
});
test("malformed responses remain failures, never exclusions / 잘못된 엔진 응답은 제외가 아닌 실패", () => {
  const mutations: ((value: Record<string, unknown>) => void)[] = [
    (value) => {
      objects(value.matched_points).pop();
    },
    (value) => {
      objects(value.edges)[0]!.id = 999;
    },
    (value) => {
      objects(value.matched_points)[1]!.edge_index = 99;
    },
    (value) => {
      objects(value.matched_points)[1]!.distance_along_edge = 2;
    },
    (value) => {
      objects(value.matched_points)[1]!.type = "unsupported";
    },
    (value) => {
      value.shape = "bad";
    },
  ];
  for (const mutation of mutations) {
    const response = object(
      structuredClone(probes["baseline-clean"]!.response),
    );
    mutation(response);
    assert.throws(
      () => matchObservations(matchingEnvelope(), unitBundle, () => response),
      InputError,
    );
  }
  assert.throws(
    () =>
      matchObservations(matchingEnvelope(), unitBundle, () => {
        throw new Error("real engine failure");
      }),
    /real engine failure/,
  );
});
test("invalid observation domains and order are input errors / 잘못된 관측 범위·순서는 입력 오류", () => {
  const changes: ((value: ReturnType<typeof matchingEnvelope>) => void)[] = [
    (value) => {
      value.graph_id = "wrong";
    },
    (value) => {
      Object.assign(value, { truth: {} });
    },
    (value) => {
      Object.assign(value.observations[0]!, { edge_id: "truth-leak" });
    },
    (value) => {
      value.observations[0]!.accuracy_m = 0;
    },
    (value) => {
      value.observations[0]!.latitude = 91;
    },
    (value) => {
      value.observations[1]!.sample_id = value.observations[0]!.sample_id;
    },
    (value) => {
      value.observations.reverse();
    },
    (value) => {
      value.observations[1]!.event_time_utc = "2026-01-02T00:00:01.000Z";
    },
  ];
  for (const change of changes) {
    const value = matchingEnvelope();
    change(value);
    assert.throws(() => validateEnvelope(value, unitBundle), InputError);
  }
  const template = probeObservations("baseline-clean")[0]!;
  const many = Array.from({ length: 3002 }, (_, index) => ({
    ...template,
    sample_id: "dense-" + index,
    offset_ms: index,
    event_time_utc: new Date(
      Date.parse("2026-01-01T00:00:00Z") + index,
    ).toISOString(),
  }));
  assert.throws(
    () => validateEnvelope(matchingEnvelope(many), unitBundle),
    /3001/,
  );
});
test("bounded split/overlap session is identical and seals exactly once / 제한 분할·중첩 세션 동등성·한 번 종료", () => {
  const envelope = matchingEnvelope(),
    full = matchObservations(
      envelope,
      unitBundle,
      () => probes["baseline-clean"]!.response,
    );
  let calls = 0;
  const session = new MatchingSession(
    {
      schema_version: "0.1",
      matching_id: envelope.matching_id,
      graph_id: envelope.graph_id,
    },
    unitBundle,
    () => {
      calls++;
      return probes["baseline-clean"]!.response;
    },
  );
  session.append(envelope.observations.slice(0, 25));
  session.append(envelope.observations.slice(20));
  const split = session.finalize();
  assert.deepEqual(split, full);
  assert.equal(calls, 1);
  assert.throws(() => session.finalize(), /finalized/);
  assert.throws(() => session.append([]), /sealed/);
});
test("conflicting overlap and novel out-of-order samples fail / 충돌 중첩·새 역순 표본 거부", () => {
  const envelope = matchingEnvelope(),
    session = new MatchingSession(
      {
        schema_version: "0.1",
        matching_id: envelope.matching_id,
        graph_id: envelope.graph_id,
      },
      unitBundle,
      () => probes["baseline-clean"]!.response,
    );
  session.append(envelope.observations.slice(0, 10));
  const conflict = structuredClone(envelope.observations[5]!);
  conflict.longitude += 0.000001;
  assert.throws(() => session.append([conflict]), /conflicting overlap/);
  const earlier = { ...envelope.observations[5]!, sample_id: "novel-earlier" };
  assert.throws(() => session.append([earlier]), /decreasing/);
});
