import {
  RouteProgress,
  sameRouteBinding,
  routeBinding,
  type ProgressState,
} from "../../tools/route_progress.js";
import {
  buildProgressReplay,
  type AuthoredReplay,
  type ReplayScenario,
} from "../../tools/progress_replay.js";
import type { GatewaySuccess } from "../../tools/gateway_public_types.js";
const words = {
  en: {
    heading: "Synthetic GPS route replay",
    scope:
      "Authored positions on this route. No device GPS or location upload. Replay clock is separate from traffic time.",
    scenario: "Replay scenario",
    noisy: "Position noise",
    departure: "Departure and rejoin",
    play: "Play at 4×",
    pause: "Pause",
    step: "Next sample",
    reset: "Reset",
    waiting: "Calculate a route, then replay its positions.",
    paused: "Paused",
    playing: "Playing at 4×",
    finished: "Replay finished",
    accuracy: "Reported accuracy",
    time: "Replay time",
    remaining: "Remaining route",
    next: "Next instruction",
    until: "Distance to next instruction",
    unknown:
      "Position is not confirmed; current instruction and distance are withheld.",
    error: "This replay cannot be prepared for the selected route.",
    details: "Replay evidence",
    WAITING: "Waiting for a position",
    ON_ROUTE: "Position confirmed on this route",
    UNCERTAIN: "Position uncertain",
    OFF_ROUTE_PENDING: "Possible departure; awaiting more positions",
    OFF_ROUTE: "Departure confirmed; automatic rerouting is not available",
    ARRIVED: "Replay route endpoint reached",
    STALE: "Position expired",
    INVALIDATED: "Route changed; replay stopped",
  },
  ko: {
    heading: "합성 GPS 경로 재생",
    scope:
      "이 경로 위 자체 합성 위치입니다. 단말 GPS·위치 업로드를 사용하지 않으며 재생 시계와 교통 시계는 별개입니다.",
    scenario: "재생 시나리오",
    noisy: "위치 오차",
    departure: "경로 이탈·복귀",
    play: "4배속 재생",
    pause: "일시정지",
    step: "다음 표본",
    reset: "초기화",
    waiting: "경로를 계산한 뒤 위치를 재생하세요.",
    paused: "일시정지",
    playing: "4배속 재생 중",
    finished: "재생 완료",
    accuracy: "보고된 위치 오차",
    time: "재생 시각",
    remaining: "남은 경로",
    next: "다음 안내",
    until: "다음 안내까지 거리",
    unknown: "위치를 확정할 수 없어 현재 안내·거리를 보류합니다.",
    error: "선택한 경로의 재생을 준비할 수 없습니다.",
    details: "재생 근거",
    WAITING: "위치 표본 대기",
    ON_ROUTE: "이 경로 위 위치 확인",
    UNCERTAIN: "위치 불확실",
    OFF_ROUTE_PENDING: "이탈 가능성·추가 위치 확인 중",
    OFF_ROUTE: "경로 이탈 확인·자동 재탐색은 아직 제공하지 않습니다",
    ARRIVED: "재생 경로 끝점 도착",
    STALE: "위치 표본 만료",
    INVALIDATED: "경로 변경·재생 중단",
  },
} as const;
const el = (id: string) => document.getElementById(id)!;
export class ReplayController {
  private route: GatewaySuccess | null = null;
  private roads: number[][][] = [];
  private language: "en" | "ko" = "en";
  private tracker: RouteProgress | null = null;
  private replay: AuthoredReplay | null = null;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private error = false;
  private invalidated = false;
  constructor(private readonly changed: (state: ProgressState | null) => void) {
    el("replay-play").addEventListener("click", () =>
      this.timer ? this.pause() : this.play(),
    );
    el("replay-step").addEventListener("click", () => {
      this.pause();
      this.step();
    });
    el("replay-reset").addEventListener("click", () => this.reset());
    el("replay-scenario").addEventListener("change", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
    });
  }
  sync(
    route: GatewaySuccess | null,
    roads: number[][][],
    language: "en" | "ko",
  ): void {
    this.language = language;
    if (
      !route ||
      (this.route &&
        !sameRouteBinding(routeBinding(this.route), routeBinding(route)))
    ) {
      this.pause();
      this.tracker?.invalidate();
      this.tracker = null;
      this.replay = null;
      this.index = 0;
      this.invalidated = !!this.route;
      this.changed(null);
    }
    if (route && !this.route) this.invalidated = false;
    this.route = route;
    this.roads = roads;
    this.render();
  }
  snapshot() {
    return {
      source_class: "SYNTHETIC",
      playing: !!this.timer,
      cursor: this.index,
      sample_count: this.replay?.samples.length ?? 0,
      scenario: (el("replay-scenario") as HTMLSelectElement).value,
      replay: this.replay,
      state: this.tracker?.snapshot() ?? null,
    };
  }
  private prepare(): boolean {
    if (!this.route) return false;
    if (this.tracker && this.replay) return true;
    try {
      this.tracker = new RouteProgress(this.route, this.roads);
      this.replay = buildProgressReplay(
        this.route,
        this.roads,
        (el("replay-scenario") as HTMLSelectElement).value as ReplayScenario,
      );
      this.error = false;
      this.invalidated = false;
      return true;
    } catch {
      this.error = true;
      this.tracker = null;
      this.replay = null;
      this.render();
      return false;
    }
  }
  private step(): void {
    if (!this.prepare() || !this.route || !this.replay || !this.tracker) return;
    if (!sameRouteBinding(this.replay.binding, routeBinding(this.route))) {
      this.pause();
      return;
    }
    const sample = this.replay.samples[this.index];
    if (!sample) {
      this.pause();
      return;
    }
    const result = this.tracker.observe(sample.fix, sample.fix.event_time_ms);
    this.index++;
    this.changed(result.state);
    if (this.index === this.replay.samples.length) this.pause();
    this.render();
  }
  private play(): void {
    if (!this.prepare()) return;
    if (this.index >= this.replay!.samples.length) this.reset();
    this.timer = setInterval(() => this.step(), 250);
    this.render();
  }
  private pause(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.render();
  }
  private reset(): void {
    this.pause();
    this.tracker = null;
    this.replay = null;
    this.index = 0;
    this.error = false;
    this.invalidated = false;
    this.changed(null);
    this.render();
  }
  private render(): void {
    const w = words[this.language],
      s = this.tracker?.snapshot();
    for (const [id, text] of Object.entries({
      "progress-heading": w.heading,
      "progress-scope": w.scope,
      "replay-scenario-label": w.scenario,
      "replay-noisy": w.noisy,
      "replay-departure": w.departure,
      "replay-step": w.step,
      "replay-reset": w.reset,
      "replay-evidence-label": w.details,
    }))
      el(id).textContent = text;
    el("replay-play").textContent = this.timer ? w.pause : w.play;
    for (const id of [
      "replay-play",
      "replay-step",
      "replay-reset",
      "replay-scenario",
    ])
      (el(id) as HTMLButtonElement).disabled = !this.route;
    const root = el("progress");
    root.dataset.state =
      s?.status ?? (this.invalidated ? "INVALIDATED" : "WAITING");
    root.dataset.playing = String(!!this.timer);
    root.dataset.cursor = String(this.index);
    el("progress-status").textContent = this.error
      ? w.error
      : s
        ? w[s.status]
        : this.invalidated
          ? w.INVALIDATED
          : w.waiting;
    el("replay-clock").textContent =
      (this.timer
        ? w.playing
        : this.replay && this.index >= this.replay.samples.length
          ? w.finished
          : w.paused) +
      (s
        ? " · " +
          w.time +
          ": " +
          ((s.event_time_ms ?? 0) / 1000).toFixed(1) +
          " s · " +
          w.accuracy +
          ": " +
          s.accuracy_m +
          " m"
        : "");
    const metrics = el("progress-metrics");
    metrics.replaceChildren();
    const add = (text: string, id: string) => {
      const p = document.createElement("p");
      p.id = id;
      p.textContent = text;
      metrics.append(p);
    };
    if (s?.remaining_m !== null && s?.remaining_m !== undefined) {
      add(
        w.remaining + ": " + Math.round(s.remaining_m) + " m",
        "remaining-distance",
      );
      if (s.next_maneuver) {
        add(w.next + ": " + s.next_maneuver.instruction, "next-maneuver");
        add(
          w.until + ": " + Math.round(s.next_maneuver.distance_m) + " m",
          "next-distance",
        );
      }
    } else if (s) add(w.unknown, "progress-withheld");
    el("progress-evidence").textContent = JSON.stringify(
      this.snapshot(),
      null,
      2,
    );
  }
}
