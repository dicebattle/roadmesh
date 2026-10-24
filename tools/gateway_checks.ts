/** Fresh actual gateway integration / 새 실제 경로 중계 통합. */
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { generateKeyPair, exportJWK } from "jose";
import {
  canonical,
  sha256,
  isMain,
  consoleIO,
  type ConsoleIO,
} from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";
import { evidenceHashes } from "./map_matcher.js";
import { prepareNodeSource } from "./node_checks.js";
import { geodesicSphere } from "./geodesy.js";
import { TRAFFIC_START } from "./traffic_scenario.js";
import { PublicationConsumer } from "./publication_consumer.js";
import {
  OwnedIngestionRuntime,
  pause,
  portIsOpen,
  type OwnedIngestionProcess,
} from "./ingestion_runtime.js";
import { assertNoSensitiveDiagnostics } from "./ingestion_checks.js";
import type {
  ConsumerConfig,
  TrustRoot,
  PublicationSigner,
} from "./publication_types.js";
import type { RoutingNodeConfig, NodeStatus, NodePhase } from "./node_types.js";
import type {
  GatewayConfig,
  GatewayRequest,
  GatewaySuccess,
  GatewayPhase,
  GatewayStatus,
} from "./gateway_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
export const GATEWAY_CASE_IDS = [
  "fresh-source",
  "authenticated-api",
  "invalid-input",
  "body-limit",
  "unsupported-policy",
  "configured-origins",
  "independent-consumer",
  "baseline",
  "live-primary",
  "route-local-coverage",
  "primary-kill-failover",
  "primary-unavailable-retry",
  "wrong-generation-rejected",
  "wrong-request-rejected",
  "malformed-route-rejected",
  "oversized-response-rejected",
  "redirect-rejected",
  "stale-node-excluded",
  "no-matching-node",
  "both-down",
  "retry-once",
  "shared-deadline",
  "propagated-node-deadline",
  "client-disconnect",
  "admission-eight",
  "result-version-change",
  "exact-expiry",
  "non-live-correction",
  "publisher-outage",
  "store-outage",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p10-" + id);
export function requireGatewayCases(assertions: SimulationAssertion[]): void {
  const ids = assertions.map((a) => a.assertion_id);
  if (
    ids.length !== GATEWAY_CASE_IDS.length ||
    new Set(ids).size !== ids.length ||
    GATEWAY_CASE_IDS.some((id) => !ids.includes(id)) ||
    assertions.some((a) => a.status !== "PASS")
  )
    throw new Error("P10 required cases incomplete / P10 필수 검사 미완료");
}
export function gatewayFailureMatches(
  reply: { status: number; body: unknown },
  status: number,
  reason: string,
): boolean {
  if (!reply.body || typeof reply.body !== "object") return false;
  const body = reply.body as Record<string, unknown>;
  return (
    reply.status === status &&
    body.reason === reason &&
    body.code === "ERROR" &&
    typeof body.message_en === "string" &&
    typeof body.message_ko === "string" &&
    ![
      "geometry",
      "distance_m",
      "duration_s",
      "engine_result",
      "provenance",
      "snapshot_id",
    ].some((key) => key in body)
  );
}
export interface GatewayReport {
  assertions_passed: number;
  assertions_total: number;
  cleanup_verified: boolean;
  routes: Array<{
    label: string;
    request: GatewayRequest;
    response: GatewaySuccess;
    evidence_path: string;
  }>;
  events: Array<{
    event_id: string;
    recorded_at_utc: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }>;
  cases: Array<{
    case_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }>;
  evidence: Array<{ name_en: string; name_ko: string; path: string }>;
}
const at = (ms: number) =>
  new Date(Date.parse(TRAFFIC_START) + ms).toISOString();
const write = (root: string, file: string, data: unknown) =>
  writeFileSync(join(root, file), JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
type HttpReply = {
  status: number;
  headers: Record<string, string>;
  body: any;
  elapsed_ms: number;
};
type PeerMode =
  | "normal"
  | "route-unavailable"
  | "unavailable"
  | "wrong-generation"
  | "wrong-request"
  | "malformed"
  | "oversized"
  | "redirect"
  | "stale"
  | "slow";
export async function runGatewayChecks(
  graphDirectory: string,
  outputPath: string,
): Promise<{ gateway: GatewayReport; assertions: SimulationAssertion[] }> {
  const output = resolve(outputPath);
  mkdirSync(output);
  for (const dir of [
    "public",
    "requests",
    "status",
    "readbacks",
    "negative",
    "nodes",
    "gateway",
    "proxies",
  ])
    mkdirSync(join(output, dir));
  const source = sourceIdentity(),
    fingerprint = implementationFingerprint(),
    runtime = new OwnedIngestionRuntime(join(output, "runtime"), output);
  const stores: Array<{ close(): Promise<void> }> = [],
    servers: Server[] = [],
    secrets: string[] = [],
    ports: number[] = [],
    assertions: SimulationAssertion[] = [],
    events: GatewayReport["events"] = [],
    routes: GatewayReport["routes"] = [];
  const peerRecords: Array<any> = [],
    publisherRequests: unknown[] = [];
  let fixture: Awaited<ReturnType<typeof prepareNodeSource>> | undefined,
    failure: unknown,
    cleanup = false;
  const check = (
    id: string,
    ok: boolean,
    en: string,
    ko: string,
    actual: unknown,
    evidence_path: string,
  ) => {
    assertions.push({
      assertion_id: "p10-" + id,
      status: ok ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected: true,
      actual,
      evidence_path,
    });
    write(output, "assertions-current.json.tmp", assertions);
    renameSync(
      join(output, "assertions-current.json.tmp"),
      join(output, "assertions-current.json"),
    );
    if (!ok) throw new Error("P10 criterion failed / P10 기준 미달: " + id);
  };
  const record = (id: string, en: string, ko: string, path: string) => {
    events.push({
      event_id: id,
      recorded_at_utc: new Date().toISOString(),
      message_en: en,
      message_ko: ko,
      evidence_path: path,
    });
    writeFileSync(
      join(output, "events.json"),
      JSON.stringify(events, null, 2) + "\n",
    );
  };
  const control = async (
    child: OwnedIngestionProcess,
    body: Record<string, unknown>,
  ) => {
    const control_id = randomUUID();
    child.send({ ...body, control_id });
    const result = await child.message(
      (m) => m.type === "CONTROL_RESULT" && m.control_id === control_id,
      180000,
    );
    if (result.code === "REJECTED")
      throw new Error(
        "Private control rejected / 비공개 제어 거부: " +
          JSON.stringify(result),
      );
    return result;
  };
  const phase = (
    child: OwnedIngestionProcess,
    name: string,
    id?: string,
    cursor = 0,
  ) =>
    child.message(
      (m) =>
        child.messages.indexOf(m) >= cursor &&
        m.type === "PHASE" &&
        m.phase === name &&
        (id === undefined || m.request_id === id),
      180000,
    );
  const listen = async (server: Server) => {
    servers.push(server);
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Owned HTTP address missing / 소유 HTTP 주소 없음");
    ports.push(address.port);
    return "http://127.0.0.1:" + address.port;
  };
  try {
    fixture = await prepareNodeSource(graphDirectory, output, runtime, stores);
    const f = fixture;
    check(
      "fresh-source",
      true,
      "Fresh fifteen Seoul trips pass actual HTTP, P05 matching and P06 fixed criteria.",
      "새 서울15여행이 실제HTTP·P05매칭·P06고정기준을 통과합니다.",
      { trips: 15, targets: 3 },
      "source/candidate.json",
    );
    const target = f.scene.targets[1]!,
      edge = f.graph.edges.find(
        (e) => e.edge_id === target.edge_id && e.forward === target.forward,
      )!;
    const from = geodesicSphere.position(
        edge.directed_geometry,
        target.distance_m * 0.35,
      ),
      to = geodesicSphere.position(
        edge.directed_geometry,
        target.distance_m * 0.65,
      );
    const short = {
      origin: { longitude: from[0]!, latitude: from[1]! },
      destination: { longitude: to[0]!, latitude: to[1]! },
    };
    const long = {
      origin: { longitude: 127.029, latitude: 37.4984 },
      destination: { longitude: 127.049, latitude: 37.5045 },
    };
    write(output, "source/route-inputs.json", {
      selected_before_native_routing: true,
      short,
      long,
      target,
      original_geometry: edge.directed_geometry,
      source_fraction: 0.35,
      target_fraction: 0.65,
      expected_partial_distance_m: target.distance_m * 0.3,
    });
    const roots: TrustRoot[] = [],
      signers: PublicationSigner[] = [];
    for (const kid of ["gateway-key-a", "gateway-key-b", "gateway-key-c"]) {
      const keys = await generateKeyPair("EdDSA", { extractable: true }),
        private_jwk = await exportJWK(keys.privateKey),
        public_jwk = await exportJWK(keys.publicKey);
      secrets.push(private_jwk.d!);
      signers.push({ kid, private_jwk });
      roots.push({
        kid,
        public_jwk,
        publisher_id: f.publication.publisher_id,
        simulation_namespace: f.config.namespace,
        region_id: "seoul-pilot-corridors-v1",
        allowed_graph_ids: [f.graph.graphId],
        source_class: "SYNTHETIC",
        valid_from: at(-60000),
        valid_until: at(3600000),
        revoked: false,
      });
    }
    write(output, "public/trust-roots.json", roots);
    const publisherChild = runtime.spawn(
      "p10-publication-service",
      "publication_service",
      { publication: f.publication, port: 0 },
    );
    const pubReady = await publisherChild.message(
      (m) => m.type === "READY" && m.kind === "publication-service",
    );
    const publicationOrigin = "http://127.0.0.1:" + pubReady.port;
    ports.push(Number(pubReady.port));
    let publisherOffline = false;
    const pubProxy = await listen(
      createServer((req, res) => {
        void (async () => {
          if (publisherOffline) {
            publisherRequests.push({
              path: req.url,
              status: 502,
              configured_http_502: true,
            });
            res.writeHead(502);
            res.end("Configured publisher outage / 설정된 게시 접속 장애");
            return;
          }
          const response = await fetch(publicationOrigin + req.url, {
              redirect: "error",
              signal: AbortSignal.timeout(5000),
            }),
            bytes = Buffer.from(await response.arrayBuffer());
          publisherRequests.push({
            path: req.url,
            status: response.status,
            sha256: sha256(bytes),
          });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(bytes);
        })().catch(() => {
          res.writeHead(502);
          res.end();
        });
      }),
    );
    const consumer = (id: string): ConsumerConfig => ({
      store: f.config,
      consumer_id: id,
      publisher_id: f.publication.publisher_id,
      region_id: "seoul-pilot-corridors-v1",
      allowed_graph_ids: [f.graph.graphId],
      catalogs: [{ graph_id: f.graph.graphId, edges: f.scene.catalog }],
      trust_roots: roots,
      origin: pubProxy,
    });
    const consumerIds = ["p10-node-a", "p10-node-b", "p10-gateway"];
    const consumers = consumerIds.map(
      (id) => new PublicationConsumer(consumer(id)),
    );
    for (const c of consumers) {
      stores.push(c);
      await c.initialize();
    }
    const pool = new pg.Pool({ connectionString: runtime.databaseUrl, max: 1 });
    stores.push({ close: () => pool.end() });
    const sql = async (label: string) => {
      const result = await pool.query(
        "SELECT namespace,consumer_id,publisher_id,region_id,high_water,last_snapshot_id,octet_length(artifact) AS artifact_bytes FROM routelens_p07.consumer_states WHERE namespace=$1 ORDER BY consumer_id",
        [f.config.namespace],
      );
      write(output, "readbacks/sql-" + label + ".json", {
        query:
          "SELECT namespace,consumer_id,publisher_id,region_id,high_water,last_snapshot_id,octet_length(artifact) FROM routelens_p07.consumer_states WHERE namespace=$1 ORDER BY consumer_id",
        namespace: f.config.namespace,
        rows: result.rows,
      });
      return result.rows;
    };
    const publish = async (index: number) => {
      const child = runtime.spawn(
        "p10-publisher-" + runtime.processes.length,
        "publication_worker",
        {
          publication: f.publication,
          signer: signers[index]!,
          window_start: at(180000),
          event_time_utc: f.now,
        },
      );
      const message = await child.message((m) => m.type === "RESULT", 300000),
        exit = await child.exited(300000);
      if (message.code !== "PUBLISHED" || exit.code !== 0)
        throw new Error(
          "Signed source publication failed / 원본 서명 게시 실패",
        );
      const p = (await f.publisher.inspect()).publications.at(-1)!;
      const current = await fetch(
          publicationOrigin +
            "/v1/simulations/" +
            f.config.namespace +
            "/regions/seoul-pilot-corridors-v1/current",
        ),
        artifact = await fetch(
          publicationOrigin +
            "/v1/simulations/" +
            f.config.namespace +
            "/artifacts/" +
            p.traffic_snapshot_id,
        ),
        jws = await current.text(),
        bytes = Buffer.from(await artifact.arrayBuffer());
      if (
        current.status !== 200 ||
        artifact.status !== 200 ||
        jws !== p.jws ||
        !bytes.equals(Buffer.from(p.artifact))
      )
        throw new Error("Signed HTTP bytes mismatch / 서명 HTTP 바이트 불일치");
      writeFileSync(
        join(output, "public/sequence-" + p.sequence + ".jws.txt"),
        jws,
        { flag: "wx" },
      );
      writeFileSync(
        join(output, "public/sequence-" + p.sequence + ".json"),
        bytes,
        { flag: "wx" },
      );
      write(output, "readbacks/publication-" + p.sequence + ".json", {
        message,
        exit,
        sequence: p.sequence,
        snapshot_id: p.traffic_snapshot_id,
        http_status: current.status,
        artifact_status: artifact.status,
        artifact_sha256: sha256(bytes),
      });
      return p;
    };
    type NodeHandle = {
      config: RoutingNodeConfig;
      child: OwnedIngestionProcess;
      origin: string;
      instance_id: string;
    };
    const handles: NodeHandle[] = [];
    const startNode = async (index: number, existingToken?: string) => {
      const node_id = "seoul-gateway-node-" + (index === 0 ? "a" : "b"),
        token = existingToken ?? randomBytes(24).toString("hex");
      secrets.push(token);
      mkdirSync(join(output, "nodes", node_id), { recursive: true });
      const config: RoutingNodeConfig = {
        node_id,
        consumer: consumer(consumerIds[index]!),
        graph_directory: f.graph.directory,
        bundle_directory: f.bundle.directory,
        generation_root: join(output, "nodes", node_id, "generations"),
        runtime_root: join(output, "nodes", node_id, "runtime-" + randomUUID()),
        token,
        port: 0,
        poll_interval_ms: 500,
      };
      const child = runtime.spawn(
          "p10-native-node-" + index,
          "node_service",
          config,
        ),
        ready = await child.message(
          (m) => m.type === "READY" && m.kind === "routing-node",
          300000,
        );
      const handle = {
        config,
        child,
        origin: "http://127.0.0.1:" + ready.port,
        instance_id: String(ready.instance_id),
      };
      ports.push(Number(ready.port));
      handles.push(handle);
      return handle;
    };
    let a = await startNode(0),
      b = await startNode(1);
    const nodeStatus = async (node: NodeHandle) => {
      const r = await fetch(node.origin + "/internal/v1/status", {
        headers: { authorization: "Bearer " + node.config.token },
        signal: AbortSignal.timeout(5000),
      });
      return (await r.json()) as NodeStatus;
    };
    const waitNode = async (
      node: NodeHandle,
      predicate: (s: NodeStatus) => boolean,
      label: string,
    ) => {
      const start = performance.now();
      let state: NodeStatus;
      do {
        state = await nodeStatus(node);
        if (predicate(state)) {
          write(output, "status/" + label + ".json", state);
          return state;
        }
        await pause(100);
      } while (performance.now() - start < 180000);
      throw new Error("Node phase deadline / 노드 상태 제한: " + label);
    };
    await waitNode(a, (s) => s.ready, "baseline-a");
    await waitNode(b, (s) => s.ready, "baseline-b");
    const peer = async (node: NodeHandle) => {
      const item = { node, mode: "normal" as PeerMode, origin: "" };
      item.origin = await listen(
        createServer((req, res) => {
          void (async () => {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(Buffer.from(c));
            const raw = Buffer.concat(chunks).toString(),
              started = performance.now(),
              route = req.url === "/internal/v1/route",
              record: any = {
                node_id: item.node.config.node_id,
                path: req.url,
                mode: item.mode,
                request: raw ? JSON.parse(raw) : null,
                deadline_ms: req.headers["x-routelens-deadline-ms"],
                test_proxy: true,
                received_at_monotonic_ms: started,
              };
            peerRecords.push(record);
            if (item.mode === "slow") {
              await pause(5500);
              if (res.destroyed) return;
            }
            if (
              item.mode === "unavailable" ||
              (route && item.mode === "route-unavailable")
            ) {
              record.status = 503;
              record.reason = "configured-http-503";
              res.writeHead(503, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  code: "UNAVAILABLE",
                  reason: "ENGINE_UNAVAILABLE",
                  message_en: "Configured proxy failure",
                  message_ko: "설정된 대리 장애",
                }),
              );
              return;
            }
            if (route && item.mode === "redirect") {
              record.status = 302;
              res.writeHead(302, {
                location: item.node.origin + "/internal/v1/route",
              });
              res.end();
              return;
            }
            if (route && item.mode === "oversized") {
              record.status = 200;
              record.byte_length = 2 * 1024 * 1024 + 1;
              res.writeHead(200, { "content-type": "application/json" });
              res.end(" ".repeat(record.byte_length));
              return;
            }
            const upstream = await fetch(item.node.origin + req.url, {
              method: req.method,
              headers: {
                authorization: "Bearer " + item.node.config.token,
                "content-type": "application/json",
                ...(req.headers["x-routelens-deadline-ms"]
                  ? {
                      "x-routelens-deadline-ms": String(
                        req.headers["x-routelens-deadline-ms"],
                      ),
                    }
                  : {}),
              },
              ...(raw ? { body: raw } : {}),
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            });
            const body: any = await upstream.json();
            record.original_status = upstream.status;
            record.original_body = structuredClone(body);
            if (route && upstream.status === 200) {
              if (item.mode === "wrong-generation")
                body.provenance.generation_id = "0".repeat(64);
              if (item.mode === "wrong-request")
                body.request_id = "another-request";
              if (item.mode === "malformed")
                body.engine_result.route.trip.legs[0].shape = "!";
            }
            if (!route && item.mode === "stale" && body.active)
              body.active.generation_id = "0".repeat(64);
            record.status = upstream.status;
            record.body = body;
            record.elapsed_ms = performance.now() - started;
            res.writeHead(upstream.status, {
              "content-type": "application/json",
            });
            res.end(JSON.stringify(body));
          })().catch((error) => {
            peerRecords.push({
              node_id: item.node.config.node_id,
              path: req.url,
              mode: item.mode,
              error: String(error),
              test_proxy: true,
            });
            if (!res.headersSent)
              res.writeHead(503, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                code: "UNAVAILABLE",
                reason: "ENGINE_UNAVAILABLE",
                message_en: "Proxy upstream unavailable",
                message_ko: "대리 원서버 사용불가",
              }),
            );
          });
        }),
      );
      return item;
    };
    const pa = await peer(a),
      pb = await peer(b);
    const gatewayToken = randomBytes(24).toString("hex");
    secrets.push(gatewayToken);
    const config: GatewayConfig = {
      gateway_id: "seoul-route-gateway",
      consumer: consumer(consumerIds[2]!),
      graph_directory: f.graph.directory,
      bundle_directory: f.bundle.directory,
      generation_root: join(output, "gateway/generations"),
      runtime_root: join(output, "gateway/runtime"),
      token: gatewayToken,
      port: 0,
      poll_interval_ms: 500,
      nodes: [
        { node_id: a.config.node_id, origin: pa.origin, token: a.config.token },
        { node_id: b.config.node_id, origin: pb.origin, token: b.config.token },
      ],
    };
    const gatewayChild = runtime.spawn(
        "p10-gateway",
        "gateway_service",
        config,
      ),
      gatewayReady = await gatewayChild.message(
        (m) => m.type === "READY" && m.kind === "route-gateway",
        300000,
      ),
      gatewayOrigin = "http://127.0.0.1:" + gatewayReady.port;
    ports.push(Number(gatewayReady.port));
    const publicSuccessBodies: GatewaySuccess[] = [];
    const status = async () => {
      const result = await control(gatewayChild, { type: "STATUS" });
      return result.status as GatewayStatus;
    };
    const request = (id: string, od = long): GatewayRequest => ({
      schema_version: "0.1",
      request_id: id,
      ...od,
      profile: "car",
      traffic_policy: "prefer_live",
    });
    const http = async (
      body: unknown,
      label: string,
      options: { raw?: string; token?: string } = {},
    ): Promise<HttpReply> => {
      const start = performance.now(),
        r = await fetch(gatewayOrigin + "/v1/routes", {
          method: "POST",
          headers: {
            authorization: "Bearer " + (options.token ?? gatewayToken),
            "content-type": "application/json",
          },
          body: options.raw ?? JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        }),
        text = await r.text();
      assertNoSensitiveDiagnostics(text, secrets);
      const reply = {
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: JSON.parse(text),
        elapsed_ms: performance.now() - start,
      };
      if (reply.status === 200)
        publicSuccessBodies.push(reply.body as GatewaySuccess);
      write(output, "requests/" + label + ".json", {
        request: body,
        ...(options.raw === undefined ? {} : { raw_body: options.raw }),
        ...reply,
      });
      return reply;
    };
    const success = (
      label: string,
      input: GatewayRequest,
      reply: HttpReply,
    ) => {
      if (reply.status !== 200)
        throw new Error(
          "Actual gateway route failed / 실제 중계 경로 실패: " +
            JSON.stringify(reply),
        );
      const response = reply.body as GatewaySuccess;
      if (
        response.request_id !== input.request_id ||
        response.request_sha256 !== sha256(canonical(input))
      )
        throw new Error(
          "Public request binding mismatch / 공개요청 결합 불일치",
        );
      routes.push({
        label,
        request: input,
        response,
        evidence_path: "requests/" + label + ".json",
      });
      record(
        label,
        "Recorded gateway route: " + label,
        "기록된 중계 경로: " + label,
        "requests/" + label + ".json",
      );
      return response;
    };
    const unauthorized = await http(request("unauthorized"), "unauthorized", {
      token: "wrong-token",
    });
    check(
      "authenticated-api",
      gatewayFailureMatches(unauthorized, 401, "AUTH_REQUIRED"),
      "The public endpoint requires its private bearer token.",
      "공개 경로 접점이 비공개 인증값을 요구합니다.",
      unauthorized,
      "requests/unauthorized.json",
    );
    const invalids = [];
    for (const [label, extra] of [
      ["unknown", { extra: true }],
      ["latitude", { origin: { latitude: 91, longitude: 127 } }],
      ["profile", { profile: "bicycle" }],
      ["schema", { schema_version: "9" }],
    ] as const)
      invalids.push(
        await http(
          { ...request("invalid-" + label), ...extra },
          "invalid-" + label,
        ),
      );
    check(
      "invalid-input",
      invalids.every((r) => gatewayFailureMatches(r, 422, "INVALID_INPUT")),
      "Unknown fields, coordinates and unsupported schema/profile are rejected.",
      "알수없는 필드·좌표·미지원규격/이동수단을 거부합니다.",
      invalids,
      "requests/invalid-unknown.json",
    );
    const oversized = await http({}, "body-limit", { raw: " ".repeat(65537) });
    const chunkedRaw = " ".repeat(65537),
      chunkedStart = performance.now();
    const chunked = await new Promise<HttpReply>((ok, fail) => {
      const client = httpRequest(
        gatewayOrigin + "/v1/routes",
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + gatewayToken,
            "content-type": "application/json",
            "transfer-encoding": "chunked",
          },
        },
        (response) => {
          const parts: Buffer[] = [];
          response.on("data", (part) => parts.push(Buffer.from(part)));
          response.on("end", () => {
            try {
              ok({
                status: response.statusCode!,
                headers: Object.fromEntries(
                  Object.entries(response.headers).map(([key, value]) => [
                    key,
                    String(value),
                  ]),
                ),
                body: JSON.parse(Buffer.concat(parts).toString()),
                elapsed_ms: performance.now() - chunkedStart,
              });
            } catch (error) {
              fail(error);
            }
          });
        },
      );
      client.setTimeout(15000, () =>
        client.destroy(new Error("Chunked input deadline / 청크입력기한")),
      );
      client.on("error", fail);
      client.write(chunkedRaw.slice(0, 32768));
      client.end(chunkedRaw.slice(32768));
    });
    write(output, "requests/body-limit-chunked.json", {
      raw_body: chunkedRaw,
      transfer_encoding: "chunked",
      ...chunked,
    });
    check(
      "body-limit",
      gatewayFailureMatches(oversized, 422, "INVALID_INPUT") &&
        gatewayFailureMatches(chunked, 422, "INVALID_INPUT"),
      "The public body limit rejects oversized input.",
      "공개 본문 크기 제한이 초과 입력을 거부합니다.",
      { oversized, chunked },
      "requests/body-limit-chunked.json",
    );
    const unsupported = await http(
      { ...request("unsupported-policy"), traffic_policy: "base_only" },
      "unsupported-policy",
    );
    check(
      "unsupported-policy",
      gatewayFailureMatches(unsupported, 422, "UNSUPPORTED_POLICY"),
      "Explicit base_only is refused rather than silently computing live traffic.",
      "명시 base_only를 몰래 실시간 계산하지 않고 거부합니다.",
      unsupported,
      "requests/unsupported-policy.json",
    );
    const badConfigs = [
      {
        ...config,
        nodes: [
          { ...config.nodes[0], origin: "http://localhost:1234" },
          config.nodes[1],
        ],
      },
      { ...config, nodes: [config.nodes[0], config.nodes[0]] },
    ];
    const rejectedConfigs = [];
    for (const bad of badConfigs) {
      const child = runtime.spawn("p10-invalid-config", "gateway_service", bad);
      const exit = await child.exited(30000);
      rejectedConfigs.push({
        exit,
        ready: child.messages.some(
          (m) =>
            m !== null &&
            typeof m === "object" &&
            "type" in m &&
            m.type === "READY",
        ),
        messages: child.messages,
        diagnostics: child.diagnostics.join(""),
      });
    }
    write(output, "negative/configured-origins.json", rejectedConfigs);
    check(
      "configured-origins",
      rejectedConfigs.every((r) => r.exit.code !== 0 && !r.ready),
      "Only distinct configured loopback node origins are admitted.",
      "서로 다른 설정된 로컬 노드 주소만 허용합니다.",
      rejectedConfigs,
      "negative/configured-origins.json",
    );
    await sql("baseline");
    const baselineInput = request("baseline"),
      baseline = success(
        "baseline",
        baselineInput,
        await http(baselineInput, "baseline"),
      );
    check(
      "baseline",
      baseline.traffic_mode === "BASE_ONLY" &&
        baseline.live_coverage_ratio === 0 &&
        baseline.snapshot_id === null,
      "No accepted traffic yields a real native baseline with zero live coverage.",
      "수용 교통정보가 없으면 실제 지속 엔진 기본 경로와 적용률0을 반환합니다.",
      baseline,
      "requests/baseline.json",
    );
    const first = await publish(0);
    await control(a.child, { type: "RECONCILE", pull: true });
    await control(b.child, { type: "RECONCILE", pull: true });
    await control(gatewayChild, { type: "RECONCILE", pull: true });
    await waitNode(
      a,
      (s) => s.ready && s.active?.sequence === first.sequence,
      "live-a",
    );
    await waitNode(
      b,
      (s) => s.ready && s.active?.sequence === first.sequence,
      "live-b",
    );
    const liveSql = await sql("live");
    check(
      "independent-consumer",
      consumerIds.every((id) =>
        liveSql.some(
          (r) =>
            r.consumer_id === id && Number(r.high_water) === first.sequence,
        ),
      ) && new Set(consumerIds).size === 3,
      "The gateway and both nodes have distinct persisted consumers.",
      "중계와 두 노드는 서로 다른 영속 수신자를 가집니다.",
      liveSql,
      "readbacks/sql-live.json",
    );
    const liveInput = request("live-primary", short),
      live = success(
        "live-primary",
        liveInput,
        await http(liveInput, "live-primary"),
      );
    check(
      "live-primary",
      live.node_id === a.config.node_id &&
        live.sequence === first.sequence &&
        live.traffic_mode === "LIVE_MIXED" &&
        live.live_coverage_ratio > 0 &&
        live.live_coverage_ratio <= 1,
      "The first matching actual node uses accepted live traffic on the preselected partial edge.",
      "첫 적합 실제 노드가 미리 선정한 부분구간의 수용 교통정보를 사용합니다.",
      live,
      "requests/live-primary.json",
    );
    const detourInput = request("live-detour"),
      detour = success(
        "live-detour",
        detourInput,
        await http(detourInput, "live-detour"),
      );
    check(
      "route-local-coverage",
      detour.sequence === first.sequence &&
        detour.live_coverage_ratio === 0 &&
        detour.traffic_mode === "BASE_ONLY" &&
        detour.distance_m > baseline.distance_m + 50 &&
        detour.duration_s > baseline.duration_s + 5 &&
        live.distance_m < target.distance_m,
      "Coverage belongs to the returned partial route; the longer detour has zero accepted live-edge overlap.",
      "적용률은 반환한 부분 경로 기준이며 긴 우회 경로의 수용 구간 교집합은0입니다.",
      { live, detour },
      "requests/live-detour.json",
    );
    // All adversarial peers are explicit HTTP test proxies; only unmodified forwarded native replies count as success.
    // 적대 응답은 명시 HTTP시험대리서버이며 변경하지 않은 실제 엔진 응답만 정상성공으로 셉니다.
    const attemptFiles = (id: string) => {
      const dirs = readdirSync(join(output, "gateway/runtime/requests"));
      const found = dirs.filter((d) => d.startsWith(id + "-"));
      if (found.length !== 1)
        throw new Error(
          "Unique gateway attempt evidence missing / 유일한 중계시도 근거 누락: " +
            id,
        );
      return "gateway/runtime/requests/" + found[0] + "/attempts.json";
    };
    const attempts = (id: string) =>
      JSON.parse(
        readFileSync(join(output, attemptFiles(id)), "utf8"),
      ) as Array<any>;
    const negativePeer = async (
      id: string,
      mode: PeerMode,
      expectedReason: string,
    ) => {
      pa.mode = mode;
      pb.mode = mode;
      const input = request(id, short),
        reply = await http(input, id);
      pa.mode = "normal";
      pb.mode = "normal";
      const raw = attempts(id);
      check(
        id,
        gatewayFailureMatches(reply, 503, "NO_HEALTHY_NODE") &&
          raw.length === 2 &&
          raw.every((a) => a.reason === expectedReason),
        "Two explicit test-proxy responses are rejected with the exact validation reason: " +
          expectedReason,
        "명시한 두 시험 응답을 정확한 검증 사유로 거부합니다.",
        { reply, attempts: raw },
        attemptFiles(id),
      );
    };
    await negativePeer(
      "wrong-generation-rejected",
      "wrong-generation",
      "WRONG_GENERATION",
    );
    await negativePeer(
      "wrong-request-rejected",
      "wrong-request",
      "WRONG_REQUEST",
    );
    await negativePeer(
      "malformed-route-rejected",
      "malformed",
      "INVALID_ROUTE",
    );
    await negativePeer(
      "oversized-response-rejected",
      "oversized",
      "OVERSIZED_RESPONSE",
    );
    await negativePeer("redirect-rejected", "redirect", "REDIRECT_REJECTED");
    pa.mode = "stale";
    const staleInput = request("stale-node-excluded", short),
      stale = success(
        "stale-node-excluded",
        staleInput,
        await http(staleInput, "stale-node-excluded"),
      );
    pa.mode = "normal";
    check(
      "stale-node-excluded",
      stale.node_id === b.config.node_id &&
        attempts("stale-node-excluded").length === 1,
      "A stale generation is excluded during status selection before route dispatch.",
      "오래된 세대는 경로 전송 전 상태 선택에서 제외합니다.",
      stale,
      attemptFiles("stale-node-excluded"),
    );
    pa.mode = "stale";
    pb.mode = "stale";
    const mismatch = await http(
      request("no-matching-node", short),
      "no-matching-node",
    );
    pa.mode = "normal";
    pb.mode = "normal";
    check(
      "no-matching-node",
      gatewayFailureMatches(mismatch, 503, "NO_HEALTHY_NODE") &&
        attempts("no-matching-node").length === 0,
      "No matching current generation is an explicit failure, never an older live or baseline substitution.",
      "현재 세대 적합 노드가 없으면 옛 실시간·기본 경로로 바꾸지 않고 실패합니다.",
      mismatch,
      "requests/no-matching-node.json",
    );
    pa.mode = "unavailable";
    pb.mode = "unavailable";
    const both = await http(request("both-down"), "both-down");
    pa.mode = "normal";
    pb.mode = "normal";
    check(
      "both-down",
      gatewayFailureMatches(both, 503, "NO_HEALTHY_NODE"),
      "Both unavailable nodes produce an explicit unavailable response.",
      "두 노드가 모두 사용불가하면 명시적으로 실패합니다.",
      both,
      "requests/both-down.json",
    );
    // A route-only failure keeps status valid so the second attempt is exercised rather than selection filtering.
    // 상태는 유효하게 유지하고 경로만 실패시켜 선택 제외가 아닌 두번째 실제 시도를 검사합니다.
    pa.mode = "route-unavailable";
    const retryInput = request("primary-unavailable-retry", short),
      retry = success(
        "primary-unavailable-retry",
        retryInput,
        await http(retryInput, "primary-unavailable-retry"),
      );
    pa.mode = "normal";
    const retryAttempts = attempts("primary-unavailable-retry");
    check(
      "primary-unavailable-retry",
      retry.node_id === b.config.node_id &&
        retryAttempts.length === 2 &&
        retryAttempts[0].node_id === a.config.node_id &&
        retryAttempts[1].node_id === b.config.node_id,
      "One failed primary route retries the same pinned target on the other real node.",
      "첫 경로 실패 뒤 다른 실제 노드에 같은 고정 자료로 한 번 재시도합니다.",
      retryAttempts,
      attemptFiles("primary-unavailable-retry"),
    );
    pa.mode = "route-unavailable";
    pb.mode = "route-unavailable";
    const exhausted = await http(request("retry-once", short), "retry-once");
    pa.mode = "normal";
    pb.mode = "normal";
    check(
      "retry-once",
      gatewayFailureMatches(exhausted, 503, "NO_HEALTHY_NODE") &&
        attempts("retry-once").length === 2,
      "Two failed route attempts exhaust the single retry without hedging or a third attempt.",
      "두 번의 순차 실패 뒤 추가·동시 요청 없이 한 번의 재시도를 마칩니다.",
      attempts("retry-once"),
      attemptFiles("retry-once"),
    );
    const killIdentity = {
      pid: a.child.child!.pid,
      instance_id: a.instance_id,
      node_id: a.config.node_id,
    };
    a.child.child!.kill("SIGKILL");
    const killedExit = await a.child.exited(30000);
    write(output, "readbacks/primary-sigkill.json", {
      ...killIdentity,
      exit: killedExit,
    });
    const failoverInput = request("primary-kill-failover", short),
      failover = success(
        "primary-kill-failover",
        failoverInput,
        await http(failoverInput, "primary-kill-failover"),
      );
    check(
      "primary-kill-failover",
      killedExit.signal === "SIGKILL" &&
        failover.node_id === b.config.node_id &&
        failover.sequence === first.sequence,
      "An actual SIGKILL of the primary node fails over to the independent native node at the same accepted version.",
      "첫 노드를 실제 강제 종료한 뒤 독립 지속 엔진 노드의 같은 수용 버전으로 전환합니다.",
      { killIdentity, killedExit, failover },
      "readbacks/primary-sigkill.json",
    );
    const reaped = [];
    for (const ownerDirectory of readdirSync(
      join(a.config.runtime_root, "engines"),
    )) {
      const file = join(
          a.config.runtime_root,
          "engines",
          ownerDirectory,
          "ownership.json",
        ),
        owned = JSON.parse(readFileSync(file, "utf8"));
      const inspected = runtime.commands.command(
        ["inspect", owned.container_id ?? owned.container_name],
        10000,
        true,
      );
      if (inspected.status !== 0) {
        if (!/No such (?:container|object)/i.test(inspected.stderr))
          throw new Error("Owned engine inspection failed / 소유엔진검사 실패");
        reaped.push({ owner: owned, already_absent: true });
        continue;
      }
      const detail = JSON.parse(inspected.stdout)[0];
      if (
        detail.Id !== owned.container_id ||
        detail.Name !== "/routelens-p02-" + owned.owner_id ||
        detail.Config.Labels["io.routelens.run_id"] !== owned.owner_id ||
        !detail.Mounts.some(
          (m: any) =>
            m.Destination === "/work" &&
            resolve(m.Source) === resolve(owned.work_directory) &&
            resolve(m.Source).startsWith(output + "/"),
        )
      )
        throw new Error("Owned engine identity mismatch / 소유엔진식별 불일치");
      runtime.commands.command(["rm", "-f", detail.Id], 30000);
      const absent = runtime.commands.command(
        ["inspect", detail.Id],
        10000,
        true,
      );
      if (
        absent.status === 0 ||
        !/No such (?:container|object)/i.test(absent.stderr)
      )
        throw new Error("Owned engine remains / 소유엔진잔존");
      reaped.push({ owner: owned, exact_inspect: detail, absent: true });
    }
    write(output, "readbacks/primary-parent-reaped.json", reaped);
    a = await startNode(0, a.config.token);
    pa.node = a;
    await waitNode(
      a,
      (s) => s.ready && s.active?.sequence === first.sequence,
      "restarted-primary",
    );
    const pauseGateway = async (name: GatewayPhase, id?: string) =>
      control(gatewayChild, {
        type: "SET_GATEWAY_PAUSE",
        phase: name,
        ...(id ? { request_id: id } : {}),
      });
    const resumeGateway = async (name: GatewayPhase, id?: string) =>
      control(gatewayChild, {
        type: "RESUME",
        phase: name,
        ...(id ? { request_id: id } : {}),
      });
    await pauseGateway("AFTER_GATEWAY_SELECTION");
    const capacityCursor = gatewayChild.messages.length;
    const held = Array.from({ length: 8 }, (_, i) => {
      const input = request("admission-" + i, short);
      return http(input, input.request_id);
    });
    for (let i = 0; i < 8; i++)
      await phase(
        gatewayChild,
        "AFTER_GATEWAY_SELECTION",
        "admission-" + i,
        capacityCursor,
      );
    const admissionState = await status(),
      ninth = await http(request("admission-ninth", short), "admission-ninth");
    write(output, "status/admission-eight.json", admissionState);
    await resumeGateway("AFTER_GATEWAY_SELECTION");
    await control(gatewayChild, { type: "SET_GATEWAY_PAUSE", phase: null });
    const released = await Promise.all(held);
    check(
      "admission-eight",
      admissionState.in_flight === 8 &&
        gatewayFailureMatches(ninth, 429, "RATE_LIMITED") &&
        released.every((r) => r.status === 200),
      "Exactly eight admitted requests are held at a confirmed phase; the ninth is refused without a queue.",
      "확정 단계에8요청을 고정하고 아홉째는 대기열 없이 거부합니다.",
      { admissionState, ninth, released: released.map((r) => r.status) },
      "status/admission-eight.json",
    );
    // Native compute is genuinely completed, then the private phase holds its lease until the propagated deadline.
    // 실제 지속 엔진 계산 뒤 비공개 단계에서 요청 고정을 유지하고 전달 기한으로 해제합니다.
    await control(a.child, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "propagated-node-deadline",
    });
    pb.mode = "unavailable";
    const nativeCursor = a.child.messages.length,
      propagatedInput = request("propagated-node-deadline", short),
      propagatedPending = http(propagatedInput, propagatedInput.request_id);
    const nativePhase = await phase(
        a.child,
        "AFTER_NODE_ENGINE_RESULT",
        propagatedInput.request_id,
        nativeCursor,
      ),
      leased = await nodeStatus(a),
      propagated = await propagatedPending;
    const releasedNode = await waitNode(
      a,
      (s) => s.in_flight === 0,
      "propagated-lease-released",
    );
    const propagatedLeaseObservedAt = performance.now();
    const propagatedProxy = peerRecords.filter(
      (r) => r.request?.request_id === propagatedInput.request_id,
    );
    const propagatedLeaseElapsed =
      propagatedProxy.length === 1
        ? propagatedLeaseObservedAt -
          propagatedProxy[0].received_at_monotonic_ms
        : Infinity;
    await control(a.child, {
      type: "RESUME",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: propagatedInput.request_id,
    });
    await control(a.child, { type: "SET_NODE_PAUSE", phase: null });
    pb.mode = "normal";
    write(output, "readbacks/propagated-node-deadline.json", {
      phase: nativePhase,
      leased,
      released: releasedNode,
      reply: propagated,
      lease_observed_elapsed_ms: propagatedLeaseElapsed,
      lease_bound_ms: Number(propagatedProxy[0]?.deadline_ms) + 500,
      proxy_requests: peerRecords.filter(
        (r) => r.request?.request_id === propagatedInput.request_id,
      ),
    });
    const propagatedHeaders = peerRecords
      .filter((r) => r.request?.request_id === propagatedInput.request_id)
      .map((r) => Number(r.deadline_ms));
    check(
      "propagated-node-deadline",
      gatewayFailureMatches(propagated, 503, "NO_HEALTHY_NODE") &&
        leased.in_flight === 1 &&
        releasedNode.in_flight === 0 &&
        propagatedLeaseElapsed <=
          Number(propagatedProxy[0]?.deadline_ms) + 500 &&
        propagatedHeaders.length === 1 &&
        propagatedHeaders.every(
          (ms) => Number.isInteger(ms) && ms > 0 && ms <= 4000,
        ),
      "A genuine native lease is bounded by the remaining propagated route-attempt deadline.",
      "실제 지속 엔진 고정이 전달한 남은 경로 시도 기한으로 제한됩니다.",
      {
        elapsed_ms: propagated.elapsed_ms,
        lease_elapsed_ms: propagatedLeaseElapsed,
        propagatedHeaders,
      },
      "readbacks/propagated-node-deadline.json",
    );
    await pauseGateway("AFTER_GATEWAY_SELECTION", "shared-deadline");
    const deadlineStart = performance.now(),
      sharedPending = http(
        request("shared-deadline", short),
        "shared-deadline",
      );
    await phase(gatewayChild, "AFTER_GATEWAY_SELECTION", "shared-deadline");
    const shared = await sharedPending;
    const observedElapsed = performance.now() - deadlineStart;
    await resumeGateway("AFTER_GATEWAY_SELECTION", "shared-deadline");
    await control(gatewayChild, { type: "SET_GATEWAY_PAUSE", phase: null });
    write(output, "readbacks/shared-deadline.json", {
      reply: shared,
      elapsed_ms: observedElapsed,
      status: await status(),
    });
    check(
      "shared-deadline",
      gatewayFailureMatches(shared, 504, "DEADLINE_EXCEEDED") &&
        observedElapsed >= 12000 &&
        observedElapsed <= 12500 &&
        (await status()).in_flight === 0,
      "The overall monotonic twelve-second budget includes a confirmed held selection phase and releases admission.",
      "확인된 선택 단계 대기를 포함한 전체 단조12초 기한 뒤 접수를 해제합니다.",
      { elapsed_ms: observedElapsed, reply: shared },
      "readbacks/shared-deadline.json",
    );
    await control(a.child, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "client-disconnect",
    });
    const disconnectInput = request("client-disconnect", short),
      disconnectStart = performance.now();
    const client = httpRequest(gatewayOrigin + "/v1/routes", {
      method: "POST",
      headers: {
        authorization: "Bearer " + gatewayToken,
        "content-type": "application/json",
      },
    });
    client.on("error", () => {});
    client.end(JSON.stringify(disconnectInput));
    const disconnectPhase = await phase(
        a.child,
        "AFTER_NODE_ENGINE_RESULT",
        "client-disconnect",
      ),
      beforeDisconnect = await nodeStatus(a);
    const abortedAt = performance.now();
    client.destroy();
    let gatewayAfterAbort = await status();
    while (
      gatewayAfterAbort.in_flight !== 0 &&
      performance.now() - abortedAt < 500
    ) {
      await pause(20);
      gatewayAfterAbort = await status();
    }
    const gatewayReleaseElapsed = performance.now() - abortedAt;
    const disconnectNode = await waitNode(
        a,
        (s) => s.in_flight === 0,
        "client-disconnect-released",
      ),
      disconnectElapsed = performance.now() - disconnectStart;
    const disconnectProxy = peerRecords.filter(
      (r) => r.request?.request_id === disconnectInput.request_id,
    );
    const disconnectLeaseElapsed =
      disconnectProxy.length === 1
        ? performance.now() - disconnectProxy[0].received_at_monotonic_ms
        : Infinity;
    const disconnectDeadline = Number(disconnectProxy[0]?.deadline_ms);
    await control(a.child, {
      type: "RESUME",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "client-disconnect",
    });
    await control(a.child, { type: "SET_NODE_PAUSE", phase: null });
    write(output, "readbacks/client-disconnect.json", {
      request: disconnectInput,
      phase: disconnectPhase,
      before: beforeDisconnect,
      after: disconnectNode,
      elapsed_ms: disconnectElapsed,
      gateway_release_after_abort_ms: gatewayReleaseElapsed,
      gateway_after_abort: gatewayAfterAbort,
      node_lease_observed_elapsed_ms: disconnectLeaseElapsed,
      propagated_deadline_ms: disconnectDeadline,
      proxy_requests: disconnectProxy,
      gateway: await status(),
      client_destroyed: client.destroyed,
    });
    check(
      "client-disconnect",
      client.destroyed &&
        beforeDisconnect.in_flight === 1 &&
        disconnectNode.in_flight === 0 &&
        gatewayAfterAbort.in_flight === 0 &&
        gatewayReleaseElapsed <= 500 &&
        disconnectDeadline > 0 &&
        disconnectDeadline <= 4000 &&
        disconnectLeaseElapsed <= disconnectDeadline + 500,
      "An actual client socket disconnect releases the bounded native lease and gateway admission.",
      "실제 클라이언트 소켓 단절 뒤 제한된 지속 엔진 고정과 중계 접수를 해제합니다.",
      {
        elapsed_ms: disconnectElapsed,
        gateway_release_ms: gatewayReleaseElapsed,
        node_lease_ms: disconnectLeaseElapsed,
        propagated_deadline_ms: disconnectDeadline,
      },
      "readbacks/client-disconnect.json",
    );
    await pauseGateway("AFTER_GATEWAY_NODE_RESULT", "result-version-change");
    const changedInput = request("result-version-change", short),
      changedPending = http(changedInput, changedInput.request_id);
    await phase(
      gatewayChild,
      "AFTER_GATEWAY_NODE_RESULT",
      changedInput.request_id,
    );
    const second = await publish(1);
    await control(gatewayChild, { type: "RECONCILE", pull: true });
    await control(a.child, { type: "RECONCILE", pull: true });
    await control(b.child, { type: "RECONCILE", pull: true });
    await sql("version-change");
    await resumeGateway("AFTER_GATEWAY_NODE_RESULT", changedInput.request_id);
    await control(gatewayChild, { type: "SET_GATEWAY_PAUSE", phase: null });
    const changed = await changedPending;
    check(
      "result-version-change",
      gatewayFailureMatches(changed, 409, "TRAFFIC_CHANGED") &&
        second.sequence > first.sequence,
      "A response computed for the pinned old version is explicitly rejected after durable acceptance changes.",
      "영속 수용 버전 교체 뒤 이전 버전으로 계산한 응답을 명시적으로 거부합니다.",
      changed,
      "requests/result-version-change.json",
    );
    publisherOffline = true;
    await control(gatewayChild, { type: "RECONCILE", pull: true });
    const outageInput = request("publisher-outage", short),
      outage = success(
        "publisher-outage",
        outageInput,
        await http(outageInput, "publisher-outage"),
      );
    write(output, "readbacks/publisher-outage.json", publisherRequests);
    check(
      "publisher-outage",
      outage.sequence === second.sequence &&
        publisherRequests.some(
          (r: any) => r.configured_http_502 && r.status === 502,
        ),
      "Configured HTTP502 preserves only a still-valid durable selection; this is not packet-loss proof.",
      "설정한 HTTP502에서 아직 유효한 영속 선택만 유지하며 패킷 손실 근거가 아닙니다.",
      outage,
      "readbacks/publisher-outage.json",
    );
    publisherOffline = false;
    runtime.commands.command(["pause", runtime.name]);
    let storeFailure: HttpReply;
    try {
      storeFailure = await http(request("store-outage", short), "store-outage");
    } finally {
      runtime.commands.command(["unpause", runtime.name]);
    }
    check(
      "store-outage",
      gatewayFailureMatches(storeFailure, 503, "STORE_UNAVAILABLE"),
      "Paused actual PostgreSQL cannot authorize a cached gateway response.",
      "실제 PostgreSQL을 멈추면 캐시로 중계 성공을 승인하지 않습니다.",
      storeFailure,
      "requests/store-outage.json",
    );
    await control(gatewayChild, { type: "RECONCILE", pull: true });
    await waitNode(a, (s) => s.ready, "db-recovered-a");
    await waitNode(b, (s) => s.ready, "db-recovered-b");
    const revoked = [];
    for (const i of [0, 5, 10])
      revoked.push(await f.post(i, "/v1/consent/revoke"));
    const corrected = await f.aggregate.finalize(at(180000), f.now);
    write(output, "readbacks/non-live-source.json", { revoked, corrected });
    const correction = await publish(2);
    await control(a.child, { type: "RECONCILE", pull: true });
    await control(b.child, { type: "RECONCILE", pull: true });
    await control(gatewayChild, { type: "RECONCILE", pull: true });
    const correctionInput = request("non-live-correction", short),
      correctedRoute = success(
        "non-live-correction",
        correctionInput,
        await http(correctionInput, "non-live-correction"),
      );
    await sql("correction");
    check(
      "non-live-correction",
      revoked.every((r) => r.status === 200) &&
        corrected.code === "FINALIZED" &&
        corrected.draft.entries.filter((e) => e.status === "LIVE").length ===
          0 &&
        correctedRoute.snapshot_id === correction.traffic_snapshot_id &&
        correctedRoute.traffic_mode === "BASE_ONLY" &&
        correctedRoute.live_coverage_ratio === 0,
      "Actual consent revocation and signed non-live correction remove route live coverage without inherited speeds.",
      "실제 동의 철회·서명 정정이 이전 속도를 이어받지 않고 경로 적용률을0으로 만듭니다.",
      correctedRoute,
      "requests/non-live-correction.json",
    );
    await f.advance(419999);
    const beforeInput = request("before-expiry", short),
      before = success(
        "before-expiry",
        beforeInput,
        await http(beforeInput, "before-expiry"),
      );
    await f.advance(420000);
    await control(gatewayChild, { type: "RECONCILE", pull: false });
    await control(a.child, { type: "RECONCILE", pull: false });
    await control(b.child, { type: "RECONCILE", pull: false });
    await waitNode(
      a,
      (s) => s.ready && s.active?.traffic_snapshot_id === null,
      "expired-a",
    );
    await waitNode(
      b,
      (s) => s.ready && s.active?.traffic_snapshot_id === null,
      "expired-b",
    );
    const expiredInput = request("exact-expiry"),
      expired = success(
        "exact-expiry",
        expiredInput,
        await http(expiredInput, "exact-expiry"),
      );
    await sql("expiry");
    check(
      "exact-expiry",
      before.snapshot_id === correction.traffic_snapshot_id &&
        expired.snapshot_id === null &&
        expired.traffic_mode === "BASE_ONLY" &&
        expired.live_coverage_ratio === 0 &&
        canonical(expired.geometry).equals(canonical(baseline.geometry)) &&
        Math.abs(expired.duration_s - baseline.duration_s) <= 1e-6,
      "At exact event time420 the gateway and both nodes restore the original baseline rather than stale traffic.",
      "정확한 관측시각420초에 중계·두 노드가 낡은 교통 대신 원래 기본 경로를 복구합니다.",
      { before, expired },
      "requests/exact-expiry.json",
    );
    const publicKeys = [
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
      "high_water",
      "checked_at_event_time",
      "traffic_published_at",
      "traffic_valid_until",
      "source_class",
      "clock_basis",
    ].sort();
    const privacy = publicSuccessBodies.every(
      (response) =>
        canonical(Object.keys(response).sort()).equals(canonical(publicKeys)) &&
        Number.isSafeInteger(response.high_water) &&
        response.high_water >= (response.sequence ?? 0) &&
        Number.isFinite(Date.parse(response.checked_at_event_time)) &&
        response.source_class === "SYNTHETIC" &&
        response.clock_basis === "SIMULATION_EVENT_TIME" &&
        (response.snapshot_id === null
          ? response.traffic_published_at === null &&
            response.traffic_valid_until === null
          : Number.isFinite(Date.parse(response.traffic_published_at!)) &&
            Date.parse(response.traffic_valid_until!) >
              Date.parse(response.checked_at_event_time)) &&
        response.warnings.every((w) =>
          canonical(Object.keys(w).sort()).equals(
            canonical(["code", "message_en", "message_ko"].sort()),
          ),
        ),
    );
    write(output, "readbacks/public-privacy.json", {
      expected_keys: publicKeys,
      routes: routes.map((r) => ({
        label: r.label,
        keys: Object.keys(r.response),
      })),
    });
    check(
      "public-privacy",
      privacy,
      "Public routes contain only the contract allowlist; native identities and raw traces remain private evidence.",
      "공개 경로는 계약 허용 필드만 포함하고 지속 엔진 식별자·원추적은 별도 근거로 둡니다.",
      privacy,
      "readbacks/public-privacy.json",
    );
    await control(gatewayChild, { type: "SHUTDOWN" });
    await gatewayChild.message((m) => m.type === "STOPPED", 60000);
    await gatewayChild.exited(60000);
    for (const node of [a, b]) {
      await control(node.child, { type: "SHUTDOWN" });
      await node.child.message((m) => m.type === "STOPPED", 60000);
      await node.child.exited(60000);
    }
  } catch (error) {
    failure = error;
  } finally {
    write(output, "proxies/node-requests.json", peerRecords);
    write(output, "proxies/publication-requests.json", publisherRequests);
    for (const server of servers) {
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((ok) => server.close(() => ok()));
    }
    for (const store of stores.reverse())
      await store.close().catch((error) => {
        failure ??= error;
      });
    cleanup = await runtime.cleanup();
    const processEvents = runtime.processes.map((p) => ({
      role: p.role,
      pid: p.child?.pid,
      exit_code: p.child?.exitCode,
      signal: p.child?.signalCode,
      messages: p.messages,
      diagnostics: p.diagnostics.join(""),
    }));
    assertNoSensitiveDiagnostics(JSON.stringify(processEvents), secrets);
    runtime.assertSafe(JSON.stringify(processEvents));
    write(output, "process-events.json", processEvents);
    const closedPorts = await Promise.all(
      [...new Set(ports)].map(async (port) => ({
        port,
        open: await portIsOpen(port),
      })),
    );
    write(output, "readbacks/ports-after-cleanup.json", closedPorts);
    cleanup = cleanup && closedPorts.every((p) => !p.open);
  }
  if (failure || !cleanup) {
    write(output, "failure.json", {
      status: "FAIL",
      error: String(failure),
      cleanup_verified: cleanup,
      message_en: "Actual P10 gateway integration incomplete.",
      message_ko: "실제 P10 중계 통합 미완료.",
    });
    throw failure ?? new Error("P10 cleanup incomplete / P10 정리 미완료");
  }
  check(
    "owned-cleanup",
    cleanup,
    "Exact owned HTTP, node/native process, private file and database resources are removed.",
    "정확히 소유한HTTP·노드/지속엔진·비공개파일·DB자원을 제거했습니다.",
    cleanup,
    "runtime/cleanup.json",
  );
  requireGatewayCases(assertions);
  for (const file of Object.keys(evidenceHashes(output))) {
    if (file.endsWith(".tar") || file.endsWith(".bin")) continue;
    const text = readFileSync(join(output, file), "utf8");
    runtime.assertSafe(text);
    if (secrets.some((s) => s && text.includes(s)))
      throw new Error(
        "Private credential in gateway evidence / 중계 근거에 비공개 인증값 존재",
      );
  }
  const report: GatewayReport = {
    assertions_passed: assertions.length,
    assertions_total: GATEWAY_CASE_IDS.length,
    cleanup_verified: true,
    routes,
    events,
    cases: assertions.map((a) => ({
      case_id: a.assertion_id,
      status: a.status,
      message_en: a.message_en,
      message_ko: a.message_ko,
      evidence_path: a.evidence_path,
    })),
    evidence: [
      {
        name_en: "Fresh source and aggregate",
        name_ko: "새 원본·집계",
        path: "source/candidate.json",
      },
      {
        name_en: "Independent consumer SQL",
        name_ko: "독립 수신자 SQL",
        path: "readbacks/sql-live.json",
      },
      {
        name_en: "Recorded gateway history",
        name_ko: "기록된 중계 이력",
        path: "events.json",
      },
      {
        name_en: "Actual process faults and controls",
        name_ko: "실제 프로세스 장애·제어",
        path: "process-events.json",
      },
    ],
  };
  write(output, "report-gateway.json", report);
  write(output, "assertions.json", assertions);
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error("Source changed during P10 / P10 실행 중 소스 변경");
  write(output, "manifest.json.tmp", {
    schema_version: "0.1",
    source,
    graph_id: fixture!.graph.graphId,
    graph_manifest_sha256: fixture!.graph.manifestSha256,
    implementation_sha256: fingerprint,
    status: "PASS",
    cleanup_verified: true,
    output_sha256: evidenceHashes(output),
    completed_at_utc: new Date().toISOString(),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return { gateway: report, assertions };
}
export async function main(
  args = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    let graph = "",
      output = "";
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--graph" && !graph) graph = args[++i] ?? "";
      else if (args[i] === "--output" && !output) output = args[++i] ?? "";
      else if (args[i] === "--help") {
        io.out(
          "Usage / 사용법: gateway:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY",
        );
        return 0;
      } else throw new Error("Unknown argument / 알수없는 인자");
    }
    if (!graph || !output || graph.startsWith("-") || output.startsWith("-"))
      throw new Error("Graph and new output required / 지도·새출력 필요");
    await runGatewayChecks(graph, output);
    return 0;
  } catch (error) {
    io.error("P10 incomplete / P10 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
