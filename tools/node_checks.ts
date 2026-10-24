/** Actual native two-node lifecycle checks / 실제 지속 엔진 두 노드 수명주기 검사. */
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  cpSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
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
import { loadSeoulGraph } from "./seoul_bundle.js";
import { createTrafficScenario, TRAFFIC_START } from "./traffic_scenario.js";
import { prepareTrafficBundle } from "./traffic_bundle.js";
import {
  summarizeTrafficRoute,
  assertPublicTrafficProvenance,
  type RecordedTrafficRoute,
} from "./traffic_checks.js";
import { IngestionStore } from "./ingestion_store.js";
import { AggregationStore } from "./aggregation_store.js";
import { PublicationStore } from "./publication_store.js";
import { PublicationConsumer } from "./publication_consumer.js";
import {
  OwnedIngestionRuntime,
  pause,
  portIsOpen,
  type OwnedIngestionProcess,
} from "./ingestion_runtime.js";
import {
  buildIngestBatches,
  assertNoSensitiveDiagnostics,
} from "./ingestion_checks.js";
import type {
  StoreConfig,
  ServiceCredential,
  ServiceConfig,
  WorkerConfig,
} from "./ingestion_types.js";
import type { AggregationStoreConfig } from "./aggregation_types.js";
import type {
  PublicationStoreConfig,
  PublicationSigner,
  ConsumerConfig,
  TrustRoot,
} from "./publication_types.js";
import type {
  RoutingNodeConfig,
  NodeStatus,
  NodePhase,
  NodeRouteSuccess,
  NodeReply,
  NativeDaemonIdentity,
} from "./node_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
const at = (ms: number) =>
  new Date(Date.parse(TRAFFIC_START) + ms).toISOString();
export const NODE_CASE_IDS = [
  "fresh-source",
  "independent-nodes",
  "baseline-same-daemon",
  "native-readiness",
  "unauthorized",
  "invalid-input",
  "body-limit",
  "generation-mismatch",
  "capacity-eight",
  "signed-http-pull",
  "two-node-live-detour",
  "held-old-lease",
  "activation-new-request",
  "obsolete-result-rejected",
  "last-lease-cleanup",
  "expired-candidate",
  "before-expiry",
  "automatic-baseline-expiry",
  "offline-node-expiry",
  "publisher-outage",
  "store-outage",
  "corrupt-generation",
  "engine-kill",
  "node-kill",
  "parent-reaping",
  "durable-restart",
  "two-slot-coalescing",
  "non-live-correction",
  "accepted-key-revoked",
  "deadline-drain-bound",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p09-" + id);
export function requireNodeCases(assertions: SimulationAssertion[]): void {
  const ids = assertions.map((a) => a.assertion_id);
  if (
    ids.length !== NODE_CASE_IDS.length ||
    new Set(ids).size !== ids.length ||
    NODE_CASE_IDS.some((id) => !ids.includes(id)) ||
    assertions.some((a) => a.status !== "PASS")
  )
    throw new Error("P09 required cases incomplete / P09 필수 검사 미완료");
}
export interface RecordedNodeRoute extends RecordedTrafficRoute {
  node_id: string;
  instance_id: string;
  activation_epoch: number;
  native_daemon: NativeDaemonIdentity;
}
export interface NodeReport {
  assertions_passed: number;
  assertions_total: number;
  cleanup_verified: boolean;
  routes: RecordedNodeRoute[];
  events: {
    event_id: string;
    recorded_at_utc: string;
    node_id: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
    status: NodeStatus | null;
  }[];
  cases: {
    case_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }[];
  evidence: { name_en: string; name_ko: string; path: string }[];
}
const write = (root: string, file: string, data: unknown) =>
  writeFileSync(join(root, file), JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
const done = async (child: OwnedIngestionProcess) => {
  const message = await child.message((m) => m.type === "RESULT", 300000);
  const exit = await child.exited(300000);
  return { message, exit, pid: child.child?.pid };
};
/** Only fresh source preparation is shared in this integration module; no prior PASS reuse.
 * 새 원본 준비만 좁게 묶으며 과거 성공 자료는 재사용하지 않습니다. */
export async function prepareNodeSource(
  graphDirectory: string,
  output: string,
  runtime: OwnedIngestionRuntime,
  stores: Array<{ close(): Promise<void> }>,
) {
  const graph = loadSeoulGraph(graphDirectory),
    scene = createTrafficScenario(graph);
  mkdirSync(join(output, "source"));
  mkdirSync(join(output, "source/synthetic-engines"));
  write(output, "source/expected.json", {
    calculated_before_matching: true,
    targets: scene.targets,
    trips: scene.expected,
    window_start: at(180000),
    window_end: at(240000),
    deadline: at(270000),
    valid_until: at(420000),
    maximum_boundary_error_ms: 150,
    median_speed_relative_error: 0.02,
    clipping_policy: scene.clipping_policy,
  });
  write(output, "source/scenario.json", scene.spec);
  write(output, "source/observations.json", scene.observations);
  write(output, "source/full-truth.json", scene.simulation.truth);
  write(output, "source/catalog.json", scene.catalog);
  const bundle = await prepareTrafficBundle(
    graph.directory,
    join(output, "bundle"),
  );
  await runtime.start();
  const config: StoreConfig = {
    database_url: runtime.databaseUrl,
    namespace: "p09-" + runtime.runId.replace(/-/g, "").slice(0, 16),
    graph_id: graph.graphId,
    matching_policy: "seoul-observed-v3",
  };
  const credentials: ServiceCredential[] = scene.expected.map((e) => ({
    token: randomBytes(24).toString("hex"),
    principal: {
      contributor_id: e.contributor_id,
      vehicle_id: e.vehicle_id,
      consent_version: "pilot-consent-v1",
    },
  }));
  const ingestion = new IngestionStore(config);
  stores.push(ingestion);
  await ingestion.initialize(credentials.map((c) => c.principal));
  const aggregation: AggregationStoreConfig = {
    store: config,
    catalog: scene.catalog,
    source_class: "SYNTHETIC",
  };
  const aggregate = new AggregationStore(aggregation);
  stores.push(aggregate);
  await aggregate.initialize();
  const publication: PublicationStoreConfig = {
    aggregation,
    publisher_id: "seoul-p09-publisher",
  };
  const publisher = new PublicationStore(publication);
  stores.push(publisher);
  await publisher.initialize();
  let now = TRAFFIC_START;
  const advance = async (ms: number) => {
    now = await ingestion.advanceEventTime(at(ms));
    return now;
  };
  const api = runtime.spawn("p09-source-api", "ingestion_service", {
    store: config,
    credentials,
    event_time_utc: now,
    port: 0,
  } satisfies ServiceConfig);
  const apiReady = await api.message(
      (m) => m.type === "READY" && m.kind === "service",
    ),
    apiOrigin = "http://127.0.0.1:" + apiReady.port;
  const post = async (index: number, path: string, body?: unknown) => {
    const response = await fetch(apiOrigin + path, {
      method: "POST",
      headers: {
        authorization: "Bearer " + credentials[index]!.token,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json() };
  };
  const batches = scene.expected.flatMap((trip, index) =>
    buildIngestBatches(
      scene.observations.filter((p) => p.vehicle_id === trip.vehicle_id),
      trip.trip_id,
      graph.graphId,
      TRAFFIC_START,
    ).map((batch) => ({ index, batch })),
  );
  batches.sort(
    (a, b) =>
      Date.parse(a.batch.samples.at(-1)!.event_time_utc) -
        Date.parse(b.batch.samples.at(-1)!.event_time_utc) || a.index - b.index,
  );
  const replies = [];
  for (const { index, batch } of batches) {
    await advance(
      Date.parse(batch.samples.at(-1)!.event_time_utc) -
        Date.parse(TRAFFIC_START),
    );
    const reply = await post(index, "/v1/observations/batches", batch);
    replies.push({
      vehicle_id: scene.expected[index]!.vehicle_id,
      batch_id: batch.batch_id,
      checked_at_event_time: now,
      ...reply,
    });
    if (reply.status !== 202)
      throw new Error("P09 source HTTP rejected / P09 원본 HTTP 거부");
  }
  write(output, "source/http.json", replies);
  await advance(240000);
  const workers = [];
  for (let i = 0; i < 15; i++) {
    const result = await done(
      runtime.spawn("p09-source-worker-" + i, "ingestion_worker", {
        store: config,
        graph_directory: graph.directory,
        output_root: join(output, "source/synthetic-engines"),
        event_time_utc: now,
        owner_id: "p09-source-" + i,
      } satisfies WorkerConfig),
    );
    workers.push(result);
    if (result.message.code !== "SUCCEEDED" || result.exit.code !== 0) {
      write(output, "source/workers.json", workers);
      write(output, "source/db.json", await ingestion.inspect());
      throw new Error("P09 source matching failed / P09 원본 매칭 실패");
    }
  }
  write(output, "source/workers.json", workers);
  const state = await ingestion.inspect();
  write(output, "source/db.json", state);
  const timing = scene.expected.map((e) => {
    const rows = state.traversals.filter(
      (t) =>
        t.trip_id === e.trip_id &&
        t.edge_id === e.target.edge_id &&
        t.forward === e.target.forward,
    );
    return {
      vehicle_id: e.vehicle_id,
      count: rows.length,
      entry_error_ms: rows[0]
        ? Math.abs(
            Date.parse(rows[0].entered_at_utc) -
              Date.parse(TRAFFIC_START) -
              e.entered_at_ms,
          )
        : null,
      exit_error_ms: rows[0]
        ? Math.abs(
            Date.parse(rows[0].exited_at_utc) -
              Date.parse(TRAFFIC_START) -
              e.exited_at_ms,
          )
        : null,
    };
  });
  write(output, "source/timing.json", timing);
  await advance(270000);
  const candidate = await aggregate.finalize(at(180000), now);
  write(output, "source/candidate.json", candidate);
  const lives =
    candidate.code === "FINALIZED"
      ? candidate.draft.entries.filter((e) => e.status === "LIVE")
      : [];
  if (
    state.traversals.length !== 15 ||
    timing.some(
      (t) =>
        t.count !== 1 ||
        t.entry_error_ms === null ||
        t.exit_error_ms === null ||
        t.entry_error_ms > 150 ||
        t.exit_error_ms > 150,
    ) ||
    candidate.code !== "FINALIZED" ||
    candidate.draft.entries.length !== scene.catalog.length ||
    lives.length !== 3 ||
    !scene.targets.every((t) =>
      lives.some(
        (e) =>
          e.edge_id === t.edge_id &&
          e.forward === t.forward &&
          e.speed_mps !== null &&
          Math.abs(e.speed_mps / 0.5 - 1) <= 0.02,
      ),
    ) ||
    !scene.targets.every((t) =>
      candidate.selections.some(
        (e) =>
          e.edge_id === t.edge_id &&
          e.forward === t.forward &&
          e.eligible_contributors === 5,
      ),
    )
  )
    throw new Error("P09 source criteria failed / P09 원본 고정 기준 미달");
  return {
    graph,
    scene,
    bundle,
    config,
    credentials,
    ingestion,
    aggregate,
    publisher,
    publication,
    advance,
    post,
    get now() {
      return now;
    },
  };
}
export function nodeFailureMatches(
  reply: NodeReply,
  status: number,
  reason: string,
): boolean {
  return (
    reply.status === status &&
    reply.body.code === "UNAVAILABLE" &&
    reply.body.reason === reason &&
    !("engine_result" in reply.body) &&
    !("provenance" in reply.body)
  );
}
export async function runNodeChecks(
  graphDirectory: string,
  outputPath: string,
): Promise<{ nodes: NodeReport; assertions: SimulationAssertion[] }> {
  const output = resolve(outputPath);
  mkdirSync(output);
  for (const dir of [
    "public",
    "requests",
    "status",
    "readbacks",
    "negative",
    "nodes",
  ])
    mkdirSync(join(output, dir));
  const source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  const runtime = new OwnedIngestionRuntime(join(output, "runtime"), output),
    stores: Array<{ close(): Promise<void> }> = [],
    assertions: SimulationAssertion[] = [],
    routes: RecordedNodeRoute[] = [],
    events: NodeReport["events"] = [],
    privateKeys: string[] = [],
    nodeTokens: string[] = [],
    proxyRecords: unknown[] = [];
  const proxies: Array<{
    server: ReturnType<typeof createServer>;
    origin: string;
    offline: boolean;
    node_id: string;
  }> = [];
  const handles: Array<{
    child: OwnedIngestionProcess;
    config: RoutingNodeConfig;
    origin: string;
    instance_id: string;
  }> = [];
  let fixture: Awaited<ReturnType<typeof prepareNodeSource>> | undefined,
    report: NodeReport | undefined,
    failure: unknown,
    cleanup = false;
  const secrets = () => [
    ...privateKeys,
    ...nodeTokens,
    ...(fixture
      ? [
          fixture.config.database_url,
          ...fixture.credentials.map((c) => c.token),
        ]
      : []),
  ];
  const check = (
    id: string,
    pass: boolean,
    en: string,
    ko: string,
    expected: unknown,
    actual: unknown,
    path: string,
  ) => {
    assertions.push({
      assertion_id: "p09-" + id,
      status: pass ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected,
      actual,
      evidence_path: path,
    });
    writeFileSync(
      join(output, "assertions.json"),
      JSON.stringify(assertions, null, 2) + "\n",
    );
    if (!pass) throw new Error(en + " / " + ko);
  };
  const record = (
    event_id: string,
    node_id: string,
    message_en: string,
    message_ko: string,
    evidence_path: string,
    status: NodeStatus | null = null,
  ) => {
    events.push({
      event_id,
      recorded_at_utc: new Date().toISOString(),
      node_id,
      message_en,
      message_ko,
      evidence_path,
      status,
    });
    writeFileSync(
      join(output, "events.json"),
      JSON.stringify(events, null, 2) + "\n",
    );
  };
  try {
    fixture = await prepareNodeSource(graphDirectory, output, runtime, stores);
    const f = fixture;
    check(
      "fresh-source",
      true,
      "Fresh fifteen-trip HTTP/P05/P06 source meets the unchanged fixed Seoul criteria.",
      "새 HTTP·P05·P06의15여행이 기존 서울 고정 기준을 만족합니다.",
      { trips: 15, targets: 3, contributors_each: 5 },
      true,
      "source/candidate.json",
    );
    const request = {
      graph_id: f.graph.graphId,
      locations: [
        { lon: 127.029, lat: 37.4984 },
        { lon: 127.049, lat: 37.5045 },
      ] as [{ lon: number; lat: number }, { lon: number; lat: number }],
    };
    write(output, "request.json", request);
    const roots: TrustRoot[] = [],
      signers: PublicationSigner[] = [];
    for (const kid of [
      "node-key-a",
      "node-key-b",
      "node-key-c",
      "node-key-d",
    ]) {
      const key = await generateKeyPair("EdDSA", { extractable: true }),
        private_jwk = await exportJWK(key.privateKey),
        public_jwk = await exportJWK(key.publicKey);
      privateKeys.push(private_jwk.d!);
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
      "p09-publication-service",
      "publication_service",
      { publication: f.publication, port: 0 },
    );
    const publisherReady = await publisherChild.message(
      (m) => m.type === "READY" && m.kind === "publication-service",
    );
    const publicationOrigin = "http://127.0.0.1:" + publisherReady.port;
    const publish = async (index: number) => {
      const result = await done(
        runtime.spawn(
          "p09-publisher-" + runtime.processes.length,
          "publication_worker",
          {
            publication: f.publication,
            signer: signers[index]!,
            window_start: at(180000),
            event_time_utc: f.now,
          },
        ),
      );
      if (result.message.code !== "PUBLISHED" || result.exit.code !== 0)
        throw new Error("Fresh signed publication failed / 새 서명 게시 실패");
      const inspection = await f.publisher.inspect(),
        p = inspection.publications.at(-1)!;
      const current = await fetch(
        publicationOrigin +
          "/v1/simulations/" +
          f.config.namespace +
          "/regions/seoul-pilot-corridors-v1/current",
      );
      const artifact = await fetch(
        publicationOrigin +
          "/v1/simulations/" +
          f.config.namespace +
          "/artifacts/" +
          p.traffic_snapshot_id,
      );
      const jws = await current.text(),
        bytes = Buffer.from(await artifact.arrayBuffer());
      if (
        current.status !== 200 ||
        artifact.status !== 200 ||
        jws !== p.jws ||
        !bytes.equals(Buffer.from(p.artifact))
      )
        throw new Error(
          "Actual signed HTTP bytes differ / 실제 서명 HTTP 바이트 불일치",
        );
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
        result,
        http_status: current.status,
        artifact_status: artifact.status,
        artifact_sha256: sha256(bytes),
        sequence: p.sequence,
        traffic_snapshot_id: p.traffic_snapshot_id,
      });
      return p;
    };
    const proxy = async (node_id: string) => {
      const item = {
        server: createServer(),
        origin: "",
        offline: false,
        node_id,
      };
      item.server.on("request", (req, res) => {
        void (async () => {
          const url = req.url ?? "/";
          let status = 502,
            body = Buffer.from(
              "Publisher transport unavailable / 게시 전송 사용불가",
            ),
            headers: Record<string, string> = { "content-type": "text/plain" };
          if (!item.offline) {
            try {
              const upstream = await fetch(publicationOrigin + url, {
                redirect: "error",
                signal: AbortSignal.timeout(5000),
              });
              status = upstream.status;
              body = Buffer.from(await upstream.arrayBuffer());
              headers = Object.fromEntries(upstream.headers);
            } catch {}
          }
          proxyRecords.push({
            node_id,
            path: url,
            status,
            sha256: sha256(body),
            byte_length: body.length,
            proxy_transport_unavailable: item.offline,
          });
          res.writeHead(status, headers);
          res.end(body);
        })().catch(() => {
          res.writeHead(502);
          res.end();
        });
      });
      await new Promise<void>((ok) => item.server.listen(0, "127.0.0.1", ok));
      const address = item.server.address();
      if (!address || typeof address === "string")
        throw new Error("Proxy address unavailable / 대리 접속 주소 없음");
      item.origin = "http://127.0.0.1:" + address.port;
      proxies.push(item);
      return item;
    };
    const proxyA = await proxy("seoul-node-a"),
      proxyB = await proxy("seoul-node-b");
    const configs: RoutingNodeConfig[] = [];
    for (const [index, p] of [proxyA, proxyB].entries()) {
      mkdirSync(join(output, "nodes", p.node_id));
      const token = randomBytes(24).toString("hex");
      nodeTokens.push(token);
      const consumer: ConsumerConfig = {
        store: f.config,
        consumer_id: "p09-consumer-" + index,
        publisher_id: f.publication.publisher_id,
        region_id: "seoul-pilot-corridors-v1",
        allowed_graph_ids: [f.graph.graphId],
        catalogs: [{ graph_id: f.graph.graphId, edges: f.scene.catalog }],
        trust_roots: roots,
        origin: p.origin,
      };
      const store = new PublicationConsumer(consumer);
      stores.push(store);
      await store.initialize();
      configs.push({
        node_id: p.node_id,
        consumer,
        graph_directory: f.graph.directory,
        bundle_directory: f.bundle.directory,
        generation_root: join(output, "nodes", p.node_id, "generations"),
        runtime_root: join(
          output,
          "nodes",
          p.node_id,
          "runtime-" + randomUUID(),
        ),
        token,
        port: 0,
        poll_interval_ms: 500,
      });
    }
    const start = async (config: RoutingNodeConfig) => {
      const child = runtime.spawn(
          "p09-node-" + runtime.processes.length,
          "node_service",
          config,
        ),
        ready = await child.message(
          (m) => m.type === "READY" && m.kind === "routing-node",
          300000,
        );
      const handle = {
        child,
        config,
        origin: "http://127.0.0.1:" + ready.port,
        instance_id: String(ready.instance_id),
      };
      handles.push(handle);
      return handle;
    };
    type Handle = Awaited<ReturnType<typeof start>>;
    const http = async (
      node: Handle,
      path: string,
      body?: unknown,
      options: { token?: string; raw?: string } = {},
    ) => {
      const response = await fetch(node.origin + path, {
        method:
          body === undefined && options.raw === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer " + (options.token ?? node.config.token),
          "content-type": "application/json",
        },
        ...(body !== undefined || options.raw !== undefined
          ? { body: options.raw ?? JSON.stringify(body) }
          : {}),
        signal: AbortSignal.timeout(45000),
      });
      const text = await response.text();
      assertNoSensitiveDiagnostics(text, secrets());
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: JSON.parse(text),
      };
    };
    const getStatus = async (node: Handle) => {
      const response = await http(node, "/internal/v1/status");
      if (
        ![200, 503].includes(response.status) ||
        !Array.isArray(response.body.slots) ||
        typeof response.body.ready !== "boolean"
      )
        throw new Error(
          "Status HTTP rejected / 상태 HTTP 거부: " + JSON.stringify(response),
        );
      return response.body as NodeStatus;
    };
    const captureStatus = async (node: Handle, label: string) => {
      const state = await getStatus(node);
      write(output, "status/" + label + ".json", state);
      record(
        label,
        node.config.node_id,
        "Recorded node state: " + label,
        "기록된 노드 상태: " + label,
        "status/" + label + ".json",
        state,
      );
      return state;
    };
    const waitState = async (
      node: Handle,
      predicate: (s: NodeStatus) => boolean,
      label: string,
      timeout = 180000,
    ) => {
      const started = performance.now();
      let state: NodeStatus | undefined;
      while (performance.now() - started < timeout) {
        state = await getStatus(node);
        if (predicate(state)) {
          write(output, "status/" + label + ".json", state);
          record(
            label,
            node.config.node_id,
            "Observed node transition: " + label,
            "관측한 노드 전환: " + label,
            "status/" + label + ".json",
            state,
          );
          return state;
        }
        await pause(100);
      }
      write(output, "status/" + label + "-timeout.json", state);
      throw new Error("Node state deadline / 노드 상태 제한시간: " + label);
    };
    const control = async (node: Handle, command: Record<string, unknown>) => {
      const control_id = randomUUID();
      node.child.send({ ...command, control_id });
      const ack = await node.child.message(
        (m) => m.type === "CONTROL_RESULT" && m.control_id === control_id,
        180000,
      );
      if (ack.code === "REJECTED")
        throw new Error(
          "Private node control refused / 비공개 노드 제어 거부: " +
            JSON.stringify(ack),
        );
      return ack;
    };
    const phase = async (
      node: Handle,
      name: NodePhase,
      request_id?: string,
      cursor = 0,
    ) =>
      node.child.message(
        (m) =>
          node.child.messages.indexOf(m) >= cursor &&
          m.type === "PHASE" &&
          m.phase === name &&
          (request_id === undefined || m.request_id === request_id),
        180000,
      );
    const requestRoute = async (
      node: Handle,
      id: string,
      extra: Record<string, unknown> = {},
    ) => {
      const result = await http(node, "/internal/v1/route", {
        request_id: id,
        ...request,
        ...extra,
      });
      write(output, "requests/" + id + ".json", result);
      return result as NodeReply;
    };
    const recordRoute = (label: string, result: NodeReply) => {
      if (result.status !== 200 || result.body.code !== "ROUTE")
        throw new Error(
          "Actual node route failed / 실제 노드 경로 실패: " +
            JSON.stringify(result),
        );
      const body = result.body;
      const { activation_epoch, native_daemon, ...traffic } = body.provenance;
      assertPublicTrafficProvenance(traffic, secrets());
      if (
        !Number.isSafeInteger(native_daemon.pid) ||
        native_daemon.pid <= 1 ||
        typeof native_daemon.start_ticks !== "string" ||
        !/^[1-9]\d*$/.test(native_daemon.start_ticks)
      )
        throw new Error("Native daemon identity missing / 지속 엔진 식별 누락");
      const summary = summarizeTrafficRoute(
        label,
        {
          code: "ROUTE",
          traffic_mode: traffic.traffic_mode,
          engine_result: body.engine_result,
          provenance: traffic,
        },
        "requests/" + body.request_id + ".json",
      );
      const recorded = {
        ...summary,
        node_id: body.node_id,
        instance_id: body.instance_id,
        activation_epoch,
        native_daemon,
      };
      routes.push(recorded);
      return recorded;
    };
    const stop = async (node: Handle) => {
      await control(node, { type: "SHUTDOWN" });
      const stopped = await node.child.message(
        (m) => m.type === "STOPPED",
        60000,
      );
      const exited = await node.child.exited(60000);
      if (!stopped.cleanup_verified || exited.code !== 0)
        throw new Error(
          "Owned node shutdown incomplete / 소유 노드 정상종료 미완료",
        );
    };
    const inspectOwnership = (node: Handle, generation?: string) => {
      const found: Array<{ file: string; record: any }> = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isSymbolicLink())
            throw new Error(
              "Ownership symlink refused / 소유권 심볼릭 링크 거부",
            );
          const file = join(dir, entry.name);
          if (entry.isDirectory()) walk(file);
          else if (entry.name === "ownership.json") {
            const record = JSON.parse(readFileSync(file, "utf8"));
            if (
              record.schema_version === "p09-engine-0.1" &&
              (!generation || record.generation_id === generation)
            )
              found.push({ file, record });
          }
        }
      };
      walk(node.config.runtime_root);
      return found;
    };
    const exactEngine = (record: any) => {
      if (
        !/^[a-f0-9-]{36}$/.test(record.owner_id) ||
        record.container_name !== "routelens-p02-" + record.owner_id ||
        record.owner_label !== "io.routelens.run_id=" + record.owner_id ||
        !resolve(record.work_directory).startsWith(output + "/")
      )
        throw new Error(
          "Invalid recorded node ownership / 노드 소유권 기록 오류",
        );
      const inspected = runtime.commands.command(
        ["inspect", record.container_name],
        10000,
        true,
      );
      if (inspected.status !== 0) {
        if (!/No such (?:container|object)/i.test(inspected.stderr))
          throw new Error("Engine absence not confirmed / 엔진 부재 미확인");
        return null;
      }
      const actual = JSON.parse(inspected.stdout)[0];
      if (
        actual.Id !== record.container_id ||
        actual.Name !== "/" + record.container_name ||
        actual.Config.Labels["io.routelens.run_id"] !== record.owner_id ||
        !actual.Mounts.some(
          (m: any) =>
            m.Destination === "/work" &&
            resolve(m.Source) === resolve(record.work_directory),
        )
      )
        throw new Error(
          "Exact engine ownership mismatch / 정확한 엔진 소유권 불일치",
        );
      return actual;
    };
    const reap = async (node: Handle, label: string) => {
      const records = inspectOwnership(node),
        result = [];
      for (const item of records) {
        const actual = exactEngine(item.record);
        if (actual)
          runtime.commands.command(
            ["rm", "-f", item.record.container_name],
            30000,
          );
        const absent = runtime.commands.command(
          ["inspect", item.record.container_name],
          10000,
          true,
        );
        if (
          absent.status === 0 ||
          !/No such (?:container|object)/i.test(absent.stderr)
        )
          throw new Error(
            "Owned engine reaping incomplete / 소유 엔진 회수 미완료",
          );
        result.push({
          record: item.record,
          was_present: !!actual,
          absent: true,
        });
      }
      write(output, "readbacks/" + label + ".json", result);
      return result;
    };
    let a = await start(configs[0]!),
      b = await start(configs[1]!);
    const [initialA, initialB] = await Promise.all([
      waitState(
        a,
        (s) => s.ready && s.active?.traffic_mode === "NO_USABLE_SNAPSHOT",
        "a-baseline",
      ),
      waitState(
        b,
        (s) => s.ready && s.active?.traffic_mode === "NO_USABLE_SNAPSHOT",
        "b-baseline",
      ),
    ]);
    check(
      "independent-nodes",
      a.instance_id !== b.instance_id &&
        a.config.consumer.consumer_id !== b.config.consumer.consumer_id &&
        a.child.child?.pid !== b.child.child?.pid &&
        a.origin !== b.origin,
      "Two actual node processes own independent consumers, listeners and native engines.",
      "실제 노드 프로세스 두 개가 별도 수신자·접속처·지속 엔진을 소유합니다.",
      true,
      { a: initialA, b: initialB },
      "status/a-baseline.json",
    );
    const baseline = recordRoute(
        "baseline",
        await requestRoute(a, "baseline-a-1"),
      ),
      baselineAgain = recordRoute(
        "baseline-repeat",
        await requestRoute(a, "baseline-a-2"),
      );
    recordRoute("baseline-b", await requestRoute(b, "baseline-b-1"));
    check(
      "baseline-same-daemon",
      canonical(baseline.native_daemon).equals(
        canonical(baselineAgain.native_daemon),
      ) &&
        baseline.generation_id === baselineAgain.generation_id &&
        baseline.shape === baselineAgain.shape,
      "Repeated actual HTTP routes use one unchanged native daemon.",
      "반복한 실제 HTTP 경로 요청이 같은 지속 엔진을 사용합니다.",
      baseline.native_daemon,
      baselineAgain.native_daemon,
      "requests/baseline-a-2.json",
    );
    const baselineOwnership = inspectOwnership(a, baseline.generation_id);
    write(output, "readbacks/native-readiness.json", baselineOwnership);
    check(
      "native-readiness",
      baselineOwnership.some(
        (o) =>
          o.record.native_daemon?.pid === baseline.native_daemon.pid &&
          o.record.native_daemon?.start_ticks ===
            baseline.native_daemon.start_ticks &&
          exactEngine(o.record),
      ),
      "Readiness records bind actual route, live daemon and owned native listener.",
      "준비 기록이 실제 경로·생존 지속 엔진·소유 리스너에 연결됩니다.",
      baseline.native_daemon,
      baselineOwnership,
      "readbacks/native-readiness.json",
    );
    const nativeRequestCount = (node: Handle) =>
      inspectOwnership(node).reduce((total, item) => {
        const directory = join(item.record.work_directory, "requests");
        return (
          total +
          (existsSync(directory)
            ? readdirSync(directory, { withFileTypes: true }).filter((entry) =>
                entry.isDirectory(),
              ).length
            : 0)
        );
      }, 0);
    const negativeNativeBefore = nativeRequestCount(a);
    const unauthorized = await http(a, "/internal/v1/status", undefined, {
      token: "invalid-simulation-token",
    });
    write(output, "negative/unauthorized.json", unauthorized);
    check(
      "unauthorized",
      nodeFailureMatches(unauthorized, 401, "AUTH_REQUIRED"),
      "Unauthenticated requests are refused without native work.",
      "인증되지 않은 요청을 지속 엔진 작업 전에 거부합니다.",
      401,
      unauthorized,
      "negative/unauthorized.json",
    );
    const invalid = await requestRoute(a, "invalid-input", {
        unknown_field: true,
      }),
      wrongGraph = await requestRoute(a, "invalid-graph", {
        graph_id: "0".repeat(64),
      });
    const publicClock = await requestRoute(a, "invalid-public-clock", {
      event_time_utc: at(430000),
    });
    const clockAfterInvalid = (await getStatus(a)).active
      ?.checked_at_event_time;
    write(output, "negative/invalid-input.json", {
      invalid,
      wrongGraph,
      publicClock,
      clockAfterInvalid,
    });
    check(
      "invalid-input",
      nodeFailureMatches(invalid, 422, "INVALID_REQUEST") &&
        nodeFailureMatches(wrongGraph, 422, "INVALID_REQUEST") &&
        nodeFailureMatches(publicClock, 422, "INVALID_REQUEST") &&
        clockAfterInvalid === at(270000),
      "Strict unknown-field and graph scope validation precedes native calls.",
      "알 수 없는 필드·지도 범위 검사를 지속 엔진 호출 전에 수행합니다.",
      422,
      { invalid, wrongGraph },
      "negative/invalid-input.json",
    );
    const oversize = await http(a, "/internal/v1/route", undefined, {
      raw: " ".repeat(65537),
    });
    write(output, "negative/body-limit.json", oversize);
    check(
      "body-limit",
      nodeFailureMatches(oversize, 422, "BODY_TOO_LARGE"),
      "The actual HTTP listener enforces its 64KiB request limit.",
      "실제 HTTP 접속처가64KiB 요청 상한을 지킵니다.",
      422,
      oversize,
      "negative/body-limit.json",
    );
    const mismatch = await requestRoute(a, "generation-mismatch", {
      expected_generation_id: "f".repeat(64),
    });
    const negativeNativeAfter = nativeRequestCount(a);
    write(output, "negative/native-requests-unchanged.json", {
      before: negativeNativeBefore,
      after: negativeNativeAfter,
      request_ids: [
        "invalid-input",
        "invalid-graph",
        "invalid-public-clock",
        "generation-mismatch",
      ],
      auth_and_body_limit_included: true,
    });
    check(
      "generation-mismatch",
      nodeFailureMatches(mismatch, 409, "GENERATION_MISMATCH") &&
        negativeNativeBefore === negativeNativeAfter,
      "An expected-generation mismatch is refused before native work.",
      "기대 세대 불일치를 지속 엔진 작업 전에 거부합니다.",
      409,
      mismatch,
      "requests/generation-mismatch.json",
    );
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
    });
    const capacityCursor = a.child.messages.length;
    const heldCapacity = Array.from({ length: 8 }, (_, i) =>
      requestRoute(a, "capacity-" + i),
    );
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        phase(a, "AFTER_NODE_ENGINE_RESULT", "capacity-" + i, capacityCursor),
      ),
    );
    const full = await captureStatus(a, "capacity-eight");
    const excess = await requestRoute(a, "capacity-excess");
    await control(a, { type: "RESUME", phase: "AFTER_NODE_ENGINE_RESULT" });
    await control(a, { type: "SET_NODE_PAUSE", phase: null });
    const completedCapacity = await Promise.all(heldCapacity);
    write(output, "readbacks/capacity.json", {
      full,
      excess,
      completed: completedCapacity,
    });
    check(
      "capacity-eight",
      full.in_flight === 8 &&
        nodeFailureMatches(excess, 429, "CAPACITY") &&
        completedCapacity.every((r) => r.status === 200),
      "Eight actual held native requests pin leases; the ninth receives 429.",
      "실제 지속 엔진 요청8개가 고정된 동안9번째 요청은429를 받습니다.",
      8,
      full.in_flight,
      "readbacks/capacity.json",
    );
    const first = await publish(0);
    const liveStates = await Promise.all([
      waitState(
        a,
        (s) => s.ready && s.active?.sequence === first.sequence,
        "a-live",
      ),
      waitState(
        b,
        (s) => s.ready && s.active?.sequence === first.sequence,
        "b-live",
      ),
    ]);
    const liveA = recordRoute("live-a", await requestRoute(a, "live-a")),
      liveB = recordRoute("live-b", await requestRoute(b, "live-b"));
    write(output, "readbacks/signed-pull.json", {
      states: liveStates,
      proxy_requests: proxyRecords,
    });
    check(
      "signed-http-pull",
      liveStates.every(
        (s) => s.active?.traffic_snapshot_id === first.traffic_snapshot_id,
      ) &&
        proxies.every((p) =>
          proxyRecords.some(
            (r: any) =>
              r.node_id === p.node_id &&
              r.status === 200 &&
              r.path.includes("/artifacts/"),
          ),
        ),
      "Both independent consumers accept exact signed bytes through real HTTP pulls.",
      "독립 수신자 둘이 실제 HTTP 조회로 정확한 서명 바이트를 수용합니다.",
      first.traffic_snapshot_id,
      liveStates,
      "readbacks/signed-pull.json",
    );
    check(
      "two-node-live-detour",
      [liveA, liveB].every(
        (r) =>
          r.traffic_mode === "LIVE" &&
          r.shape !== baseline.shape &&
          r.distance_m - baseline.distance_m >= 50 &&
          r.eta_s - baseline.eta_s >= 5 &&
          f.scene.targets.every((t) => !r.trace_edge_ids.includes(t.edge_id)),
      ),
      "Both native nodes route around the fixed three-edge synthetic congestion.",
      "지속 노드 둘이 고정3구간의 합성 정체를 실제로 우회합니다.",
      { minimum_extra_m: 50, minimum_extra_eta_s: 5 },
      [liveA, liveB],
      "requests/live-a.json",
    );
    await stop(b);
    b = await start({
      ...b.config,
      runtime_root: join(
        output,
        "nodes",
        b.config.node_id,
        "runtime-key-revoked-" + randomUUID(),
      ),
      consumer: {
        ...b.config.consumer,
        trust_roots: roots.map((r) =>
          r.kid === signers[0]!.kid ? { ...r, revoked: true } : r,
        ),
      },
    });
    const keyRevoked = await waitState(
      b,
      (s) =>
        s.ready &&
        s.active?.traffic_mode === "NO_USABLE_SNAPSHOT" &&
        s.active.high_water === 1,
      "b-accepted-key-revoked",
    );
    check(
      "accepted-key-revoked",
      keyRevoked.active?.traffic_snapshot_id === null &&
        keyRevoked.active.high_water === 1,
      "A restarted node with the same consumer identity refuses its revoked accepted key and retains high-water.",
      "같은 수신자 식별자로 재시작한 노드가 수용 키 철회를 반영하고 최고순번을 보존합니다.",
      { high_water: 1, snapshot: null },
      keyRevoked,
      "status/b-accepted-key-revoked.json",
    );
    const second = await publish(1);
    await Promise.all([
      waitState(
        a,
        (s) => s.ready && s.active?.sequence === second.sequence,
        "a-live-2",
      ),
      waitState(
        b,
        (s) => s.ready && s.active?.sequence === second.sequence,
        "b-live-2",
      ),
    ]);
    proxyB.offline = true;
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "old-held",
    });
    const oldCursor = a.child.messages.length,
      oldPending = requestRoute(a, "old-held");
    const oldPhase = await phase(
      a,
      "AFTER_NODE_ENGINE_RESULT",
      "old-held",
      oldCursor,
    );
    const held = await captureStatus(a, "old-lease-held");
    check(
      "held-old-lease",
      held.in_flight === 1 &&
        held.active?.sequence === second.sequence &&
        inspectOwnership(a, oldPhase.generation_id).some((o) =>
          exactEngine(o.record),
        ),
      "An actual completed native request retains its original engine lease while held.",
      "실제 계산을 마친 지속 엔진 요청이 대기 중 원래 엔진 고정을 유지합니다.",
      1,
      held.in_flight,
      "status/old-lease-held.json",
    );
    const third = await publish(2);
    await control(a, { type: "RECONCILE", pull: true });
    const switched = await waitState(
      a,
      (s) =>
        s.ready &&
        s.active?.sequence === third.sequence &&
        s.slots.some(
          (slot) => slot.state === "DRAINING" && slot.in_flight === 1,
        ),
      "old-draining-new-active",
    );
    const newer = recordRoute(
      "new-active",
      await requestRoute(a, "new-active"),
    );
    check(
      "activation-new-request",
      newer.sequence === third.sequence &&
        newer.generation_id !== oldPhase.generation_id &&
        switched.slots.length === 2 &&
        inspectOwnership(a, oldPhase.generation_id).some((o) =>
          exactEngine(o.record),
        ),
      "A new request uses the newly active engine while the old leased daemon is still alive and draining.",
      "옛 고정 엔진이 생존하며 마무리하는 동안 새 요청은 새 활성 엔진을 사용합니다.",
      third.sequence,
      { switched, newer },
      "status/old-draining-new-active.json",
    );
    await control(a, {
      type: "RESUME",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "old-held",
    });
    await control(a, { type: "SET_NODE_PAUSE", phase: null });
    const obsolete = await oldPending;
    record(
      "obsolete-result-rejected",
      a.config.node_id,
      "Old completed response rejected: 409 ACCEPTED_STATE_CHANGED",
      "옛 완료 응답 거부:409 ACCEPTED_STATE_CHANGED",
      "requests/old-held.json",
    );
    check(
      "obsolete-result-rejected",
      nodeFailureMatches(obsolete, 409, "ACCEPTED_STATE_CHANGED"),
      "The old native result is rejected instead of mixing old geometry with new provenance.",
      "옛 지형과 새 출처정보를 섞지 않고 이전 지속 엔진 결과를 거부합니다.",
      409,
      obsolete,
      "requests/old-held.json",
    );
    const settled = await waitState(
      a,
      (s) => s.slots.length === 1 && s.in_flight === 0,
      "last-lease-retired",
    );
    const retired = inspectOwnership(a, oldPhase.generation_id).map((o) => ({
      record: o.record,
      absent: exactEngine(o.record) === null,
    }));
    write(output, "readbacks/last-lease-cleanup.json", retired);
    check(
      "last-lease-cleanup",
      retired.length > 0 &&
        retired.every((r) => r.absent) &&
        settled.slots.length === 1,
      "The last released old lease causes its exact daemon to be retired.",
      "마지막 옛 요청 고정이 해제되면 해당 지속 엔진을 정확히 정리합니다.",
      true,
      retired,
      "readbacks/last-lease-cleanup.json",
    );
    // Hold one real request across two more desired updates; the newest version must win.
    // 실제 요청 하나를 두 번의 추가 교체 동안 유지하고 최신 버전으로 합쳐지는지 검사합니다.
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "coalesce-held",
    });
    const coalesceCursor = a.child.messages.length,
      coalescePending = requestRoute(a, "coalesce-held");
    await phase(a, "AFTER_NODE_ENGINE_RESULT", "coalesce-held", coalesceCursor);
    const fourth = await publish(3);
    await control(a, { type: "RECONCILE", pull: true });
    await waitState(
      a,
      (s) => s.active?.sequence === fourth.sequence && s.slots.length === 2,
      "coalesce-two-slots",
    );
    const fifth = await publish(0);
    await control(a, { type: "RECONCILE", pull: true });
    const fifthWaiting = await captureStatus(a, "coalesce-fifth-waiting");
    const sixth = await publish(1);
    await control(a, { type: "RECONCILE", pull: true });
    const sixthWaiting = await captureStatus(a, "coalesce-sixth-waiting");
    await control(a, {
      type: "RESUME",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "coalesce-held",
    });
    await control(a, { type: "SET_NODE_PAUSE", phase: null });
    const coalesceOld = await coalescePending;
    const coalesced = await waitState(
      a,
      (s) =>
        s.ready &&
        s.active?.sequence === sixth.sequence &&
        s.slots.length === 1,
      "coalesced-latest-active",
    );
    const fifthGeneration = sha256(
      canonical({
        graph_id: f.graph.graphId,
        skeleton_sha256: f.bundle.skeleton_sha256,
        traffic_snapshot_id: fifth.traffic_snapshot_id,
        compiler_policy: "valhalla-current-v1",
      }),
    );
    const engineRecords = inspectOwnership(a);
    const slotHistory = JSON.parse(
      readFileSync(join(a.config.runtime_root, "events.json"), "utf8"),
    ) as { slot_count: number }[];
    write(output, "readbacks/coalescing.json", {
      slot_history: slotHistory,
      fifthWaiting,
      sixthWaiting,
      coalesced,
      engines: engineRecords,
      old_response: coalesceOld,
    });
    check(
      "two-slot-coalescing",
      fifthWaiting.slots.length === 2 &&
        sixthWaiting.slots.length === 2 &&
        slotHistory.length > 0 &&
        slotHistory.every(
          (event) =>
            Number.isInteger(event.slot_count) &&
            event.slot_count >= 0 &&
            event.slot_count <= 2,
        ) &&
        coalesced.active?.sequence === sixth.sequence &&
        !engineRecords.some(
          (o) => o.record.generation_id === fifthGeneration,
        ) &&
        nodeFailureMatches(coalesceOld, 409, "ACCEPTED_STATE_CHANGED"),
      "A full two-slot node coalesces desired versions and never starts an intermediate third engine.",
      "엔진2개가 찬 노드는 교체 요청을 최신 버전으로 합치며 중간 세 번째 엔진을 시작하지 않습니다.",
      { maximum_slots: 2, selected_sequence: sixth.sequence },
      coalesced,
      "readbacks/coalescing.json",
    );
    proxyA.offline = true;
    await control(a, { type: "RECONCILE", pull: true });
    const outage = recordRoute(
      "publisher-outage",
      await requestRoute(a, "publisher-outage"),
    );
    write(output, "readbacks/proxy-outage.json", proxyRecords);
    check(
      "publisher-outage",
      outage.traffic_mode === "LIVE" &&
        outage.sequence === sixth.sequence &&
        proxyRecords.some(
          (r: any) =>
            r.node_id === a.config.node_id &&
            r.status === 502 &&
            r.proxy_transport_unavailable,
        ),
      "Owned proxy HTTP 502 preserves a still-valid accepted version; this is not a packet-loss claim.",
      "소유 대리 접속의HTTP 502에도 아직 유효한 수용 버전을 유지하며 패킷 손실 검증으로 표현하지 않습니다.",
      sixth.sequence,
      outage.sequence,
      "readbacks/proxy-outage.json",
    );
    proxyA.offline = false;
    runtime.commands.command(["pause", runtime.name]);
    let storeFailure: NodeReply;
    try {
      storeFailure = await requestRoute(a, "store-outage");
    } finally {
      runtime.commands.command(["unpause", runtime.name]);
    }
    check(
      "store-outage",
      nodeFailureMatches(storeFailure, 503, "STORE_UNAVAILABLE"),
      "An actual paused PostgreSQL store refuses cached serving.",
      "실제로 멈춘 PostgreSQL 저장소에서는 캐시 서비스로 성공을 반환하지 않습니다.",
      503,
      storeFailure,
      "requests/store-outage.json",
    );
    await waitState(a, (s) => s.ready, "store-recovered");
    // Prove corrupt cache refusal in a separate owned cache, preserving the working copy.
    // 실제 사용 중인 캐시를 보존하고 별도의 소유 캐시에서 손상 거부를 검사합니다.
    await stop(b);
    const corruptRoot = join(output, "negative/corrupt-generations");
    mkdirSync(corruptRoot);
    const goodBGeneration = sha256(
      canonical({
        graph_id: f.graph.graphId,
        skeleton_sha256: f.bundle.skeleton_sha256,
        traffic_snapshot_id: second.traffic_snapshot_id,
        compiler_policy: "valhalla-current-v1",
      }),
    );
    cpSync(
      join(b.config.generation_root, goodBGeneration),
      join(corruptRoot, goodBGeneration),
      { recursive: true },
    );
    writeFileSync(
      join(corruptRoot, goodBGeneration, "traffic.tar"),
      Buffer.alloc(7),
    );
    const originalBConfig = b.config;
    b = await start({
      ...b.config,
      generation_root: corruptRoot,
      runtime_root: join(
        output,
        "nodes",
        b.config.node_id,
        "runtime-corrupt-" + randomUUID(),
      ),
    });
    await control(b, { type: "RECONCILE", pull: false });
    const badRoute = await requestRoute(b, "corrupt-generation");
    check(
      "corrupt-generation",
      nodeFailureMatches(badRoute, 503, "GENERATION_CONFLICT"),
      "A truncated immutable cache is rejected before a daemon can serve it.",
      "잘린 불변 캐시를 지속 엔진 서비스 전에 거부합니다.",
      503,
      badRoute,
      "requests/corrupt-generation.json",
    );
    await stop(b);
    b = await start({
      ...originalBConfig,
      runtime_root: join(
        output,
        "nodes",
        originalBConfig.node_id,
        "runtime-restored-" + randomUUID(),
      ),
    });
    await waitState(
      b,
      (s) => s.ready && s.active?.sequence === second.sequence,
      "offline-node-restored",
    );
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "engine-kill",
    });
    const killCursor = a.child.messages.length,
      killedRoute = requestRoute(a, "engine-kill");
    const enginePhase = await phase(
      a,
      "AFTER_NODE_ENGINE_RESULT",
      "engine-kill",
      killCursor,
    );
    const engineOwner = inspectOwnership(a, enginePhase.generation_id).find(
      (o) => exactEngine(o.record),
    );
    if (!engineOwner)
      throw new Error("Active owned daemon missing / 활성 소유 지속 엔진 누락");
    write(output, "readbacks/engine-before-kill.json", {
      phase: enginePhase,
      ownership: engineOwner,
    });
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_CANDIDATE_READY",
    });
    const recoveryCursor = a.child.messages.length;
    runtime.commands.command(["kill", engineOwner.record.container_name]);
    const recoveryPhase = await phase(
      a,
      "AFTER_NODE_CANDIDATE_READY",
      undefined,
      recoveryCursor,
    );
    const unavailableNew = await requestRoute(a, "engine-kill-new-request");
    await captureStatus(a, "engine-recovery-candidate-held");
    await control(a, {
      type: "RESUME",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "engine-kill",
    });
    const engineFailure = await killedRoute;
    check(
      "engine-kill",
      nodeFailureMatches(engineFailure, 503, "ENGINE_UNAVAILABLE") &&
        nodeFailureMatches(unavailableNew, 503, "ENGINE_UNAVAILABLE") &&
        recoveryPhase.engine_container !== engineOwner.record.container_name,
      "Killing the exact leased native daemon invalidates its completed response.",
      "고정한 정확한 지속 엔진을 종료하면 완료한 응답을 무효화합니다.",
      503,
      engineFailure,
      "requests/engine-kill.json",
    );
    record(
      "leased-engine-result-rejected",
      a.config.node_id,
      "Completed leased result rejected: 503 ENGINE_UNAVAILABLE",
      "고정 엔진의 완료 결과 거부:503 ENGINE_UNAVAILABLE",
      "requests/engine-kill.json",
    );
    await control(a, { type: "RESUME", phase: "AFTER_NODE_CANDIDATE_READY" });
    await control(a, { type: "SET_NODE_PAUSE", phase: null });
    await waitState(a, (s) => s.ready, "engine-recovered");
    recordRoute("engine-recovered", await requestRoute(a, "engine-recovered"));
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "node-kill",
    });
    const nodeKillCursor = a.child.messages.length,
      lostRequest = requestRoute(a, "node-kill").then(
        (value) => ({ value }),
        (error) => ({ error: String(error) }),
      );
    await phase(a, "AFTER_NODE_ENGINE_RESULT", "node-kill", nodeKillCursor);
    const oldInstance = a.instance_id,
      oldConfig = a.config,
      orphanRecords = inspectOwnership(a).filter((o) => exactEngine(o.record));
    await a.child.stop("SIGKILL");
    const lost = await lostRequest;
    write(output, "readbacks/node-killed.json", {
      pid: a.child.child?.pid,
      signal: a.child.child?.signalCode,
      instance_id: oldInstance,
      orphan_engines: orphanRecords,
      lost_request: lost,
    });
    check(
      "node-kill",
      a.child.child?.signalCode === "SIGKILL" &&
        orphanRecords.length > 0 &&
        orphanRecords.every((o) => exactEngine(o.record)),
      "Actual node SIGKILL leaves identified native engines for its parent supervisor.",
      "실제 노드 강제종료 뒤 부모 감독자가 회수할 식별된 지속 엔진이 남습니다.",
      "SIGKILL",
      a.child.child?.signalCode,
      "readbacks/node-killed.json",
    );
    const reaped = await reap(a, "parent-reaped");
    check(
      "parent-reaping",
      reaped.length > 0 &&
        reaped.every((r) => r.absent) &&
        !(await portIsOpen(Number(new URL(a.origin).port))),
      "The parent reaps only exact recorded owned containers and confirms the node port is closed.",
      "부모가 정확히 기록한 소유 컨테이너만 회수하고 노드 포트 종료를 확인합니다.",
      true,
      reaped,
      "readbacks/parent-reaped.json",
    );
    a = await start({
      ...oldConfig,
      runtime_root: join(
        output,
        "nodes",
        oldConfig.node_id,
        "runtime-restarted-" + randomUUID(),
      ),
    });
    const durableRestart = await waitState(
      a,
      (s) => s.ready && s.active?.sequence === sixth.sequence,
      "durable-restarted",
    );
    const restartedRoute = recordRoute(
      "durable-restarted",
      await requestRoute(a, "durable-restarted"),
    );
    check(
      "durable-restart",
      a.instance_id !== oldInstance &&
        restartedRoute.sequence === sixth.sequence &&
        restartedRoute.snapshot_id === sixth.traffic_snapshot_id &&
        durableRestart.active?.high_water === sixth.sequence,
      "Restarted node reconstructs service from durable acceptance and verified generation bytes.",
      "재시작 노드가 영속 수용상태·검증 세대 바이트에서 서비스를 복구합니다.",
      sixth.sequence,
      restartedRoute,
      "requests/durable-restarted.json",
    );
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_ENGINE_RESULT",
      request_id: "deadline-held",
    });
    const deadlineCursor = a.child.messages.length,
      deadlineStart = performance.now(),
      deadlinePending = requestRoute(a, "deadline-held");
    const deadlinePhase = await phase(
      a,
      "AFTER_NODE_ENGINE_RESULT",
      "deadline-held",
      deadlineCursor,
    );
    const seventh = await publish(2);
    await control(a, { type: "RECONCILE", pull: true });
    await waitState(
      a,
      (s) =>
        s.active?.sequence === seventh.sequence &&
        s.slots.some((slot) => slot.state === "DRAINING"),
      "deadline-old-draining",
    );
    const drainStart = performance.now();
    const deadlineReply = await deadlinePending;
    const deadlineElapsed = performance.now() - deadlineStart;
    await control(a, { type: "SET_NODE_PAUSE", phase: null });
    await waitState(
      a,
      (s) => s.in_flight === 0 && s.slots.length === 1,
      "deadline-old-retired",
    );
    const drainElapsed = performance.now() - drainStart;
    write(output, "readbacks/deadline-drain.json", {
      response: deadlineReply,
      request_elapsed_ms: deadlineElapsed,
      draining_elapsed_ms: drainElapsed,
      held_phase: deadlinePhase,
    });
    check(
      "deadline-drain-bound",
      nodeFailureMatches(deadlineReply, 503, "REQUEST_DEADLINE") &&
        deadlineElapsed >= 29000 &&
        deadlineElapsed <= 32000 &&
        drainElapsed <= 30000 &&
        inspectOwnership(a, deadlinePhase.generation_id).every(
          (o) => exactEngine(o.record) === null,
        ),
      "A held actual native request reaches its real 30-second deadline and releases its old draining engine within the ceiling.",
      "대기한 실제 지속 엔진 요청이 실제30초 제한에 도달하고 상한 안에 옛 마무리 엔진을 정리합니다.",
      { request_deadline_s: 30, drain_ceiling_s: 30 },
      { deadlineElapsed, drainElapsed, response: deadlineReply },
      "readbacks/deadline-drain.json",
    );
    const revocations = [];
    for (const index of [0, 5, 10])
      revocations.push(await f.post(index, "/v1/consent/revoke"));
    const corrected = await f.aggregate.finalize(at(180000), f.now);
    write(output, "readbacks/revoked-correction.json", {
      revocations,
      candidate: corrected,
    });
    const correction = await publish(2);
    await waitState(
      a,
      (s) =>
        s.ready &&
        s.active?.sequence === correction.sequence &&
        s.active.traffic_mode === "NO_LIVE_COVERAGE",
      "non-live-correction",
    );
    const correctedRoute = recordRoute(
      "non-live-correction",
      await requestRoute(a, "non-live-correction"),
    );
    check(
      "non-live-correction",
      revocations.every((r) => r.status === 200) &&
        corrected.code === "FINALIZED" &&
        f.scene.targets.every((t) =>
          corrected.draft.entries.some(
            (e) =>
              e.edge_id === t.edge_id &&
              e.forward === t.forward &&
              e.status === "INSUFFICIENT" &&
              e.speed_mps === null,
          ),
        ) &&
        correctedRoute.traffic_mode === "NO_LIVE_COVERAGE" &&
        correctedRoute.snapshot_id === correction.traffic_snapshot_id,
      "Actual contributor revocation and fresh signed correction remove live coverage without inheriting old speeds.",
      "실제 기여자 철회와 새 서명 정정으로 이전 속도를 이어받지 않고 실시간 적용을 제거합니다.",
      "NO_LIVE_COVERAGE",
      correctedRoute,
      "readbacks/revoked-correction.json",
    );
    await f.advance(419999);
    const beforeB = recordRoute(
      "before-expiry-offline",
      await requestRoute(b, "before-expiry-offline"),
    );
    const beforeA = await captureStatus(a, "before-expiry-a");
    check(
      "before-expiry",
      beforeB.traffic_mode === "LIVE" &&
        beforeB.sequence === second.sequence &&
        beforeB.checked_at_event_time === at(419999) &&
        beforeA.active?.sequence === correction.sequence,
      "At 419.999 seconds the disconnected node retains its own unexpired live version.",
      "419.999초에 단절된 노드는 자기의 미만료 실시간 버전을 유지합니다.",
      { node_b: second.sequence, event_time: at(419999) },
      beforeB,
      "requests/before-expiry-offline.json",
    );
    await control(a, {
      type: "SET_NODE_PAUSE",
      phase: "AFTER_NODE_CANDIDATE_READY",
    });
    const candidateCursor = a.child.messages.length;
    const expiring = await publish(3);
    const expiringPhase = await phase(
      a,
      "AFTER_NODE_CANDIDATE_READY",
      undefined,
      candidateCursor,
    );
    write(output, "readbacks/expiry-candidate-ready.json", {
      phase: expiringPhase,
      publication: {
        sequence: expiring.sequence,
        snapshot_id: expiring.traffic_snapshot_id,
        valid_until: expiring.valid_until,
      },
      before_clock: at(419999),
    });
    await f.advance(420000);
    await control(a, { type: "RESUME", phase: "AFTER_NODE_CANDIDATE_READY" });
    await control(a, { type: "SET_NODE_PAUSE", phase: null });
    const [expiredA, expiredB] = await Promise.all([
      waitState(
        a,
        (s) =>
          s.ready &&
          s.active?.traffic_mode === "NO_USABLE_SNAPSHOT" &&
          s.active.traffic_snapshot_id === null,
        "automatic-baseline-a",
      ),
      waitState(
        b,
        (s) =>
          s.ready &&
          s.active?.traffic_mode === "NO_USABLE_SNAPSHOT" &&
          s.active.traffic_snapshot_id === null,
        "automatic-baseline-b",
      ),
    ]);
    const refusedCandidate = inspectOwnership(a, expiringPhase.generation_id);
    record(
      "expired-candidate-refused",
      a.config.node_id,
      "Ready candidate refused at exact 420-second expiry",
      "준비 후보를 정확한420초 만료에 거부",
      "readbacks/expiry-candidate-ready.json",
    );
    write(output, "readbacks/expired-candidate.json", {
      phase: expiringPhase,
      engines: refusedCandidate,
      state: expiredA,
    });
    check(
      "expired-candidate",
      refusedCandidate.length > 0 &&
        refusedCandidate.every((o) => exactEngine(o.record) === null) &&
        expiredA.active?.generation_id !== expiringPhase.generation_id,
      "A real ready candidate crossing exact expiry is discarded before it can be selected.",
      "실제로 준비된 후보가 정확한 만료를 지나면 선택 전에 폐기됩니다.",
      { snapshot: null, event_time: at(420000) },
      expiredA,
      "readbacks/expired-candidate.json",
    );
    const expiredRouteA = recordRoute(
        "expired-a",
        await requestRoute(a, "expired-a"),
      ),
      expiredRouteB = recordRoute(
        "expired-b",
        await requestRoute(b, "expired-b"),
      );
    check(
      "automatic-baseline-expiry",
      [expiredRouteA, expiredRouteB].every(
        (r) =>
          r.traffic_mode === "NO_USABLE_SNAPSHOT" &&
          r.snapshot_id === null &&
          r.shape === baseline.shape &&
          Math.abs(r.eta_s - baseline.eta_s) <= 1e-6 &&
          r.checked_at_event_time === at(420000),
      ),
      "Periodic reconciliation automatically restores verified baseline routes at exact event-time expiry.",
      "주기적 조정이 정확한 관측시각 만료에 검증한 기본 경로를 자동 복구합니다.",
      { shape: baseline.shape, eta_s: baseline.eta_s },
      [expiredRouteA, expiredRouteB],
      "requests/expired-a.json",
    );
    check(
      "offline-node-expiry",
      proxyB.offline &&
        expiredB.active?.high_water === second.sequence &&
        expiredA.active?.high_water === expiring.sequence &&
        expiredRouteB.snapshot_id === null,
      "Disconnected and connected nodes independently expire and preserve their own durable high-water values.",
      "단절·연결 노드가 각각 만료를 적용하고 자기의 영속 최고순번을 보존합니다.",
      { a: expiring.sequence, b: second.sequence },
      { a: expiredA, b: expiredB },
      "status/automatic-baseline-b.json",
    );
    const publicText = JSON.stringify({
      routes,
      status: events.map((e) => e.status),
    });
    assertNoSensitiveDiagnostics(publicText, secrets());
    if (
      /"(?:contributor_id|trip_id|sample_id|database_url|token|private_jwk|work_directory|graph_directory|runtime_root|container_name|container_id)"\s*:/.test(
        publicText,
      )
    )
      throw new Error(
        "Private public node field / 공개 노드 정보에 비공개 필드",
      );
    check(
      "public-privacy",
      !roots.some((root) => "d" in root.public_jwk),
      "Public node responses, status and routing provenance exclude credentials, paths and raw movement.",
      "공개 노드 응답·상태·경로 출처정보에서 인증·경로·원 이동자료를 제외합니다.",
      true,
      true,
      "events.json",
    );
    report = {
      assertions_passed: assertions.length,
      assertions_total: NODE_CASE_IDS.length,
      cleanup_verified: false,
      routes,
      events,
      cases: [],
      evidence: [
        {
          name_en: "Fresh authored source and aggregate",
          name_ko: "새 합성 원본·집계",
          path: "source/candidate.json",
        },
        {
          name_en: "Native two-node transition history",
          name_ko: "지속 엔진 두 노드 전환 이력",
          path: "events.json",
        },
        {
          name_en: "Old draining and new active state",
          name_ko: "옛 마무리·새 활성 상태",
          path: "status/old-draining-new-active.json",
        },
        {
          name_en: "Actual proxy transport outage",
          name_ko: "실제 대리 접속 전송 장애",
          path: "readbacks/proxy-outage.json",
        },
        {
          name_en: "Exact parent reaping",
          name_ko: "부모의 정확한 자원 회수",
          path: "readbacks/parent-reaped.json",
        },
      ],
    };
    for (const node of [a, b]) await stop(node);
  } catch (error) {
    failure = error;
  } finally {
    for (const proxy of proxies) {
      proxy.server.closeAllConnections();
      if (proxy.server.listening)
        await new Promise<void>((ok) => proxy.server.close(() => ok()));
    }
    write(output, "proxy-requests.json", proxyRecords);
    for (const store of stores.reverse())
      await store.close().catch((error) => {
        failure ??= error;
      });
    cleanup = await runtime.cleanup();
    const processes = runtime.processes.map((p) => ({
      role: p.role,
      pid: p.child?.pid,
      exit_code: p.child?.exitCode,
      signal: p.child?.signalCode,
      messages: p.messages,
      diagnostics: p.diagnostics.join(""),
    }));
    assertNoSensitiveDiagnostics(JSON.stringify(processes), secrets());
    runtime.assertSafe(JSON.stringify(processes));
    write(output, "process-events.json", processes);
    const ports = await Promise.all(
      [
        ...proxies.map((p) => Number(new URL(p.origin).port)),
        ...handles.map((h) => Number(new URL(h.origin).port)),
      ].map(async (port) => ({ port, open: await portIsOpen(port) })),
    );
    write(output, "readbacks/ports-after-cleanup.json", ports);
    cleanup = cleanup && ports.every((p) => !p.open);
  }
  if (failure || !cleanup || !report) {
    write(output, "failure.json", {
      status: "FAIL",
      error: String(failure),
      cleanup_verified: cleanup,
      message_en: "Actual P09 native-node integration incomplete.",
      message_ko: "실제 P09 지속 노드 통합 미완료.",
    });
    throw failure ?? new Error("P09 cleanup incomplete / P09 정리 미완료");
  }
  check(
    "owned-cleanup",
    cleanup,
    "Owned nodes, native engines, HTTP ports, private files and database resources are removed.",
    "소유 노드·지속 엔진·HTTP 포트·비공개 파일·DB 자원을 제거했습니다.",
    true,
    cleanup,
    "runtime/cleanup.json",
  );
  requireNodeCases(assertions);
  for (const file of Object.keys(evidenceHashes(output))) {
    if (file.endsWith(".tar") || file.endsWith(".bin")) continue;
    const text = readFileSync(join(output, file), "utf8");
    runtime.assertSafe(text);
    if (secrets().some((secret) => secret && text.includes(secret)))
      throw new Error(
        "Private credential in node evidence / 노드 증거에 비공개 인증값 존재",
      );
  }
  report.assertions_passed = assertions.length;
  report.cleanup_verified = true;
  report.cases = assertions.map((a) => ({
    case_id: a.assertion_id,
    status: a.status,
    message_en: a.message_en,
    message_ko: a.message_ko,
    evidence_path: a.evidence_path,
  }));
  write(output, "report-nodes.json", report);
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error("Source changed during P09 / P09 실행 중 소스 변경");
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
  return { nodes: report, assertions };
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
          "Usage / 사용법: node:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY",
        );
        return 0;
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!graph || !output || graph.startsWith("-") || output.startsWith("-"))
      throw new Error("Graph and new output required / 지도·새 출력 필요");
    await runNodeChecks(graph, output);
    return 0;
  } catch (error) {
    io.error("P09 incomplete / P09 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
