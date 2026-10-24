import * as maplibregl from "maplibre-gl";
import "./style.css";
import { RouteClientState } from "./state.js";
import type {
  ClientBootstrap,
  ClientLocation,
} from "../../tools/client_public_types.js";
import type {
  GatewayRequest,
  GatewaySuccess,
} from "../../tools/gateway_public_types.js";
type Language = "en" | "ko";
const copy = {
  en: {
    subtitle: "Seoul route pilot",
    synthetic: "Actual Seoul roads · synthetic traffic",
    heading: "Choose your route",
    preset: "Route preset",
    long: "Teheran-ro · long route",
    short: "Teheran-ro · short live segment",
    custom: "Enter coordinates",
    origin: "Origin",
    destination: "Destination",
    latitude: "Latitude",
    longitude: "Longitude",
    calculate: "Calculate route",
    recalculate: "Recalculate route",
    result: "Route result",
    evidence: "Request and version evidence",
    scope:
      "Local synthetic pilot. Not real-time traffic, driving guidance or independently verified road accuracy.",
    mapHelp:
      "Select coordinates with the form. Pan or zoom the map to explore the original roads.",
    empty: "Choose two locations, then calculate a route.",
    loading:
      "Calculating a route. Changing the locations cancels this request.",
    current: "Route checked against the accepted traffic context.",
    unverified:
      "The route is no longer verified. Recalculate to check the current traffic context.",
    expired:
      "The synthetic traffic context expired. Recalculate to use current defaults.",
    invalid:
      "Enter finite coordinates within the displayed Seoul map area, then calculate again.",
    unavailable:
      "The route service is unavailable. Recalculate after it recovers.",
    timeout: "The route request timed out. Recalculate to try again.",
    mapUnavailable:
      "The map is unavailable in this browser. Route distance, time and freshness remain readable below the form.",
    mapLoading: "Loading the original Seoul roads…",
    applied: "Accepted traffic applied on this route",
    baseline: "Default speeds on this route",
    coverage: "Route live coverage",
    age: "Traffic age · simulation time",
    seconds: "s",
    noAge: "No accepted snapshot · no traffic age",
    clock: "Checked simulation time",
    bootstrapError:
      "The local pilot could not load. Reload this page after the local server recovers.",
    mapOrigin: "Origin marker",
    mapDestination: "Destination marker",
  },
  ko: {
    subtitle: "서울 경로 파일럿",
    synthetic: "실제 서울 도로 · 합성 교통정보",
    heading: "경로를 선택하세요",
    preset: "미리 정한 경로",
    long: "테헤란로 · 장거리 경로",
    short: "테헤란로 · 짧은 교통 적용 구간",
    custom: "좌표 직접 입력",
    origin: "출발지",
    destination: "도착지",
    latitude: "위도",
    longitude: "경도",
    calculate: "경로 계산",
    recalculate: "다시 계산",
    result: "경로 결과",
    evidence: "요청과 버전 근거",
    scope:
      "로컬 합성 파일럿입니다. 실시간 교통·주행 안내·독립 검증한 도로 정확도 근거가 아닙니다.",
    mapHelp:
      "입력란에서 좌표를 선택하세요. 지도를 이동하거나 확대해 원래 도로를 살펴볼 수 있습니다.",
    empty: "두 위치를 선택한 뒤 경로를 계산하세요.",
    loading: "경로를 계산하고 있습니다. 위치를 바꾸면 이 요청을 취소합니다.",
    current: "수용한 교통 문맥으로 확인한 경로입니다.",
    unverified:
      "경로의 유효성을 더 이상 확인할 수 없습니다. 다시 계산해 현재 교통 문맥을 확인하세요.",
    expired:
      "합성 교통 문맥의 기한이 지났습니다. 다시 계산하면 현재 기본 속도를 사용합니다.",
    invalid:
      "표시된 서울 지도 범위 안의 유한한 좌표를 입력한 뒤 다시 계산하세요.",
    unavailable:
      "경로 서비스를 사용할 수 없습니다. 서비스가 복구되면 다시 계산하세요.",
    timeout: "경로 요청 시간이 초과됐습니다. 다시 계산해 요청을 재시도하세요.",
    mapUnavailable:
      "이 브라우저에서 지도를 사용할 수 없습니다. 입력 아래에서 거리·시간·유효성을 확인할 수 있습니다.",
    mapLoading: "원래 서울 도로를 불러오고 있습니다…",
    applied: "이 경로에 수용한 교통정보 적용",
    baseline: "이 경로에 기본 속도 적용",
    coverage: "경로 실시간 적용률",
    age: "교통정보 나이 · 모의 시각 기준",
    seconds: "초",
    noAge: "수용한 자료 없음 · 교통정보 나이 없음",
    clock: "확인한 모의 시각",
    bootstrapError:
      "로컬 파일럿을 불러오지 못했습니다. 로컬 서버가 복구되면 페이지를 새로 고침하세요.",
    mapOrigin: "출발지 표시",
    mapDestination: "도착지 표시",
  },
} as const;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element)
    throw new Error("Missing client element / 화면 요소 누락: " + id);
  return element as T;
};
let lang: Language = "en";
try {
  if (localStorage.getItem("routelens-language") === "ko") lang = "ko";
} catch {}
const state = new RouteClientState();
let bootstrap: ClientBootstrap | undefined,
  map: maplibregl.Map | undefined,
  mapReady = false,
  mapUnavailable = false,
  routeAbort: AbortController | undefined,
  contextAbort: AbortController | undefined,
  polling = false,
  lastRequest: GatewayRequest | undefined;
let markers: maplibregl.Marker[] = [];
let renderedGeometry: unknown = null;
function renderEvidence(): void {
  $("route-evidence").textContent = JSON.stringify(
    {
      request: lastRequest ?? null,
      response: state.route,
      authority: state.authority,
      state: state.phase,
      reason: state.reason,
      map_source_geometry: renderedGeometry,
    },
    null,
    2,
  );
}
const emptyLine = () => ({ type: "FeatureCollection" as const, features: [] });
function locations(): {
  origin: ClientLocation;
  destination: ClientLocation;
} | null {
  const result = {
    origin: { latitude: 0, longitude: 0 },
    destination: { latitude: 0, longitude: 0 },
  };
  for (const endpoint of ["origin", "destination"] as const)
    for (const axis of ["latitude", "longitude"] as const) {
      const field = $<HTMLInputElement>(endpoint + "-" + axis);
      if (!field.value.trim()) return null;
      const value = Number(field.value);
      if (!Number.isFinite(value)) return null;
      result[endpoint][axis] = value;
    }
  if (!bootstrap) return null;
  const [west, south, east, north] = bootstrap.bounds;
  return [result.origin, result.destination].every(
    (p) =>
      p.longitude >= west &&
      p.longitude <= east &&
      p.latitude >= south &&
      p.latitude <= north,
  )
    ? result
    : null;
}
function updateMarkers(): void {
  if (!mapReady || !map) return;
  markers.forEach((m) => m.remove());
  markers = [];
  const chosen = locations();
  if (!chosen) return;
  for (const [index, p] of [chosen.origin, chosen.destination].entries()) {
    const el = document.createElement("div");
    el.className = "location-marker" + (index ? " destination" : "");
    el.textContent = index ? "B" : "A";
    el.setAttribute(
      "aria-label",
      copy[lang][index ? "mapDestination" : "mapOrigin"],
    );
    markers.push(
      new maplibregl.Marker({ element: el })
        .setLngLat([p.longitude, p.latitude])
        .addTo(map),
    );
  }
}
function syncMap(): void {
  if (!mapReady || !map) return;
  const source = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const route = state.route;
  map.setLayoutProperty("route-line", "visibility", route ? "visible" : "none");
  if (!route) {
    renderedGeometry = null;
    $("map").dataset.renderedRouteRequestId = "";
  }
  source.setData(
    route
      ? { type: "Feature", properties: {}, geometry: route.geometry }
      : emptyLine(),
  );
  map.setPaintProperty(
    "route-line",
    "line-color",
    route?.traffic_mode === "LIVE_MIXED" ? "#CC481D" : "#18816B",
  );
  $("map").dataset.routeRequestId = route?.request_id ?? "";
  $("map").dataset.activeRoute = route ? "true" : "false";
  if (route) {
    const id = route.request_id;
    map.once("idle", () => {
      if (state.route?.request_id !== id) return;
      const data = source.serialize().data;
      if (typeof data !== "string" && data.type === "Feature")
        renderedGeometry = data.geometry;
      $("map").dataset.renderedRouteRequestId = id;
      renderEvidence();
    });
  }
}
function mapLanguage(): void {
  for (const [selector, en, ko] of [
    [".maplibregl-ctrl-zoom-in", "Zoom in", "지도 확대"],
    [".maplibregl-ctrl-zoom-out", "Zoom out", "지도 축소"],
  ]) {
    const button = document.querySelector<HTMLButtonElement>(selector!);
    if (button) {
      button.title = lang === "en" ? en! : ko!;
      button.setAttribute("aria-label", button.title);
    }
  }
  map
    ?.getCanvas()
    .setAttribute(
      "aria-label",
      lang === "en" ? "Interactive Seoul road map" : "서울 도로 조작 지도",
    );
}
function render(): void {
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as keyof typeof copy.en;
    if (key in copy[lang]) el.textContent = copy[lang][key];
  });
  const language = $("language");
  language.textContent = lang === "en" ? "한국어" : "English";
  language.setAttribute(
    "aria-label",
    lang === "en"
      ? "Switch to Korean / 한국어로 전환"
      : "Switch to English / 영어로 전환",
  );
  $("result").dataset.state = state.phase;
  $("result").dataset.requestId = state.route?.request_id ?? "";
  $("route-status").textContent = copy[lang][state.phase];
  $("recalculate").hidden = ["empty", "loading", "current"].includes(
    state.phase,
  );
  const button = $("request-route");
  button.setAttribute("aria-busy", String(state.phase === "loading"));
  const summary = $("route-summary");
  summary.replaceChildren();
  summary.hidden = !state.route;
  if (state.route) {
    const r = state.route,
      add = (text: string, className?: string) => {
        const p = document.createElement("p");
        p.textContent = text;
        if (className) p.className = className;
        summary.append(p);
        return p;
      };
    add(
      (r.distance_m / 1000).toFixed(2) +
        " km · " +
        (r.duration_s / 60).toFixed(1) +
        (lang === "en" ? " min" : "분"),
      "route-measure",
    );
    const mode = add(
      copy[lang][r.traffic_mode === "LIVE_MIXED" ? "applied" : "baseline"],
      "mode",
    );
    mode.dataset.mode = r.traffic_mode;
    add(
      copy[lang].coverage +
        ": " +
        (r.live_coverage_ratio * 100).toFixed(2) +
        "%",
    );
    if (r.traffic_published_at !== null)
      add(
        copy[lang].age +
          ": " +
          Math.max(
            0,
            (Date.parse((state.authority ?? r).checked_at_event_time) -
              Date.parse(r.traffic_published_at)) /
              1000,
          ).toFixed(1) +
          " " +
          copy[lang].seconds,
      );
    else add(copy[lang].noAge);
    add(copy[lang].clock + ": " + (state.authority ?? r).checked_at_event_time);
    r.warnings.forEach((w) =>
      add(w[lang === "en" ? "message_en" : "message_ko"]),
    );
  }
  renderEvidence();
  $("map-status").textContent = mapUnavailable
    ? copy[lang].mapUnavailable
    : !mapReady
      ? copy[lang].mapLoading
      : "";
  syncMap();
  updateMarkers();
  mapLanguage();
}
function invalidate(): void {
  routeAbort?.abort();
  state.invalidate();
  lastRequest = undefined;
  render();
}
function preset(): void {
  if (!bootstrap) return;
  const value = $<HTMLSelectElement>("preset").value;
  if (value !== "long" && value !== "short") return;
  const selected = bootstrap.presets[value];
  for (const endpoint of ["origin", "destination"] as const)
    for (const axis of ["latitude", "longitude"] as const)
      $<HTMLInputElement>(endpoint + "-" + axis).value = String(
        selected[endpoint][axis],
      );
  invalidate();
}
async function pollContext(): Promise<void> {
  if (polling || document.hidden) return;
  polling = true;
  contextAbort = new AbortController();
  const timer = setTimeout(() => contextAbort?.abort(), 3000);
  try {
    const response = await fetch("/api/route-context", {
      credentials: "same-origin",
      signal: contextAbort.signal,
      redirect: "error",
    });
    if (!response.ok)
      throw new Error("Freshness unavailable / 신선도 조회 불가");
    state.context(await response.json());
  } catch {
    state.freshnessFailed();
  } finally {
    clearTimeout(timer);
    polling = false;
    render();
  }
}
async function submit(): Promise<void> {
  const chosen = locations();
  routeAbort?.abort();
  if (!chosen) {
    state.invalidate("invalid", "INVALID_INPUT");
    render();
    return;
  }
  const request: GatewayRequest = {
    schema_version: "0.1",
    request_id: "browser-" + crypto.randomUUID(),
    ...chosen,
    profile: "car",
    traffic_policy: "prefer_live",
  };
  lastRequest = request;
  const generation = state.begin(request.request_id),
    abort = new AbortController();
  routeAbort = abort;
  render();
  const timer = setTimeout(() => abort.abort(), 12500);
  try {
    const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(request),
        signal: abort.signal,
        redirect: "error",
      }),
      body = await response.json();
    if (!response.ok) {
      state.fail(
        generation,
        typeof body.reason === "string" ? body.reason : "NO_HEALTHY_NODE",
      );
    } else if (
      state.result(generation, request.request_id, body as GatewaySuccess)
    ) {
      if (mapReady && map) {
        const coords = body.geometry.coordinates as number[][];
        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((p) => bounds.extend([p[0]!, p[1]!]));
        map.fitBounds(bounds, {
          padding: 55,
          maxZoom: 18,
          duration: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : 350,
        });
      }
    }
  } catch {
    state.fail(
      generation,
      abort.signal.aborted ? "DEADLINE_EXCEEDED" : "NO_HEALTHY_NODE",
    );
  } finally {
    clearTimeout(timer);
    render();
  }
}
async function start(): Promise<void> {
  render();
  try {
    const response = await fetch("/api/bootstrap", {
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Bootstrap unavailable");
    bootstrap = (await response.json()) as ClientBootstrap;
    if (
      bootstrap.source_class !== "SYNTHETIC" ||
      bootstrap.clock_basis !== "SIMULATION_EVENT_TIME"
    )
      throw new Error("Unexpected bootstrap");
    for (const endpoint of ["origin", "destination"])
      for (const axis of ["latitude", "longitude"]) {
        const field = $<HTMLInputElement>(endpoint + "-" + axis),
          bounds = bootstrap.bounds;
        field.min = String(axis === "latitude" ? bounds[1] : bounds[0]);
        field.max = String(axis === "latitude" ? bounds[3] : bounds[2]);
      }
    preset();
    try {
      maplibregl.setWorkerUrl("/maplibre-worker.js");
      map = new maplibregl.Map({
        container: "map",
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            roads: { type: "geojson", data: bootstrap.roads },
            route: { type: "geojson", data: emptyLine() },
          },
          layers: [
            {
              id: "paper",
              type: "background",
              paint: { "background-color": "#F5F7F9" },
            },
            {
              id: "roads",
              type: "line",
              source: "roads",
              paint: { "line-color": "#CAD4DF", "line-width": 2 },
            },
            {
              id: "route-line",
              type: "line",
              source: "route",
              paint: { "line-color": "#18816B", "line-width": 6 },
              layout: { "line-cap": "round", "line-join": "round" },
            },
          ],
        },
        bounds: [
          [bootstrap.bounds[0], bootstrap.bounds[1]],
          [bootstrap.bounds[2], bootstrap.bounds[3]],
        ],
        fitBoundsOptions: { padding: 35, duration: 0 },
        fadeDuration: 0,
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.once("load", () => {
        mapReady = true;
        $("map").dataset.ready = "true";
        render();
      });
      map.on("error", () => {
        mapUnavailable = true;
        render();
      });
    } catch {
      mapUnavailable = true;
      render();
    }
    await pollContext();
    setInterval(() => void pollContext(), 1000);
  } catch {
    state.invalidate("unavailable", "BOOTSTRAP_UNAVAILABLE");
    render();
    $("route-status").textContent = copy[lang].bootstrapError;
  }
}
$<HTMLFormElement>("route-form").noValidate = true;
$("route-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void submit();
});
$("recalculate").addEventListener("click", () => void submit());
$("preset").addEventListener("change", preset);
for (const endpoint of ["origin", "destination"])
  for (const axis of ["latitude", "longitude"])
    $(endpoint + "-" + axis).addEventListener("input", () => {
      $<HTMLSelectElement>("preset").value = "custom";
      invalidate();
    });
$("language").addEventListener("click", () => {
  lang = lang === "en" ? "ko" : "en";
  try {
    localStorage.setItem("routelens-language", lang);
  } catch {}
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    contextAbort?.abort();
    return;
  }
  if (!document.hidden) {
    state.freshnessFailed();
    render();
    void pollContext();
  }
});
void start();
