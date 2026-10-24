/** Local session and same-origin forwarding; no pilot/test validators in HTTP validation.
 * 로컬 세션·같은 출처 전달이며 HTTP 검증에 시험 검증기를 가져오지 않습니다. */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { parseJson, record } from "./shared.js";
import { readNodeBody } from "./node_service.js";
import {
  gatewayFailure,
  validateGatewayRequest,
  GatewayError,
} from "./gateway_controller.js";
import { durableNodeJSON } from "./node_engine.js";
import type { ClientServerConfig } from "./client_types.js";
import type { GatewayRouteContext, GatewaySuccess } from "./gateway_types.js";
export const CLIENT_COOKIE = "routelens_session";
const freshnessKeys = [
  "high_water",
  "checked_at_event_time",
  "traffic_published_at",
  "traffic_valid_until",
  "source_class",
  "clock_basis",
];
const routeKeys = [
  "request_id",
  "request_sha256",
  "graph_id",
  "snapshot_id",
  "sequence",
  "generation_id",
  "traffic_sha256",
  "engine_version",
  "image_id",
  "costing_config_id",
  "node_id",
  "calculated_at",
  "traffic_mode",
  "distance_m",
  "duration_s",
  "geometry",
  "live_coverage_ratio",
  "warnings",
  ...freshnessKeys,
];
function freshness(raw: Record<string, unknown>): void {
  if (
    !Number.isSafeInteger(raw.high_water) ||
    Number(raw.high_water) < 0 ||
    typeof raw.checked_at_event_time !== "string" ||
    !Number.isFinite(Date.parse(raw.checked_at_event_time)) ||
    raw.source_class !== "SYNTHETIC" ||
    raw.clock_basis !== "SIMULATION_EVENT_TIME"
  )
    throw Error("freshness");
  for (const f of ["traffic_published_at", "traffic_valid_until"])
    if (
      raw[f] !== null &&
      (typeof raw[f] !== "string" ||
        !Number.isFinite(Date.parse(raw[f] as string)))
    )
      throw Error("traffic time");
}
export function validateClientContext(
  raw: unknown,
  graph: string,
): asserts raw is GatewayRouteContext {
  record(raw, "context", [
    "schema_version",
    "graph_id",
    "traffic_snapshot_id",
    "sequence",
    ...freshnessKeys,
  ]);
  freshness(raw);
  if (raw.schema_version !== "0.1" || raw.graph_id !== graph)
    throw Error("context identity");
  if (raw.traffic_snapshot_id === null) {
    if (
      raw.sequence !== null ||
      raw.traffic_published_at !== null ||
      raw.traffic_valid_until !== null
    )
      throw Error("baseline context");
  } else if (
    typeof raw.traffic_snapshot_id !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.traffic_snapshot_id) ||
    !Number.isSafeInteger(raw.sequence) ||
    Number(raw.sequence) < 1 ||
    raw.sequence !== raw.high_water ||
    raw.traffic_published_at === null ||
    raw.traffic_valid_until === null ||
    Date.parse(raw.checked_at_event_time as string) >=
      Date.parse(raw.traffic_valid_until as string)
  )
    throw Error("live context");
}
export function validateClientRoute(
  raw: unknown,
  graph: string,
): asserts raw is GatewaySuccess {
  record(raw, "route", routeKeys);
  freshness(raw);
  if (
    raw.graph_id !== graph ||
    typeof raw.request_id !== "string" ||
    typeof raw.request_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.request_sha256) ||
    !Number.isFinite(raw.distance_m) ||
    Number(raw.distance_m) < 0 ||
    !Number.isFinite(raw.duration_s) ||
    Number(raw.duration_s) < 0 ||
    !Number.isFinite(raw.live_coverage_ratio) ||
    Number(raw.live_coverage_ratio) < 0 ||
    Number(raw.live_coverage_ratio) > 1 ||
    !Array.isArray(raw.warnings)
  )
    throw Error("route summary");
  record(raw.geometry, "geometry", ["type", "coordinates"]);
  if (
    raw.geometry.type !== "LineString" ||
    !Array.isArray(raw.geometry.coordinates) ||
    raw.geometry.coordinates.length < 2
  )
    throw Error("geometry");
  for (const p of raw.geometry.coordinates)
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      throw Error("coordinate");
  validateClientContext(
    {
      schema_version: "0.1",
      graph_id: graph,
      traffic_snapshot_id: raw.snapshot_id,
      sequence: raw.sequence,
      ...Object.fromEntries(freshnessKeys.map((k) => [k, raw[k]])),
    },
    graph,
  );
  for (const w of raw.warnings) {
    record(w, "warning", ["code", "message_en", "message_ko"]);
    if (
      ![w.code, w.message_en, w.message_ko].every(
        (x) => typeof x === "string" && x,
      )
    )
      throw Error("warning");
  }
}
function same(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function hasSession(req: IncomingMessage, session: string): boolean {
  const cookies =
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(CLIENT_COOKIE + "=")) ?? [];
  return (
    cookies.length === 1 &&
    same(cookies[0]!.slice(CLIENT_COOKIE.length + 1), session)
  );
}
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function respond(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}
export interface RunningClientServer {
  origin: string;
  port: number;
  close(): Promise<void>;
}
export async function startClientServer(
  config: ClientServerConfig,
): Promise<RunningClientServer> {
  const target = new URL(config.gateway_origin);
  if (
    config.gateway_origin !== `http://127.0.0.1:${target.port}` ||
    target.protocol !== "http:" ||
    !target.port ||
    !config.gateway_token ||
    /[\r\n]/.test(config.gateway_token)
  )
    throw Error("Invalid private gateway origin / 비공개 중계 주소 오류");
  const assets = realpathSync(config.assets_directory),
    session = randomBytes(32).toString("hex"),
    events: unknown[] = [];
  let origin = "",
    closing = false;
  if (config.evidence_directory)
    mkdirSync(config.evidence_directory, { recursive: true });
  const active = new Set<AbortController>();
  const log = (entry: unknown) => {
    events.push(entry);
    if (config.evidence_directory)
      durableNodeJSON(join(config.evidence_directory, "http.json"), events);
  };
  const server = createServer((req, res) => {
    const started = performance.now();
    void (async () => {
      res.setHeader("content-security-policy", csp);
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "no-referrer");
      if (closing || req.headers.host !== origin.slice("http://".length)) {
        req.resume();
        respond(res, 403, gatewayFailure("AUTH_REQUIRED"));
        return;
      }
      const pathname = req.url ?? "";
      if (pathname.startsWith("/api/")) {
        if (
          !hasSession(req, session) ||
          req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin !== undefined && req.headers.origin !== origin) ||
          (req.method === "POST" && req.headers.origin !== origin)
        ) {
          req.resume();
          respond(res, 403, gatewayFailure("AUTH_REQUIRED"));
          return;
        }
        if (pathname === "/api/bootstrap" && req.method === "GET") {
          respond(res, 200, config.bootstrap);
          return;
        }
        const route = pathname === "/api/routes" && req.method === "POST",
          context = pathname === "/api/route-context" && req.method === "GET";
        if (!route && !context) {
          req.resume();
          respond(res, 404, gatewayFailure("INVALID_INPUT"));
          return;
        }
        const abort = new AbortController(),
          timeout = setTimeout(() => abort.abort(), route ? 12500 : 2500),
          disconnect = () => {
            if (!res.writableEnded) abort.abort();
          };
        active.add(abort);
        res.once("close", disconnect);
        req.once("aborted", disconnect);
        let input: unknown;
        let acceptedInput = false;
        try {
          if (route) {
            input = await readNodeBody(req, started + 12000);
            validateGatewayRequest(input);
            const [west, south, east, north] = config.bootstrap.bounds;
            for (const point of [input.origin, input.destination])
              if (
                point.longitude < west ||
                point.longitude > east ||
                point.latitude < south ||
                point.latitude > north
              )
                throw new GatewayError("INVALID_INPUT");
          }
          acceptedInput = route;
          if (abort.signal.aborted) throw Error("cancelled");
          const upstream = await fetch(
            config.gateway_origin +
              (route ? "/v1/routes" : "/v1/route-context"),
            {
              method: route ? "POST" : "GET",
              headers: {
                authorization: "Bearer " + config.gateway_token,
                "content-type": "application/json",
              },
              ...(route ? { body: JSON.stringify(input) } : {}),
              redirect: "error",
              signal: abort.signal,
            },
          );
          if (
            upstream.headers.get("content-type")?.split(";")[0]?.trim() !==
              "application/json" ||
            !upstream.body
          ) {
            await upstream.body?.cancel();
            throw Error("Invalid gateway content / 중계 본문 오류");
          }
          const reader = upstream.body.getReader(),
            chunks: Uint8Array[] = [];
          let length = 0;
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              length += part.value.byteLength;
              if (length > 2 * 1024 * 1024) {
                await reader.cancel();
                throw Error("Gateway body too large / 중계 본문 초과");
              }
              chunks.push(part.value);
            }
          } finally {
            reader.releaseLock();
          }
          const body = parseJson(Buffer.concat(chunks));
          if (upstream.status === 200) {
            if (route) validateClientRoute(body, config.bootstrap.graph_id);
            else validateClientContext(body, config.bootstrap.graph_id);
          } else {
            record(body, "failure", [
              "code",
              "reason",
              "message_en",
              "message_ko",
            ]);
            if (
              body.code !== "ERROR" ||
              ![401, 409, 422, 429, 503, 504].includes(upstream.status)
            )
              throw Error("Invalid gateway failure / 중계 실패 형식 오류");
          }
          log({
            path: pathname,
            request: acceptedInput ? input : null,
            status: upstream.status,
            body,
            elapsed_ms: performance.now() - started,
          });
          respond(res, upstream.status, body);
        } catch (e) {
          const reason = abort.signal.aborted
            ? "DEADLINE_EXCEEDED"
            : e instanceof GatewayError
              ? e.reason
              : route &&
                  e &&
                  typeof e === "object" &&
                  "reason" in e &&
                  ["INVALID_REQUEST", "BODY_TOO_LARGE"].includes(
                    String(e.reason),
                  )
                ? "INVALID_INPUT"
                : "NO_HEALTHY_NODE";
          const status =
            reason === "DEADLINE_EXCEEDED"
              ? 504
              : reason === "INVALID_INPUT" || reason === "UNSUPPORTED_POLICY"
                ? 422
                : 503;
          log({
            path: pathname,
            request: acceptedInput ? input : null,
            status,
            reason,
            elapsed_ms: performance.now() - started,
          });
          const failure = gatewayFailure(reason);
          if (reason === "INVALID_INPUT") {
            failure.message_en =
              "Enter two finite locations inside the displayed Seoul pilot map bounds.";
            failure.message_ko =
              "표시된 서울 파일럿 지도 범위 안의 유효한 두 위치를 입력하세요.";
          }
          respond(res, status, failure);
        } finally {
          clearTimeout(timeout);
          res.off("close", disconnect);
          req.off("aborted", disconnect);
          active.delete(abort);
        }
        return;
      }
      const files: Record<string, [string, string]> = {
        "/": ["index.html", "text/html; charset=utf-8"],
        "/client.js": ["client.js", "application/javascript; charset=utf-8"],
        "/client.css": ["client.css", "text/css; charset=utf-8"],
        "/maplibre-worker.js": [
          "maplibre-worker.js",
          "application/javascript; charset=utf-8",
        ],
      };
      const file = files[pathname];
      if (req.method !== "GET" || !file) {
        req.resume();
        respond(res, 404, gatewayFailure("INVALID_INPUT"));
        return;
      }
      const name = join(assets, file[0]),
        stat = lstatSync(name);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 8 * 1024 * 1024 ||
        !realpathSync(name).startsWith(assets + "/")
      )
        throw Error("Static asset rejected / 정적 자료 거부");
      if (pathname === "/")
        res.setHeader(
          "set-cookie",
          `${CLIENT_COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`,
        );
      res.writeHead(200, {
        "content-type": file[1],
        "cache-control": "no-store",
      });
      res.end(readFileSync(name));
    })().catch(() => respond(res, 503, gatewayFailure("NO_HEALTHY_NODE")));
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 13000;
  try {
    await new Promise<void>((done, fail) => {
      server.once("error", fail);
      server.listen(config.port ?? 0, "127.0.0.1", () => {
        server.off("error", fail);
        done();
      });
    });
  } catch (e) {
    server.close();
    throw e;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Client listener missing / 화면 수신 소켓 없음");
  origin = `http://127.0.0.1:${address.port}`;
  let closed: Promise<void> | undefined;
  return {
    origin,
    port: address.port,
    close: () =>
      (closed ??= (async () => {
        closing = true;
        for (const a of active) a.abort();
        const done = new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
        server.closeAllConnections();
        await done;
      })()),
  };
}
