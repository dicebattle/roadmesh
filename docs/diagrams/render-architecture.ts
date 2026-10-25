/** README figure source. / README 구조도 생성 원본입니다.
 * Run: node --experimental-strip-types docs/diagrams/render-architecture.ts
 * 실행: 위 명령으로 한영 HTML 원본을 다시 만듭니다.
 */
import { mkdirSync, writeFileSync } from "node:fs";

type Language = "en" | "ko";
type Box = { id: string; x: number; y: number; w: number; title: string; detail: string; kind?: "input" | "focal"; tag: string };
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const ink = "#172b3a", paper = "#f5f7f9", muted = "#526575", accent = "#18816b";
const sans = "'Avenir Next', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif";
const body = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif";
const text = {
  en: {
    title: "RouteLens: from observations to a route",
    description: "Synthetic observations are matched and aggregated into signed traffic shared by two compatible route nodes; the gateway returns a route to the browser.",
    subtitle: "Actual Seoul roads · synthetic movement and traffic · local pilot",
    prepare: "01  PREPARE TRAFFIC", route: "02  INDEPENDENT ROUTE SERVERS",
    callout: ["Same map. Same traffic.", "Another compatible server can answer", "when one routing server is unavailable."],
    note: "Arrows follow traffic and route results; request/reply details are in the architecture document.",
    legend: ["Observations / result", "Processing / route engine", "Shared data / selection"],
    names: ["Driving observations", "Match to roads", "Aggregate and sign", "Shared traffic", "Routing node A", "Routing node B", "Select a ready node", "Browser result"],
    details: ["Synthetic GPS", "Receive + map matching", "Road speeds + signature", "Same map version", "Valhalla", "Valhalla", "Gateway · one retry", "Map · distance · time"],
  },
  ko: {
    title: "RouteLens: 관측이 경로가 되기까지",
    description: "합성 관측을 도로에 매칭하고 집계·서명한 교통정보를 두 호환 경로 노드가 공유하며 중계 서버가 브라우저에 경로 결과를 반환합니다.",
    subtitle: "실제 서울 도로 · 합성 이동과 교통정보 · 로컬 파일럿",
    prepare: "01  교통정보 준비", route: "02  독립된 경로 서버",
    callout: ["같은 지도, 같은 교통정보.", "경로 서버 한 곳이 응답하지 못하면", "호환되는 다른 서버가 처리합니다."],
    note: "화살표는 교통자료와 경로 결과의 흐름입니다. 요청·응답의 세부 규칙은 아키텍처 문서를 참고하세요.",
    legend: ["관측 · 결과", "처리 · 경로 엔진", "공유 자료 · 서버 선택"],
    names: ["주행 관측", "도로 매칭", "집계와 서명", "교통정보 공유", "경로 노드 A", "경로 노드 B", "응답할 노드 선택", "브라우저 결과"],
    details: ["합성 GPS", "관측 수집 · 도로 대응", "도로 속도 · 교통자료 서명", "같은 지도 버전", "Valhalla", "Valhalla", "중계 서버 · 한 번 재시도", "지도 · 거리 · 예상 시간"],
  },
};

function render(language: Language) {
  const t = text[language], slug = "architecture" + (language === "ko" ? ".ko" : "");
  const positions = [
    {id:"O", x:48, y:160, w:208, kind:"input", tag:"INPUT"},
    {id:"I", x:352, y:160, w:208, tag:"MATCH"},
    {id:"A", x:656, y:160, w:240, tag:"AGGREGATE"},
    {id:"T", x:1008, y:160, w:224, kind:"focal", tag:"SHARE"},
    {id:"N1", x:656, y:352, w:224, tag:"NODE A"},
    {id:"N2", x:1008, y:352, w:224, tag:"NODE B"},
    {id:"G", x:656, y:512, w:224, kind:"focal", tag:"GATEWAY"},
    {id:"U", x:1008, y:512, w:224, kind:"input", tag:"CLIENT"},
  ] as const;
  const boxes: Box[] = positions.map((p, i) => ({...p, title:t.names[i], detail:t.details[i]}));
  const node = (b: Box) => {
    const fill = b.kind === "focal" ? "#e5f0ec" : b.kind === "input" ? "#e4e9ee" : "#ffffff";
    const stroke = b.kind === "focal" ? accent : b.kind === "input" ? muted : ink;
    return `<g data-node-id="${b.id}">
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="80" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${b.x+16}" y="${b.y+20}" class="tag">${b.tag}</text>
      <text x="${b.x+16}" y="${b.y+44}" class="name">${escape(b.title)}</text>
      <text x="${b.x+16}" y="${b.y+64}" class="detail">${escape(b.detail)}</text>
    </g>`;
  };
  const edges = [
    ["O", "I", "M256 200H352"], ["I", "A", "M560 200H656"], ["A", "T", "M896 200H1008"],
    ["T", "N1", "M1072 240V288Q1072 296 1064 296H776Q768 296 768 304V352"],
    ["T", "N2", "M1120 240V352"],
    ["N1", "G", "M768 432V512"],
    ["N2", "G", "M1120 432V472Q1120 480 1112 480H928Q920 480 920 488V536Q920 544 912 544H880"],
    ["G", "U", "M880 568H1008"],
  ];
  const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${slug}-title ${slug}-desc">
  <title id="${slug}-title">${escape(t.title)}</title>
  <desc id="${slug}-desc">${escape(t.description)}</desc>
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${muted}"/></marker></defs>
  <rect width="1280" height="720" fill="${paper}"/>
  <text x="40" y="64" class="title">${escape(t.title)}</text>
  <text x="40" y="96" class="detail">${escape(t.subtitle)}</text>
  <rect x="40" y="120" width="872" height="144" rx="8" fill="#edf1f4" stroke="#cad4df"/>
  <text x="56" y="140" class="group">${t.prepare}</text>
  <rect x="632" y="304" width="608" height="152" rx="8" fill="#edf1f4" stroke="#cad4df"/>
  <text x="864" y="332" class="group">${t.route}</text>
  <g fill="none" stroke="${muted}" stroke-width="1.5" marker-end="url(#arrow)">${edges.map(([from,to,d])=>`<path data-from="${from}" data-to="${to}" d="${d}"/>`).join("\n")}</g>
  ${boxes.map(node).join("\n")}
  <text x="48" y="376" class="name">${escape(t.callout[0])}</text>
  <text x="48" y="404" class="detail">${escape(t.callout[1])}</text>
  <text x="48" y="428" class="detail">${escape(t.callout[2])}</text>
  <text x="48" y="624" class="detail">${escape(t.note)}</text>
  <path d="M40 652H1240" stroke="#cad4df"/>
  ${[48,400,816].map((x,i)=>`<rect x="${x}" y="664" width="16" height="16" rx="4" fill="${["#e4e9ee","#ffffff","#e5f0ec"][i]}" stroke="${i===2?accent:muted}"/><text x="${x+28}" y="676" class="detail">${escape(t.legend[i])}</text>`).join("\n")}
</svg>`;
  const css = `*{box-sizing:border-box}body{margin:0;padding:24px;background:${paper};color:${ink};font-family:${body}}.frame{width:100%;max-width:1280px;min-width:0;margin:auto}.diagram-container{width:100%;overflow-x:auto}svg{width:100%;min-width:1280px;display:block}text{fill:${ink};font-family:${sans}}.title{font-size:40px;font-weight:600}.name{font-size:16px;font-weight:600}.detail{font-family:${body};font-size:12px;fill:${muted}}.group{font-family:${body};font-size:14px;font-weight:600;fill:${muted}}.tag{font-family:ui-monospace,monospace;font-size:8px;fill:${muted};letter-spacing:1px}@media print{body{padding:0}.diagram-container{overflow-x:visible}svg{min-width:0}}`;
  return `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(t.title)}</title><style>${css}</style></head><body><main class="frame"><div class="diagram-container">${svg}</div></main></body></html>\n`;
}
mkdirSync("docs/diagrams", {recursive:true});
for (const language of ["en", "ko"] as const) writeFileSync(`docs/diagrams/architecture${language === "ko" ? ".ko" : ""}.html`, render(language));
console.log("Generated English/Korean architecture HTML / 한영 아키텍처 HTML을 생성했습니다");
