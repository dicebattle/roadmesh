/** Actual fresh P05 → P06 → P07 → immutable traffic → Valhalla evidence.
 * 새 실제 수집·집계·서명수용·불변 교통파일·경로 엔진 근거. */
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  readdirSync,
  cpSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { generateKeyPair, exportJWK } from "jose";
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
import { decodeShape } from "./graph_evidence.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { createTrafficScenario, TRAFFIC_START } from "./traffic_scenario.js";
import { IngestionStore } from "./ingestion_store.js";
import { AggregationStore } from "./aggregation_store.js";
import { PublicationStore } from "./publication_store.js";
import { PublicationConsumer } from "./publication_consumer.js";
import { prepareTrafficBundle, loadTrafficBundle } from "./traffic_bundle.js";
import {
  OwnedIngestionRuntime,
  type OwnedIngestionProcess,
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
} from "./publication_types.js";
import type {
  TrafficWorkerConfig,
  TrafficPhase,
  TrafficResult,
  TrafficRouteRequest,
} from "./traffic_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
const at = (ms: number) =>
  new Date(Date.parse(TRAFFIC_START) + ms).toISOString();
export const TRAFFIC_CASE_IDS = [
  "authored-source",
  "http-matched-timing",
  "no-neighbor-contributions",
  "three-live-medians",
  "signed-http-acceptance",
  "blank-bundle",
  "exact-compiled-bytes",
  "identical-retry",
  "generation-concurrency",
  "generation-precommit-kill",
  "generation-postcommit-kill",
  "corrupt-bundle",
  "truncated-cache",
  "baseline-route",
  "live-detour",
  "restart-cache",
  "publisher-outage",
  "accepted-key-revoked",
  "database-outage",
  "database-restart",
  "engine-unavailable",
  "superseded-compile",
  "http-revoked-correction",
  "offline-ttl",
  "new-empty-window",
  "before-expiry",
  "exact-expiry",
  "route-result-expiry",
  "compile-selection-expiry",
  "clock-only-baseline",
  "public-privacy",
  "owned-cleanup",
].map((id) => "p08-" + id);
export function requireTrafficCases(assertions: SimulationAssertion[]): void {
  const ids = assertions.map((a) => a.assertion_id);
  if (
    ids.length !== TRAFFIC_CASE_IDS.length ||
    new Set(ids).size !== ids.length ||
    TRAFFIC_CASE_IDS.some((id) => !ids.includes(id)) ||
    assertions.some((a) => a.status !== "PASS")
  )
    throw new Error("P08 required cases incomplete / P08 필수 검사 미완료");
}
export interface RecordedTrafficRoute {
  label: string;
  message_en: string;
  message_ko: string;
  traffic_mode: string;
  sequence: number | null;
  snapshot_id: string | null;
  checked_at_event_time: string;
  valid_until: string | null;
  generation_id: string;
  traffic_sha256: string;
  shape: string;
  coordinates: number[][];
  distance_m: number;
  eta_s: number;
  trace_edge_ids: string[];
  evidence_path: string;
}
export interface TrafficReport {
  assertions_passed: number;
  assertions_total: number;
  cleanup_verified: boolean;
  targets: {
    edge_id: string;
    forward: boolean;
    distance_m: number;
    label: string;
  }[];
  routes: RecordedTrafficRoute[];
  cases: {
    case_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }[];
  evidence: {
    name_en: string;
    name_ko: string;
    path: string;
  }[];
}
/** Original engine responses are retained separately; summaries only read actual responses.
 * 원 엔진 응답은 별도 보존하며 요약은 실제 응답만 읽습니다. */
export function summarizeTrafficRoute(
  label: string,
  result: TrafficResult,
  path: string,
): RecordedTrafficRoute {
  if (result.code !== "ROUTE")
    throw new Error(
      "Actual route required / 실제 경로 필요: " + JSON.stringify(result),
    );
  const e = result.engine_result as {
    route?: any;
    trace?: any;
    route_response?: any;
    trace_response?: any;
  };
  const route = e.route ?? e.route_response,
    trace = e.trace ?? e.trace_response;
  const leg = route?.trip?.legs?.[0],
    summary = route?.trip?.summary;
  if (
    typeof leg?.shape !== "string" ||
    !Number.isFinite(summary?.time) ||
    !Number.isFinite(summary?.length) ||
    !Array.isArray(trace?.edges)
  )
    throw new Error(
      "Original route/trace evidence missing / 원 경로·trace 근거 누락",
    );
  return {
    label,
    message_en: label + " recorded route",
    message_ko: label + " 기록 경로",
    traffic_mode: result.traffic_mode,
    sequence: result.provenance.sequence,
    snapshot_id: result.provenance.traffic_snapshot_id,
    checked_at_event_time: result.provenance.checked_at_event_time,
    valid_until: result.provenance.valid_until,
    generation_id: result.provenance.generation_id,
    traffic_sha256: result.provenance.traffic_sha256,
    shape: leg.shape,
    coordinates: decodeShape(leg.shape),
    distance_m: summary.length * 1000,
    eta_s: summary.time,
    trace_edge_ids: trace.edges.map((x: any) => String(x.id ?? x.edge_id)),
    evidence_path: path,
  };
}
export function assertPublicTrafficProvenance(
  value: unknown,
  secrets: string[] = [],
): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid traffic provenance / 교통 출처정보 형식 오류");
  const p = value as Record<string, unknown>;
  const allowed = [
    "graph_id",
    "high_water",
    "sequence",
    "traffic_snapshot_id",
    "compiler_policy",
    "generation_id",
    "traffic_sha256",
    "traffic_byte_length",
    "checked_at_event_time",
    "valid_until",
    "traffic_mode",
    "engine",
    "message_en",
    "message_ko",
  ].sort();
  if (!canonical(Object.keys(p).sort()).equals(canonical(allowed)))
    throw new Error(
      "Unexpected public provenance field / 공개 출처정보에 허용하지 않은 필드",
    );
  if (
    !p.engine ||
    typeof p.engine !== "object" ||
    !canonical(Object.keys(p.engine).sort()).equals(
      canonical(["image_id", "version"]),
    )
  )
    throw new Error(
      "Unexpected public engine field / 공개 엔진정보에 허용하지 않은 필드",
    );
  assertNoSensitiveDiagnostics(JSON.stringify(p), secrets);
  if (
    /"(?:contributor_id|trip_id|sample_id|private_jwk|d)"\s*:/.test(
      JSON.stringify(p),
    )
  )
    throw new Error(
      "Private public provenance field / 공개 출처정보에 비공개 필드",
    );
}
const write = (root: string, path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
export async function runTrafficChecks(
  graphDirectory: string,
  outputPath: string,
): Promise<{
  traffic: TrafficReport;
  assertions: SimulationAssertion[];
}> {
  const output = resolve(outputPath);
  mkdirSync(output);
  for (const d of [
    "public",
    "readbacks",
    "negative",
    "synthetic-engine",
    "routes",
    "generations",
  ])
    mkdirSync(join(output, d));
  const graph = loadSeoulGraph(graphDirectory),
    scene = createTrafficScenario(graph),
    source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  write(output, "expected.json", {
    calculated_before_matching: true,
    targets: scene.targets,
    trips: scene.expected,
    window_start: at(180000),
    window_end: at(240000),
    finalize_at: at(270000),
    valid_until: at(420000),
    timing_tolerance_ms: 150,
    speed_relative_tolerance: 0.02,
    expected_live_count: 3,
    contributors_per_target: 5,
    expected_speed_mps: 0.5,
    encoded_kmh: 2,
    detour_minimum_distance_m: 50,
    detour_minimum_eta_s: 5,
    clipping_policy: scene.clipping_policy,
  });
  write(output, "synthetic-scenario.json", scene.spec);
  write(output, "synthetic-observations.json", scene.observations);
  write(output, "synthetic-full-truth.json", scene.simulation.truth);
  write(output, "catalog.json", scene.catalog);
  const request: TrafficRouteRequest = {
    graph_id: graph.graphId,
    locations: [
      {
        lon: 127.029,
        lat: 37.4984,
      },
      {
        lon: 127.049,
        lat: 37.5045,
      },
    ],
  };
  write(output, "route-request.json", request);
  const runtime = new OwnedIngestionRuntime(join(output, "runtime"), output),
    stores: Array<{
      close(): Promise<void>;
    }> = [],
    assertions: SimulationAssertion[] = [],
    routes: RecordedTrafficRoute[] = [],
    credentials: ServiceCredential[] = [],
    privateKeys: string[] = [];
  let config: StoreConfig | undefined,
    failure: unknown,
    cleanup = false,
    report: TrafficReport | undefined;
  const secrets = () => [
    ...credentials.map((c) => c.token),
    config?.database_url ?? "",
    ...privateKeys,
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
      assertion_id: "p08-" + id,
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
    const message = await child.message((m) => m.type === "RESULT", 300000),
      exit = await child.exited(300000);
    return {
      message: message as TrafficResult & {
        high_water?: number;
      },
      exit,
      pid: child.child?.pid,
    };
  };
  const phase = (child: OwnedIngestionProcess, p: TrafficPhase) =>
    child.message((m) => m.type === "PHASE" && m.phase === p, 300000);
  const resume = (child: OwnedIngestionProcess, p: TrafficPhase) =>
    child.send({
      type: "RESUME",
      phase: p,
    });
  try {
    check(
      "authored-source",
      scene.expected.length === 15 &&
        new Set(scene.expected.map((e) => e.contributor_id)).size === 15 &&
        scene.targets.length === 3,
      "Fixed public Seoul corridor and fifteen independent authored trips precede matching.",
      "고정 서울 공개 구간·독립 합성 여행15개를 매칭 전에 작성했습니다.",
      15,
      scene.expected.length,
      "expected.json",
    );
    const bundle = await prepareTrafficBundle(
      graph.directory,
      join(output, "bundle"),
    );
    write(output, "readbacks/bundle.json", bundle);
    const skeleton = readFileSync(bundle.skeleton_path);
    check(
      "blank-bundle",
      bundle.graph_id === graph.graphId &&
        bundle.catalog.length === scene.catalog.length &&
        bundle.members.every((m) =>
          skeleton
            .subarray(m.offset + 32, m.offset + m.byte_length)
            .every((b) => b === 0),
        ),
      "Verified complete graph traffic skeleton retains zero speed records.",
      "검증한 전체 지도 교통 뼈대가 빈 속도 기록을 유지합니다.",
      scene.catalog.length,
      bundle.catalog.length,
      "readbacks/bundle.json",
    );
    await runtime.start();
    config = {
      database_url: runtime.databaseUrl,
      namespace: "p08-" + runtime.runId.replace(/-/g, "").slice(0, 16),
      graph_id: graph.graphId,
      matching_policy: "seoul-observed-v3",
    };
    credentials.push(
      ...scene.expected.map((e) => ({
        token: randomBytes(24).toString("hex"),
        principal: {
          contributor_id: e.contributor_id,
          vehicle_id: e.vehicle_id,
          consent_version: "pilot-consent-v1" as const,
        },
      })),
    );
    let ingestion = new IngestionStore(config);
    stores.push(ingestion);
    await ingestion.initialize(credentials.map((c) => c.principal));
    let aggregation: AggregationStoreConfig = {
      store: config,
      catalog: scene.catalog,
      source_class: "SYNTHETIC",
    };
    let aggregate = new AggregationStore(aggregation);
    stores.push(aggregate);
    await aggregate.initialize();
    let publication: PublicationStoreConfig = {
      aggregation,
      publisher_id: "seoul-p08-publisher",
    };
    let publisher = new PublicationStore(publication);
    stores.push(publisher);
    await publisher.initialize();
    let now = TRAFFIC_START;
    const startApi = async () => {
      const child = runtime.spawn(
        "p08-source-api-" + runtime.processes.length,
        "ingestion_service",
        {
          store: config!,
          credentials,
          event_time_utc: now,
          port: 0,
        } satisfies ServiceConfig,
      );
      const ready = await child.message(
        (m) => m.type === "READY" && m.kind === "service",
      );
      return { child, origin: "http://127.0.0.1:" + ready.port };
    };
    let api = await startApi();
    const advance = async (ms: number) => {
      now = await ingestion.advanceEventTime(at(ms));
    };
    const post = async (index: number, path: string, body?: unknown) => {
      const r = await fetch(api.origin + path, {
        method: "POST",
        headers: {
          authorization: "Bearer " + credentials[index]!.token,
          "content-type": "application/json",
        },
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
        signal: AbortSignal.timeout(10000),
      });
      return {
        status: r.status,
        body: await r.json(),
      };
    };
    const http: unknown[] = [];
    const batches = scene.expected.flatMap((trip, index) =>
      buildIngestBatches(
        scene.observations.filter((p) => p.vehicle_id === trip.vehicle_id),
        trip.trip_id,
        graph.graphId,
        TRAFFIC_START,
      ).map((batch) => ({
        index,
        batch,
      })),
    );
    batches.sort(
      (a, b) =>
        Date.parse(a.batch.samples.at(-1)!.event_time_utc) -
          Date.parse(b.batch.samples.at(-1)!.event_time_utc) ||
        a.index - b.index,
    );
    for (const { index, batch } of batches) {
      await advance(
        Date.parse(batch.samples.at(-1)!.event_time_utc) -
          Date.parse(TRAFFIC_START),
      );
      const r = await post(index, "/v1/observations/batches", batch);
      http.push({
        vehicle_id: scene.expected[index]!.vehicle_id,
        batch_id: batch.batch_id,
        checked_at_event_time: now,
        ...r,
      });
      if (r.status !== 202)
        throw new Error("Source HTTP refused / 원 관측 HTTP 거부");
    }
    write(output, "readbacks/source-http.json", http);
    await advance(240000);
    for (let i = 0; i < 15; i++) {
      const r = await done(
        runtime.spawn("p08-source-worker-" + i, "ingestion_worker", {
          store: config,
          graph_directory: graph.directory,
          output_root: join(output, "synthetic-engine"),
          event_time_utc: now,
          owner_id: "p08-source-" + i,
        } satisfies WorkerConfig),
      );
      if ((r.message as any).code !== "SUCCEEDED" || r.exit.code !== 0)
        throw new Error(
          "Source matcher failed / 원 관측 매칭 실패: " + JSON.stringify(r),
        );
    }
    const sourceRows = await ingestion.inspect();
    write(output, "readbacks/source-db.json", sourceRows);
    const targetRows = sourceRows.traversals.filter((t) =>
      scene.targets.some(
        (e) => e.edge_id === t.edge_id && e.forward === t.forward,
      ),
    );
    const timing = scene.expected.map((e) => {
      const rows = targetRows.filter(
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
    write(output, "readbacks/timing.json", timing);
    check(
      "http-matched-timing",
      timing.every(
        (t) =>
          t.count === 1 &&
          t.entry_error_ms !== null &&
          t.entry_error_ms <= 150 &&
          t.exit_error_ms !== null &&
          t.exit_error_ms <= 150,
      ),
      "Actual HTTP/P05 target boundaries meet independent 150ms timing limits.",
      "실제 HTTP·P05 경계가 독립 기대 시각의150ms 제한을 만족합니다.",
      {
        trips: 15,
        max_error_ms: 150,
      },
      timing,
      "readbacks/timing.json",
    );
    check(
      "no-neighbor-contributions",
      sourceRows.traversals.length === 15 && targetRows.length === 15,
      "Clipped partial neighboring context produces no full-edge contributions.",
      "잘린 부분 이웃 문맥이 전체 구간 기여를 만들지 않습니다.",
      15,
      sourceRows.traversals.length,
      "readbacks/source-db.json",
    );
    await advance(270000);
    const candidate = await aggregate.finalize(at(180000), now);
    write(output, "readbacks/candidate.json", candidate);
    const lives =
      candidate.code === "FINALIZED"
        ? candidate.draft.entries.filter((e) => e.status === "LIVE")
        : [];
    check(
      "three-live-medians",
      candidate.code === "FINALIZED" &&
        candidate.draft.entries.length === scene.catalog.length &&
        lives.length === 3 &&
        scene.targets.every((t) =>
          lives.some(
            (e) =>
              e.edge_id === t.edge_id &&
              e.forward === t.forward &&
              e.speed_mps !== null &&
              Math.abs(e.speed_mps / 0.5 - 1) <= 0.02,
          ),
        ) &&
        candidate.selections
          .filter((s) =>
            scene.targets.some(
              (t) => t.edge_id === s.edge_id && t.forward === s.forward,
            ),
          )
          .every((s) => s.eligible_contributors === 5),
      "Fresh fixed-window aggregate has exactly three LIVE medians and five contributors per target.",
      "새 고정창 집계는 정확히 LIVE3개·대상별 기여자5명입니다.",
      {
        live: 3,
        contributors: 5,
        speed_mps: 0.5,
      },
      candidate,
      "readbacks/candidate.json",
    );
    const pair = await generateKeyPair("EdDSA", {
        extractable: true,
      }),
      private_jwk = await exportJWK(pair.privateKey),
      public_jwk = await exportJWK(pair.publicKey);
    privateKeys.push(private_jwk.d!);
    const signer: PublicationSigner = {
        kid: "p08-key",
        private_jwk,
      },
      roots: TrustRoot[] = [
        {
          kid: signer.kid,
          public_jwk,
          publisher_id: publication.publisher_id,
          simulation_namespace: config.namespace,
          region_id: "seoul-pilot-corridors-v1",
          allowed_graph_ids: [graph.graphId],
          source_class: "SYNTHETIC",
          valid_from: at(-60000),
          valid_until: at(3600000),
          revoked: false,
        },
      ];
    write(output, "public/trust-roots.json", roots);
    const startService = async () => {
      const child = runtime.spawn(
          "p08-publication-service-" + runtime.processes.length,
          "publication_service",
          {
            publication,
            port: 0,
          },
        ),
        r = await child.message(
          (m) => m.type === "READY" && m.kind === "publication-service",
        );
      return {
        child,
        origin: "http://127.0.0.1:" + r.port,
      };
    };
    let service = await startService();
    const makeConsumer = async (id: string) => {
      const consumer: ConsumerConfig = {
        store: config!,
        consumer_id: id,
        publisher_id: publication.publisher_id,
        region_id: "seoul-pilot-corridors-v1",
        allowed_graph_ids: [graph.graphId],
        catalogs: [
          {
            graph_id: graph.graphId,
            edges: scene.catalog,
          },
        ],
        trust_roots: roots,
        origin: service.origin,
      };
      const store = new PublicationConsumer(consumer);
      stores.push(store);
      await store.initialize();
      return {
        config: consumer,
        store,
      };
    };
    let main = await makeConsumer("p08-main"),
      cached = await makeConsumer("p08-offline-ttl"),
      keyCache = await makeConsumer("p08-key-revocation");
    const worker = (
      consumer: ConsumerConfig,
      operation: "compile" | "route",
      root = "main",
      pause_at?: TrafficPhase,
      bundle_directory = bundle.directory,
    ) =>
      runtime.spawn(
        "p08-traffic-" + runtime.processes.length,
        "traffic_worker",
        {
          consumer,
          graph_directory: graph.directory,
          bundle_directory,
          generation_root: join(output, "generations", root),
          expected_graph_id: graph.graphId,
          operation,
          ...(operation === "route"
            ? {
                request,
              }
            : {}),
          ...(pause_at
            ? {
                pause_at,
              }
            : {}),
        } satisfies TrafficWorkerConfig,
      );
    const route = async (
      label: string,
      consumer = main.config,
      root = "main",
    ) => {
      const r = await done(worker(consumer, "route", root));
      write(output, "routes/" + label + ".json", r);
      if (
        r.message.code === "ROUTE" &&
        !canonical(
          (
            r.message.engine_result as {
              request: unknown;
            }
          ).request,
        ).equals(
          canonical({
            locations: request.locations,
            costing: "auto",
            units: "kilometers",
            language: "en-US",
            date_time: {
              type: 0,
            },
          }),
        )
      )
        throw new Error("Original route request changed / 원 경로 요청 변경");
      if (r.message.code === "ROUTE")
        assertPublicTrafficProvenance(r.message.provenance, secrets());
      const summary = summarizeTrafficRoute(
        label,
        r.message,
        "routes/" + label + ".json",
      );
      routes.push(summary);
      return summary;
    };
    const baseline = await route("baseline");
    check(
      "baseline-route",
      baseline.traffic_mode === "NO_USABLE_SNAPSHOT" &&
        baseline.snapshot_id === null,
      "Fresh controller selects blank baseline before acceptance.",
      "새 조정자가 수용 전 빈 기본파일을 선택합니다.",
      "NO_USABLE_SNAPSHOT",
      baseline,
      "routes/baseline.json",
    );
    const publish = async (window = at(180000)) => {
      const r = await done(
        runtime.spawn(
          "p08-publisher-" + runtime.processes.length,
          "publication_worker",
          {
            publication,
            signer,
            window_start: window,
            event_time_utc: now,
          },
        ),
      );
      const rows = await publisher.inspect();
      write(
        output,
        "readbacks/publication-" + rows.publications.length + ".json",
        rows,
      );
      return r;
    };
    const consume = async (c: ConsumerConfig) =>
      done(
        runtime.spawn(
          "p08-consumer-" + runtime.processes.length,
          "publication_consumer_worker",
          {
            consumer: c,
            event_time_utc: now,
          },
        ),
      );
    const archive = async (p: PublicationRecord) => {
      const prefix = "public/sequence-" + p.sequence;
      const j = await fetch(
          service.origin +
            "/v1/simulations/" +
            config!.namespace +
            "/regions/seoul-pilot-corridors-v1/current",
        ),
        a = await fetch(
          service.origin +
            "/v1/simulations/" +
            config!.namespace +
            "/artifacts/" +
            p.traffic_snapshot_id,
        );
      const jws = await j.text(),
        bytes = Buffer.from(await a.arrayBuffer());
      writeFileSync(join(output, prefix + ".jws.txt"), jws, {
        flag: "wx",
      });
      writeFileSync(join(output, prefix + ".json"), bytes, {
        flag: "wx",
      });
      if (
        j.status !== 200 ||
        a.status !== 200 ||
        jws !== p.jws ||
        !bytes.equals(Buffer.from(p.artifact))
      )
        throw new Error("Signed HTTP bytes differ / 서명 HTTP 바이트 불일치");
    };
    await publish();
    const first = (await publisher.inspect()).publications[0]!;
    await archive(first);
    const accepted = await consume(main.config);
    await consume(cached.config);
    await consume(keyCache.config);
    const state = await main.store.status();
    write(output, "readbacks/accepted.json", state);
    check(
      "signed-http-acceptance",
      (accepted.message as any).code === "ACCEPTED" &&
        state.active?.manifest.traffic_snapshot_id ===
          first.traffic_snapshot_id &&
        state.high_water === 1,
      "Actual signed HTTP bytes become durable P07 acceptance before compilation.",
      "실제 서명 HTTP 바이트가 파일 생성 전에 P07 영속 수용에 도달합니다.",
      first.traffic_snapshot_id,
      state.active?.manifest.traffic_snapshot_id,
      "readbacks/accepted.json",
    );
    const compile = await done(worker(main.config, "compile"));
    write(output, "readbacks/compiled.json", compile);
    if (compile.message.code !== "READY")
      throw new Error("Live compilation failed / 실시간 파일 생성 실패");
    const generation = compile.message.generation;
    const compiled = readFileSync(generation.traffic_path),
      changed: number[] = [];
    for (let i = 0; i < compiled.length; i++)
      if (compiled[i] !== skeleton[i]) changed.push(i);
    const offsets = generation.live_edges.map((e) => e.offset);
    check(
      "exact-compiled-bytes",
      generation.live_edges.length === 3 &&
        generation.live_edges.every(
          (e) =>
            e.raw_speed === 1 &&
            e.decoded_speed_mps === 2 / 3.6 &&
            scene.targets.some(
              (t) => t.edge_id === e.edge_id && t.forward === e.forward,
            ),
        ) &&
        changed.every((i) => offsets.some((o) => i >= o && i < o + 8)) &&
        compiled.length === skeleton.length,
      "Exactly three accepted LIVE records encode 2km/h; every other byte is unchanged.",
      "수용한 LIVE3개만2km/h로 인코딩하고 나머지 바이트는 보존합니다.",
      {
        records: 3,
        kmh: 2,
      },
      generation,
      "readbacks/compiled.json",
    );
    const retry = await done(worker(main.config, "compile"));
    write(output, "readbacks/retry.json", retry);
    check(
      "identical-retry",
      retry.message.code === "READY" &&
        retry.message.generation.traffic_sha256 === generation.traffic_sha256 &&
        retry.message.generation.generation_id === generation.generation_id,
      "Identical retry reuses checked immutable bytes.",
      "동일 재시도가 검사한 불변 바이트를 재사용합니다.",
      generation.generation_id,
      retry.message,
      "readbacks/retry.json",
    );
    const concurrent = await Promise.all([
      done(worker(main.config, "compile", "race")),
      done(worker(main.config, "compile", "race")),
    ]);
    write(output, "readbacks/concurrent.json", concurrent);
    check(
      "generation-concurrency",
      concurrent.every(
        (r) =>
          r.message.code === "READY" &&
          r.message.generation.traffic_sha256 === generation.traffic_sha256,
      ),
      "Concurrent real workers converge on identical complete generations.",
      "동시 실제 처리자가 동일한 완성 세대로 모입니다.",
      generation.traffic_sha256,
      concurrent,
      "readbacks/concurrent.json",
    );
    for (const [label, p] of [
      ["precommit", "AFTER_TRAFFIC_WRITE"],
      ["postcommit", "AFTER_TRAFFIC_COMMIT"],
    ] as const) {
      const child = worker(main.config, "compile", label, p);
      await phase(child, p);
      await child.stop("SIGKILL");
      const dirs = readdirSync(join(output, "generations", label));
      const again = await done(worker(main.config, "compile", label));
      write(output, "readbacks/" + label + "-kill.json", {
        pid: child.child?.pid,
        signal: child.child?.signalCode,
        directories_after_kill: dirs,
        retry: again,
      });
      check(
        "generation-" + label + "-kill",
        child.child?.signalCode === "SIGKILL" &&
          again.message.code === "READY" &&
          again.message.generation.traffic_sha256 ===
            generation.traffic_sha256 &&
          (label !== "precommit" || !dirs.includes(generation.generation_id)),
        "Actual SIGKILL and retry preserve complete immutable publication boundaries.",
        "실제 강제종료·재시도가 완성 불변 파일 공개 경계를 지킵니다.",
        generation.traffic_sha256,
        again.message,
        "readbacks/" + label + "-kill.json",
      );
    }
    const badBundle = join(output, "negative/corrupt-bundle");
    cpSync(bundle.directory, badBundle, {
      recursive: true,
    });
    const badPath = join(
      badBundle,
      bundle.skeleton_path.slice(bundle.directory.length + 1),
    );
    const bad = readFileSync(badPath);
    bad[0] = bad[0]! ^ 1;
    writeFileSync(badPath, bad);
    let refused = false;
    try {
      loadTrafficBundle(badBundle, graph.directory);
    } catch {
      refused = true;
    }
    const corruptResult = await done(
      worker(main.config, "route", "corrupt-bundle", undefined, badBundle),
    );
    write(output, "negative/corrupt-bundle.json", corruptResult);
    check(
      "corrupt-bundle",
      refused &&
        corruptResult.message.code === "UNAVAILABLE" &&
        corruptResult.message.reason === "INVALID_TAR_HEADER",
      "Corrupt bundle is refused before engine use.",
      "손상 뼈대를 엔진 사용 전에 거부합니다.",
      "UNAVAILABLE",
      corruptResult.message,
      "negative/corrupt-bundle.json",
    );
    const corruptCompile = await done(
      worker(main.config, "compile", "corrupt-cache"),
    );
    if (corruptCompile.message.code !== "READY")
      throw new Error("Negative setup failed / 부정 검사 준비 실패");
    writeFileSync(
      corruptCompile.message.generation.traffic_path,
      Buffer.alloc(7),
    );
    const truncated = await done(worker(main.config, "route", "corrupt-cache"));
    write(output, "negative/truncated-cache.json", truncated);
    check(
      "truncated-cache",
      truncated.message.code === "UNAVAILABLE" &&
        truncated.message.reason === "GENERATION_CONFLICT",
      "Truncated ready cache cannot be silently rebuilt or routed.",
      "잘린 준비 캐시를 몰래 재생성하거나 경로에 쓰지 않습니다.",
      "UNAVAILABLE",
      truncated.message,
      "negative/truncated-cache.json",
    );
    const live = await route("live");
    check(
      "live-detour",
      live.traffic_mode === "LIVE" &&
        live.shape !== baseline.shape &&
        scene.targets.every((t) => !live.trace_edge_ids.includes(t.edge_id)) &&
        live.distance_m - baseline.distance_m >= 50 &&
        live.eta_s - baseline.eta_s >= 5,
      "Original two-point request takes a real positive-speed detour with fixed distance and ETA margins.",
      "원래 두 좌표 요청이 양수 속도 우회로 거리·예상시간의 고정 여유를 만족합니다.",
      {
        minimum_extra_m: 50,
        minimum_extra_eta_s: 5,
        target_ids_absent: true,
      },
      {
        baseline,
        live,
      },
      "routes/live.json",
    );
    const restarted = await route("restart-cache");
    check(
      "restart-cache",
      restarted.shape === live.shape &&
        restarted.traffic_sha256 === live.traffic_sha256,
      "Separate restarted controller validates and reuses the immutable generation.",
      "별도 재시작 조정자가 불변 세대를 검증·재사용합니다.",
      live.traffic_sha256,
      restarted.traffic_sha256,
      "routes/restart-cache.json",
    );
    await service.child.stop("SIGKILL");
    const outagePull = await consume(cached.config),
      outage = await route("publisher-outage", cached.config);
    write(output, "readbacks/publisher-outage.json", outagePull);
    check(
      "publisher-outage",
      outagePull.message.code === "REJECTED" &&
        outage.traffic_mode === "LIVE" &&
        outage.snapshot_id === live.snapshot_id,
      "Actual publisher outage retains a still-valid accepted live snapshot.",
      "실제 게시자 장애 중에도 아직 유효한 수용 실시간 자료를 사용합니다.",
      live.snapshot_id,
      outage.snapshot_id,
      "routes/publisher-outage.json",
    );
    service = await startService();
    main.config.origin = service.origin;
    cached.config.origin = service.origin;
    keyCache.config.origin = service.origin;
    const revokedConfig = {
      ...keyCache.config,
      trust_roots: roots.map((r) => ({
        ...r,
        revoked: true,
      })),
    };
    const revoked = await route("accepted-key-revoked", revokedConfig);
    check(
      "accepted-key-revoked",
      revoked.traffic_mode === "NO_USABLE_SNAPSHOT" &&
        revoked.snapshot_id === null &&
        revoked.sequence === null,
      "Configured accepted-key revocation removes usable traffic before selection.",
      "수용 키 철회 설정이 선택 전에 사용 가능한 교통자료를 제거합니다.",
      "NO_USABLE_SNAPSHOT",
      revoked,
      "routes/accepted-key-revoked.json",
    );
    // Compare persisted state through independent connections, without accepting again.
    // 재수용 없이 별도 연결로 저장된 상태를 전후 비교합니다.
    const durableDatabaseState = async () => {
      const pool = new pg.Pool({
        connectionString: config!.database_url,
        max: 1,
        connectionTimeoutMillis: 5000,
      });
      try {
        const clock = (
          await pool.query(
            "SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1",
            [config!.namespace],
          )
        ).rows[0];
        const rows = (
          await pool.query(
            "SELECT consumer_id,high_water,last_snapshot_id,last_window_start,artifact,jws FROM routelens_p07.consumer_states WHERE namespace=$1 ORDER BY consumer_id",
            [config!.namespace],
          )
        ).rows;
        const count = (
          await pool.query(
            "SELECT count(*) AS count FROM routelens_p05.traversals WHERE namespace=$1",
            [config!.namespace],
          )
        ).rows[0];
        return {
          namespace: config!.namespace,
          graph_id: config!.graph_id,
          event_time_utc: clock.event_time_utc.toISOString(),
          stored_traversals: Number(count.count),
          consumers: rows.map((row) => ({
            consumer_id: row.consumer_id,
            high_water: Number(row.high_water),
            last_snapshot_id: row.last_snapshot_id,
            last_window_start: row.last_window_start?.toISOString() ?? null,
            artifact_sha256: row.artifact ? sha256(row.artifact) : null,
            artifact_byte_length: row.artifact?.length ?? null,
            jws: row.jws,
          })),
        };
      } finally {
        await pool.end();
      }
    };
    const durableBefore = await durableDatabaseState();
    write(output, "readbacks/database-before-restart.json", durableBefore);
    runtime.commands.command(["stop", "--time", "5", runtime.name], 15000);
    const dbDown = await done(worker(main.config, "route"));
    write(output, "negative/database-outage.json", dbDown);
    check(
      "database-outage",
      dbDown.message.code === "UNAVAILABLE" &&
        dbDown.message.reason === "STORE_UNAVAILABLE",
      "Actual database outage returns unavailable without trusting cached traffic.",
      "실제 DB 장애에서 캐시 교통정보를 믿지 않고 사용불가를 반환합니다.",
      "UNAVAILABLE",
      dbDown.message,
      "negative/database-outage.json",
    );
    // Stop exactly this run's HTTP services and discard every old connection pool.
    // 이 실행의 HTTP 서비스만 종료하고 이전 연결 풀을 모두 제거합니다.
    await api.child.stop();
    await service.child.stop();
    while (stores.length) {
      const oldStore = stores[stores.length - 1]!;
      await oldStore.close();
      stores.pop();
    }
    const oldEndpointPort = new URL(config.database_url).port;
    await runtime.restartDatabase();
    config = { ...config, database_url: runtime.databaseUrl };
    aggregation = { ...aggregation, store: config };
    publication = { ...publication, aggregation };
    ingestion = new IngestionStore(config);
    stores.push(ingestion);
    aggregate = new AggregationStore(aggregation);
    stores.push(aggregate);
    await aggregate.verifyInitialized();
    publisher = new PublicationStore(publication);
    stores.push(publisher);
    await publisher.verifyInitialized();
    api = await startApi();
    service = await startService();
    for (const handle of [main, cached, keyCache]) {
      handle.config = {
        ...handle.config,
        store: config,
        origin: service.origin,
      };
      handle.store = new PublicationConsumer(handle.config);
      stores.push(handle.store);
      await handle.store.verifyInitialized();
    }
    const durableAfter = await durableDatabaseState();
    write(output, "readbacks/database-after-restart.json", durableAfter);
    write(output, "readbacks/database-reconnect.json", {
      old_loopback_port: Number(oldEndpointPort),
      new_loopback_port: Number(new URL(config.database_url).port),
      same_namespace: durableBefore.namespace === durableAfter.namespace,
      exact_durable_state_preserved: canonical(durableBefore).equals(
        canonical(durableAfter),
      ),
      consumer_acceptance_repeated: false,
      clock_initialization_repeated: false,
      message_en:
        "Reopened current endpoint with fresh pools and owned HTTP services; original consumer state was read back without reacceptance.",
      message_ko:
        "현재 접속처의 새 연결 풀·소유 HTTP 서비스를 열고 재수용 없이 기존 수신 상태를 다시 읽었습니다.",
    });
    const dbBack = await route("database-restart");
    check(
      "database-restart",
      dbBack.traffic_mode === "LIVE" &&
        dbBack.snapshot_id === live.snapshot_id &&
        canonical(durableBefore).equals(canonical(durableAfter)) &&
        durableAfter.event_time_utc === at(270000) &&
        durableAfter.stored_traversals === 15,
      "Actual database restart preserves accepted identity and revalidates routes.",
      "실제 DB 재시작 후 수용 식별자를 보존·재검증합니다.",
      live.snapshot_id,
      dbBack.snapshot_id,
      "readbacks/database-reconnect.json",
    );
    // Engine unavailability uses the exact owned engine name emitted at its real ready phase.
    const deadEngine = worker(
        main.config,
        "route",
        "engine-unavailable",
        "AFTER_ENGINE_READY",
      ),
      enginePhase = await phase(deadEngine, "AFTER_ENGINE_READY");
    if (
      typeof enginePhase.engine_container !== "string" ||
      typeof enginePhase.engine_run_directory !== "string"
    )
      throw new Error("Owned engine identity missing / 소유 엔진 식별 누락");
    const ownedEngine = JSON.parse(
      runtime.commands.command(["inspect", enginePhase.engine_container])
        .stdout,
    )[0] as {
      Name: string;
      Config: {
        Labels: Record<string, string>;
      };
      Mounts: {
        Source: string;
        Destination: string;
      }[];
    };
    const engineLabel = ownedEngine.Config.Labels["io.routelens.run_id"],
      engineDirectory = resolve(enginePhase.engine_run_directory);
    write(output, "negative/engine-ownership.json", {
      engine: ownedEngine,
      phase: enginePhase,
      owned_output_root: output,
    });
    if (
      !/^[a-f0-9-]{36}$/.test(engineLabel ?? "") ||
      ownedEngine.Name !== "/routelens-p02-" + engineLabel ||
      ownedEngine.Name !== "/" + enginePhase.engine_container ||
      !engineDirectory.startsWith(output + "/") ||
      !ownedEngine.Mounts.some(
        (m) =>
          m.Destination === "/work" && resolve(m.Source) === engineDirectory,
      )
    )
      throw new Error(
        "Engine ownership does not match current run / 엔진 소유권이 현재 실행과 불일치합니다",
      );
    runtime.commands.command(["kill", enginePhase.engine_container]);
    resume(deadEngine, "AFTER_ENGINE_READY");
    const unavailable = await done(deadEngine);
    write(output, "negative/engine-unavailable.json", {
      engine_name: enginePhase.engine_container,
      result: unavailable,
    });
    check(
      "engine-unavailable",
      unavailable.message.code === "UNAVAILABLE" &&
        unavailable.message.reason === "ENGINE_UNAVAILABLE",
      "Killing the exact owned ready engine returns explicit unavailability.",
      "준비된 정확한 소유 엔진을 종료하면 명시적 사용불가를 반환합니다.",
      "UNAVAILABLE",
      unavailable.message,
      "negative/engine-unavailable.json",
    );
    const oldCompile = worker(
      main.config,
      "compile",
      "superseded",
      "AFTER_TRAFFIC_WRITE",
    );
    await phase(oldCompile, "AFTER_TRAFFIC_WRITE");
    const revokedReplies = [];
    for (const index of [0, 5, 10])
      revokedReplies.push(await post(index, "/v1/consent/revoke"));
    const corrected = await aggregate.finalize(at(180000), now);
    await publish();
    const correction = (await publisher.inspect()).publications.at(-1)!;
    await archive(correction);
    await consume(main.config);
    resume(oldCompile, "AFTER_TRAFFIC_WRITE");
    const superseded = await done(oldCompile);
    write(output, "readbacks/superseded.json", superseded);
    check(
      "superseded-compile",
      superseded.message.code === "REJECTED" &&
        superseded.message.reason === "ACCEPTED_STATE_CHANGED",
      "Paused older compile refuses selection after durable higher-sequence acceptance.",
      "멈춘 이전 파일 생성이 높은 순번 영속 수용 뒤 선택을 거부합니다.",
      "REJECTED",
      superseded.message,
      "readbacks/superseded.json",
    );
    write(output, "readbacks/correction.json", {
      revoked_http: revokedReplies,
      candidate: corrected,
      sequence: correction.sequence,
      state: await main.store.status(),
    });
    const correctedRoute = await route("correction");
    check(
      "http-revoked-correction",
      revokedReplies.every((r) => r.status === 200) &&
        corrected.code === "FINALIZED" &&
        scene.targets.every((t) =>
          corrected.draft.entries.some(
            (e) =>
              e.edge_id === t.edge_id &&
              e.forward === t.forward &&
              e.status === "INSUFFICIENT" &&
              e.speed_mps === null,
          ),
        ) &&
        correction.sequence > first.sequence &&
        correctedRoute.traffic_mode === "NO_LIVE_COVERAGE" &&
        correctedRoute.snapshot_id === correction.traffic_snapshot_id,
      "Actual HTTP contributor revocation, recomputation and signed correction remove all three live speeds.",
      "실제 HTTP 기여자 철회·재집계·서명 정정으로 세 실시간 속도를 제거합니다.",
      "NO_LIVE_COVERAGE",
      correctedRoute,
      "readbacks/correction.json",
    );
    const offline = await cached.store.status();
    write(output, "readbacks/offline-ttl.json", offline);
    check(
      "offline-ttl",
      offline.active?.manifest.traffic_snapshot_id ===
        first.traffic_snapshot_id,
      "Separate offline consumer retains accepted old bytes until its original TTL.",
      "별도 오프라인 수신자는 원래 만료까지 기존 수용 바이트를 유지합니다.",
      first.traffic_snapshot_id,
      offline.active?.manifest.traffic_snapshot_id,
      "readbacks/offline-ttl.json",
    );
    await advance(330000);
    const empty = await aggregate.finalize(at(240000), now);
    await publish(at(240000));
    const emptyPub = (await publisher.inspect()).publications.at(-1)!;
    await archive(emptyPub);
    await consume(main.config);
    const emptyRoute = await route("new-empty-window");
    write(output, "readbacks/empty.json", empty);
    check(
      "new-empty-window",
      empty.code === "FINALIZED" &&
        empty.draft.entries.every(
          (e) => e.status === "UNKNOWN" && e.speed_mps === null,
        ) &&
        emptyRoute.traffic_mode === "NO_LIVE_COVERAGE" &&
        emptyRoute.snapshot_id === emptyPub.traffic_snapshot_id &&
        emptyRoute.snapshot_id !== correction.traffic_snapshot_id,
      "New signed empty window replaces previous records and retains its own snapshot identity.",
      "새 서명 빈 창이 이전 기록을 대체하고 자체 식별자를 유지합니다.",
      emptyPub.traffic_snapshot_id,
      emptyRoute,
      "readbacks/empty.json",
    );
    await advance(419999);
    const before = await route("before-expiry", cached.config);
    check(
      "before-expiry",
      before.traffic_mode === "LIVE" &&
        before.snapshot_id === first.traffic_snapshot_id,
      "Live acceptance remains usable at event time419.999 seconds.",
      "관측시각419.999초에는 실시간 수용자료가 유효합니다.",
      "LIVE",
      before,
      "routes/before-expiry.json",
    );
    const staleRoute = worker(
        cached.config,
        "route",
        "expiry-route",
        "AFTER_ROUTE_RESULT",
      ),
      staleCompile = worker(
        cached.config,
        "compile",
        "expiry-compile",
        "AFTER_TRAFFIC_COMMIT",
      );
    await Promise.all([
      phase(staleRoute, "AFTER_ROUTE_RESULT"),
      phase(staleCompile, "AFTER_TRAFFIC_COMMIT"),
    ]);
    await advance(420000);
    const exact = await cached.store.status();
    write(output, "readbacks/exact-expiry.json", exact);
    check(
      "exact-expiry",
      exact.active === null && exact.high_water === 1,
      "Clock-only exact420-second expiry clears acceptance while preserving high-water.",
      "시계만 진행한 정확한420초 만료가 수용자료를 지우고 최고순번을 보존합니다.",
      {
        active: null,
        high_water: 1,
      },
      exact,
      "readbacks/exact-expiry.json",
    );
    resume(staleRoute, "AFTER_ROUTE_RESULT");
    resume(staleCompile, "AFTER_TRAFFIC_COMMIT");
    const [routeExpired, compileExpired] = await Promise.all([
      done(staleRoute),
      done(staleCompile),
    ]);
    write(output, "readbacks/route-result-expiry.json", routeExpired);
    write(output, "readbacks/compile-selection-expiry.json", compileExpired);
    check(
      "route-result-expiry",
      routeExpired.message.code === "UNAVAILABLE" &&
        routeExpired.message.reason === "ACCEPTED_STATE_CHANGED",
      "Actual completed live engine result is discarded after expiry before response.",
      "실제 계산된 실시간 엔진 결과를 응답 전 만료 후 버립니다.",
      "UNAVAILABLE",
      routeExpired.message,
      "readbacks/route-result-expiry.json",
    );
    check(
      "compile-selection-expiry",
      compileExpired.message.code === "REJECTED" &&
        compileExpired.message.reason === "ACCEPTED_STATE_CHANGED",
      "Fresh complete compile cannot be selected after exact expiry.",
      "새로 완성한 파일도 정확한 만료 뒤 선택할 수 없습니다.",
      "REJECTED",
      compileExpired.message,
      "readbacks/compile-selection-expiry.json",
    );
    const expired = await route("expired", cached.config);
    check(
      "clock-only-baseline",
      expired.traffic_mode === "NO_USABLE_SNAPSHOT" &&
        expired.snapshot_id === null &&
        expired.shape === baseline.shape &&
        Math.abs(expired.eta_s - baseline.eta_s) <= 1e-6,
      "Next request returns the original baseline shape and ETA after clock-only expiry.",
      "시계만 진행한 만료 후 다음 요청은 원래 기본 경로·예상시간으로 돌아갑니다.",
      {
        shape: baseline.shape,
        eta_s: baseline.eta_s,
      },
      expired,
      "routes/expired.json",
    );
    const pool = new pg.Pool({
      connectionString: config.database_url,
      max: 1,
    });
    try {
      write(
        output,
        "readbacks/final-consumer-db.json",
        (
          await pool.query(
            "SELECT consumer_id,high_water,last_snapshot_id,last_window_start,octet_length(artifact) artifact_byte_length FROM routelens_p07.consumer_states WHERE namespace=$1 ORDER BY consumer_id",
            [config.namespace],
          )
        ).rows,
      );
    } finally {
      await pool.end();
    }
    for (const p of (await publisher.inspect()).publications) {
      const text = Buffer.from(p.artifact).toString("utf8");
      assertNoSensitiveDiagnostics(text, secrets());
      if (
        /"(?:contributor_id|trip_id|sample_id|longitude|latitude|database_url|private_jwk|d)"\s*:/.test(
          text,
        )
      )
        throw new Error("Private public field / 공개 자료 비공개 필드");
    }
    for (const r of routes) {
      const recorded = JSON.parse(
        readFileSync(join(output, r.evidence_path), "utf8"),
      ) as {
        message: TrafficResult;
      };
      if (recorded.message.code !== "ROUTE")
        throw new Error("Recorded route missing / 기록 경로 누락");
      assertPublicTrafficProvenance(recorded.message.provenance, secrets());
    }
    check(
      "public-privacy",
      !roots.some((r) => "d" in r.public_jwk),
      "Public signed bytes and routing metadata contain no raw observations or credentials.",
      "공개 서명 바이트·경로 정보에 원 관측·인증정보가 없습니다.",
      true,
      true,
      "public/trust-roots.json",
    );
    report = {
      assertions_passed: assertions.length,
      assertions_total: TRAFFIC_CASE_IDS.length,
      cleanup_verified: false,
      targets: scene.targets,
      routes,
      cases: [],
      evidence: [
        {
          name_en: "Authored source and fixed criteria",
          name_ko: "합성 원본·고정 기준",
          path: "expected.json",
        },
        {
          name_en: "Original HTTP matching and timing",
          name_ko: "원 HTTP 매칭·시각",
          path: "readbacks/timing.json",
        },
        {
          name_en: "Exact compiled generation",
          name_ko: "정확한 변환 세대",
          path: "readbacks/compiled.json",
        },
        {
          name_en: "Durable consumer read-back",
          name_ko: "영속 수신 저장값",
          path: "readbacks/final-consumer-db.json",
        },
      ],
    };
  } catch (error) {
    failure = error;
  } finally {
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
    const text = JSON.stringify(processes);
    assertNoSensitiveDiagnostics(text, secrets());
    runtime.assertSafe(text);
    write(output, "process-events.json", processes);
  }
  if (failure || !cleanup || !report) {
    write(output, "failure.json", {
      status: "FAIL",
      error: String(failure),
      cleanup_verified: cleanup,
      message_en: "Actual P08 integration incomplete.",
      message_ko: "실제 P08 통합 미완료.",
    });
    throw failure ?? new Error("P08 cleanup incomplete / P08 정리 미완료");
  }
  check(
    "owned-cleanup",
    cleanup,
    "Only owned workers, engines, database, private files, volume and ports are removed.",
    "소유 처리자·엔진·DB·비공개파일·볼륨·포트만 제거했습니다.",
    true,
    cleanup,
    "runtime/cleanup.json",
  );
  requireTrafficCases(assertions);
  for (const file of Object.keys(evidenceHashes(output))) {
    if (file.endsWith(".tar") || file.endsWith(".bin")) continue;
    const text = readFileSync(join(output, file)).toString("utf8");
    runtime.assertSafe(text);
    if (secrets().some((secret) => secret && text.includes(secret)))
      throw new Error(
        "Private credential in evidence / 증거에 비공개 인증값 존재",
      );
  }
  report.cleanup_verified = true;
  report.assertions_passed = assertions.length;
  report.cases = assertions.map((a) => ({
    case_id: a.assertion_id,
    status: a.status,
    message_en: a.message_en,
    message_ko: a.message_ko,
    evidence_path: a.evidence_path,
  }));
  write(output, "report-traffic.json", report);
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error("Source changed during P08 / P08 실행 중 소스 변경");
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
  return {
    traffic: report,
    assertions,
  };
}
export async function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    let graph = "",
      output = "";
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--graph" && !graph) graph = argv[++i] ?? "";
      else if (argv[i] === "--output" && !output) output = argv[++i] ?? "";
      else if (argv[i] === "--help") {
        io.out(
          "Usage / 사용법: traffic:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY",
        );
        return 0;
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!graph || !output)
      throw new Error("Graph and new output required / 지도·새 출력 필요");
    await runTrafficChecks(graph, output);
    return 0;
  } catch (error) {
    io.error("P08 incomplete / P08 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
