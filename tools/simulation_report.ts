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
<html lang="en">
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
    [hidden] {
      display: none !important;
    }
    #matching-decisions {
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
      svg {
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
        <div class="eyebrow">ROUTELENS / ${data.matching ? "P03 + P04" : "P03"}</div>
        <h1
          data-en="Vehicle &amp; GPS simulation"
          data-ko="차량·GPS 시뮬레이션"
        ></h1>
        <p
          class="notice"
          data-en="Synthetic trajectories and GPS observations on an authored fictional road network. Test evidence, not live traffic or a navigation client."
          data-ko="직접 만든 가상 도로망의 합성 이동 경로와 GPS 관측입니다. 실시간 교통정보나 내비게이션 화면이 아닌 검사 증거입니다."
        ></p>
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
            aria-label="Fictional road replay / 가상 도로 재생"
          ></svg>
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
            ><label
              ><input id="all-roads" type="checkbox" /><span
                data-en="All fixture roads"
                data-ko="전체 시험도로"
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
    const reasons = {
      AMBIGUOUS_PARALLEL: ["Ambiguous parallel roads", "평행도로 구분 불가"],
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
      const m = data.matching;
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
      matchingDetails();
      draw();
    }
    let viewportWidth = 900,
      viewportHeight = 560;
    function bounds() {
      const truth = data.vehicles.flatMap((v) =>
        v.truth.map((p) => [p.longitude, p.latitude]),
      );
      const coords =
        $("all-roads").checked || !truth.length
          ? data.roads.flatMap((r) => r.coordinates)
          : truth;
      const xs = coords.map((p) => p[0]),
        ys = coords.map((p) => p[1]);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
      return {
        minX,
        maxX,
        minY,
        maxY,
        scale: Math.min(
          Math.max(100, viewportWidth - 120) / (maxX - minX || 0.001),
          Math.max(100, viewportHeight - 110) / (maxY - minY || 0.001),
        ),
      };
    }
    let { minX, maxX, minY, maxY, scale } = bounds();
    function xy(p) {
      return [
        viewportWidth / 2 + (p[0] - (minX + maxX) / 2) * scale,
        viewportHeight / 2 - (p[1] - (minY + maxY) / 2) * scale,
      ];
    }
    function svg(tag, attrs) {
      const e = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
      $("map").append(e);
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
      ({ minX, maxX, minY, maxY, scale } = bounds());
      $("map").replaceChildren();
      data.roads.forEach((r) => {
        svg("polyline", {
          points: r.coordinates.map((p) => xy(p).join(",")).join(" "),
          fill: "none",
          stroke: "#9BAEC2",
          "stroke-width": 12,
          "stroke-linecap": "round",
        });
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
      let omissions = 0;
      data.vehicles
        .filter(
          (v) =>
            $("vehicle").value === "*" || v.vehicle_id === $("vehicle").value,
        )
        .forEach((v, index) => {
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
            const t = svg("text", {
              x: p[0] + (rightHalf ? -12 : 12),
              y: p[1] + (lowerHalf ? -20 - index * 20 : 22 + index * 20),
              "text-anchor": rightHalf ? "end" : "start",
            });
            t.textContent = v.vehicle_id;
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
      if (data.matching && $("matched").checked)
        data.matching.points
          .filter(
            (p) =>
              p.offset_ms <= time &&
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
        (data.summary.duration_ms / 1000).toFixed(1) +
        " s";
      $("omissions").textContent =
        (lang === "en"
          ? "Scheduled omissions so far: "
          : "현재까지 예정된 누락: ") + omissions;
      $("time").value = String(time);
    }
    $("matching-section").hidden = !data.matching;
    $("matching-toggle").hidden = !data.matching;
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
      if (time >= data.summary.duration_ms) time = 0;
      playing = !playing;
      last = 0;
      translate();
      if (playing) requestAnimationFrame(tick);
    };
    $("time").oninput = () => {
      time = Number($("time").value);
      draw();
    };
    ["vehicle", "truth", "observed", "all-roads", "matched"].forEach(
      (id) => ($(id).onchange = draw),
    );
    function tick(now) {
      if (!playing) return;
      if (last)
        time = Math.min(
          data.summary.duration_ms,
          time + (now - last) * Number($("speed").value),
        );
      last = now;
      draw();
      if (time >= data.summary.duration_ms) {
        playing = false;
        translate();
      } else requestAnimationFrame(tick);
    }
    window.addEventListener("resize", draw);
    translate();
  </script>
</html>`;
}
