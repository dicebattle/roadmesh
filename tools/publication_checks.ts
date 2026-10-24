/** Real short Seoul GPS → P05 → P06 → signed HTTP publication → durable consumer. */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { CompactSign, generateKeyPair, exportJWK, importJWK } from "jose";
import pg from "pg";
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
import { createAggregationScenario } from "./aggregation_scenario.js";
import { IngestionStore } from "./ingestion_store.js";
import { AggregationStore } from "./aggregation_store.js";
import { PublicationStore } from "./publication_store.js";
import { PublicationConsumer } from "./publication_consumer.js";
import {
  OwnedIngestionRuntime,
  type OwnedIngestionProcess,
  pause,
  portIsOpen,
} from "./ingestion_runtime.js";
import {
  buildIngestBatches,
  assertNoSensitiveDiagnostics,
} from "./ingestion_checks.js";
import type {
  StoreConfig,
  ServiceConfig,
  ServiceCredential,
  WorkerConfig,
} from "./ingestion_types.js";
import type { AggregationStoreConfig } from "./aggregation_types.js";
import type {
  PublicationStoreConfig,
  PublicationSigner,
  TrustRoot,
  ConsumerConfig,
  PublicationRecord,
  PublicationPhase,
  PublicationWorkerConfig,
  ConsumerWorkerConfig,
} from "./publication_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
import type { SimulationReportData } from "./simulation_report.js";
const START = "2026-10-24T00:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(START) + ms).toISOString();
/** Single required-case inventory: the whole runner checks IDs, not a second P07 count. */
export const PUBLICATION_CASE_IDS = [
  "actual-source",
  "publisher-precommit-kill",
  "publisher-postcommit-kill",
  "publisher-retry",
  "publisher-concurrency",
  "publisher-initial-concurrency",
  "http-exact-bytes",
  "consumer-durable",
  "consumer-postcommit-kill",
  "rotation",
  "accepted-key-revoked",
  "consumer-order-race",
  "bad-signature",
  "changed-artifact",
  "wrong-length",
  "truncated",
  "manifest-oversize",
  "artifact-oversize",
  "duplicate-manifest-key",
  "duplicate-artifact-key",
  "unknown-manifest-field",
  "unknown-artifact-field",
  "unsupported-algorithm",
  "unsupported-header",
  "unknown-kid",
  "duplicate-kid",
  "disallowed-key",
  "private-root",
  "invalid-utf8",
  "wrong-graph",
  "wrong-namespace",
  "wrong-region",
  "wrong-publisher",
  "revoked-key",
  "expired-key",
  "future-key",
  "future-published",
  "old-sequence",
  "sequence-conflict",
  "older-window",
  "redirect",
  "fetch-timeout",
  "revoke-lock-wait",
  "revoke-current-invalidation",
  "revoked-correction",
  "new-empty-window",
  "publisher-older-window",
  "publisher-outage",
  "before-expiry",
  "exact-expiry",
  "verify-then-expire",
  "stale-caller",
  "current-expired",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p07-" + id);
export function requirePublicationCases(
  assertions: SimulationAssertion[],
): void {
  const ids = assertions.map((a) => a.assertion_id);
  if (
    new Set(ids).size !== ids.length ||
    PUBLICATION_CASE_IDS.some((id) => !ids.includes(id)) ||
    assertions.some((a) => a.status !== "PASS")
  )
    throw new Error("P07 required cases incomplete / P07 필수검사 미완료");
}
const write = (root: string, path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
export async function runPublicationChecks(
  graphDirectory: string,
  outputPath: string,
): Promise<{
  publication: NonNullable<SimulationReportData["publication"]>;
  assertions: SimulationAssertion[];
}> {
  const output = resolve(outputPath);
  mkdirSync(output);
  for (const dir of ["public", "negative", "readbacks", "synthetic-engine"])
    mkdirSync(join(output, dir));
  const graph = loadSeoulGraph(graphDirectory),
    scene = createAggregationScenario(graph),
    source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  if (!source.commit || source.dirty === null)
    throw new Error("Source unavailable / 소스 식별 불가");
  write(output, "expected.json", {
    target: scene.target,
    vehicles: scene.expected.slice(0, 5),
    median_duration_s: scene.expected_median_duration_s,
    speed_mps: scene.expected_speed_mps,
    calculated_before_matching: true,
  });
  write(output, "synthetic-scenario.json", scene.spec);
  write(
    output,
    "synthetic-observations.json",
    scene.simulation.observations.filter((p) => p.vehicle_id !== "p06-parked"),
  );
  write(output, "catalog.json", scene.catalog);
  const runtime = new OwnedIngestionRuntime(join(output, "runtime"), output),
    stores: Array<{ close(): Promise<void> }> = [],
    assertions: SimulationAssertion[] = [],
    events: unknown[] = [];
  let failure: unknown,
    cleanup = false,
    report: NonNullable<SimulationReportData["publication"]> | undefined;
  let credentials: ServiceCredential[] = [],
    config: StoreConfig | undefined;
  const privateKeys: string[] = [],
    secrets = () => [
      ...credentials.map((c) => c.token),
      config?.database_url ?? "",
      ...privateKeys,
    ];
  const record = (phase: string, value: unknown) => {
    events.push({ phase, value });
    writeFileSync(
      join(output, "events.json"),
      JSON.stringify(events, null, 2) + "\n",
    );
  };
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
      assertion_id: "p07-" + id,
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
  const done = async (child: OwnedIngestionProcess) => {
    const message = await child.message((m) => m.type === "RESULT");
    const exit = await child.exited();
    record("PROCESS", {
      role: child.role,
      pid: child.child?.pid,
      message,
      exit,
    });
    return { message, exit };
  };
  let fault:
    | {
        jws: Buffer;
        artifact: Buffer;
        mode?: "redirect" | "timeout" | "truncated";
        requests: string[];
        responses: unknown[];
      }
    | undefined;
  const faultServer = createServer((req, res) => {
    const f = fault;
    if (!f) {
      res.writeHead(503);
      res.end();
      return;
    }
    f.requests.push(req.url ?? "");
    if (f.mode === "timeout") {
      f.responses.push({ path: req.url, status: null, headers_sent: false });
      return;
    }
    if (f.mode === "redirect") {
      f.responses.push({
        path: req.url,
        status: 302,
        location: "/never-follow",
      });
      res.writeHead(302, { location: "/never-follow" });
      res.end();
      return;
    }
    const current = (req.url ?? "").endsWith("/current"),
      bytes = current ? f.jws : f.artifact;
    f.responses.push({
      path: req.url,
      status: 200,
      media_type: current ? "application/jose" : "application/json",
      declared_length:
        bytes.length + (f.mode === "truncated" && !current ? 10 : 0),
      provided_bytes: bytes.length,
      connection_destroyed: f.mode === "truncated" && !current,
    });
    res.writeHead(200, {
      "content-type": current ? "application/jose" : "application/json",
      "content-length":
        bytes.length + (f.mode === "truncated" && !current ? 10 : 0),
    });
    if (f.mode === "truncated" && !current) {
      res.write(bytes);
      setTimeout(() => res.destroy(), 20).unref();
    } else res.end(bytes);
  });
  let faultPort = 0;
  try {
    await runtime.start();
    config = {
      database_url: runtime.databaseUrl,
      namespace: "p07-" + runtime.runId.replace(/-/g, "").slice(0, 16),
      graph_id: graph.graphId,
      matching_policy: "seoul-observed-v3",
    };
    credentials = scene.expected.slice(0, 5).map((v, i) => ({
      token: randomBytes(24).toString("hex"),
      principal: {
        contributor_id: "publisher-person-" + i,
        vehicle_id: v.vehicle_id,
        consent_version: "pilot-consent-v1",
      },
    }));
    const ingestion = new IngestionStore(config);
    stores.push(ingestion);
    await ingestion.initialize(credentials.map((c) => c.principal));
    const aggregationConfig: AggregationStoreConfig = {
      store: config,
      catalog: scene.catalog,
      source_class: "SYNTHETIC",
    };
    const aggregate = new AggregationStore(aggregationConfig);
    stores.push(aggregate);
    await aggregate.initialize();
    const readbackPool = new pg.Pool({
      connectionString: config.database_url,
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    stores.push({ close: () => readbackPool.end() });
    const publicationConfig: PublicationStoreConfig = {
      aggregation: aggregationConfig,
      publisher_id: "seoul-synthetic-publisher",
    };
    const publisher = new PublicationStore(publicationConfig);
    stores.push(publisher);
    await publisher.initialize();
    const api = runtime.spawn("p07-source-api", "ingestion_service", {
      store: config,
      credentials,
      event_time_utc: START,
      port: 0,
    } satisfies ServiceConfig);
    const ready = await api.message(
        (m) => m.type === "READY" && m.kind === "service",
      ),
      apiOrigin = "http://127.0.0.1:" + ready.port;
    let now = START;
    const advance = async (ms: number) => {
      now = await ingestion.advanceEventTime(at(ms));
    };
    const post = async (index: number, path: string, body?: unknown) => {
      const r = await fetch(apiOrigin + path, {
        method: "POST",
        headers: {
          authorization: "Bearer " + credentials[index]!.token,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await r.text();
      assertNoSensitiveDiagnostics(text, secrets());
      return { status: r.status, body: JSON.parse(text) };
    };
    for (let i = 0; i < 5; i++) {
      const v = scene.expected[i]!,
        samples = scene.simulation.observations.filter(
          (p) => p.vehicle_id === v.vehicle_id,
        );
      for (const b of buildIngestBatches(
        samples,
        "p07-trip-" + i,
        graph.graphId,
        START,
      )) {
        now = await ingestion.advanceEventTime(
          b.samples.at(-1)!.event_time_utc,
        );
        const response = await post(i, "/v1/observations/batches", b);
        record("SOURCE_HTTP", {
          vehicle: i,
          batch_id: b.batch_id,
          ...response,
        });
        if (response.status !== 202)
          throw new Error("Actual source HTTP refused / 실제 원본 HTTP 거부");
      }
    }
    await advance(59000);
    for (let i = 0; i < 5; i++) {
      const worker = runtime.spawn(
        "p07-source-worker-" + i,
        "ingestion_worker",
        {
          store: config,
          graph_directory: graph.directory,
          output_root: join(output, "synthetic-engine"),
          event_time_utc: now,
          owner_id: "p07-source-" + i,
        } satisfies WorkerConfig,
      );
      const completed = await done(worker);
      if (completed.message.code !== "SUCCEEDED" || completed.exit.code !== 0)
        throw new Error("Actual source matching failed / 실제 원본 매칭 실패");
    }
    await advance(90000);
    const candidate = await aggregate.finalize(START, now);
    write(output, "readbacks/source-candidate.json", candidate);
    const target =
      candidate.code === "FINALIZED"
        ? candidate.draft.entries.find(
            (e) =>
              e.edge_id === scene.target.edge_id &&
              e.forward === scene.target.forward,
          )
        : undefined;
    const liveSpeed = target?.speed_mps;
    check(
      "actual-source",
      candidate.code === "FINALIZED" &&
        candidate.draft.entries.length === scene.catalog.length &&
        target?.status === "LIVE" &&
        typeof liveSpeed === "number" &&
        Math.abs(liveSpeed / scene.expected_speed_mps - 1) <= 0.02,
      "Fresh actual GPS, HTTP, P05 workers and P06 create the complete eligible catalog.",
      "새 실제 GPS·HTTP·P05 처리자·P06이 적격 전체구간 후보를 만듭니다.",
      {
        entries: scene.catalog.length,
        status: "LIVE",
        relative_tolerance: 0.02,
      },
      {
        entries:
          candidate.code === "FINALIZED" ? candidate.draft.entries.length : 0,
        target,
      },
      "readbacks/source-candidate.json",
    );
    const signers: PublicationSigner[] = [],
      roots: TrustRoot[] = [];
    for (const kid of ["key-a", "key-b", "key-c"]) {
      const pair = await generateKeyPair("EdDSA", { extractable: true });
      const private_jwk = await exportJWK(pair.privateKey),
        public_jwk = await exportJWK(pair.publicKey);
      privateKeys.push(private_jwk.d!);
      signers.push({ kid, private_jwk });
      roots.push({
        kid,
        public_jwk,
        publisher_id: publicationConfig.publisher_id,
        simulation_namespace: config.namespace,
        region_id: "seoul-pilot-corridors-v1",
        allowed_graph_ids: [graph.graphId],
        source_class: "SYNTHETIC",
        valid_from: at(-60000),
        valid_until: at(3600000),
        revoked: false,
      });
    }
    write(output, "public/trust-roots.json", roots);
    const publish = (
      signer = signers[0]!,
      pause_at?: PublicationWorkerConfig["pause_at"],
      window = START,
    ) =>
      runtime.spawn(
        "p07-publisher-" + runtime.processes.length,
        "publication_worker",
        {
          publication: publicationConfig,
          signer,
          window_start: window,
          event_time_utc: now,
          ...(pause_at ? { pause_at } : {}),
        } satisfies PublicationWorkerConfig,
      );
    const phase = async (
      child: OwnedIngestionProcess,
      name: PublicationPhase,
    ) => child.message((m) => m.type === "PHASE" && m.phase === name);
    const pubRead = async (name: string) => {
      const r = await publisher.inspect();
      write(output, "readbacks/" + name + ".json", r);
      return r;
    };
    const pre = publish(signers[0], "AFTER_PUBLICATION_WRITE");
    await phase(pre, "AFTER_PUBLICATION_WRITE");
    await pre.stop("SIGKILL");
    const preRows = await pubRead("publisher-precommit");
    check(
      "publisher-precommit-kill",
      pre.child?.signalCode === "SIGKILL" &&
        preRows.publications.length === 0 &&
        preRows.streams.every(
          (s) => s.high_water === 0 && !s.current_snapshot_id,
        ),
      "Publisher SIGKILL before commit leaves no artifact or pointer.",
      "커밋 전 게시자 강제종료가 내용·현재참조를 남기지 않습니다.",
      0,
      preRows.publications.length,
      "readbacks/publisher-precommit.json",
    );
    const postCommit = publish(signers[0], "AFTER_PUBLICATION_COMMIT");
    await phase(postCommit, "AFTER_PUBLICATION_COMMIT");
    await postCommit.stop("SIGKILL");
    const firstRows = await pubRead("publisher-postcommit"),
      first = firstRows.publications[0]!;
    check(
      "publisher-postcommit-kill",
      postCommit.child?.signalCode === "SIGKILL" &&
        firstRows.publications.length === 1 &&
        first.sequence === 1 &&
        firstRows.streams[0]?.current_snapshot_id === first.traffic_snapshot_id,
      "Committed publication survives lost acknowledgement and publisher death.",
      "응답 유실·게시자 종료 후 커밋된 게시가 남습니다.",
      1,
      firstRows.streams,
      "readbacks/publisher-postcommit.json",
    );
    const retried = await done(publish());
    const retryRows = await pubRead("publisher-retry");
    check(
      "publisher-retry",
      retried.message.code === "UNCHANGED" &&
        retried.message.sequence === 1 &&
        retryRows.publications.length === 1 &&
        retryRows.publications[0]!.jws === first.jws &&
        Buffer.from(retryRows.publications[0]!.artifact).equals(
          Buffer.from(first.artifact),
        ),
      "Restarted retry returns identical committed JWS and artifact bytes.",
      "재시작 재시도가 동일 JWS·내용 바이트를 돌려줍니다.",
      { sequence: 1, rows: 1 },
      retried.message,
      "readbacks/publisher-retry.json",
    );
    const concurrent = await Promise.all([done(publish()), done(publish())]),
      concurrentRows = await pubRead("publisher-concurrency");
    check(
      "publisher-concurrency",
      concurrent.every((r) => r.exit.code === 0 && r.message.sequence === 1) &&
        concurrentRows.publications.length === 1,
      "Two actual publisher workers converge on one immutable version.",
      "실제 게시자 두 개가 불변 게시 한 개로 모입니다.",
      1,
      concurrentRows.publications.length,
      "readbacks/publisher-concurrency.json",
    );
    const initialConfig = {
      ...publicationConfig,
      publisher_id: "initial-race-publisher",
    };
    const initialStore = new PublicationStore(initialConfig);
    stores.push(initialStore);
    await initialStore.verifyInitialized();
    const initialWorkers = [0, 1].map((i) =>
      runtime.spawn("p07-initial-race-" + i, "publication_worker", {
        publication: initialConfig,
        signer: signers[0]!,
        window_start: START,
        event_time_utc: now,
      } satisfies PublicationWorkerConfig),
    );
    const initialResults = await Promise.all(initialWorkers.map(done)),
      initialRows = await initialStore.inspect();
    write(output, "readbacks/publisher-initial-concurrency.json", {
      results: initialResults,
      stored: initialRows,
    });
    check(
      "publisher-initial-concurrency",
      initialResults.every(
        (r) => r.exit.code === 0 && r.message.sequence === 1,
      ) &&
        initialResults.filter((r) => r.message.code === "PUBLISHED").length ===
          1 &&
        initialResults.filter((r) => r.message.code === "UNCHANGED").length ===
          1 &&
        initialRows.publications.length === 1 &&
        initialRows.streams[0]?.high_water === 1,
      "Two workers creating a new stream converge on one committed first version.",
      "새 발행계열을 만드는 처리자 두 개가 첫 커밋 한 개로 모입니다.",
      { rows: 1, sequence: 1 },
      { rows: initialRows.publications.length, streams: initialRows.streams },
      "readbacks/publisher-initial-concurrency.json",
    );
    const startService = async () => {
      const child = runtime.spawn(
        "p07-http-" + runtime.processes.length,
        "publication_service",
        { publication: publicationConfig, port: 0 },
      );
      const m = await child.message(
        (m) => m.type === "READY" && m.kind === "publication-service",
      );
      return { child, origin: "http://127.0.0.1:" + m.port };
    };
    let service = await startService();
    const currentPath =
      "/v1/simulations/" +
      config.namespace +
      "/regions/seoul-pilot-corridors-v1/current";
    const archive = async (record: PublicationRecord) => {
      const dir = "public/sequence-" + record.sequence;
      mkdirSync(join(output, dir));
      const j = await fetch(service.origin + currentPath, {
          signal: AbortSignal.timeout(5000),
        }),
        jws = await j.text();
      const a = await fetch(
          service.origin +
            "/v1/simulations/" +
            config!.namespace +
            "/artifacts/" +
            record.traffic_snapshot_id,
          { signal: AbortSignal.timeout(5000) },
        ),
        bytes = Buffer.from(await a.arrayBuffer());
      writeFileSync(join(output, dir, "manifest.jws.txt"), jws, { flag: "wx" });
      writeFileSync(join(output, dir, "artifact.json"), bytes, { flag: "wx" });
      write(
        output,
        dir + "/manifest-decoded.json",
        JSON.parse(
          Buffer.from(jws.split(".")[1]!, "base64url").toString("utf8"),
        ),
      );
      write(output, dir + "/http.json", {
        current: {
          status: j.status,
          headers: Object.fromEntries(j.headers),
          byte_length: Buffer.byteLength(jws),
        },
        artifact: {
          status: a.status,
          headers: Object.fromEntries(a.headers),
          byte_length: bytes.length,
          sha256: sha256(bytes),
        },
      });
      if (
        j.status !== 200 ||
        a.status !== 200 ||
        j.headers.get("cache-control") !== "no-store" ||
        j.headers.get("content-type") !== "application/jose" ||
        Number(a.headers.get("content-length")) !== bytes.length ||
        jws !== record.jws ||
        !bytes.equals(Buffer.from(record.artifact)) ||
        sha256(bytes) !== record.traffic_snapshot_id
      )
        throw new Error(
          "HTTP immutable bytes mismatch / HTTP 불변바이트 불일치",
        );
      return dir;
    };
    await archive(first);
    const immutable = await publisher.artifact(first.traffic_snapshot_id),
      unsupported = await fetch(service.origin + currentPath, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
    check(
      "http-exact-bytes",
      !!immutable &&
        Buffer.from(immutable.artifact).equals(Buffer.from(first.artifact)) &&
        unsupported.status === 405,
      "HTTP provides exact immutable bytes, hash, length, no-store JWS and method rejection.",
      "HTTP가 정확한 불변 바이트·해시·길이·JWS 캐시금지·메서드 거부를 제공합니다.",
      { hash: first.traffic_snapshot_id, method_status: 405 },
      {
        hash: immutable?.traffic_snapshot_id,
        method_status: unsupported.status,
      },
      "public/sequence-1/http.json",
    );
    const consumerConfig = (id: string): ConsumerConfig => ({
      store: config!,
      consumer_id: id,
      publisher_id: publicationConfig.publisher_id,
      region_id: "seoul-pilot-corridors-v1",
      allowed_graph_ids: [graph.graphId],
      catalogs: [{ graph_id: graph.graphId, edges: scene.catalog }],
      trust_roots: roots,
      origin: service.origin,
    });
    const makeConsumer = async (id: string) => {
      const c = new PublicationConsumer(consumerConfig(id));
      stores.push(c);
      await c.initialize();
      return c;
    };
    const main = await makeConsumer("primary"),
      cached = await makeConsumer("live-cache"),
      crashed = await makeConsumer("committed-crash"),
      expiry = await makeConsumer("expiry-race");
    const consume = (
      cfg: ConsumerConfig,
      pause_at?: ConsumerWorkerConfig["pause_at"],
    ) =>
      runtime.spawn(
        "p07-consumer-" + runtime.processes.length,
        "publication_consumer_worker",
        {
          consumer: cfg,
          event_time_utc: now,
          ...(pause_at ? { pause_at } : {}),
        } satisfies ConsumerWorkerConfig,
      );
    const snapshot = async (c: PublicationConsumer, name: string) => {
      const status = await c.status();
      write(output, "readbacks/" + name + ".json", status);
      const rows = (
        await readbackPool.query(
          "SELECT consumer_id,publisher_id,region_id,high_water,last_snapshot_id,last_window_start,octet_length(artifact) AS artifact_byte_length,encode(sha256(artifact),'hex') AS artifact_sha256,jws FROM routelens_p07.consumer_states WHERE namespace=$1 AND consumer_id=$2 ORDER BY publisher_id,region_id",
          [config!.namespace, c.config.consumer_id],
        )
      ).rows;
      write(output, "readbacks/" + name + "-db-row.json", rows);
      if (status.active)
        writeFileSync(
          join(output, "readbacks/" + name + "-artifact.json"),
          status.active.artifact,
          { flag: "wx" },
        );
      return status;
    };
    const accepted = await done(consume(main.config));
    await done(consume(cached.config));
    const acceptedState = await snapshot(main, "consumer-accepted-1");
    check(
      "consumer-durable",
      accepted.message.code === "ACCEPTED" &&
        accepted.exit.code === 0 &&
        acceptedState.high_water === 1 &&
        acceptedState.active?.manifest.traffic_snapshot_id ===
          first.traffic_snapshot_id &&
        Buffer.from(acceptedState.active.artifact).equals(
          Buffer.from(first.artifact),
        ),
      "Separate consumer process durably stores the exact signed and downloaded bytes.",
      "별도 수신 프로세스가 정확한 서명·다운로드 바이트를 영속 저장합니다.",
      first.traffic_snapshot_id,
      acceptedState.active?.manifest.traffic_snapshot_id,
      "readbacks/consumer-accepted-1.json",
    );
    const crashedChild = consume(crashed.config, "AFTER_CONSUMER_COMMIT");
    await phase(crashedChild, "AFTER_CONSUMER_COMMIT");
    await crashedChild.stop("SIGKILL");
    const crashRetry = await done(consume(crashed.config));
    const crashState = await snapshot(crashed, "consumer-commit-crash");
    check(
      "consumer-postcommit-kill",
      crashedChild.child?.signalCode === "SIGKILL" &&
        crashRetry.message.code === "DUPLICATE" &&
        crashState.high_water === 1,
      "Consumer commit survives SIGKILL and process restart returns DUPLICATE.",
      "수신 커밋이 강제종료 후 남고 재시작은 DUPLICATE입니다.",
      { code: "DUPLICATE", high_water: 1 },
      crashRetry.message,
      "readbacks/consumer-commit-crash.json",
    );
    const oldRace = consume(main.config, "AFTER_CONSUMER_VERIFY");
    await phase(oldRace, "AFTER_CONSUMER_VERIFY");
    const rotationResults = await Promise.all([
      done(publish(signers[1])),
      done(publish(signers[1])),
    ]);
    write(output, "readbacks/rotation-workers.json", rotationResults);
    const rotationRows = await pubRead("rotation"),
      second = rotationRows.publications.find((p) => p.sequence === 2)!;
    await archive(second);
    const secondAccept = await done(consume(main.config));
    check(
      "rotation",
      rotationRows.publications.length === 2 &&
        rotationResults.every(
          (r) =>
            r.exit.code === 0 &&
            r.message.sequence === 2 &&
            r.message.traffic_snapshot_id === second.traffic_snapshot_id,
        ) &&
        rotationResults.filter((r) => r.message.code === "PUBLISHED").length ===
          1 &&
        rotationResults.filter((r) => r.message.code === "UNCHANGED").length ===
          1 &&
        second.kid === "key-b" &&
        secondAccept.message.code === "ACCEPTED" &&
        secondAccept.message.high_water === 2,
      "Preconfigured key rotation preserves the stream and advances its sequence.",
      "사전설정 키 교체가 동일 발행계열의 순번을 올립니다.",
      2,
      secondAccept.message.high_water,
      "public/sequence-2/http.json",
    );
    const trustedCache = await makeConsumer("revoked-trust-cache");
    await done(consume(trustedCache.config));
    const revokedCacheConfig = {
      ...trustedCache.config,
      trust_roots: roots.map((r) =>
        r.kid === "key-b" ? { ...r, revoked: true } : r,
      ),
    };
    const revokedCache = new PublicationConsumer(revokedCacheConfig);
    stores.push(revokedCache);
    const revokedTrust = await done(consume(revokedCacheConfig)),
      revokedTrustState = await snapshot(revokedCache, "accepted-key-revoked");
    const revokedTrustRows = JSON.parse(
      readFileSync(
        join(output, "readbacks/accepted-key-revoked-db-row.json"),
        "utf8",
      ),
    ) as {
      high_water: string;
      artifact_byte_length: number | null;
      jws: string | null;
    }[];
    check(
      "accepted-key-revoked",
      revokedTrust.message.code === "REJECTED" &&
        revokedTrust.message.reason === "REVOKED_KEY" &&
        revokedTrustState.high_water === 2 &&
        revokedTrustState.active === null &&
        revokedTrustRows.length === 1 &&
        Number(revokedTrustRows[0]!.high_water) === 2 &&
        revokedTrustRows[0]!.artifact_byte_length === null &&
        revokedTrustRows[0]!.jws === null,
      "Restarted configured key revocation clears accepted bytes but preserves high-water.",
      "재시작 설정의 키 철회가 수용 바이트를 지우고 최고순번은 보존합니다.",
      { reason: "REVOKED_KEY", high_water: 2, active: null },
      revokedTrust.message,
      "readbacks/accepted-key-revoked-db-row.json",
    );
    oldRace.send({ type: "RESUME", phase: "AFTER_CONSUMER_VERIFY" });
    const oldDone = await done(oldRace),
      raceState = await snapshot(main, "consumer-order-race");
    check(
      "consumer-order-race",
      oldDone.message.code === "REJECTED" &&
        oldDone.message.reason === "REPLAY" &&
        raceState.high_water === 2,
      "A delayed older verified consumer cannot lower the newer committed high-water.",
      "늦게 끝난 옛 검증 수신자가 새 최고순번을 낮추지 못합니다.",
      2,
      raceState.high_water,
      "readbacks/consumer-order-race.json",
    );
    // This origin is deliberately invalid-response-only. Success always uses the real service.
    write(output, "negative/ownership.json", {
      owner_pid: process.pid,
      host: "127.0.0.1",
      purpose: "Invalid-response-only HTTP fixture / 부정응답 전용 HTTP 시험",
    });
    await new Promise<void>((ok, fail) => {
      faultServer.once("error", fail);
      faultServer.listen(0, "127.0.0.1", ok);
    });
    const address = faultServer.address();
    if (!address || typeof address === "string")
      throw new Error("Fault port unavailable / 부정시험 포트 확인 불가");
    faultPort = address.port;
    write(output, "negative/listening.json", {
      pid: process.pid,
      port: faultPort,
    });
    const secondManifest = JSON.parse(
      Buffer.from(second.jws.split(".")[1]!, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const secondSnapshot = JSON.parse(
      Buffer.from(second.artifact).toString("utf8"),
    ) as Record<string, unknown>;
    const signed = async (
      payload: Buffer,
      signer = signers[1]!,
      header: Record<string, unknown> = {
        alg: "EdDSA",
        kid: signer.kid,
        typ: "routelens-traffic-manifest+jws",
      },
    ) =>
      new CompactSign(payload)
        .setProtectedHeader(
          header as Parameters<CompactSign["setProtectedHeader"]>[0],
        )
        .sign(await importJWK(signer.private_jwk, "EdDSA"));
    const changed = async (
      manifest: Record<string, unknown> = {},
      snapshot: Record<string, unknown> = {},
      signer = signers[1]!,
    ) => {
      const artifact = canonical({ ...secondSnapshot, ...snapshot });
      const jws = await signed(
        canonical({
          ...secondManifest,
          ...manifest,
          traffic_snapshot_id: sha256(artifact),
          byte_length: artifact.length,
        }),
        signer,
      );
      return { jws: Buffer.from(jws), artifact };
    };
    const negative = async (
      id: string,
      en: string,
      ko: string,
      value: {
        jws: Buffer;
        artifact: Buffer;
        mode?: "redirect" | "timeout" | "truncated";
      },
      patch: Partial<ConsumerConfig> = {},
      requiredReason?: string,
    ) => {
      const before = await main.status(),
        dir = "negative/" + id;
      mkdirSync(join(output, dir));
      fault = { ...value, requests: [], responses: [] };
      writeFileSync(join(output, dir, "manifest.jws.txt"), value.jws, {
        flag: "wx",
      });
      writeFileSync(join(output, dir, "artifact-bytes.txt"), value.artifact, {
        flag: "wx",
      });
      const cfg = {
        ...main.config,
        ...patch,
        origin: "http://127.0.0.1:" + faultPort,
      };
      write(output, dir + "/public-trust-config.json", {
        consumer_id: cfg.consumer_id,
        publisher_id: cfg.publisher_id,
        region_id: cfg.region_id,
        allowed_graph_ids: cfg.allowed_graph_ids,
        trust_roots: cfg.trust_roots,
        note_en:
          "Negative trust configuration; any d sentinel is deliberately invalid and is not generated private key material.",
        note_ko:
          "부정 신뢰설정이며 d 표식은 의도적으로 잘못된 값이고 생성한 비공개키가 아닙니다.",
      });
      // Invalid root configurations may fail before READY. Their process exit is evidence, never acceptance.
      const child = consume(cfg),
        started = performance.now();
      const exit = await child.exited();
      const message = (child.messages as Record<string, unknown>[]).find(
        (m) => m.type === "RESULT",
      );
      const elapsed = performance.now() - started;
      const after = await main.status();
      const stateUnchanged = canonical(before).equals(canonical(after));
      const expectedStartupFailure = [
        "duplicate-kid",
        "disallowed-key",
        "private-root",
      ].includes(id);
      const expectedReasons: Record<string, string> = {
        "bad-signature": "INVALID_SIGNATURE_OR_METADATA",
        "changed-artifact": "HASH_MISMATCH",
        "wrong-length": "LENGTH_MISMATCH",
        truncated: "TRANSPORT_FAILED",
        "manifest-oversize": "OVERSIZE",
        "artifact-oversize": "OVERSIZE",
        "duplicate-manifest-key": "INVALID_JSON",
        "duplicate-artifact-key": "INVALID_JSON",
        "unknown-manifest-field": "INVALID_SIGNATURE_OR_METADATA",
        "unknown-artifact-field": "INVALID_METADATA",
        "unsupported-algorithm": "INVALID_HEADER",
        "unsupported-header": "INVALID_SIGNATURE_OR_METADATA",
        "unknown-kid": "UNKNOWN_KEY",
        "invalid-utf8": "INVALID_JSON",
        "wrong-graph": "WRONG_SCOPE",
        "wrong-namespace": "WRONG_SCOPE",
        "wrong-region": "WRONG_SCOPE",
        "wrong-publisher": "WRONG_SCOPE",
        "revoked-key": "REVOKED_KEY",
        "expired-key": "KEY_TIME_INVALID",
        "future-key": "KEY_TIME_INVALID",
        "future-published": "INVALID_TIME",
        redirect: "HTTP_302",
        "fetch-timeout": "TRANSPORT_FAILED",
      };
      const expectedReason = requiredReason ?? expectedReasons[id];
      if (!expectedStartupFailure && !expectedReason)
        throw new Error(
          "Missing expected rejection reason / 예상 거부사유 누락",
        );
      const startupRejected =
        exit.code === 2 &&
        !message &&
        !(child.messages as Record<string, unknown>[]).some(
          (m) => m.type === "READY",
        ) &&
        child.diagnostics
          .join("")
          .includes(
            "Use --config PRIVATE_JSON for the consumer worker / 수신 작업자는 --config PRIVATE_JSON을 사용하세요",
          );
      const responseRejected =
        exit.code === 1 &&
        (child.messages as Record<string, unknown>[]).some(
          (m) => m.type === "READY" && m.kind === "consumer",
        ) &&
        message?.code === "REJECTED" &&
        message.reason === expectedReason;
      const readback = {
        before,
        after,
        expected_startup_failure: expectedStartupFailure,
        expected_reason: expectedReason ?? null,
        exit,
        message: message ?? null,
        elapsed_ms: elapsed,
        requests: fault.requests,
        actual_http_responses: fault.responses,
        response: {
          current_status:
            value.mode === "timeout"
              ? null
              : value.mode === "redirect"
                ? 302
                : 200,
          current_bytes: value.jws.length,
          artifact_status: 200,
          artifact_bytes: value.artifact.length,
          mode: value.mode ?? "bytes",
        },
      };
      write(output, dir + "/readback.json", readback);
      check(
        id,
        (expectedStartupFailure ? startupRejected : responseRejected) &&
          stateUnchanged &&
          (id !== "redirect" || fault.requests.length === 1) &&
          (id !== "fetch-timeout" || (elapsed >= 4500 && elapsed < 10000)),
        en,
        ko,
        {
          accepted: false,
          state_unchanged: true,
          ...(expectedReason
            ? { reason: expectedReason }
            : { expected_exit: 2, no_ready_or_result: true }),
        },
        {
          exit: exit.code,
          message,
          state_unchanged: stateUnchanged,
          elapsed_ms: elapsed,
        },
        dir + "/readback.json",
      );
    };
    const raw = {
      jws: Buffer.from(second.jws),
      artifact: Buffer.from(second.artifact),
    };
    const signatureParts = second.jws.split(".");
    const signature = Buffer.from(signatureParts[2]!, "base64url");
    signature[0] = signature[0]! ^ 1;
    await negative(
      "bad-signature",
      "A changed signature is rejected without state mutation.",
      "변경된 서명이 상태변경 없이 거부됩니다.",
      {
        ...raw,
        jws: Buffer.from(
          signatureParts.slice(0, 2).join(".") +
            "." +
            signature.toString("base64url"),
        ),
      },
    );
    const changedBytes = Buffer.from(raw.artifact);
    changedBytes[changedBytes.length - 2] =
      changedBytes[changedBytes.length - 2]! ^ 1;
    await negative(
      "changed-artifact",
      "Changed artifact bytes fail the signed hash.",
      "변경된 내용 바이트가 서명된 해시에 실패합니다.",
      { ...raw, artifact: changedBytes },
    );
    await negative(
      "wrong-length",
      "A valid signature cannot authorize an incorrect byte length.",
      "유효한 서명도 틀린 바이트 길이를 허용하지 못합니다.",
      {
        ...raw,
        jws: Buffer.from(
          await signed(
            canonical({
              ...secondManifest,
              byte_length: raw.artifact.length + 1,
            }),
          ),
        ),
      },
    );
    await negative(
      "truncated",
      "A real truncated HTTP body is rejected.",
      "실제 잘린 HTTP 본문이 거부됩니다.",
      { ...raw, mode: "truncated" },
    );
    await negative(
      "manifest-oversize",
      "The manifest streaming bound rejects oversized bytes.",
      "서명목록 스트림 상한이 초과 바이트를 거부합니다.",
      { ...raw, jws: Buffer.alloc(65537, 120) },
    );
    await negative(
      "artifact-oversize",
      "The artifact streaming bound rejects oversized bytes.",
      "내용 스트림 상한이 초과 바이트를 거부합니다.",
      { ...raw, artifact: Buffer.alloc(2097153, 120) },
    );
    await negative(
      "duplicate-manifest-key",
      "Duplicate JSON manifest keys fail despite a valid signature.",
      "유효한 서명이어도 서명목록 JSON 중복키는 실패합니다.",
      {
        ...raw,
        jws: Buffer.from(
          await signed(
            Buffer.from(
              '{"sequence":2,' + JSON.stringify(secondManifest).slice(1),
            ),
          ),
        ),
      },
    );
    const duplicateArtifact = Buffer.from(
      '{"sequence":2,' + JSON.stringify(secondSnapshot).slice(1),
    );
    await negative(
      "duplicate-artifact-key",
      "Duplicate artifact JSON keys are rejected after exact hashing.",
      "정확한 해시 확인 뒤 내용 JSON 중복키를 거부합니다.",
      {
        jws: Buffer.from(
          await signed(
            canonical({
              ...secondManifest,
              traffic_snapshot_id: sha256(duplicateArtifact),
              byte_length: duplicateArtifact.length,
            }),
          ),
        ),
        artifact: duplicateArtifact,
      },
    );
    await negative(
      "unknown-manifest-field",
      "Unknown signed manifest fields are rejected.",
      "미지원 서명목록 필드를 거부합니다.",
      {
        ...raw,
        jws: Buffer.from(
          await signed(canonical({ ...secondManifest, extra: true })),
        ),
      },
    );
    await negative(
      "unknown-artifact-field",
      "Unknown artifact fields are rejected.",
      "미지원 내용 필드를 거부합니다.",
      await changed({}, { extra: true }),
    );
    await negative(
      "unsupported-algorithm",
      "An unsupported protected algorithm is rejected.",
      "미지원 보호 알고리즘을 거부합니다.",
      {
        ...raw,
        jws: Buffer.from(
          Buffer.from(
            JSON.stringify({
              alg: "none",
              kid: "key-b",
              typ: "routelens-traffic-manifest+jws",
            }),
          ).toString("base64url") +
            "." +
            signatureParts[1] +
            "." +
            signatureParts[2],
        ),
      },
    );
    await negative(
      "unsupported-header",
      "An injected remote key header is rejected without discovery.",
      "삽입된 원격키 헤더를 키 검색 없이 거부합니다.",
      {
        ...raw,
        jws: Buffer.from(
          await signed(canonical(secondManifest), signers[1], {
            alg: "EdDSA",
            kid: "key-b",
            typ: "routelens-traffic-manifest+jws",
            jku: "http://127.0.0.1/never-fetch",
          }),
        ),
      },
    );
    await negative(
      "unknown-kid",
      "An unconfigured signing key ID is rejected.",
      "미설정 서명키 식별자를 거부합니다.",
      {
        ...raw,
        jws: Buffer.from(
          await signed(canonical(secondManifest), signers[1], {
            alg: "EdDSA",
            kid: "unknown",
            typ: "routelens-traffic-manifest+jws",
          }),
        ),
      },
    );
    await negative(
      "duplicate-kid",
      "Duplicate local trust IDs fail before acceptance.",
      "중복 로컬 신뢰키 식별자가 수용 전에 실패합니다.",
      raw,
      { trust_roots: [...roots, roots[0]!] },
    );
    await negative(
      "disallowed-key",
      "A non-Ed25519 public key configuration is rejected.",
      "Ed25519이 아닌 공개키 설정을 거부합니다.",
      raw,
      {
        trust_roots: roots.map((r) =>
          r.kid === "key-a"
            ? { ...r, public_jwk: { kty: "RSA", n: "AA", e: "AQAB" } }
            : r,
        ),
      },
    );
    // A public-shaped invalid d is sufficient: never archive or log a real private root.
    await negative(
      "private-root",
      "A public trust root containing private material is rejected.",
      "비공개 필드가 든 공개 신뢰키를 거부합니다.",
      raw,
      {
        trust_roots: roots.map((r) =>
          r.kid === "key-a"
            ? {
                ...r,
                public_jwk: { ...r.public_jwk, d: "invalid-private-field" },
              }
            : r,
        ),
      },
    );
    const invalidUtf8 = Buffer.from([0xc3, 0x28]);
    await negative(
      "invalid-utf8",
      "Invalid UTF-8 artifact bytes fail despite a matching signed hash.",
      "서명 해시가 일치해도 잘못된 UTF-8 내용은 실패합니다.",
      {
        jws: Buffer.from(
          await signed(
            canonical({
              ...secondManifest,
              traffic_snapshot_id: sha256(invalidUtf8),
              byte_length: invalidUtf8.length,
            }),
          ),
        ),
        artifact: invalidUtf8,
      },
    );
    for (const [id, field, value, en, ko] of [
      [
        "wrong-graph",
        "graph_id",
        "f".repeat(64),
        "A valid signature for a different graph is rejected.",
        "다른 그래프의 유효 서명을 거부합니다.",
      ],
      [
        "wrong-namespace",
        "simulation_namespace",
        "other-namespace",
        "A valid signature for a different namespace is rejected.",
        "다른 시험영역의 유효 서명을 거부합니다.",
      ],
      [
        "wrong-region",
        "region_id",
        "other-region",
        "A valid signature for a different region is rejected.",
        "다른 지역의 유효 서명을 거부합니다.",
      ],
      [
        "wrong-publisher",
        "publisher_id",
        "other-publisher",
        "A valid signature for a different publisher is rejected.",
        "다른 발행자의 유효 서명을 거부합니다.",
      ],
    ] as const)
      await negative(
        id,
        en,
        ko,
        await changed({ [field]: value }, { [field]: value }),
      );
    const signedA = {
      ...raw,
      jws: Buffer.from(await signed(canonical(secondManifest), signers[0])),
    };
    await negative(
      "revoked-key",
      "A revoked key cannot authorize a new acceptance.",
      "철회된 키가 새 수용을 허용하지 못합니다.",
      signedA,
      {
        trust_roots: roots.map((r) =>
          r.kid === "key-a" ? { ...r, revoked: true } : r,
        ),
      },
    );
    await negative(
      "expired-key",
      "An expired key cannot authorize a new acceptance.",
      "만료된 키가 새 수용을 허용하지 못합니다.",
      signedA,
      {
        trust_roots: roots.map((r) =>
          r.kid === "key-a" ? { ...r, valid_until: at(89000) } : r,
        ),
      },
    );
    await negative(
      "future-key",
      "A not-yet-valid key cannot authorize a new acceptance.",
      "아직 유효하지 않은 키가 새 수용을 허용하지 못합니다.",
      signedA,
      {
        trust_roots: roots.map((r) =>
          r.kid === "key-a" ? { ...r, valid_from: at(91000) } : r,
        ),
      },
    );
    await negative(
      "future-published",
      "A future published-at timestamp is rejected.",
      "미래 발행시각을 거부합니다.",
      await changed({ published_at: at(91000) }, { published_at: at(91000) }),
    );
    await negative(
      "old-sequence",
      "A restarted consumer rejects an older actual published sequence.",
      "재시작한 수신자가 실제 게시된 낮은 순번을 거부합니다.",
      { jws: Buffer.from(first.jws), artifact: Buffer.from(first.artifact) },
      {},
      "REPLAY",
    );
    await negative(
      "sequence-conflict",
      "Different content at the same sequence cannot replace durable state.",
      "동일 순번의 다른 내용이 영속 상태를 바꾸지 못합니다.",
      await changed(
        {},
        {
          entries: (
            secondSnapshot.entries as Array<Record<string, unknown>>
          ).map((e) =>
            e.speed_mps === null
              ? e
              : { ...e, speed_mps: Number(e.speed_mps) + 0.001 },
          ),
        },
      ),
      {},
      "SEQUENCE_CONFLICT",
    );
    // The older window remains otherwise valid at now=90s (expiry180s).
    const oldWindow = {
      sequence: 3,
      window_start: at(-60000),
      window_end: START,
      valid_until: at(180000),
    };
    await negative(
      "older-window",
      "A higher sequence cannot move the accepted window backwards.",
      "높은 순번도 수용된 창을 뒤로 옮기지 못합니다.",
      await changed(oldWindow, oldWindow),
      {},
      "WINDOW_ROLLBACK",
    );
    await negative(
      "redirect",
      "The configured-origin fetcher refuses redirects.",
      "설정된 연결주소의 수신기가 리다이렉트를 거부합니다.",
      { ...raw, mode: "redirect" },
    );
    await negative(
      "fetch-timeout",
      "A real stalled HTTP response is bounded by the five-second deadline.",
      "실제 지연 HTTP 응답이 5초 제한으로 종료됩니다.",
      { ...raw, mode: "timeout" },
    );
    // A changed signing kid forces a write while the authoritative candidate is SHARE locked.
    const publishing = publish(signers[2], "AFTER_PUBLICATION_WRITE");
    await phase(publishing, "AFTER_PUBLICATION_WRITE");
    const revoke = post(4, "/v1/consent/revoke").then(
      (value) => ({ value }),
      (error) => ({ error: String(error) }),
    );
    const monitor = new pg.Pool({
      connectionString: config.database_url,
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      let waiters: unknown[] = [];
      for (let i = 0; i < 80; i++) {
        waiters = (
          await monitor.query(
            "SELECT w.pid,w.application_name,w.wait_event_type,ARRAY(SELECT b.pid FROM pg_stat_activity b WHERE b.pid=ANY(pg_blocking_pids(w.pid)) AND b.application_name='routelens-p07') AS publication_blockers FROM pg_stat_activity w WHERE w.datname=current_database() AND w.application_name='routelens-p05' AND w.wait_event_type='Lock'",
          )
        ).rows.filter((r) => r.publication_blockers.length > 0);
        if (waiters.length) break;
        await pause(25);
      }
      const pids = [
        ...new Set(
          (
            waiters as { pid: number; publication_blockers: number[] }[]
          ).flatMap((r) => [r.pid, ...r.publication_blockers]),
        ),
      ];
      const locks = pids.length
        ? (
            await monitor.query(
              "SELECT pid,locktype,mode,granted,relation::regclass::text AS relation_name FROM pg_locks WHERE pid=ANY($1::int[]) ORDER BY pid,locktype,mode",
              [pids],
            )
          ).rows
        : [];
      write(output, "readbacks/revoke-lock-wait.json", {
        paused_worker_pid: publishing.child?.pid,
        waiters,
        locks,
      });
      check(
        "revoke-lock-wait",
        waiters.length === 1,
        "Actual HTTP revocation waits on the owned paused publisher database lock.",
        "실제 HTTP 철회가 대기 중인 소유 게시자의 DB 잠금을 기다립니다.",
        1,
        waiters.length,
        "readbacks/revoke-lock-wait.json",
      );
    } finally {
      await monitor.end();
    }
    publishing.send({ type: "RESUME", phase: "AFTER_PUBLICATION_WRITE" });
    await done(publishing);
    const revokeResult = await revoke;
    if ("error" in revokeResult)
      throw new Error("HTTP revoke failed / HTTP 철회 실패");
    const revokeReply = revokeResult.value;
    const currentAfter = await publisher.current(),
      afterRevoke = await pubRead("revoke-before-recompute");
    const revokedHttp = await fetch(service.origin + currentPath, {
      signal: AbortSignal.timeout(5000),
    });
    write(output, "readbacks/revoke-http.json", {
      response: revokeReply,
      current: currentAfter,
      http_status: revokedHttp.status,
    });
    check(
      "revoke-current-invalidation",
      revokeReply.status === 200 &&
        currentAfter.code === "MISSING" &&
        revokedHttp.status === 404 &&
        afterRevoke.streams[0]?.high_water === 3 &&
        !afterRevoke.streams[0]?.current_snapshot_id &&
        afterRevoke.publications.length === 3,
      "Acknowledged revocation has already invalidated current, while immutable history and high-water remain.",
      "철회 응답 전에 현재참조가 무효화되고 불변 이력·최고순번은 남습니다.",
      { http_status: 404, high_water: 3 },
      afterRevoke.streams,
      "readbacks/revoke-http.json",
    );
    const corrected = await aggregate.finalize(START, now);
    write(output, "readbacks/recomputed-candidate.json", corrected);
    await done(publish(signers[2]));
    const correctedRows = await pubRead("correction"),
      fourth = correctedRows.publications.find((p) => p.sequence === 4)!;
    await archive(fourth);
    const correctionAcceptance = await done(consume(main.config));
    await snapshot(main, "consumer-accepted-4");
    const correctedTarget =
      corrected.code === "FINALIZED"
        ? corrected.draft.entries.find(
            (e) =>
              e.edge_id === scene.target.edge_id &&
              e.forward === scene.target.forward,
          )
        : undefined;
    check(
      "revoked-correction",
      correctedTarget?.status === "INSUFFICIENT" &&
        correctedTarget.speed_mps === null &&
        correctionAcceptance.message.high_water === 4 &&
        correctionAcceptance.message.code === "ACCEPTED",
      "Fresh recomputation publishes a higher-sequence INSUFFICIENT correction.",
      "새 재집계가 높은 순번의 INSUFFICIENT 정정본을 게시합니다.",
      { sequence: 4, status: "INSUFFICIENT" },
      {
        sequence: correctionAcceptance.message.high_water,
        target: correctedTarget,
      },
      "readbacks/consumer-accepted-4.json",
    );
    const expiryChild = consume(expiry.config, "AFTER_CONSUMER_VERIFY");
    await phase(expiryChild, "AFTER_CONSUMER_VERIFY");
    await advance(150000);
    const empty = await aggregate.finalize(at(60000), now);
    write(output, "readbacks/empty-candidate.json", empty);
    await done(publish(signers[2], undefined, at(60000)));
    const fifthRows = await pubRead("new-window"),
      fifth = fifthRows.publications.find((p) => p.sequence === 5)!;
    await archive(fifth);
    const newAccept = await done(consume(main.config));
    const newState = await snapshot(main, "consumer-accepted-5");
    check(
      "new-empty-window",
      newAccept.message.high_water === 5 &&
        newState.active?.snapshot.entries.every(
          (e) =>
            e.status === "UNKNOWN" &&
            e.speed_mps === null &&
            e.sample_bucket === null,
        ) === true,
      "A newer signed empty window replaces all previous speeds.",
      "새 서명된 빈 창이 이전 속도를 모두 대체합니다.",
      { sequence: 5, status: "UNKNOWN" },
      newAccept.message,
      "readbacks/consumer-accepted-5.json",
    );
    const oldPublish = await publisher.publish(START, now, signers[2]!);
    write(output, "readbacks/publisher-older-window.json", oldPublish);
    check(
      "publisher-older-window",
      oldPublish.code === "OLDER_WINDOW",
      "An older authoritative candidate cannot move publication current backwards.",
      "이전 창의 정식 후보가 현재 게시를 뒤로 돌리지 못합니다.",
      "OLDER_WINDOW",
      oldPublish.code,
      "readbacks/publisher-older-window.json",
    );
    await service.child.stop("SIGKILL");
    const outage = await done(consume(main.config));
    const outageState = await snapshot(main, "outage-main"),
      liveCache = await snapshot(cached, "outage-live-cache");
    check(
      "publisher-outage",
      service.child.child?.signalCode === "SIGKILL" &&
        outage.message.code === "REJECTED" &&
        outageState.high_water === 5 &&
        !!outageState.active &&
        liveCache.active?.manifest.sequence === 1,
      "Actual service outage retains still-valid accepted bytes without changing high-water.",
      "실제 서버 장애에서도 아직 유효한 수용 바이트·최고순번을 보존합니다.",
      { primary: 5, cached_live: 1 },
      { primary: outageState.high_water, cached: liveCache.high_water },
      "readbacks/outage-live-cache.json",
    );
    await advance(239999);
    const beforeExpiry = await snapshot(cached, "expiry-239999");
    check(
      "before-expiry",
      beforeExpiry.active?.manifest.sequence === 1,
      "The actual LIVE version remains usable at 239.999 seconds.",
      "실제 LIVE 버전이 239.999초에 유효합니다.",
      1,
      beforeExpiry.active?.manifest.sequence,
      "readbacks/expiry-239999.json",
    );
    await advance(240000);
    const exact = await snapshot(cached, "expiry-240000");
    check(
      "exact-expiry",
      exact.active === null && exact.high_water === 1,
      "Clock-only exact expiry clears LIVE acceptance and retains highest sequence.",
      "시계만 진행한 정확한 만료가 LIVE 수용을 지우고 최고순번을 남깁니다.",
      { active: null, high_water: 1 },
      exact,
      "readbacks/expiry-240000.json",
    );
    expiryChild.send({ type: "RESUME", phase: "AFTER_CONSUMER_VERIFY" });
    const expiredAcceptance = await done(expiryChild);
    const expiredState = await snapshot(expiry, "verify-then-expire");
    check(
      "verify-then-expire",
      expiredAcceptance.message.code === "REJECTED" &&
        expiredAcceptance.message.reason === "EXPIRED" &&
        expiredState.high_water === 0 &&
        expiredState.active === null,
      "Clock expiry after crypto verification prevents transactional acceptance.",
      "암호 검증 뒤 시계 만료가 트랜잭션 수용을 막습니다.",
      { reason: "EXPIRED", high_water: 0 },
      expiredAcceptance.message,
      "readbacks/verify-then-expire.json",
    );
    const stale = await cached.accept(first.jws, first.artifact, at(90000));
    write(output, "readbacks/stale-caller.json", stale);
    check(
      "stale-caller",
      stale.code === "REJECTED" &&
        stale.reason === "EXPIRED" &&
        stale.high_water === 1,
      "A stale caller cannot extend the TTL or restore expired accepted data.",
      "과거 호출시각이 유효기한을 늘리거나 만료 자료를 복원하지 못합니다.",
      { code: "REJECTED", reason: "EXPIRED" },
      stale,
      "readbacks/stale-caller.json",
    );
    service = await startService();
    await advance(300000);
    const expiredCurrent = await fetch(service.origin + currentPath, {
        signal: AbortSignal.timeout(5000),
      }),
      expiredMain = await snapshot(main, "current-expired");
    write(output, "readbacks/current-expired-http.json", {
      status: expiredCurrent.status,
      body: await expiredCurrent.text(),
    });
    check(
      "current-expired",
      expiredCurrent.status === 410 &&
        expiredMain.active === null &&
        expiredMain.high_water === 5,
      "Restarted HTTP service and consumer use persisted expiry and preserve high-water.",
      "재시작한 HTTP 서버·수신자가 저장된 만료시각을 쓰고 최고순번을 보존합니다.",
      { http: 410, high_water: 5 },
      { http: expiredCurrent.status, high_water: expiredMain.high_water },
      "readbacks/current-expired-http.json",
    );
    const finalRows = await pubRead("final-publications");
    for (const pub of finalRows.publications) {
      writeFileSync(
        join(
          output,
          "public/committed-sequence-" + pub.sequence + "-artifact.json",
        ),
        pub.artifact,
        { flag: "wx" },
      );
      writeFileSync(
        join(
          output,
          "public/committed-sequence-" + pub.sequence + "-manifest.jws.txt",
        ),
        pub.jws,
        { flag: "wx" },
      );
    }
    const readPool = new pg.Pool({
      connectionString: config.database_url,
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      const rows = (
        await readPool.query(
          "SELECT consumer_id,publisher_id,region_id,high_water,last_snapshot_id,last_window_start,octet_length(artifact) AS artifact_byte_length,jws FROM routelens_p07.consumer_states WHERE namespace=$1 ORDER BY consumer_id",
          [config.namespace],
        )
      ).rows;
      write(output, "readbacks/final-consumer-rows.json", rows);
    } finally {
      await readPool.end();
    }

    for (const pub of finalRows.publications) {
      const text = Buffer.from(pub.artifact).toString("utf8");
      assertNoSensitiveDiagnostics(text, secrets());
      runtime.assertSafe(text);
      if (
        /"(?:contributor_id|trip_id|sample_id|longitude|latitude|database_url|private_jwk|d)"\s*:/.test(
          text,
        )
      )
        throw new Error("Public private field / 공개자료 비공개필드");
    }
    const publicText = JSON.stringify(roots);
    assertNoSensitiveDiagnostics(publicText, secrets());
    runtime.assertSafe(publicText);
    check(
      "public-privacy",
      !roots.some((r) => "d" in r.public_jwk),
      "Archived public roots and exact signed public bytes contain no private keys, credentials or raw observations.",
      "보존된 공개키·정확한 서명 공개바이트에 비공개키·인증·원시관측이 없습니다.",
      true,
      true,
      "public/trust-roots.json",
    );
    report = {
      publisher_id: publicationConfig.publisher_id,
      simulation_namespace: config.namespace,
      high_water: expiredMain.high_water,
      active_snapshot_id: null,
      assertions_passed: assertions.length,
      assertions_total: assertions.length,
      cleanup_verified: false,
      versions: finalRows.publications.map((p) => ({
        sequence: p.sequence,
        kid: p.kid,
        snapshot_id: p.traffic_snapshot_id,
        target_status:
          (
            JSON.parse(Buffer.from(p.artifact).toString("utf8"))
              .entries as Array<{
              edge_id: string;
              forward: boolean;
              status: string;
            }>
          ).find(
            (e) =>
              e.edge_id === scene.target.edge_id &&
              e.forward === scene.target.forward,
          )?.status ?? "UNKNOWN",
        valid_until: p.valid_until,
        artifact_path:
          "public/committed-sequence-" + p.sequence + "-artifact.json",
        jws_path:
          "public/committed-sequence-" + p.sequence + "-manifest.jws.txt",
      })),
      cases: assertions.map((a) => ({
        case_id: a.assertion_id,
        status: a.status,
        message_en: a.message_en,
        message_ko: a.message_ko,
        evidence_path: a.evidence_path,
      })),
      evidence: [
        {
          name_en: "Public trust roots",
          name_ko: "공개 신뢰키",
          path: "public/trust-roots.json",
        },
        {
          name_en: "Original signed manifest",
          name_ko: "원본 서명목록",
          path: "public/sequence-1/manifest.jws.txt",
        },
        {
          name_en: "Exact artifact bytes",
          name_ko: "정확한 내용바이트",
          path: "public/sequence-1/artifact.json",
        },
        {
          name_en: "Durable consumer acceptance",
          name_ko: "영속 수신 수용",
          path: "readbacks/consumer-accepted-1-db-row.json",
        },
        {
          name_en: "Final publication rows",
          name_ko: "최종 게시행",
          path: "readbacks/final-publications.json",
        },
      ],
    };
  } catch (error) {
    failure = error;
    record("INTEGRATION", { code: "FAILED", error: String(error) });
  } finally {
    faultServer.closeAllConnections();
    if (faultServer.listening)
      await new Promise<void>((ok) => faultServer.close(() => ok()));
    for (const store of [...stores].reverse())
      await store.close().catch((error) => {
        failure ??= error;
      });
    cleanup = await runtime.cleanup();
    const diagnostics = runtime.processes.map((p) => ({
      role: p.role,
      pid: p.child?.pid,
      exit_code: p.child?.exitCode,
      signal: p.child?.signalCode,
      messages: p.messages,
      diagnostics: p.diagnostics.join(""),
    }));
    const text = JSON.stringify(diagnostics);
    assertNoSensitiveDiagnostics(text, secrets());
    runtime.assertSafe(text);
    write(output, "process-events.json", diagnostics);
    const portOpen = faultPort ? await portIsOpen(faultPort) : false;
    cleanup = cleanup && !portOpen;
    write(output, "negative/cleanup.json", {
      port: faultPort,
      server_listening: faultServer.listening,
      port_open: portOpen,
      connections_closed: true,
    });
  }
  if (failure || !cleanup || !report) {
    write(output, "failure.json", {
      status: "FAIL",
      error: String(failure),
      cleanup_verified: cleanup,
      message_en: "Actual P07 integration incomplete.",
      message_ko: "실제 P07 통합 미완료.",
    });
    throw failure ?? new Error("P07 cleanup incomplete / P07 정리 미완료");
  }
  for (const file of Object.keys(evidenceHashes(output))) {
    const text = readFileSync(join(output, file)).toString("utf8");
    runtime.assertSafe(text);
    if (secrets().some((value) => value && text.includes(value)))
      throw new Error(
        "Private credential in evidence / 증거에 비공개 인증값 존재",
      );
  }
  check(
    "owned-cleanup",
    cleanup && !faultServer.listening,
    "All owned processes, engines, database, volume, private files and HTTP ports are removed.",
    "소유 프로세스·엔진·DB·볼륨·비공개파일·HTTP 포트를 제거했습니다.",
    true,
    cleanup,
    "runtime/cleanup.json",
  );
  requirePublicationCases(assertions);
  report.cleanup_verified = true;
  report.assertions_passed = assertions.length;
  report.assertions_total = assertions.length;
  report.cases = assertions.map((a) => ({
    case_id: a.assertion_id,
    status: a.status,
    message_en: a.message_en,
    message_ko: a.message_ko,
    evidence_path: a.evidence_path,
  }));
  write(output, "report-publication.json", report);
  writeFileSync(
    join(output, "summary.md"),
    "# Signed synthetic publication / 서명 합성 게시\n\nActual GPS → HTTP → P05 matching → P06 candidate → signed immutable HTTP bytes → durable consumer.\n실제 GPS→HTTP→P05매칭→P06후보→서명 불변HTTP바이트→영속수신.\n\nP08 engine activation, production HTTPS/authentication and real-road accuracy remain unimplemented. Offline bytes are not instantly recalled by revocation.\nP08엔진활성화·운영HTTPS/인증·실도로정확도는 미구현이며 철회가 오프라인 바이트를 즉시 회수하지 않습니다.\n",
  );
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error("Source changed during P07 / P07 실행 중 소스변경");
  write(output, "manifest.json.tmp", {
    schema_version: "0.1",
    source,
    graph_id: graph.graphId,
    graph_manifest_sha256: graph.manifestSha256,
    implementation_sha256: fingerprint,
    status: "PASS",
    cleanup_verified: true,
    output_sha256: evidenceHashes(output),
    completed_at_utc: new Date().toISOString(),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return { publication: report, assertions };
}
export async function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    let graph = "",
      output = "";
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--help") {
        io.out(
          "Usage / 사용법: publication:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY",
        );
        return 0;
      } else if (argv[i] === "--graph" && !graph) graph = argv[++i] ?? "";
      else if (argv[i] === "--output" && !output) output = argv[++i] ?? "";
      else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!graph || !output || graph.startsWith("-") || output.startsWith("-"))
      throw new Error("Graph and new output required / 그래프·새출력 필요");
    await runPublicationChecks(graph, output);
    return 0;
  } catch (error) {
    io.error("P07 incomplete / P07 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
