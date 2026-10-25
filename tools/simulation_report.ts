import type { CloudflareReport } from "./cloudflare_checks.js";
import type { ClientReport } from "./client_checks.js";
import type { ScenarioReport } from "./scenario_checks.js";
import type { GatewayReport } from "./gateway_checks.js";
import type { NodeReport } from "./node_checks.js";
import type { TrafficReport } from "./traffic_checks.js";
import type { AggregationDraft } from "./aggregation_types.js";
/** Offline evidence viewer. Input provenance is rendered verbatim, never refreshed. */
export interface SimulationReportData {
  schema_version: "0.1";
  source: { commit: string; dirty: boolean };
  graph_id: string;
  generated_at_utc: string;
  implementation_sha256: string;
  summary: {
    status: string;
    assertions_passed: number;
    assertions_total: number;
    vehicle_count: number;
    observation_count: number;
    omission_count: number;
    duration_ms: number;
  };
  stages: {
    id: string;
    name_en: string;
    name_ko: string;
    status: string;
    evidence_path: string;
    duration_ms: number;
  }[];
  roads: {
    label: string;
    edge_id: string;
    forward: boolean;
    car_access: boolean;
    coordinates: number[][];
  }[];
  vehicles: {
    vehicle_id: string;
    truth: {
      offset_ms: number;
      longitude: number;
      latitude: number;
      edge_id: string;
    }[];
    observations: {
      offset_ms: number;
      longitude: number;
      latitude: number;
      accuracy_m: number;
    }[];
    omissions: { offset_ms: number; reason: string }[];
    traversals: {
      label: string;
      edge_id: string;
      forward: boolean;
      entered_at_ms: number;
      exited_at_ms: number;
      distance_m: number;
    }[];
  }[];
  assertions: {
    assertion_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    expected: unknown;
    actual: unknown;
    evidence_path: string;
  }[];
  matching?: {
    policy_id: string;
    input_samples: number;
    matched_samples: number;
    excluded_samples: number;
    accepted_traversals: number;
    excluded_traversals: number;
    points: {
      sample_id: string;
      vehicle_id: string;
      offset_ms: number;
      longitude: number;
      latitude: number;
      edge_id: string | null;
      status: "MATCHED" | "EXCLUDED";
      reason_codes: string[];
    }[];
    traversals: {
      traversal_id: string;
      vehicle_id: string;
      edge_id: string;
      label: string;
      status: "ACCEPTED" | "EXCLUDED";
      entered_at_ms: number | null;
      exited_at_ms: number | null;
      reason_codes: string[];
    }[];
    cases: {
      case_id: string;
      name_en: string;
      name_ko: string;
      status: string;
      input_samples: number;
      matched_samples: number;
      excluded_samples: number;
      accepted_traversals: number;
      excluded_traversals: number;
    }[];
  };
  aggregation?: {
    policy_id: string;
    target: { edge_id: string; forward: boolean; distance_m: number };
    window_start: string;
    deadline: string;
    valid_until: string;
    cases: {
      case_id: string;
      name_en: string;
      name_ko: string;
      draft: AggregationDraft;
      canonical_sha256: string;
      evidence_path: string;
    }[];
    population: {
      duration_ms: number;
      vehicles: SimulationReportData["vehicles"];
      matching: NonNullable<SimulationReportData["matching"]>;
      case_vehicle_ids?: Record<string, string[]>;
      case_matching?: Record<
        string,
        NonNullable<SimulationReportData["matching"]>
      >;
    };
    assertions_passed: number;
    assertions_total: number;
    cleanup_verified: boolean;
  };
  nodes?: NodeReport;
  gateway?: GatewayReport;
  client?: ClientReport;
  navigation?: SimulationReportData["assertions"];
  scenarios?: ScenarioReport;
  cloudflare?: CloudflareReport;
  traffic?: TrafficReport;
  publication?: {
    publisher_id: string;
    simulation_namespace: string;
    high_water: number;
    active_snapshot_id: string | null;
    assertions_passed: number;
    assertions_total: number;
    cleanup_verified: boolean;
    versions: {
      sequence: number;
      kid: string;
      snapshot_id: string;
      target_status: string;
      valid_until: string;
      artifact_path: string;
      jws_path: string;
    }[];
    cases: {
      case_id: string;
      status: string;
      message_en: string;
      message_ko: string;
      evidence_path: string;
    }[];
    evidence: { name_en: string; name_ko: string; path: string }[];
  };
  ingestion?: {
    scenario_count: number;
    assertions_passed: number;
    assertions_total: number;
    submitted_batches: number;
    duplicate_responses: number;
    stored_traversals: number;
    reference_traversals: number;
    recovered_workers: number;
    cleanup_verified: boolean;
    events: { phase: string; code: string; elapsed_ms: number }[];
    cases: {
      case_id: string;
      status: string;
      message_en: string;
      message_ko: string;
      evidence_path: string;
    }[];
    evidence: { name_en: string; name_ko: string; path: string }[];
  };
  region?: {
    profile_id: string;
    name_en: string;
    name_ko: string;
    source_date: string;
    source_url: string;
    bounds: [number, number, number, number];
    attribution: string;
    license_url: string;
    graph_counts: Record<string, unknown>;
    display_road_count: number;
  };
  context_roads?: { name: string; coordinates: number[][] }[];
  routes?: {
    route_id: string;
    name_en: string;
    name_ko: string;
    edge_ids: string[];
    bounds: [number, number, number, number];
    vehicle_ids: string[];
  }[];
  limitations: { message_en: string; message_ko: string }[];
}
export function renderSimulationReport(data: SimulationReportData): string {
  if (
    !data ||
    data.schema_version !== "0.1" ||
    !data.source?.commit ||
    !data.graph_id ||
    !data.summary ||
    !Number.isFinite(data.summary.duration_ms) ||
    data.summary.duration_ms <= 0 ||
    !data.roads?.length ||
    !data.vehicles?.length ||
    !Array.isArray(data.stages) ||
    !Array.isArray(data.assertions) ||
    !Array.isArray(data.limitations)
  )
    throw new Error("Missing report data / 보고 화면 자료가 누락되었습니다");
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html>
<html lang="en" class="${data.region ? "regional" : "tiny"}">
  <meta charset="utf-8" /><meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  /><title>RouteLens · Simulation evidence / 시뮬레이션 증거</title
  ><style>
    :root {
      color-scheme: light;
      --paper: #f5f8fc;
      --ink: #172d46;
      --road: #9baec2;
      --truth: #1264b8;
      --observed: #d96b28;
      --success: #23775d;
    }
    .regional main {
      padding-top: 18px;
    }
    .regional h1 {
      font-size: 30px;
    }
    .regional .workspace {
      margin-top: 16px;
    }
    .regional .notice {
      font-size: 12px;
    }
    .regional .legend {
      font-size: 12px;
      padding: 6px 18px;
      gap: 10px;
    }
    .regional .controls {
      padding: 10px;
      gap: 8px;
      font-size: 13px;
    }
    .regional svg {
      height: clamp(240px, calc(100vh - 460px), 400px);
    }
    .regional #matching-ribbon {
      line-height: 1.3;
    }
    .regional #regional-note p {
      margin: 2px 0;
    }
    #aggregation-note {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 12px;
      font-size: 12px;
    }
    #aggregation-note p {
      width: 100%;
      margin: 0;
      overflow-wrap: anywhere;
    }
    #aggregation-note select {
      max-width: 220px;
      min-height: 32px;
      padding: 4px;
    }
    .regional:has(#aggregation-note:not([hidden])) svg {
      height: clamp(190px, calc(100vh - 540px), 360px);
    }
    [hidden] {
      display: none !important;
    }
    #matching-decisions, #aggregate-evidence, #publication-evidence, #cloudflare-parity, #cloudflare-cases {
      overflow-wrap: anywhere;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font:
        15px/1.5 system-ui,
        sans-serif;
    }
    main {
      max-width: 1500px;
      margin: auto;
      padding: 32px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: start;
    }
    h1,
    h2 {
      font-family: "Avenir Next", "Trebuchet MS", sans-serif;
    }
    h1 {
      font-size: clamp(28px, 4vw, 46px);
      line-height: 1.15;
      margin: 4px 0 12px;
    }
    h2 {
      font-size: 21px;
      margin: 0 0 16px;
    }
    p {
      margin: 8px 0;
    }
    .eyebrow,
    code,
    output {
      font-family: ui-monospace, monospace;
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.12em;
    }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(250px, 1fr);
      gap: 28px;
      margin-top: 28px;
    }
    .map {
      background: white;
      border: 1px solid #d7e0e9;
      border-radius: 14px;
      overflow: hidden;
    }
    svg {
      width: 100%;
      height: clamp(240px, calc(100vh - 430px), 480px);
      display: block;
    }
    svg text {
      font: 14px system-ui;
      fill: var(--ink);
    }
    .controls {
      padding: 18px;
      border-top: 1px solid #d7e0e9;
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    button,
    select {
      font: inherit;
      color: inherit;
      background: white;
      border: 1px solid var(--road);
      border-radius: 6px;
      padding: 8px 12px;
      min-height: 42px;
    }
    button {
      cursor: pointer;
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    a:focus-visible {
      outline: 3px solid var(--truth);
      outline-offset: 3px;
    }
    input[type="range"] {
      flex: 1;
      min-width: 130px;
      accent-color: var(--truth);
    }
    label {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    #nodes-section > label,
    #gateway-section > label {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      width: 100%;
      max-width: 640px;
      min-width: 0;
    }
    #nodes-section > label > select,
    #gateway-section > label > select {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    a {
      color: var(--truth);
      overflow-wrap: anywhere;
    }
    .ledger {
      border-top: 3px solid var(--ink);
      padding-top: 18px;
    }
    .stage {
      padding: 13px 0;
      border-bottom: 1px solid #d7e0e9;
    }
    .status {
      color: var(--success);
      font-weight: 700;
    }
    .legend {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      padding: 14px 18px;
    }
    .truth {
      color: var(--truth);
    }
    .observed {
      color: var(--observed);
    }
    .provenance {
      font-size: 12px;
      overflow-wrap: anywhere;
      margin-top: 24px;
    }
    .checks {
      margin-top: 32px;
    }
    details {
      border-top: 1px solid var(--road);
      padding: 14px 0;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
    }
    .notice {
      max-width: 80ch;
    }
    .timeline {
      display: block;
      width: 100%;
      font-size: 13px;
      padding: 0 18px 12px;
    }
    @media (max-width: 760px) {
      main {
        padding: 20px 14px;
      }
      .workspace {
        grid-template-columns: 1fr;
        gap: 24px;
      }
      header {
        flex-wrap: wrap;
      }
      .controls {
        gap: 10px;
      }
      svg,
      .regional svg,
      .regional:has(#aggregation-note:not([hidden])) svg {
        height: 340px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        scroll-behavior: auto;
      }
    }
  </style>
  <main>
    <header>
      <div>
        <div class="eyebrow">ROUTELENS / ${data.region ? "SEOUL" : data.matching ? "P03 + P04" : "P03"}</div>
        <h1 data-en="${data.region ? "Seoul road simulation" : "Vehicle &amp; GPS simulation"}" data-ko="${data.region ? "서울 도로 시뮬레이션" : "차량·GPS 시뮬레이션"}"></h1>
        <p class="notice" data-en="${data.region ? "Actual Seoul roads with SYNTHETIC vehicles and GPS. Same-engine round-trip evidence, not real driver traces, independent accuracy or live traffic." : "Synthetic trajectories and GPS observations on an authored fictional road network. Test evidence, not live traffic or a navigation client."}" data-ko="${data.region ? "실제 서울 도로의 합성 차량·GPS입니다. 같은 엔진 왕복 검사이며 실주행 기록·독립 정확도·실시간 교통이 아닙니다." : "직접 만든 가상 도로망의 합성 이동 경로와 GPS 관측입니다. 실시간 교통정보나 내비게이션 화면이 아닌 검사 증거입니다."}"></p>
      </div>
      <button id="language" aria-label="Switch language / 언어 변경">
        한국어
      </button>
    </header>
    <div class="workspace">
      <section>
        <div class="map">
          <svg
            id="map"
            viewBox="0 0 900 560"
            role="img"
            aria-label="${data.region ? "Seoul road replay / 서울 도로 재생" : "Fictional road replay / 가상 도로 재생"}"
          ></svg>
          <div id="aggregation-note" hidden>
            <label
              ><span data-en="Replay dataset" data-ko="재생자료"></span
              ><select id="dataset">
                <option
                  value="original"
                  data-en="Original nine vehicles"
                  data-ko="기존9대"
                ></option>
                <option
                  value="aggregation"
                  data-en="P06 short-trip population"
                  data-ko="P06짧은여행 차량군"
                ></option></select></label
            ><label
              ><span
                data-en="Recorded unsigned case"
                data-ko="기록된 서명전 사례"
              ></span
              ><select id="aggregate-case"></select
            ></label>
            <p id="aggregate-state"></p>
          </div>
          <div
            id="regional-note"
            hidden
            style="padding: 8px 18px; font-size: 12px"
          ></div>
          <div
            id="matching-ribbon"
            hidden
            style="padding: 6px 18px; font-size: 12px"
          ></div>
          <div class="legend">
            <span
              class="truth"
              data-en="● Ground truth"
              data-ko="● 정답 위치"
            ></span
            ><span
              class="observed"
              data-en="× GPS observation"
              data-ko="× GPS 관측"
            ></span
            ><span
              data-en="○ Scheduled omission"
              data-ko="○ 예정된 누락"
            ></span>
            <label id="matching-toggle" hidden style="color: #7945b2"
              ><input id="matched" type="checkbox" checked /><span
                data-en="◇ Matching results"
                data-ko="◇ 도로 매칭 결과"
              ></span
            ></label>
          </div>
          <output id="omissions" class="timeline" aria-live="off"></output>
          <div class="controls">
            <button id="play"></button
            ><label
              ><span data-en="Time" data-ko="시간"></span
              ><input
                id="time"
                type="range"
                min="0"
                step="100"
                value="0" /></label
            ><output id="clock"></output
            ><label
              ><span data-en="Speed" data-ko="배속"></span
              ><select id="speed">
                <option>1</option>
                <option>2</option>
                <option selected>5</option>
                <option>10</option>
              </select></label
            ><label
              ><span data-en="Vehicle" data-ko="차량"></span
              ><select id="vehicle"></select></label
            ><label id="route-control" hidden
              ><span data-en="Route" data-ko="경로"></span
              ><select id="route"></select></label
            ><label
              ><input id="all-roads" type="checkbox" /><span
                data-en="${data.region ? "All context roads" : "All fixture roads"}"
                data-ko="${data.region ? "전체 배경도로" : "전체 시험도로"}"
              ></span></label
            ><label
              ><input id="truth" type="checkbox" checked /><span
                data-en="Truth"
                data-ko="정답"
              ></span></label
            ><label
              ><input id="observed" type="checkbox" checked /><span
                data-en="Observed"
                data-ko="관측"
              ></span
            ></label>
          </div>
        </div>
      </section>
      <aside class="ledger">
        <h2 data-en="Execution evidence" data-ko="실행 증거"></h2>
        <p id="result"></p>
        <div id="stages"></div>
        <div class="provenance" id="provenance"></div>
      </aside>
    </div>
    <section id="aggregation-section" class="checks" hidden>
      <h2
        data-en="P06 unsigned synthetic aggregation"
        data-ko="P06 서명전 합성집계"
      ></h2>
      <p
        data-en="The original nine vehicles are a separate regression replay. P06 uses its own short trips. Recorded candidates do not change with replay time. The moving PARKED sixth tests explicit collection state, not automatic parking detection. LIVE is a synthetic candidate state. These P06 candidates are unsigned; downstream P07 evidence is shown separately. P06 candidates are not activated by this replay; accepted P08 routing evidence is shown separately."
        data-ko="기존9대는 별도회귀 재생이며 P06은 자체짧은여행을 사용합니다. 기록된 후보는 재생시각으로 바뀌지 않습니다. 이동하는 PARKED6번째는 명시수집상태 검사이며 자동주차탐지가 아닙니다. LIVE는 합성후보 상태입니다. P06 후보는 서명 전이며 후속 P07 증거는 따로 표시합니다. 이 재생은 P06 후보를 경로에 적용하지 않으며, 수용한 P08 경로 반영 근거는 별도로 표시합니다."
      ></p>
      <div id="aggregate-evidence"></div>
    </section>
    <section id="navigation-section" class="checks" hidden>
      <h2 data-en="Turn guidance acceptance" data-ko="회전 안내 검증"></h2><div id="navigation-cases"></div>
    </section>
    <section id="cloudflare-section" class="checks" hidden>
      <h2 data-en="P13 recorded local Cloudflare parity" data-ko="P13 기록된 로컬 Cloudflare 비교"></h2>
      <p data-en="Actual local Worker, Queue and SQLite Durable Objects replay matched synthetic inputs from this same run's PostgreSQL originals. This section shows completed evidence, not a hosted Cloudflare deployment. Public GPS ingestion, cloud placement and hosted consumer concurrency remain separate." data-ko="실제 로컬 Worker·큐·SQLite Durable Object가 같은 실행의 PostgreSQL 원문에서 합성 매칭 입력을 재생했습니다. 완료된 근거이며 Cloudflare 원격 배포 화면이 아닙니다. 공개 GPS 수집·지역 배치·원격 소비자 동시성은 별도입니다."></p>
      <div id="cloudflare-evidence"></div><div id="cloudflare-parity"></div><details><summary data-en="32 parity and recovery checks" data-ko="비교·복구 검사32개"></summary><div id="cloudflare-cases"></div></details>
    </section>
    <section id="scenario-section" class="checks" hidden>
      <h2 data-en="P12 whole-system faults and S01–S15 evidence" data-ko="P12 전체 장애·S01~S15 근거"></h2>
      <p data-en="Actual Seoul routing with opt-in bounded road search, trusted vehicle and node rules, controlled TCP reset/stall, exact partition expiry and two real outer-supervisor interruptions. The matrix binds this run's original evidence. Tiny waiting/parallel-road regressions are labeled separately. This is local synthetic evidence, not Internet loss measurement or independent road accuracy." data-ko="실제 서울 경로·선택형 제한 도로 탐색·신뢰 차량/노드 규칙·통제한 TCP 중단/무응답·연결 중단 중 정확한 만료·실제 상위 감독 두 장애를 검사합니다. 행렬은 이번 실행의 원문을 연결하고 작은 대기/평행도로 회귀는 따로 표시합니다. 로컬 합성 근거이며 인터넷 손실률·독립 도로 정확도 검증이 아닙니다."></p>
      <div id="scenario-evidence"></div><div id="scenario-screenshots"></div><div id="scenario-cases"></div>
    </section>
    <section id="client-section" class="checks" hidden>
      <h2 data-en="P11 recorded actual browser route client" data-ko="P11 기록된 실제 브라우저 경로 화면"></h2>
      <p data-en="Recorded automated browser requests use a fresh 15-trip source on actual Seoul roads, the independent gateway and two native nodes. These screenshots and states replay completed evidence. Start pilot:serve separately for the interactive client. Simulation time authorizes freshness; browser wall time does not. Explicit transport test proxies are not successful native-route proof. This is not production authentication, real-time traffic or independently verified driving accuracy." data-ko="실제 서울 도로의 새 합성15여행·독립 중계·두 지속노드로 자동 브라우저 요청을 기록했습니다. 화면과 상태는 완료된 근거 재생이며 실제 조작 화면은 pilot:serve로 별도 실행합니다. 신선도는 모의 시각으로 확인하고 브라우저 실제 시각을 쓰지 않습니다. 명시 전송 시험대리서버를 지속엔진 성공 근거로 세지 않습니다. 운영 인증·실시간 교통·독립 검증한 주행 정확도 근거가 아닙니다."></p>
      <div id="client-evidence"></div><div id="client-screenshots"></div>
      <details><summary data-en="Browser state, requests and 32 checks" data-ko="브라우저 상태·요청·32개 검사"></summary><div id="client-events"></div><div id="client-cases"></div></details>
    </section>
    <section id="gateway-section" class="checks" hidden>
      <h2 data-en="P10 recorded version-aware route gateway" data-ko="P10 기록된 버전확인 경로 중계"></h2>
      <p data-en="Evidence playback from 15 fresh synthetic trips on three actual Seoul Teheran-ro edges. A separate durable gateway consumer selects the accepted version and routes through two approved persistent native nodes. Public route coverage is calculated for the returned route; an accepted LIVE snapshot can still produce BASE_ONLY when the route avoids all live edges. Test-proxy faults are explicitly separate from successful native routes. This is not a complete navigation client, production authentication, hostile-node integrity or real-driving accuracy proof." data-ko="실제 서울 테헤란로3개구간의 새 합성15여행 증거 재생입니다. 별도 영속 중계 수신자가 수용 버전을 정하고 승인한 두 지속엔진 노드에 경로를 요청합니다. 공개 적용률은 반환 경로 기준이며 LIVE자료를 수용해도 모든 대상구간을 우회하면 BASE_ONLY입니다. 시험대리서버 장애와 실제 지속엔진 성공 경로는 구분합니다. 완성 내비게이션·운영 인증·악성 노드 무결성·실주행 정확도 근거가 아닙니다."></p>
      <label><span data-en="Recorded public gateway route" data-ko="기록된 공개 중계 경로"></span><select id="gateway-route"></select></label>
      <div id="gateway-route-map"></div><div id="gateway-route-detail"></div>
      <div id="gateway-evidence"></div>
      <details><summary data-en="Gateway checks, attempts and private native originals" data-ko="중계검사·시도·별도지속엔진원문"></summary><div id="gateway-cases"></div></details>
    </section>
    <section id="nodes-section" class="checks" hidden>
      <h2 data-en="P09 recorded two-node native routing" data-ko="P09 기록된 두 노드 지속 엔진 경로"></h2>
      <p data-en="Recorded evidence from 15 fresh synthetic Teheran-ro trips on actual Seoul roads. Each node has an independent consumer and persistent native daemon. Replay shows observed ACTIVE/DRAINING slots, pinned requests, rejected obsolete results and exact expiry. An owned HTTP 502 proxy models publisher transport failure; it is not packet loss. Local adapter proof does not establish production availability or real-driving accuracy." data-ko="실제 서울 도로의 새 합성 테헤란로 여행 15개로 기록한 근거입니다. 각 노드는 독립 수신자·지속 실행 엔진을 가집니다. 관측한 활성/마무리 세대·고정 요청·낡은 결과 거부·정확한 만료를 재생합니다. 소유 HTTP 502 대리 접속으로 게시 전송 장애를 만들며 패킷 손실 검사가 아닙니다. 로컬 연결기 근거이며 운영 가용성·실주행 정확도를 입증하지 않습니다."></p>
      <label><span data-en="Recorded transition" data-ko="기록된 전환"></span><select id="node-event"></select></label>
      <button id="node-replay" type="button" data-en="Replay recorded transitions" data-ko="기록된 전환 재생"></button>
      <div id="node-status-replay" aria-live="polite"></div>
      <label><span data-en="Original node route" data-ko="노드 원본 경로"></span><select id="node-route"></select></label>
      <div id="node-route-map"></div><div id="node-route-detail"></div>
      <div id="node-evidence"></div>
      <details><summary data-en="Native node checks and original evidence" data-ko="지속 노드 검사·원문 근거"></summary><div id="node-cases"></div></details>
    </section>
    <section id="traffic-section" class="checks" hidden>
      <h2 data-en="P08 recorded traffic routing and expiry" data-ko="P08 기록된 교통 경로·만료"></h2>
      <p data-en="Evidence playback of 15 authored synthetic trips on three target edges of the actual Teheran-ro road network in Seoul. Baseline, accepted live traffic and exact event-clock expiry use the same two-point request. The engine uses its own current wall clock for native speed blending. This is not a complete navigation client, real driving accuracy or live traffic." data-ko="실제 서울 테헤란로 도로망의 대상 3개 구간에 직접 만든 합성 여행 15개를 적용한 증거 재생입니다. 기본·수용 실시간·관측시계의 정확한 만료에 같은 두 좌표 요청을 씁니다. 엔진의 속도 혼합에는 엔진의 현재 현실시각을 사용합니다. 완성 내비게이션·실주행 정확도·실시간 교통 증거가 아닙니다."></p>
      <div id="traffic-route-map" aria-label="Recorded route comparison / 기록 경로 비교"></div>
      <div id="traffic-route-comparison"></div>
      <div id="traffic-evidence"></div>
      <details><summary data-en="Traffic file, concurrency, failure and expiry checks" data-ko="교통파일·경쟁·장애·만료 검사"></summary><div id="traffic-cases"></div></details>
    </section>
    <section id="publication-section" class="checks" hidden>
      <h2 data-en="P07 signed publication and durable acceptance" data-ko="P07 서명 게시·영속 수용"></h2>
      <p data-en="Recorded actual publication, verification, acceptance, rejection and expiry. These signed synthetic snapshots are separate from the original nine-vehicle and P06 evidence replays. P08 routing evidence is recorded separately. Revocation invalidates future pulls; offline downloaded bytes remain valid until TTL or a received correction or key revocation." data-ko="기록된 실제 게시·검증·수용·거부·만료입니다. 서명된 합성 스냅샷과 기존9대·P06 증거재생을 구분합니다. P08 경로 반영 근거는 별도로 기록합니다. 철회는 이후 조회를 무효화하며 이미 받은 오프라인 바이트는 기한·받은 정정본·키철회까지 유효할 수 있습니다."></p>
      <div id="publication-evidence"></div>
      <details><summary data-en="Publication and consumer checks" data-ko="게시·수신 검사"></summary><div id="publication-cases"></div></details>
    </section>
    <section id="ingestion-section" class="checks" hidden>
      <h2
        data-en="Durable receipt, interruption and recovery"
        data-ko="영속 접수·중단·복구"
      ></h2>
      <p
        data-en="Actual local HTTP, PostgreSQL and separate workers. Receipt follows commit; matching completion is a later state. Logical primary-store deletion excludes WAL and backups."
        data-ko="실제 로컬 HTTP·PostgreSQL·별도 처리자입니다. 접수는 커밋 후이며 매칭 완료는 이후 상태입니다. 주저장소 논리삭제이며 WAL·백업 삭제를 뜻하지 않습니다."
      ></p>
      <p id="ingestion-counts"></p>
      <div id="ingestion-evidence"></div>
      <details>
        <summary
          data-en="Database acceptance, recovery and deletion checks"
          data-ko="DB 접수·복구·삭제 검사"
        ></summary>
        <div id="ingestion-cases"></div>
      </details>
      <details>
        <summary
          data-en="Actual process and HTTP event timeline"
          data-ko="실제 프로세스·HTTP 이벤트 순서"
        ></summary>
        <div id="ingestion-events"></div>
      </details>
    </section>
    <section id="matching-section" class="checks" hidden>
      <h2
        data-en="Map matching and complete traversals"
        data-ko="도로 매칭과 완전 통과"
      ></h2>
      <p
        data-en="Matching a GPS point does not prove a complete edge traversal. Counts below cover the full run; map points follow replay time. Purple filled diamonds are matched points; hollow diamonds are excluded observations."
        data-ko="GPS 표본의 도로 매칭은 구간 완전 통과를 뜻하지 않습니다. 아래 수치는 전체 실행이며 지도 표본은 재생 시각을 따릅니다. 보라색 채운 마름모는 매칭점, 빈 마름모는 제외된 관측입니다."
      ></p>
      <p id="matching-counts"></p>
      <details>
        <summary
          data-en="Traversal decisions and point exclusions"
          data-ko="통과 판정과 표본 제외"
        ></summary>
        <div id="matching-decisions"></div>
      </details>
      <h2 data-en="Additional case coverage" data-ko="추가 시험 사례 범위"></h2>
      <div id="matching-cases"></div>
    </section>
    <section class="checks">
      <h2 data-en="Assertions and boundaries" data-ko="검사 결과와 한계"></h2>
      <div id="checks"></div>
      <ul id="limits"></ul>
    </section>
  </main>
  <script id="report-data" type="application/json">
    ${json}
  </script>
  <script>
    const data = JSON.parse(document.getElementById("report-data").textContent);
    let lang = "en",
      playing = false,
      time = 0,
      last = 0;
    const $ = (id) => document.getElementById(id),
      ns = "http://www.w3.org/2000/svg";
    function node(tag, text, parent) {
      const n = document.createElement(tag);
      if (text !== undefined) n.textContent = text;
      parent.append(n);
      return n;
    }
    function evidence(path, parent) {
      if (typeof path !== "string") return;
      const a = node("a", path, parent);
      if (
        !path.startsWith("/") &&
        !path.includes("\\\\") &&
        !path.split("/").includes("..") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(path)
      )
        a.href = path;
      else a.removeAttribute("href");
    }
    function replay() {
      if (data.aggregation && $("dataset").value === "aggregation") {
        const p = data.aggregation.population;
        const key = $("aggregate-case").value;
        const ids = p.case_vehicle_ids?.[key];
        return {
          ...p,
          vehicles: ids
            ? p.vehicles.filter((v) => ids.includes(v.vehicle_id))
            : p.vehicles,
          matching: p.case_matching?.[key] ?? p.matching,
        };
      }
      return data;
    }
    function replayRoutes() {
      return data.aggregation && $("dataset").value === "aggregation"
        ? [
            {
              route_id: "p06",
              name_en: "P06 short trips",
              name_ko: "P06짧은여행",
              vehicle_ids: replay().vehicles.map((v) => v.vehicle_id),
            },
          ]
        : data.routes;
    }
    function aggregateDisplay() {
      if (!data.aggregation) return;
      const a = data.aggregation;
      const selected =
        a.cases.find((c) => c.case_id === $("aggregate-case").value) ||
        a.cases[0];
      if (!selected) return;
      const active = $("dataset").value === "aggregation";
      $("aggregate-case").disabled = !active;
      const entry = selected.draft.entries.find(
        (e) =>
          e.edge_id === a.target.edge_id &&
          e.forward === a.target.forward &&
          e.source_class === "SYNTHETIC",
      );
      $("aggregate-state").textContent = active
        ? (lang === "en"
            ? "Recorded unsigned SYNTHETIC · "
            : "기록된 서명전 합성 · ") +
          (entry?.status ?? "UNKNOWN") +
          " · " +
          (lang === "en" ? "Speed: " : "속도: ") +
          (entry?.speed_mps === null ? "—" : entry?.speed_mps + " m/s") +
          " · " +
          (entry?.sample_bucket ?? "—") +
          " · " +
          (lang === "en" ? "Deadline / expiry: " : "마감 / 만료: ") +
          a.deadline.slice(11, 23) +
          " / " +
          a.valid_until.slice(11, 23)
        : lang === "en"
          ? "Original nine-vehicle replay. Select the separate P06 population to inspect aggregate cases."
          : "기존9대 재생입니다. 집계사례는 별도 P06차량군을 선택해 확인하세요.";
      $("aggregate-evidence").replaceChildren();
      node(
        "p",
        a.policy_id +
          " · " +
          (lang === "en" ? "Target directed edge: " : "대상 방향구간: ") +
          a.target.edge_id +
          " / " +
          a.target.forward +
          " · " +
          a.window_start,
        $("aggregate-evidence"),
      );
      a.cases.forEach((c) => {
        const p = node(
          "p",
          c["name_" + lang] + " · " + c.canonical_sha256 + " · ",
          $("aggregate-evidence"),
        );
        evidence(c.evidence_path, p);
      });
      [...$("aggregate-case").options].forEach((option) => {
        const c = a.cases.find((c) => c.case_id === option.value);
        if (c) option.textContent = c["name_" + lang];
      });
    }
    function resetReplay() {
      playing = false;
      last = 0;
      time = 0;
      $("time").max = String(replay().duration_ms ?? data.summary.duration_ms);
      $("vehicle").replaceChildren();
      node(
        "option",
        lang === "en" ? "All vehicles" : "전체 차량",
        $("vehicle"),
      ).value = "*";
      replay().vehicles.forEach(
        (v) =>
          (node("option", v.vehicle_id, $("vehicle")).value = v.vehicle_id),
      );
      $("route").replaceChildren();
      node(
        "option",
        lang === "en" ? "All routes" : "전체 경로",
        $("route"),
      ).value = "*";
      replayRoutes()?.forEach(
        (r) =>
          (node("option", r["name_" + lang], $("route")).value = r.route_id),
      );
      translate();
    }
    const reasons = {
      AMBIGUOUS_PARALLEL: ["Ambiguous parallel roads", "평행도로 구분 불가"],
      AMBIGUOUS_PROJECTION: ["Ambiguous position on matched road geometry", "대응 도로 지형의 위치 구분 불가"],
      AMBIGUOUS_BOUNDARY: [
        "Uncertain timing while stopped at an edge boundary",
        "구간 경계 정지 시각 불명확",
      ],
      PARTIAL_ENTRY: ["Entry not fully observed", "진입 관측 부족"],
      PARTIAL_EXIT: ["Exit not fully observed", "진출 관측 부족"],
      OBSERVATION_GAP: ["Observation gap", "관측 누락 구간"],
      DISCONTINUITY: ["Discontinuous movement", "이동 연속성 단절"],
      UNMATCHED: ["No road match", "대응 도로 없음"],
      DISTANCE_EXCEEDED: ["Match distance exceeded", "대응 거리 초과"],
      INSUFFICIENT_POINTS: ["Insufficient observations", "관측 표본 부족"],
    };
    function reasonText(codes) {
      return codes
        .map(
          (code) =>
            code +
            " · " +
            (reasons[code]?.[lang === "en" ? 0 : 1] ||
              (lang === "en" ? "Unrecognized reason" : "미등록 사유")),
        )
        .join("; ");
    }
    function matchingSummary(m) {
      return lang === "en"
        ? m.matched_samples +
            "/" +
            m.input_samples +
            " points matched; " +
            m.excluded_samples +
            " points excluded · " +
            m.accepted_traversals +
            " complete traversals accepted; " +
            m.excluded_traversals +
            " traversal candidates excluded"
        : m.input_samples +
            "개 표본 중 " +
            m.matched_samples +
            "개 매칭·" +
            m.excluded_samples +
            "개 제외 · 완전 통과 " +
            m.accepted_traversals +
            "개 수용·통과 후보 " +
            m.excluded_traversals +
            "개 제외";
    }
    function matchingDetails() {
      const m = replay().matching;
      if (!m) return;
      $("matching-counts").textContent =
        m.policy_id + " · " + matchingSummary(m);
      $("matching-decisions").replaceChildren();
      m.traversals.forEach((t) => {
        const e = node(
          "p",
          t.vehicle_id +
            " · " +
            t.label +
            " · " +
            (t.status === "ACCEPTED"
              ? lang === "en"
                ? "Complete traversal accepted"
                : "완전 통과 수용"
              : lang === "en"
                ? "Traversal excluded"
                : "통과 제외") +
            " · " +
            reasonText(t.reason_codes),
          $("matching-decisions"),
        );
        node("code", t.traversal_id, e);
        node(
          "span",
          " · " +
            (t.entered_at_ms === null ? "?" : t.entered_at_ms + " ms") +
            " → " +
            (t.exited_at_ms === null ? "?" : t.exited_at_ms + " ms"),
          e,
        );
      });
      const excluded = m.points.filter((p) => p.status === "EXCLUDED");
      excluded.forEach((p) =>
        node(
          "p",
          p.sample_id + " · " + reasonText(p.reason_codes),
          $("matching-decisions"),
        ),
      );
      $("matching-cases").replaceChildren();
      m.cases.forEach((c) => {
        const e = node("div", undefined, $("matching-cases"));
        e.className = "stage";
        node("strong", c.status + " · " + c["name_" + lang], e);
        node("p", matchingSummary(c), e);
        node("code", c.case_id, e);
      });
    }
    function translate() {
      document.documentElement.lang = lang;
      document
        .querySelectorAll("[data-en]")
        .forEach((e) => (e.textContent = e.dataset[lang]));
      $("language").textContent = lang === "en" ? "한국어" : "English";
      $("play").textContent = playing
        ? lang === "en"
          ? "Pause"
          : "일시정지"
        : lang === "en"
          ? "Play"
          : "재생";
      $("result").textContent =
        data.summary.status +
        " · " +
        data.summary.assertions_passed +
        "/" +
        data.summary.assertions_total +
        (lang === "en" ? " assertions" : " 검사");
      $("stages").replaceChildren();
      data.stages.forEach((s) => {
        const e = node("div", undefined, $("stages"));
        e.className = "stage";
        node("strong", s["name_" + lang], e);
        node(
          "p",
          s.status + " · " + (s.duration_ms / 1000).toFixed(2) + " s",
          e,
        );
        evidence(s.evidence_path, e);
      });
      $("provenance").replaceChildren();
      node(
        "p",
        (lang === "en" ? "Source: " : "소스: ") +
          data.source.commit +
          (data.source.dirty ? " (dirty / 미커밋 변경)" : ""),
        $("provenance"),
      );
      node("p", "Graph: " + data.graph_id, $("provenance"));
      node("p", data.generated_at_utc, $("provenance"));
      node("p", "SHA-256: " + data.implementation_sha256, $("provenance"));
      if (data.region)
        node(
          "p",
          (lang === "en"
            ? "Extraction envelope (west, south, east, north): "
            : "추출 사각 범위(서·남·동·북): ") + data.region.bounds.join(", "),
          $("provenance"),
        );
      $("checks").replaceChildren();
      data.assertions.forEach((a) => {
        const e = node("details", undefined, $("checks"));
        node("summary", a.status + " · " + a["message_" + lang], e);
        node(
          "pre",
          JSON.stringify(
            {
              assertion_id: a.assertion_id,
              expected: a.expected,
              actual: a.actual,
            },
            null,
            2,
          ),
          e,
        );
        evidence(a.evidence_path, e);
      });
      $("limits").replaceChildren();
      data.limitations.forEach((l) =>
        node("li", l["message_" + lang], $("limits")),
      );
      const v = $("vehicle").options[0];
      if (v) v.textContent = lang === "en" ? "All vehicles" : "전체 차량";
      $("navigation-section").hidden=!data.navigation;
      if(data.navigation){const root=$("navigation-cases");root.replaceChildren();data.navigation.forEach(a=>{const row=node("p",a.status+" · "+a["message_"+lang]+" · ",root);evidence(a.evidence_path,row);});}
      $("cloudflare-section").hidden=!data.cloudflare;
      if(data.cloudflare){const c=data.cloudflare,root=$("cloudflare-evidence");root.replaceChildren();node("p",c.assertions_passed+"/"+c.assertions_total+(lang==="en"?" checks · owned cleanup ":"개 검사 · 소유 정리 ")+c.cleanup_verified,root);node("p",c["runtime_"+lang],root);const parity=$("cloudflare-parity");parity.replaceChildren();c.parity.forEach(p=>{const row=node("p",p.case_id+" · "+(p.canonical_sha256||"WINDOW_OPEN")+" · ",parity);evidence(p.evidence_path,row);});const cases=$("cloudflare-cases");cases.replaceChildren();c.cases.forEach(a=>{const row=node("p",a.status+" · "+a["message_"+lang]+" · ",cases);evidence(a.evidence_path,row);});}
      $("scenario-section").hidden=!data.scenarios;
      if(data.scenarios){
        const s=data.scenarios,root=$("scenario-evidence");root.replaceChildren();node("p",s.assertions_passed+"/"+s.assertions_total+(lang==="en"?" checks · owned cleanup ":"개 검사 · 소유 정리 ")+s.cleanup_verified,root);if(s.matrix_path)evidence(s.matrix_path,root);
        const cases=$("scenario-cases");cases.replaceChildren();s.cases.forEach(a=>{const row=node("p",a.status+" · "+a["message_"+lang]+" · ",cases);evidence(a.evidence_path,row);});
        const shots=$("scenario-screenshots");shots.replaceChildren();s.screenshots.forEach(s=>{const figure=node("figure","",shots);if(typeof s.path==="string"&&!s.path.split("/").includes("..")&&/^[a-zA-Z0-9_./-]+\.png$/.test(s.path)){const image=node("img","",figure);image.src=s.path;image.alt=s["label_"+lang];image.loading="lazy";image.style.maxWidth="100%";}node("figcaption",s["label_"+lang],figure);});
      }
      $("client-section").hidden=!data.client;
      if(data.client){
        const c=data.client,root=$("client-evidence");root.replaceChildren();node("p",c.assertions_passed+"/"+c.assertions_total+(lang==="en"?" checks · browser ":"개 검사 · 브라우저 ")+c.browser_version,root);
        c.evidence.forEach(e=>{const row=node("p",e["name_"+lang]+" · ",root);evidence(e.path,row);});
        const shots=$("client-screenshots");shots.replaceChildren();c.screenshots.forEach(s=>{const figure=node("figure","",shots);figure.style.margin="18px 0";const caption=s["label_"+lang];if(typeof s.path==="string"&&!s.path.split("/").includes("..")&&/^[a-zA-Z0-9_./-]+\.png$/.test(s.path)){const image=node("img","",figure);image.src=s.path;image.alt=caption;image.loading="lazy";image.style.maxWidth="100%";image.style.maxHeight="500px";image.style.objectFit="contain";}node("figcaption",caption,figure);});
        const history=$("client-events");history.replaceChildren();c.events.forEach(e=>{const row=node("p",e.state+" · "+e["message_"+lang]+" · ",history);evidence(e.evidence_path,row);});
        const cases=$("client-cases");cases.replaceChildren();c.cases.forEach(a=>{const row=node("p",a.status+" · "+a["message_"+lang]+" · ",cases);evidence(a.evidence_path,row);});
      }
      $("gateway-section").hidden=!data.gateway;
      if(data.gateway){
        const g=data.gateway,selector=$("gateway-route"),selected=selector.value;selector.replaceChildren();
        g.routes.forEach((r,index)=>{const option=node("option",r.label+" · "+r.response.traffic_mode+" · "+r.response.node_id,selector);option.value=String(index);});selector.value=selected||"0";drawGatewayRoute();
        const evidenceRoot=$("gateway-evidence");evidenceRoot.replaceChildren();node("p",g.assertions_passed+"/"+g.assertions_total+(lang==="en"?" checks; owned cleanup: ":"검사 · 소유자원 정리: ")+g.cleanup_verified,evidenceRoot);
        g.evidence.forEach(e=>{const row=node("p",e["name_"+lang]+" · ",evidenceRoot);evidence(e.path,row);});
        const cases=$("gateway-cases");cases.replaceChildren();g.cases.forEach(c=>{const row=node("p",c.status+" · "+c["message_"+lang]+" · ",cases);evidence(c.evidence_path,row);});
      }
      $("nodes-section").hidden = !data.nodes;
      if(data.nodes){
        const n=data.nodes, selector=$("node-event"),selectedEvent=selector.value,routeSelector=$("node-route"),selectedRoute=routeSelector.value;
        selector.replaceChildren(); n.events.forEach((e,index)=>{const option=node("option",e.node_id+" · "+e["message_"+lang],selector);option.value=String(index);});
        selector.value=selectedEvent||"0";
        routeSelector.replaceChildren();n.routes.forEach((r,index)=>{const option=node("option",r.node_id+" · "+r.label+" · "+r.traffic_mode,routeSelector);option.value=String(index);});routeSelector.value=selectedRoute||String(Math.max(0,n.routes.findIndex(r=>r.label==="live-a")));
        drawNodeEvent();drawNodeRoute();setNodeReplayLabel();
        $("node-evidence").replaceChildren();node("p",n.assertions_passed+"/"+n.assertions_total+(lang==="en"?" checks; owned cleanup: ":"검사 · 소유자원 정리: ")+n.cleanup_verified,$("node-evidence"));
        n.evidence.forEach(e=>{const row=node("p",e["name_"+lang]+" · ",$("node-evidence"));evidence(e.path,row);});
        $("node-cases").replaceChildren();n.cases.forEach(c=>{const row=node("p",c.status+" · "+c["message_"+lang]+" · ",$("node-cases"));evidence(c.evidence_path,row);});
      }
      $("traffic-section").hidden = !data.traffic;
      if (data.traffic) {
        const t = data.traffic, comparison = $("traffic-route-comparison"), map = $("traffic-route-map");
        comparison.replaceChildren(); map.replaceChildren();
        const chosen = ["baseline", "live", "expired"].map(label => t.routes.find(r => r.label === label)).filter(Boolean);
        const colors = {baseline:"#48566A",live:"#CC481D",expired:"#18816B"};
        const names = lang === "en" ? {baseline:"Baseline",live:"Accepted live traffic",expired:"Exact expiry"} : {baseline:"기본",live:"수용 실시간",expired:"정확한 만료"};
        const coords = chosen.flatMap(r => r.coordinates), lons = coords.map(c => c[0]), lats = coords.map(c => c[1]);
        if (coords.length) {
          const view = document.createElementNS(ns,"svg"); view.setAttribute("viewBox","0 0 800 300"); view.setAttribute("role","img"); view.setAttribute("aria-label", lang === "en" ? "Recorded baseline, live and expired route shapes" : "기록된 기본·실시간·만료 경로 모양"); view.style.width="100%"; view.style.maxHeight="360px"; view.style.background="#F5F7F9";
          const minX=Math.min(...lons), maxX=Math.max(...lons), minY=Math.min(...lats), maxY=Math.max(...lats);
          const cosine=Math.cos(((minY+maxY)/2)*Math.PI/180);
          const scale=Math.min(740/Math.max((maxX-minX)*cosine,1e-9),240/Math.max(maxY-minY,1e-9));
          const project=c=>[400+(c[0]-(minX+maxX)/2)*cosine*scale,150-(c[1]-(minY+maxY)/2)*scale];
          const line=(coordinates,color,width,dash)=>{const path=document.createElementNS(ns,"polyline");path.setAttribute("points",coordinates.map(c=>project(c).join(",")).join(" "));path.setAttribute("fill","none");path.setAttribute("stroke",color);path.setAttribute("stroke-width",width);if(dash)path.setAttribute("stroke-dasharray",dash);view.append(path);};
          (data.context_roads||[]).filter(r=>r.coordinates.some(c=>c[0]>=minX&&c[0]<=maxX&&c[1]>=minY&&c[1]<=maxY)).forEach(r=>line(r.coordinates,"#D8DFE6","1"));
          chosen.forEach(r=>line(r.coordinates,colors[r.label],r.label==="baseline"?"9":r.label==="live"?"5":"2",r.label==="expired"?"8 5":null));map.append(view);
        }
        chosen.forEach(r => {
          const item=node("article","",comparison); item.style.borderLeft="4px solid "+colors[r.label]; item.style.padding="8px 12px"; item.style.margin="12px 0";
          node("h3",names[r.label],item);
          node("p",r.traffic_mode+" · "+r.distance_m.toFixed(1)+" m · "+r.eta_s.toFixed(6)+" s",item);
          node("p",(lang==="en"?"Checked event time: ":"검사 관측시각: ")+r.checked_at_event_time+" · "+(lang==="en"?"valid until: ":"유효기한: ")+(r.valid_until||"—"),item);
          node("p",(lang==="en"?"Sequence: ":"순번: ")+(r.sequence??"—")+" · "+(lang==="en"?"snapshot: ":"스냅샷: ")+(r.snapshot_id||"—"),item).style.overflowWrap="anywhere";
          node("p",(lang==="en"?"Generation: ":"파일세대: ")+r.generation_id+" · SHA256 "+r.traffic_sha256,item).style.overflowWrap="anywhere";
          evidence(r.evidence_path,item);
        });
        $("traffic-evidence").replaceChildren();
        node("p",t.assertions_passed+"/"+t.assertions_total+(lang==="en"?" checks; owned cleanup verified: ":"검사 · 소유자원 정리 확인: ")+t.cleanup_verified,$("traffic-evidence"));
        t.evidence.forEach(e => {const row=node("p",e["name_"+lang]+" · ",$("traffic-evidence"));evidence(e.path,row);});
        $("traffic-cases").replaceChildren(); t.cases.forEach(c => {const row=node("p",c.status+" · "+c["message_"+lang]+" · ",$("traffic-cases"));evidence(c.evidence_path,row);});
      }
      $("publication-section").hidden = !data.publication;
      if (data.publication) {
        const p = data.publication, root = $("publication-evidence");
        root.replaceChildren();
        node("p", p.assertions_passed + "/" + p.assertions_total + (lang === "en" ? " checks · highest accepted sequence: " : "검사 · 수용 최고순번: ") + p.high_water + (lang === "en" ? " · active snapshot: " : " · 현재 유효 스냅샷: ") + (p.active_snapshot_id || (lang === "en" ? "none (expired)" : "없음(만료)")), root);
        node("p", p.publisher_id + " · " + p.simulation_namespace, root);
        p.versions.forEach(v => {
          const row = node("p", (lang === "en" ? "Committed sequence " : "커밋 순번 ") + v.sequence + " · " + v.kid + " · " + v.target_status + " · " + v.snapshot_id + " · " + v.valid_until + " · ", root);
          evidence(v.artifact_path, row); row.append(document.createTextNode(" · ")); evidence(v.jws_path, row);
        });
        p.evidence.forEach(item => { const row = node("p", item["name_" + lang] + " · ", root); evidence(item.path, row); });
        $("publication-cases").replaceChildren();
        p.cases.forEach(item => { const row = node("p", item.status + " · " + item["message_" + lang] + " · ", $("publication-cases")); evidence(item.evidence_path, row); });
      }
      if (data.ingestion) {
        const i = data.ingestion;
        $("ingestion-counts").textContent =
          lang === "en"
            ? i.assertions_passed +
              "/" +
              i.assertions_total +
              " checks · " +
              i.submitted_batches +
              " HTTP requests · " +
              i.duplicate_responses +
              " duplicates · " +
              i.stored_traversals +
              "/" +
              i.reference_traversals +
              " stored/reference traversals · " +
              i.recovered_workers +
              " recovered workers · cleanup " +
              i.cleanup_verified
            : i.assertions_passed +
              "/" +
              i.assertions_total +
              "검사 · HTTP " +
              i.submitted_batches +
              "회 · 중복 " +
              i.duplicate_responses +
              "회 · 저장/기준 통과 " +
              i.stored_traversals +
              "/" +
              i.reference_traversals +
              "개 · 처리자복구 " +
              i.recovered_workers +
              "회 · 정리 " +
              i.cleanup_verified;
        $("ingestion-evidence").replaceChildren();
        i.evidence.forEach((item) => {
          const p = node(
            "p",
            item["name_" + lang] + " · ",
            $("ingestion-evidence"),
          );
          evidence(item.path, p);
        });
        $("ingestion-cases").replaceChildren();
        i.cases.forEach((item) => {
          const p = node(
            "p",
            item.status + " · " + item["message_" + lang] + " · ",
            $("ingestion-cases"),
          );
          evidence(item.evidence_path, p);
        });
        $("ingestion-events").replaceChildren();
        i.events.forEach((item) =>
          node(
            "p",
            (item.elapsed_ms / 1000).toFixed(2) +
              " s · " +
              item.phase +
              " · " +
              item.code,
            $("ingestion-events"),
          ),
        );
      }
      matchingDetails();
      if (data.region) {
        $("regional-note").replaceChildren();
        node(
          "span",
          (lang === "en" ? data.region.name_en : data.region.name_ko) +
            " · " +
            data.region.source_date +
            " · " +
            data.region.attribution +
            " · ",
          $("regional-note"),
        );
        const license = node("a", "ODbL", $("regional-note"));
        license.href = "https://www.openstreetmap.org/copyright";
        node("span", " · ", $("regional-note"));
        const mapSource = node("a", "Geofabrik", $("regional-note"));
        mapSource.href =
          "https://download.geofabrik.de/asia/south-korea-261023.osm.pbf";
        node(
          "span",
          " · " + (lang === "en" ? "SYNTHETIC vehicles" : "합성 차량"),
          $("regional-note"),
        );
        node(
          "p",
          (lang === "en" ? "Display roads: " : "표시 도로: ") +
            data.region.display_road_count +
            " · " +
            (lang === "en" ? "Full graph export: " : "전체 그래프 내보내기: ") +
            (data.region.graph_counts.full_export_roads ?? "?"),
          $("regional-note"),
        );
        const all = $("route").options[0];
        if (all) all.textContent = lang === "en" ? "All routes" : "전체 경로";
        replayRoutes()?.forEach((r, i) => {
          if ($("route").options[i + 1])
            $("route").options[i + 1].textContent = r["name_" + lang];
        });
      }
      aggregateDisplay();
      if (replay().matching) {
        const activeMatching = replay().matching;
        $("matching-ribbon").textContent =
          (lang === "en" ? "GPS matched/excluded: " : "GPS 매칭/제외: ") +
          activeMatching.matched_samples +
          "/" +
          activeMatching.excluded_samples +
          " · " +
          (lang === "en"
            ? "Complete traversals accepted/excluded: "
            : "완전 통과 수용/제외: ") +
          activeMatching.accepted_traversals +
          "/" +
          activeMatching.excluded_traversals +
          " · " +
          [...new Set(activeMatching.traversals.flatMap((t) => t.reason_codes))]
            .map((code) => reasons[code]?.[lang === "en" ? 0 : 1] || code)
            .join(", ");
      }
      draw();
    }
    let viewportWidth = 900,
      viewportHeight = 560;
    function bounds() {
      const view =
        data.aggregation && $("dataset").value === "aggregation"
          ? data.aggregation.population
          : data;
      const routeList =
        view === data
          ? data.routes
          : [
              {
                route_id: "p06",
                vehicle_ids: view.vehicles.map((v) => v.vehicle_id),
              },
            ];
      const selectedRoute = routeList?.find(
        (r) => r.route_id === $("route").value,
      );
      const truth = view.vehicles
        .filter(
          (v) =>
            !selectedRoute || selectedRoute.vehicle_ids.includes(v.vehicle_id),
        )
        .flatMap((v) => v.truth.map((p) => [p.longitude, p.latitude]));
      const coords =
        $("all-roads").checked || !truth.length
          ? [...data.roads, ...(data.context_roads || [])].flatMap(
              (r) => r.coordinates,
            )
          : truth;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const p of coords) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
      return {
        minX,
        maxX,
        minY,
        maxY,
        scale: Math.min(
          Math.max(100, viewportWidth - 120) /
            ((maxX - minX || 0.001) *
              (data.region
                ? Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
                : 1)),
          Math.max(100, viewportHeight - 110) / (maxY - minY || 0.001),
        ),
      };
    }
    let { minX, maxX, minY, maxY, scale } = bounds();
    function xy(p) {
      return [
        viewportWidth / 2 +
          (p[0] - (minX + maxX) / 2) *
            scale *
            (data.region ? Math.cos((((minY + maxY) / 2) * Math.PI) / 180) : 1),
        viewportHeight / 2 - (p[1] - (minY + maxY) / 2) * scale,
      ];
    }
    let activeLayer,
      roadLayer,
      movingLayer,
      roadCacheKey = "",
      projectionCacheKey = "";
    function svg(tag, attrs) {
      const e = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
      (activeLayer || $("map")).append(e);
      return e;
    }
    function point(p) {
      return xy([p.longitude, p.latitude]);
    }
    function draw() {
      viewportWidth = $("map").clientWidth || 900;
      viewportHeight = $("map").clientHeight || 560;
      $("map").setAttribute(
        "viewBox",
        "0 0 " + viewportWidth + " " + viewportHeight,
      );
      const projectionKey = JSON.stringify([
        $("dataset").value,
        viewportWidth,
        viewportHeight,
        $("all-roads").checked,
        $("route").value,
      ]);
      if (projectionKey !== projectionCacheKey) {
        ({ minX, maxX, minY, maxY, scale } = bounds());
        projectionCacheKey = projectionKey;
      }
      if (!roadLayer) {
        roadLayer = document.createElementNS(ns, "g");
        movingLayer = document.createElementNS(ns, "g");
        $("map").replaceChildren(roadLayer, movingLayer);
      }
      const cacheKey = JSON.stringify([
        viewportWidth,
        viewportHeight,
        minX,
        maxX,
        minY,
        maxY,
        $("all-roads").checked,
      ]);
      if (cacheKey !== roadCacheKey) {
        roadLayer.replaceChildren();
        activeLayer = roadLayer;
        if (data.region)
          (data.context_roads || []).forEach((r) =>
            svg("polyline", {
              points: r.coordinates.map((p) => xy(p).join(",")).join(" "),
              fill: "none",
              stroke: "#d7e0e9",
              "stroke-width": 1.5,
            }),
          );
        data.roads.forEach((r) => {
          svg("polyline", {
            points: r.coordinates.map((p) => xy(p).join(",")).join(" "),
            fill: "none",
            stroke: "#9BAEC2",
            "stroke-width": data.region ? 2.5 : 12,
            "stroke-linecap": "round",
          });
          if (data.region) return;
          const first = r.coordinates[0];
          const last = r.coordinates[r.coordinates.length - 1];
          const p = xy([(first[0] + last[0]) / 2, (first[1] + last[1]) / 2]);
          const horizontal =
            Math.abs(last[0] - first[0]) >= Math.abs(last[1] - first[1]);
          const below = ["ab", "bc"].includes(r.label.toLowerCase());
          const t = svg("text", {
            x: p[0] + (horizontal ? 0 : 12),
            y: p[1] + (horizontal ? (below ? 24 : -14) : 4),
            "text-anchor": horizontal ? "middle" : "start",
          });
          t.textContent = r.label;
        });
        roadCacheKey = cacheKey;
      }
      activeLayer = movingLayer;
      movingLayer.replaceChildren();
      if (data.aggregation && $("dataset").value === "aggregation") {
        const edge = data.roads.find(
          (r) =>
            r.edge_id === data.aggregation.target.edge_id &&
            r.forward === data.aggregation.target.forward,
        );
        if (edge)
          svg("polyline", {
            points: edge.coordinates.map((p) => xy(p).join(",")).join(" "),
            fill: "none",
            stroke: "#23775D",
            "stroke-width": 5,
            opacity: 0.7,
          });
      }
      let omissions = 0;
      const route = replayRoutes()?.find(
        (r) => r.route_id === $("route").value,
      );
      const visibleVehicles = replay()
        .vehicles.filter(
          (v) => !route || route.vehicle_ids.includes(v.vehicle_id),
        )
        .filter(
          (v) =>
            $("vehicle").value === "*" || v.vehicle_id === $("vehicle").value,
        );
      const labeledRoutes = new Set();
      visibleVehicles.forEach((v, index) => {
        const truth = v.truth.filter((p) => p.offset_ms <= time),
          obs = v.observations.filter((p) => p.offset_ms <= time);
        if ($("truth").checked && truth.length) {
          svg("polyline", {
            points: truth.map((p) => point(p).join(",")).join(" "),
            fill: "none",
            stroke: "#1264B8",
            "stroke-width": 3,
          });
          const p = point(truth[truth.length - 1]);
          svg("circle", {
            cx: p[0],
            cy: p[1],
            r: 8,
            fill: "#1264B8",
            stroke: "white",
            "stroke-width": 2,
          });
          const rightHalf = p[0] > viewportWidth / 2;
          const lowerHalf = p[1] > viewportHeight / 2;
          if (data.region) {
            const scene = replayRoutes()?.find((r) =>
              r.vehicle_ids.includes(v.vehicle_id),
            );
            const grouped = $("vehicle").value === "*" && scene;
            const key = grouped ? scene.route_id : v.vehicle_id;
            if (!labeledRoutes.has(key)) {
              labeledRoutes.add(key);
              // A group label follows its first visible vehicle, not a centroid.
              // P06 schedules may place same-route vehicles at different points.
              const label = grouped
                ? scene["name_" + lang] +
                  " · " +
                  visibleVehicles.filter((item) =>
                    scene.vehicle_ids.includes(item.vehicle_id),
                  ).length
                : v.vehicle_id;
              const t = svg("text", {
                x: p[0] + (rightHalf ? -12 : 12),
                y: Math.max(
                  16,
                  Math.min(viewportHeight - 12, p[1] + (lowerHalf ? -20 : 22)),
                ),
                "text-anchor": rightHalf ? "end" : "start",
              });
              t.textContent = label;
              const width = Math.min(
                t.getComputedTextLength(),
                viewportWidth - 16,
              );
              t.setAttribute(
                "x",
                String(
                  rightHalf
                    ? Math.max(
                        width + 8,
                        Math.min(viewportWidth - 8, p[0] - 12),
                      )
                    : Math.max(
                        8,
                        Math.min(viewportWidth - width - 8, p[0] + 12),
                      ),
                ),
              );
            }
          } else {
            const t = svg("text", {
              x: p[0] + (rightHalf ? -12 : 12),
              y: p[1] + (lowerHalf ? -20 - index * 20 : 22 + index * 20),
              "text-anchor": rightHalf ? "end" : "start",
            });
            t.textContent = v.vehicle_id;
          }
        }
        if ($("observed").checked)
          obs.forEach((p) => {
            const q = point(p);
            svg("path", {
              d: "M" + (q[0] - 3) + "," + (q[1] - 3) + "l6,6m-6,0l6,-6",
              stroke: "#D96B28",
              "stroke-width": 2,
              opacity: 0.75,
            });
          });
        v.omissions
          .filter((p) => p.offset_ms <= time)
          .forEach((o) => {
            omissions++;
            const p = v.truth.find((t) => t.offset_ms === o.offset_ms);
            if (p && $("observed").checked) {
              const q = point(p);
              svg("circle", {
                cx: q[0],
                cy: q[1],
                r: 6,
                fill: "white",
                stroke: "#172D46",
                "stroke-width": 1.5,
                "stroke-dasharray": "2 2",
              });
            }
          });
      });
      if (replay().matching && $("matched").checked)
        replay()
          .matching.points.filter(
            (p) =>
              p.offset_ms <= time &&
              (!route || route.vehicle_ids.includes(p.vehicle_id)) &&
              ($("vehicle").value === "*" ||
                p.vehicle_id === $("vehicle").value),
          )
          .forEach((p) => {
            const q = point(p);
            const marker = svg("path", {
              d: "M" + q[0] + "," + (q[1] - 5) + "l5,5l-5,5l-5,-5Z",
              fill: p.status === "MATCHED" ? "#7945B2" : "white",
              stroke: "#7945B2",
              "stroke-width": 1.5,
            });
            const title = document.createElementNS(ns, "title");
            title.textContent =
              p.sample_id +
              " · " +
              p.status +
              " · " +
              reasonText(p.reason_codes);
            marker.append(title);
          });
      $("clock").textContent =
        (time / 1000).toFixed(1) +
        " / " +
        ((replay().duration_ms ?? data.summary.duration_ms) / 1000).toFixed(1) +
        " s";
      $("omissions").textContent =
        (lang === "en"
          ? "Scheduled omissions so far: "
          : "현재까지 예정된 누락: ") + omissions;
      $("time").value = String(time);
    }
    function drawGatewayRoute(){
      if(!data.gateway)return;const r=data.gateway.routes[Number($("gateway-route").value)],map=$("gateway-route-map"),detail=$("gateway-route-detail");map.replaceChildren();detail.replaceChildren();if(!r)return;
      const body=r.response,coords=body.geometry.coordinates,lons=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);
      if(coords.length){const minX=Math.min(...lons),maxX=Math.max(...lons),minY=Math.min(...lats),maxY=Math.max(...lats),cosine=Math.cos((minY+maxY)/2*Math.PI/180),scale=Math.min(740/Math.max((maxX-minX)*cosine,1e-9),240/Math.max(maxY-minY,1e-9));const view=document.createElementNS(ns,"svg");view.setAttribute("viewBox","0 0 800 300");view.setAttribute("role","img");view.setAttribute("aria-label",lang==="en"?"Recorded public gateway route":"기록된 공개 중계 경로");view.style.width="100%";view.style.maxHeight="360px";view.style.background="#F5F7F9";const line=(coordinates,color,width)=>{const p=document.createElementNS(ns,"polyline");p.setAttribute("points",coordinates.map(c=>(400+(c[0]-(minX+maxX)/2)*cosine*scale)+","+(150-(c[1]-(minY+maxY)/2)*scale)).join(" "));p.setAttribute("fill","none");p.setAttribute("stroke",color);p.setAttribute("stroke-width",width);view.append(p);};(data.context_roads||[]).filter(road=>road.coordinates.some(c=>c[0]>=minX&&c[0]<=maxX&&c[1]>=minY&&c[1]<=maxY)).forEach(road=>line(road.coordinates,"#D8DFE6","1"));line(coords,body.traffic_mode==="LIVE_MIXED"?"#CC481D":"#18816B","5");map.append(view);}
      node("h3",r.label+" · "+body.traffic_mode,detail);node("p",body.distance_m.toFixed(1)+" m · "+body.duration_s.toFixed(6)+" s · "+(lang==="en"?"route live coverage: ":"경로 실시간 적용률: ")+(body.live_coverage_ratio*100).toFixed(2)+"%",detail);
      node("p",(lang==="en"?"Public node / sequence: ":"공개 노드 / 순번: ")+body.node_id+" / "+(body.sequence??"—"),detail);
      node("p",(lang==="en"?"Snapshot / generation: ":"스냅샷 / 파일세대: ")+(body.snapshot_id??"—")+" / "+body.generation_id,detail).style.overflowWrap="anywhere";
      node("p",(lang==="en"?"Request hash: ":"요청 해시: ")+body.request_sha256,detail).style.overflowWrap="anywhere";
      body.warnings.forEach(w=>node("p",w.code+" · "+w["message_"+lang],detail));
      node("p",lang==="en"?"The linked evidence separately retains original native replies and gateway attempts; these are not public API fields.":"연결된 근거에 지속엔진 원응답·중계 시도를 별도로 보존하며 공개API필드가 아닙니다.",detail);evidence(r.evidence_path,detail);
    }
    $("gateway-route").onchange=drawGatewayRoute;
    let nodeReplayTimer=null;
    function drawNodeEvent(){
      if(!data.nodes)return;
      const index=Number($("node-event").value),event=data.nodes.events[index],root=$("node-status-replay");root.replaceChildren();if(!event)return;
      node("p",event.recorded_at_utc+" · "+event["message_"+lang],root);evidence(event.evidence_path,root);
      const latest=new Map();data.nodes.events.slice(0,index+1).forEach(e=>{if(e.status)latest.set(e.node_id,e);});
      latest.forEach(e=>{const s=e.status,card=node("article","",root);card.style.border="1px solid #CAD4DF";card.style.padding="12px";card.style.margin="10px 0";
        node("h3",s.node_id+" · "+(s.ready?(lang==="en"?"ready":"준비됨"):(lang==="en"?"unavailable":"사용불가")),card);
        node("p",(lang==="en"?"Instance: ":"실행 식별자: ")+s.instance_id+" · "+(lang==="en"?"in flight: ":"처리 중: ")+s.in_flight,card).style.overflowWrap="anywhere";
        if(s.active)node("p",s.active.traffic_mode+" · "+(lang==="en"?"sequence ":"순번 ")+(s.active.sequence??"—")+(lang==="en"?" · epoch ":" · 활성화 순번 ")+s.active.activation_epoch+" · "+s.active.checked_at_event_time,card);
        s.slots.forEach(slot=>{const row=node("p",slot.state+" · "+slot.generation_id+" · "+slot.in_flight+(lang==="en"?" leases":"개 고정 요청")+" · PID "+(slot.native_daemon?.pid??"—")+(lang==="en"?" / ticks ":" / 시작 눈금 ")+(slot.native_daemon?.start_ticks??"—"),card);row.style.overflowWrap="anywhere";});
        node("p",s["message_"+lang],card);evidence(e.evidence_path,card);
      });
    }
    function drawNodeRoute(){
      if(!data.nodes)return;const r=data.nodes.routes[Number($("node-route").value)],map=$("node-route-map"),detail=$("node-route-detail");map.replaceChildren();detail.replaceChildren();if(!r)return;
      const coords=r.coordinates,lons=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);if(coords.length){const minX=Math.min(...lons),maxX=Math.max(...lons),minY=Math.min(...lats),maxY=Math.max(...lats),cosine=Math.cos((minY+maxY)/2*Math.PI/180),scale=Math.min(740/Math.max((maxX-minX)*cosine,1e-9),240/Math.max(maxY-minY,1e-9));const view=document.createElementNS(ns,"svg");view.setAttribute("viewBox","0 0 800 300");view.setAttribute("role","img");view.setAttribute("aria-label",lang==="en"?"Original recorded node route":"기록한 노드 원본 경로");view.style.width="100%";view.style.maxHeight="360px";view.style.background="#F5F7F9";const line=(coordinates,color,width)=>{const p=document.createElementNS(ns,"polyline");p.setAttribute("points",coordinates.map(c=>(400+(c[0]-(minX+maxX)/2)*cosine*scale)+","+(150-(c[1]-(minY+maxY)/2)*scale)).join(" "));p.setAttribute("fill","none");p.setAttribute("stroke",color);p.setAttribute("stroke-width",width);view.append(p);};(data.context_roads||[]).filter(road=>road.coordinates.some(c=>c[0]>=minX&&c[0]<=maxX&&c[1]>=minY&&c[1]<=maxY)).forEach(road=>line(road.coordinates,"#D8DFE6","1"));line(coords,r.traffic_mode==="LIVE"?"#CC481D":"#18816B","5");map.append(view);}
      node("h3",r.node_id+" · "+r.label,detail);node("p",r.traffic_mode+" · "+r.distance_m.toFixed(1)+" m · "+r.eta_s.toFixed(6)+" s",detail);
      node("p",(lang==="en"?"Actual instance / epoch / daemon: ":"실제 실행 식별자 / 활성화 순번 / 엔진: ")+r.instance_id+" / "+r.activation_epoch+" / PID "+r.native_daemon.pid+(lang==="en"?" ticks ":" 시작 눈금 ")+r.native_daemon.start_ticks,detail).style.overflowWrap="anywhere";
      node("p",(lang==="en"?"Sequence / snapshot: ":"순번 / 스냅샷: ")+(r.sequence??"—")+" / "+(r.snapshot_id||"—"),detail).style.overflowWrap="anywhere";
      node("p",(lang==="en"?"Generation / checked event time / valid until: ":"파일 세대 / 검사 관측시각 / 기한: ")+r.generation_id+" / "+r.checked_at_event_time+" / "+(r.valid_until||"—"),detail).style.overflowWrap="anywhere";evidence(r.evidence_path,detail);
    }
    $("node-event").onchange=drawNodeEvent;$("node-route").onchange=drawNodeRoute;
    function setNodeReplayLabel(){
      const button=$("node-replay"),label=nodeReplayTimer?(lang==="en"?"Pause recorded replay":"기록 재생 일시정지"):(lang==="en"?"Replay recorded transitions":"기록된 전환 재생");
      button.textContent=label;button.setAttribute("aria-label",label);button.setAttribute("aria-pressed",String(nodeReplayTimer!==null));
    }
    $("node-replay").onclick=()=>{
      if(!data.nodes?.events.length)return;
      if(nodeReplayTimer){clearInterval(nodeReplayTimer);nodeReplayTimer=null;setNodeReplayLabel();return;}
      let index=0;$("node-event").value="0";drawNodeEvent();
      nodeReplayTimer=setInterval(()=>{index++;if(index>=data.nodes.events.length){clearInterval(nodeReplayTimer);nodeReplayTimer=null;setNodeReplayLabel();return;}$("node-event").value=String(index);drawNodeEvent();},1500);
      setNodeReplayLabel();
    };
    $("aggregation-note").hidden = !data.aggregation;
    $("aggregation-section").hidden = !data.aggregation;
    data.aggregation?.cases
      .filter((c) =>
        [
          "count-0",
          "count-1",
          "count-4",
          "count-5",
          "revoked",
          "expired",
        ].includes(c.case_id),
      )
      .forEach(
        (c) =>
          (node("option", c.name_en, $("aggregate-case")).value = c.case_id),
      );
    $("dataset").onchange = resetReplay;
    $("aggregate-case").onchange = resetReplay;
    $("ingestion-section").hidden = !data.ingestion;
    $("matching-section").hidden = !data.matching;
    $("matching-toggle").hidden = !data.matching;
    $("regional-note").hidden = !data.region;
    $("matching-ribbon").hidden = !data.matching;
    $("route-control").hidden = !data.routes?.length;
    node("option", "All routes", $("route")).value = "*";
    data.routes?.forEach(
      (r) => (node("option", r.name_en, $("route")).value = r.route_id),
    );
    $("time").max = String(data.summary.duration_ms);
    node("option", "All vehicles", $("vehicle")).value = "*";
    data.vehicles.forEach(
      (v) => (node("option", v.vehicle_id, $("vehicle")).value = v.vehicle_id),
    );
    $("language").onclick = () => {
      lang = lang === "en" ? "ko" : "en";
      translate();
    };
    $("play").onclick = () => {
      if (time >= (replay().duration_ms ?? data.summary.duration_ms)) time = 0;
      playing = !playing;
      last = 0;
      translate();
      if (playing) requestAnimationFrame(tick);
    };
    $("time").oninput = () => {
      time = Number($("time").value);
      draw();
    };
    ["vehicle", "truth", "observed", "all-roads", "matched", "route"].forEach(
      (id) => ($(id).onchange = draw),
    );
    function tick(now) {
      if (!playing) return;
      if (last)
        time = Math.min(
          replay().duration_ms ?? data.summary.duration_ms,
          time + (now - last) * Number($("speed").value),
        );
      last = now;
      draw();
      if (time >= (replay().duration_ms ?? data.summary.duration_ms)) {
        playing = false;
        translate();
      } else requestAnimationFrame(tick);
    }
    window.addEventListener("resize", draw);
    translate();
  </script>
</html>`;
}
