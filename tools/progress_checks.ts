/** Same-run Seoul progress acceptance, with authored expectations and retained inputs.
 * 자체 기대 결과·입력을 보존하는 같은 실행 서울 진행 검증입니다. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RouteProgress,
  routeBinding,
  type ProgressFix,
  type ProgressUpdate,
} from "./route_progress.js";
import { buildProgressReplay } from "./progress_replay.js";
import { geodesicSphere as geo } from "./geodesy.js";
import type { GatewaySuccess } from "./gateway_public_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
export const PROGRESS_CASE_IDS = [
  "route-binding",
  "geometry-distance",
  "exact-start",
  "next-turn",
  "turn-advance",
  "remaining-distance",
  "bounded-noise",
  "stationary-jitter",
  "backward",
  "impossible-jump",
  "bad-accuracy",
  "malformed-fix",
  "stale-sample",
  "future-sample",
  "out-of-order",
  "duplicate",
  "parallel-road-ambiguous",
  "route-self-ambiguity",
  "offroute-pending",
  "offroute-confirmed",
  "one-outlier-not-offroute",
  "bad-fix-breaks-streak",
  "rejoin-hysteresis",
  "rejoin-confirmed",
  "arrival-hysteresis",
  "arrival-confirmed",
  "destination-shortcut-blocked",
  "replay-deterministic",
  "replay-ui-step",
  "replay-ui-play-pause",
  "replay-ui-invalidation",
  "replay-ui-mobile",
].map((id) => "nav02-" + id);
export function requireProgressCases(cases: SimulationAssertion[]): void {
  if (
    cases.length !== 32 ||
    new Set(cases.map((a) => a.assertion_id)).size !== 32 ||
    PROGRESS_CASE_IDS.some(
      (id) => !cases.some((a) => a.assertion_id === id && a.status === "PASS"),
    )
  )
    throw Error("NAV-02 required cases incomplete / NAV-02 필수 검사 미완료");
}
export class ProgressChecks {
  readonly assertions: SimulationAssertion[] = [];
  constructor(private readonly output: string) {
    mkdirSync(join(output, "progress"));
  }
  check(
    id: string,
    pass: boolean,
    en: string,
    ko: string,
    actual: unknown,
  ): void {
    const assertion_id = "nav02-" + id,
      evidence_path = "progress/" + id + ".json";
    if (
      !PROGRESS_CASE_IDS.includes(assertion_id) ||
      this.assertions.some((a) => a.assertion_id === assertion_id)
    )
      throw Error("Unexpected progress case / 진행 검사 목록 오류");
    writeFileSync(
      join(this.output, evidence_path),
      JSON.stringify(actual, null, 2) + "\n",
      { flag: "wx" },
    );
    this.assertions.push({
      assertion_id,
      status: pass ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected: true,
      actual: pass,
      evidence_path,
    });
    if (!pass) throw Error(en + " / " + ko);
  }
  exercise(route: GatewaySuccess, roads: number[][][]): void {
    const write = (name: string, value: unknown) =>
      writeFileSync(
        join(this.output, "progress/" + name + ".json"),
        JSON.stringify(value, null, 2) + "\n",
        { flag: "wx" },
      );
    write("route", route);
    write("context", roads);
    const line = route.geometry.coordinates,
      rad = Math.PI / 180;
    const metric = (a: number[], b: number[]) =>
      6371008.8 *
      Math.hypot(
        (b[0]! - a[0]!) * rad * Math.cos(((a[1]! + b[1]!) * rad) / 2),
        (b[1]! - a[1]!) * rad,
      );
    const prefix = [0];
    for (let i = 1; i < line.length; i++)
      prefix.push(prefix[i - 1]! + metric(line[i - 1]!, line[i]!));
    const total = prefix.at(-1)!,
      firstBoundary = prefix[route.guidance!.maneuvers[1]!.begin_shape_index]!;
    const fix = (along: number, time: number, north = 0): ProgressFix => {
      const exact = geo.position(line, Math.min(along, geo.length(line))),
        p = geo.offset(exact, 0, north),
        ahead = geo.position(line, Math.min(geo.length(line), along + 0.5));
      const heading =
        geo.distance(exact, ahead) > 0.01
          ? ((geo.project(exact, [exact, ahead]).tangent_radians * 180) /
              Math.PI +
              360) %
            360
          : null;
      return {
        binding: routeBinding(route),
        source_class: "SYNTHETIC",
        event_time_ms: time,
        longitude: p[0]!,
        latitude: p[1]!,
        accuracy_m: 4,
        heading_degrees: heading,
        speed_mps: heading === null ? 0 : 20,
      };
    };
    const seed = (until: number) => {
      const tracker = new RouteProgress(route),
        inputs: ProgressFix[] = [],
        outputs: ProgressUpdate[] = [];
      let time = 0,
        last = 0;
      for (let d = 0; d <= until; d += 20) {
        const f = fix(d, time);
        inputs.push(f);
        outputs.push(tracker.observe(f, time));
        last = d;
        time += 1000;
      }
      if (until - last > 0.01) {
        const f = fix(until, time);
        inputs.push(f);
        outputs.push(tracker.observe(f, time));
        time += 1000;
      }
      return { tracker, inputs, outputs, time };
    };
    const check = (
      id: string,
      pass: boolean,
      en: string,
      ko: string,
      data: unknown,
    ) =>
      this.check(id, pass, en, ko, {
        source_class: "SYNTHETIC",
        binding: routeBinding(route),
        metric_scope: "EXACT_RETURNED_ROUTE_NOT_ROAD_NETWORK_MATCHING",
        ...(data as object),
      });
    let s = seed(0);
    const foreign = fix(10, 1000);
    foreign.binding.generation_id = "d".repeat(64);
    let u = s.tracker.observe(foreign, 1000);
    check(
      "route-binding",
      !u.accepted &&
        u.reason === "WRONG_ROUTE" &&
        u.state.last_confirmed_progress_m === 0,
      "A foreign route generation cannot move this session.",
      "다른 경로 세대로 세션 진행 불가.",
      { input: foreign, output: u },
    );
    check(
      "geometry-distance",
      Math.abs(s.tracker.geometry_length_m - total) < 0.05,
      "Original polyline length matches independent local metric within5cm.",
      "원 지형 길이를 독립 거리식과5cm 안에서 대조.",
      { independent_length_m: total, output: s.tracker.snapshot() },
    );
    check(
      "exact-start",
      s.outputs[0]!.state.status === "ON_ROUTE" &&
        Math.abs(s.outputs[0]!.state.progress_m!) < 0.05,
      "An exact authored start acquires the beginning of this route.",
      "원 출발 합성 표본에서 경로 시작 확인.",
      { inputs: s.inputs, outputs: s.outputs },
    );
    s = seed(Math.min(10, firstBoundary / 3));
    u = s.outputs.at(-1)!;
    check(
      "next-turn",
      u.state.next_maneuver?.index === 1 &&
        u.state.next_maneuver.instruction ===
          route.guidance!.maneuvers[1]!.instruction &&
        Math.abs(
          u.state.next_maneuver.distance_m -
            (firstBoundary - Math.min(10, firstBoundary / 3)),
        ) < 0.1,
      "Upcoming text and distance use the next original maneuver boundary.",
      "다음 원 회전 경계의 문장·거리 사용.",
      {
        inputs: s.inputs,
        output: u,
        expected_next_index: 1,
        expected_distance_m: firstBoundary - Math.min(10, firstBoundary / 3),
      },
    );
    s = seed(firstBoundary + 4);
    u = s.outputs.at(-1)!;
    check(
      "turn-advance",
      u.state.status === "ON_ROUTE" && u.state.next_maneuver!.index === 2,
      "Crossing the first boundary plus3m advances exactly one native turn.",
      "첫 경계3m 뒤 원 회전을 한 단계 이동.",
      { inputs: s.inputs, outputs: s.outputs },
    );
    const midpoint = Math.min(total * 0.55, total - 30);
    s = seed(midpoint);
    u = s.outputs.at(-1)!;
    check(
      "remaining-distance",
      u.state.status === "ON_ROUTE" &&
        Math.abs(u.state.remaining_m! - (total - midpoint)) < 0.1,
      "Remaining distance is original geometric length minus confirmed progress.",
      "남은 거리는 원 지형 길이에서 확정 진행을 뺀 값.",
      {
        inputs: s.inputs,
        outputs: s.outputs,
        expected_remaining_m: total - midpoint,
      },
    );
    const replay = buildProgressReplay(route, roads, "noisy-route"),
      noisy = new RouteProgress(route),
      noisyResults = replay.samples.map((x) => ({
        truth: x.truth_along_m,
        input: x.fix,
        output: noisy.observe(x.fix, x.fix.event_time_ms),
      }));
    const confirmed = noisyResults.filter(
        (x) =>
          x.output.state.status === "ON_ROUTE" ||
          x.output.state.status === "ARRIVED",
      ),
      maxError = Math.max(
        ...confirmed.map((x) =>
          Math.abs(x.output.state.progress_m! - x.truth!),
        ),
      );
    check(
      "bounded-noise",
      confirmed.length >= replay.samples.length * 0.7 && maxError <= 8,
      "Authored bounded noise tracks within8m when confirmed and withholds ambiguous fixes.",
      "명시 오차에서 확정 진행8m 이내·모호한 표본 보류.",
      {
        confirmed: confirmed.length,
        total: replay.samples.length,
        max_progress_error_m: maxError,
        replay,
        results: noisyResults,
      },
    );
    s = seed(midpoint);
    const before = s.tracker.snapshot().last_confirmed_progress_m!;
    u = s.tracker.observe(fix(midpoint - 2, s.time), s.time);
    check(
      "stationary-jitter",
      u.state.status === "ON_ROUTE" && u.state.progress_m! >= before,
      "Small backward jitter cannot reverse confirmed progress.",
      "작은 뒤쪽 흔들림으로 확정 진행 역행 불가.",
      { input: fix(midpoint - 2, s.time), output: u, before },
    );
    u = s.tracker.observe(fix(midpoint - 50, s.time + 1000), s.time + 1000);
    check(
      "backward",
      u.state.next_maneuver === null && u.state.reason === "BACKWARD_MOTION",
      "Large backward displacement withholds current turns.",
      "큰 역행에서 현재 회전 보류.",
      { output: u },
    );
    s = seed(0);
    u = s.tracker.observe(fix(total, 1000), 1000);
    check(
      "impossible-jump",
      u.state.status === "UNCERTAIN" && u.state.last_confirmed_progress_m === 0,
      "A one-second route-end jump cannot skip maneuvers.",
      "1초 만의 끝점 도약으로 회전 건너뛰기 금지.",
      { input: fix(total, 1000), output: u },
    );
    for (const [id, mutate] of [
      ["bad-accuracy", (v: any) => (v.accuracy_m = 100)],
      ["malformed-fix", (v: any) => (v.longitude = 999)],
    ] as const) {
      s = seed(0);
      const bad = fix(10, 1000);
      mutate(bad);
      u = s.tracker.observe(bad, 1000);
      check(
        id,
        !u.accepted && u.state.next_maneuver === null,
        "Invalid position quality/input cannot become current guidance: " + id,
        "위치 품질/입력 오류의 현재 안내 차단: " + id,
        { input: bad, output: u },
      );
    }
    s = seed(0);
    const gap = s.tracker.advance(6000);
    u = s.tracker.observe(fix(10, 1000), 7000);
    check(
      "stale-sample",
      !u.accepted &&
        u.reason === "STALE_FIX" &&
        u.state.next_maneuver === null &&
        gap.status === "STALE" &&
        gap.next_maneuver === null,
      "A six-second-old fix is stale, never current.",
      "6초 단절·지난 표본은 현재 위치가 아님.",
      { clock_gap: gap, output: u },
    );
    s = seed(0);
    u = s.tracker.observe(fix(10, 2000), 1000);
    check(
      "future-sample",
      !u.accepted &&
        u.reason === "FUTURE_FIX" &&
        u.state.last_confirmed_progress_m === 0,
      "Future positions cannot move progress.",
      "미래 위치로 진행 불가.",
      { output: u },
    );
    s = seed(20);
    u = s.tracker.observe(fix(10, 0), s.time);
    check(
      "out-of-order",
      !u.accepted && u.reason === "OUT_OF_ORDER",
      "Reordered positions cannot overwrite newer progress.",
      "역순 위치로 새 진행 덮어쓰기 불가.",
      { output: u },
    );
    const duplicate = s.inputs.at(-1)!;
    u = s.tracker.observe(duplicate, s.time);
    check(
      "duplicate",
      !u.accepted && u.reason === "DUPLICATE_FIX",
      "Duplicate timestamps do not add confidence or movement.",
      "중복 시각으로 확신·진행 추가 불가.",
      { input: duplicate, output: u },
    );
    let ambiguity: any = null;
    outer: for (let index = 0; index < roads.length; index++)
      for (const fraction of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const point = geo.position(
            roads[index]!,
            geo.length(roads[index]!) * fraction,
          ),
          projection = geo.project(point, line),
          along = projection.fraction * geo.length(line);
        if (
          projection.distance_m < 12 ||
          projection.distance_m > 24 ||
          along < 300 ||
          along > total - 50
        )
          continue;
        const a = seed(along),
          f = fix(along, a.time);
        Object.assign(f, {
          longitude: point[0],
          latitude: point[1],
          accuracy_m: 25,
          heading_degrees: null,
          speed_mps: 0,
        });
        const t = new RouteProgress(route, roads);
        for (const x of a.inputs) t.observe(x, x.event_time_ms);
        const result = t.observe(f, a.time);
        if (result.state.reason === "AMBIGUOUS_CONTEXT_ROAD") {
          ambiguity = {
            road_index: index,
            road: roads[index],
            inputs: a.inputs,
            input: f,
            output: result,
            route_distance_m: projection.distance_m,
          };
          break outer;
        }
      }
    check(
      "parallel-road-ambiguous",
      !!ambiguity,
      "A competing actual Seoul context road withholds an uncertain snap.",
      "경쟁하는 실제 서울 주변 도로에서 불확실 투영 보류.",
      ambiguity ?? { found: false },
    );
    let self: any = null;
    for (let i = 0; i < line.length; i++) {
      if (prefix[i]! > 200) break;
      const t = new RouteProgress(route);
      t.observe(fix(0, 0), 0);
      const f = fix(prefix[i]!, 5000);
      f.heading_degrees = null;
      f.speed_mps = 0;
      f.accuracy_m = 25;
      const result = t.observe(f, 5000);
      if (result.state.reason === "AMBIGUOUS_ROUTE_SEGMENTS") {
        self = { shape_index: i, input: f, output: result };
        break;
      }
    }
    check(
      "route-self-ambiguity",
      !!self,
      "Nearby revisited segments of this actual route do not cause a false forward snap.",
      "실제 경로의 가까운 재방문 구간에서 잘못된 전방 투영 금지.",
      self ?? { found: false },
    );
    const departure = buildProgressReplay(route, roads, "departure-rejoin"),
      off = departure.samples.filter((x) => x.truth_along_m === null),
      anchor =
        departure.samples[
          departure.samples.findIndex((x) => x.truth_along_m === null) - 1
        ]!.truth_along_m!;
    const departed = () => {
      const a = seed(anchor),
        t = a.tracker,
        outputs: ProgressUpdate[] = [];
      let time = a.time + 3000;
      for (const x of off) {
        const f = { ...x.fix, event_time_ms: time };
        outputs.push(t.observe(f, time));
        time += 1000;
      }
      return {
        t,
        time,
        outputs,
        inputs: off.map((x, i) => ({
          ...x.fix,
          event_time_ms: a.time + 3000 + i * 1000,
        })),
      };
    };
    let d = departed();
    check(
      "offroute-pending",
      d.outputs[0]!.state.status === "OFF_ROUTE_PENDING",
      "One distant actual-road fix is only pending departure.",
      "실제 다른 도로의 단일 표본은 이탈 대기.",
      {
        road_index: departure.alternate_road,
        inputs: d.inputs,
        outputs: d.outputs,
      },
    );
    check(
      "offroute-confirmed",
      d.outputs.at(-1)!.state.status === "OFF_ROUTE" &&
        d.outputs.at(-1)!.state.next_maneuver === null,
      "Three separated actual-context-road samples confirm departure and hide turns.",
      "주변 도로 표본3개로 이탈 확정·회전 보류.",
      {
        road_index: departure.alternate_road,
        inputs: d.inputs,
        outputs: d.outputs,
      },
    );
    s = seed(anchor);
    const one = { ...off[0]!.fix, event_time_ms: s.time };
    const pending = s.tracker.observe(one, s.time),
      back = s.tracker.observe(fix(anchor, s.time + 1000), s.time + 1000);
    check(
      "one-outlier-not-offroute",
      pending.state.status === "OFF_ROUTE_PENDING" &&
        back.state.status === "ON_ROUTE",
      "A single outlier followed by the route cannot confirm departure.",
      "단일 오차 뒤 경로 표본이면 이탈 확정 불가.",
      { inputs: [one, fix(anchor, s.time + 1000)], outputs: [pending, back] },
    );
    s = seed(anchor);
    const interrupted: ProgressUpdate[] = [];
    for (let i = 0; i < 2; i++)
      interrupted.push(
        s.tracker.observe(
          { ...off[i]!.fix, event_time_ms: s.time + i * 1000 },
          s.time + i * 1000,
        ),
      );
    interrupted.push(
      s.tracker.observe(
        { ...off[0]!.fix, event_time_ms: s.time + 2000, accuracy_m: 100 },
        s.time + 2000,
      ),
    );
    for (let i = 0; i < 2; i++)
      interrupted.push(
        s.tracker.observe(
          { ...off[i]!.fix, event_time_ms: s.time + 3000 + i * 1000 },
          s.time + 3000 + i * 1000,
        ),
      );
    check(
      "bad-fix-breaks-streak",
      interrupted.at(-1)!.state.status === "OFF_ROUTE_PENDING",
      "Rejected accuracy breaks consecutive departure evidence.",
      "거부한 위치 오차가 연속 이탈 근거를 끊음.",
      { outputs: interrupted },
    );
    const firstRejoin = d.t.observe(fix(anchor, d.time), d.time),
      secondRejoin = d.t.observe(fix(anchor, d.time + 1000), d.time + 1000);
    check(
      "rejoin-hysteresis",
      firstRejoin.state.status === "OFF_ROUTE" &&
        firstRejoin.state.next_maneuver === null,
      "First rejoin sample does not prematurely restore turns.",
      "첫 복귀 표본으로 회전 조기 복구 금지.",
      { output: firstRejoin },
    );
    check(
      "rejoin-confirmed",
      secondRejoin.state.status === "ON_ROUTE" &&
        secondRejoin.state.next_maneuver !== null,
      "Two separated route positions restore confirmed progress.",
      "시간을 둔 경로 표본2개로 확정 진행 복구.",
      { output: secondRejoin },
    );
    s = seed(total - 20);
    const arrival1 = s.tracker.observe(fix(total, s.time), s.time),
      arrival2 = s.tracker.observe(fix(total, s.time + 1000), s.time + 1000);
    check(
      "arrival-hysteresis",
      arrival1.state.status === "ON_ROUTE",
      "First endpoint observation does not complete arrival.",
      "첫 끝점 관측만으로 도착 완료 금지.",
      { output: arrival1 },
    );
    check(
      "arrival-confirmed",
      arrival2.state.status === "ARRIVED" &&
        arrival2.state.remaining_m === 0 &&
        arrival2.state.next_maneuver === null,
      "Observed route travel plus two endpoint fixes completes only the replay endpoint.",
      "경로 진행·끝점 표본2개 뒤 재생 끝점 도착.",
      { inputs: s.inputs, outputs: [arrival1, arrival2] },
    );
    const shortcut = new RouteProgress(route).observe(fix(total, 0), 0);
    check(
      "destination-shortcut-blocked",
      shortcut.state.status === "UNCERTAIN" &&
        shortcut.state.remaining_m === null,
      "An initial destination-only point cannot fabricate a completed trip.",
      "첫 위치를 목적지로 보내 여행 완료 만들기 금지.",
      { output: shortcut },
    );
    check(
      "replay-deterministic",
      JSON.stringify(replay) ===
        JSON.stringify(buildProgressReplay(route, roads, "noisy-route")) &&
        departure.alternate_road !== null,
      "Identical route and authored settings reproduce the same trace on actual context geometry.",
      "같은 경로·설정에서 실제 주변 지형 합성 자료 재현.",
      { noisy: replay, departure },
    );
  }
  finish(): SimulationAssertion[] {
    requireProgressCases(this.assertions);
    writeFileSync(
      join(this.output, "progress/assertions.json"),
      JSON.stringify(this.assertions, null, 2) + "\n",
      { flag: "wx" },
    );
    return this.assertions;
  }
}
