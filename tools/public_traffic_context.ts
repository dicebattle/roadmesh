/** Browser-safe source/clock discrimination, independent of Node and credential code.
 * Node·인증키 코드와 독립적인 화면용 출처·시계 구분 검사. */
import type { PublicTrafficContext } from "./gateway_public_types.js";
export function validSourceClock(source: unknown, clock: unknown): boolean {
  return (source === "SYNTHETIC" && clock === "SIMULATION_EVENT_TIME") ||
    (source === "PUBLIC_AGENCY" && clock === "WALL_CLOCK_UTC");
}
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
export function validPublicTrafficContext(raw: unknown, checked_at: string, active: boolean): raw is PublicTrafficContext {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !time(checked_at)) return false;
  const v = raw as PublicTrafficContext;
  const regional = v.provider === "kr-regional";
  if (Object.keys(v).sort().join(",") !== (regional
      ? "graph_edges,live_edges,mapped_edges,observed_from,observed_until,provider,refresh_state,retrieved_at,source_state,sources"
      : "graph_edges,live_edges,mapped_edges,observed_from,observed_until,provider,refresh_state,retrieved_at,source_state") ||
      (!regional && v.provider !== "kr-its") || !["CURRENT", "EXPIRED", "UNAVAILABLE", "NO_MAPPED_SPEEDS"].includes(v.source_state) ||
      !["OK", "FAILED", "WAITING"].includes(v.refresh_state) ||
      ![v.graph_edges, v.mapped_edges, v.live_edges].every(n => Number.isSafeInteger(n) && n >= 0) ||
      v.graph_edges < 1 || v.mapped_edges > v.graph_edges || v.live_edges > v.mapped_edges ||
      (active !== (v.source_state === "CURRENT")) || (active !== (v.live_edges > 0))) return false;
  if (v.retrieved_at !== null && (!time(v.retrieved_at) || Date.parse(v.retrieved_at) > Date.parse(checked_at))) return false;
  if ((v.observed_from === null) !== (v.observed_until === null)) return false;
  if (v.observed_from !== null && (!time(v.observed_from) || !time(v.observed_until) || v.retrieved_at === null ||
      Date.parse(v.observed_from) > Date.parse(v.observed_until) ||
      Date.parse(v.observed_until) > Date.parse(v.retrieved_at) + 30000)) return false;
  if (active && (v.retrieved_at === null || v.observed_from === null ||
      Date.parse(checked_at) >= Date.parse(v.observed_from) + 600000)) return false;
  if (regional) {
    if (!Array.isArray(v.sources) || v.sources.length !== 2 ||
        v.sources.map(s => s?.provider).join(",") !== "kr-gits,kr-ex") return false;
    for (const s of v.sources) {
      if (!s || Object.keys(s).sort().join(",") !== "access,live_edges,observed_from,observed_until,provider" ||
          !Number.isSafeInteger(s.live_edges) || s.live_edges < 0 ||
          s.access !== (s.provider === "kr-gits" ? "ANONYMOUS_WEBSITE" : "OFFICIAL_PUBLIC_DEMO_BROWSER_DOCUMENT")) return false;
      if (s.live_edges === 0) {if (s.observed_from !== null || s.observed_until !== null) return false;}
      else if (!time(s.observed_from) || !time(s.observed_until) || s.observed_from > s.observed_until ||
          v.retrieved_at === null || Date.parse(s.observed_until) > Date.parse(v.retrieved_at) + 30000 ||
          Date.parse(checked_at) >= Date.parse(s.observed_from) + 600000) return false;
    }
    if (v.sources.reduce((n,s) => n+s.live_edges,0) !== v.live_edges) return false;
    if (active) {
      const starts = v.sources.flatMap(s => s.observed_from ? [s.observed_from] : []).sort();
      const ends = v.sources.flatMap(s => s.observed_until ? [s.observed_until] : []).sort();
      if (starts[0] !== v.observed_from || ends.at(-1) !== v.observed_until) return false;
    }
  }
  return true;
}
