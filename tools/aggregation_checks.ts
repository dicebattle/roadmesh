/** Actual short GPS → HTTP → P05 matching → PostgreSQL → P06 finalization. */
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import pg from "pg";
import {
  canonical,
  parseJson,
  sha256,
  isMain,
  consoleIO,
  type ConsoleIO,
} from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { createAggregationScenario } from "./aggregation_scenario.js";
import { IngestionStore } from "./ingestion_store.js";
import { AggregationStore } from "./aggregation_store.js";
import { normalizedCatalog } from "./traffic_aggregation.js";
import {
  OwnedIngestionRuntime,
  type OwnedIngestionProcess,
  pause,
} from "./ingestion_runtime.js";
import {
  buildIngestBatches,
  assertNoSensitiveDiagnostics,
} from "./ingestion_checks.js";
import type {
  StoreConfig,
  Principal,
  ServiceCredential,
  ServiceConfig,
  WorkerConfig,
} from "./ingestion_types.js";
import type {
  AggregationStoreConfig,
  AggregationWorkerConfig,
  AggregationPhase,
  AggregationResult,
  AggregationDraft,
} from "./aggregation_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
import type { MatchingResult } from "./matching_evidence.js";
import type { SimulationReportData } from "./simulation_report.js";
import { evidenceHashes } from "./map_matcher.js";
const write = (root: string, name: string, value: unknown) =>
  writeFileSync(join(root, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const windowStart = "2026-10-24T00:00:00.000Z";
const at = (offset: number) =>
  new Date(Date.parse(windowStart) + offset).toISOString();
interface Context {
  label: string;
  store: IngestionStore;
  aggregation: AggregationStore;
  config: StoreConfig;
  aggregateConfig: AggregationStoreConfig;
  credentials: ServiceCredential[];
  service: OwnedIngestionProcess;
  url: string;
  now: string;
  primaryMatching: MatchingResult[];
}
type ReceiptContext = Pick<
  Context,
  "label" | "config" | "store" | "credentials" | "service" | "url" | "now"
>;
export function checkPublicDraft(
  draft: AggregationDraft,
  secrets: string[],
): void {
  const expected = [
    "schema_version",
    "graph_id",
    "region_id",
    "aggregation_policy",
    "window_start",
    "window_end",
    "valid_until",
    "entries",
  ];
  if (
    Object.keys(draft).some((key) => !expected.includes(key)) ||
    Object.keys(draft).length !== expected.length
  )
    throw new Error(
      "Unexpected public candidate field / 미지원 공개 후보 필드",
    );
  for (const entry of draft.entries) {
    if (
      Object.keys(entry).sort().join(",") !==
      [
        "edge_id",
        "forward",
        "source_class",
        "status",
        "speed_mps",
        "sample_bucket",
      ]
        .sort()
        .join(",")
    )
      throw new Error("Unexpected entry field / 미지원 구간 필드");
    if (
      entry.status !== "LIVE" &&
      (entry.speed_mps !== null || entry.sample_bucket !== null)
    )
      throw new Error("Non-live speed leaked / 비실측상태 속도 노출");
  }
  assertNoSensitiveDiagnostics(JSON.stringify(draft), secrets);
}
export async function runAggregationChecks(
  graphDirectory: string,
  outputPath: string,
): Promise<{
  aggregation: NonNullable<SimulationReportData["aggregation"]>;
  assertions: SimulationAssertion[];
}> {
  const output = resolve(outputPath);
  mkdirSync(output);
  for (const name of [
    "drafts",
    "synthetic-evaluation",
    "readbacks",
    "synthetic-engine",
  ])
    mkdirSync(join(output, name));
  const graph = loadSeoulGraph(graphDirectory),
    scenario = createAggregationScenario(graph);
  const source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  if (!source.commit || source.dirty === null)
    throw new Error("Source unavailable / 소스 식별 불가");
  // Immutable expected schedule is persisted before any worker or matcher starts.
  write(output, "scenario.json", scenario.spec);
  write(output, "expected.json", {
    target: scenario.target,
    vehicles: scenario.expected,
    median_duration_s: scenario.expected_median_duration_s,
    speed_mps: scenario.expected_speed_mps,
    boundary_tolerance_ms: 150,
    speed_relative_tolerance: 0.02,
    calculated_before_matching: true,
  });
  write(output, "truth.json", scenario.simulation.truth);
  write(output, "observations.json", scenario.simulation.observations);
  write(output, "catalog.json", scenario.catalog);
  const runtime = new OwnedIngestionRuntime(join(output, "runtime"), output);
  const contexts: Context[] = [];
  const ownedStores: Array<{ close(): Promise<void> }> = [];
  const allCredentials: ServiceCredential[] = [];
  const assertions: SimulationAssertion[] = [];
  const displayed: NonNullable<SimulationReportData["aggregation"]>["cases"] =
    [];
  const events: { phase: string; code: string; elapsed_ms: number }[] = [];
  const workerAttempts: unknown[] = [];
  const start = performance.now();
  let failure: unknown,
    cleanup = false,
    result: NonNullable<SimulationReportData["aggregation"]> | undefined;
  const secrets = () =>
    allCredentials
      .map((x) => x.token)
      .concat(contexts[0]?.config.database_url ?? "");
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
      assertion_id: "p06-" + id,
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
  const record = (phase: string, code: string) => {
    events.push({ phase, code, elapsed_ms: performance.now() - start });
    writeFileSync(
      join(output, "events.json"),
      JSON.stringify(events, null, 2) + "\n",
    );
  };
  const advance = async (c: ReceiptContext, time: string) => {
    const mark = c.service.messages.length;
    c.service.send({ type: "EVENT_TIME", event_time_utc: time });
    const ack = await c.service.message(
      (m) =>
        c.service.messages.indexOf(m) >= mark && m.type === "EVENT_TIME_SET",
    );
    c.now = ack.event_time_utc;
    if (Date.parse(c.now) < Date.parse(time))
      throw new Error("Clock did not advance / 시계 진행 실패");
  };
  const request = async (
    c: ReceiptContext,
    p: Principal,
    body: unknown,
    path = "/v1/observations/batches",
  ) => {
    const credential = c.credentials.find(
      (x) => x.principal.contributor_id === p.contributor_id,
    )!;
    const response = await fetch(c.url + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + credential.token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    assertNoSensitiveDiagnostics(text, secrets());
    runtime.assertSafe(text);
    const value = JSON.parse(text) as { code?: string };
    record("HTTP", c.label + ":" + response.status + ":" + value.code);
    return { status: response.status, code: value.code };
  };
  const create = async (label: string) => {
    const config: StoreConfig = {
      database_url: runtime.databaseUrl,
      namespace:
        "p06-" + runtime.runId.replace(/-/g, "").slice(0, 12) + "-" + label,
      graph_id: graph.graphId,
      matching_policy: "seoul-observed-v3",
    };
    const credentials = scenario.expected.map((v, i) => ({
      token: randomBytes(24).toString("hex"),
      principal: {
        contributor_id: "person-" + i,
        vehicle_id: v.vehicle_id,
        consent_version: "pilot-consent-v1" as const,
      },
    }));
    allCredentials.push(...credentials);
    const store = new IngestionStore(config);
    ownedStores.push(store);
    await store.initialize(credentials.map((c) => c.principal));
    const aggregateConfig: AggregationStoreConfig = {
      store: config,
      catalog: scenario.catalog,
      source_class: "SYNTHETIC",
    };
    const aggregation = new AggregationStore(aggregateConfig);
    ownedStores.push(aggregation);
    await aggregation.initialize();
    const serviceConfig: ServiceConfig = {
      store: config,
      credentials,
      event_time_utc: windowStart,
      port: 0,
    };
    const service = runtime.spawn(
      "api-" + label,
      "ingestion_service",
      serviceConfig,
    );
    const ready = await service.message(
      (m) => m.type === "READY" && m.kind === "service",
    );
    const ctx: Context = {
      label,
      store,
      aggregation,
      config,
      aggregateConfig,
      credentials,
      service,
      url: "http://127.0.0.1:" + ready.port,
      now: windowStart,
      primaryMatching: [],
    };
    contexts.push(ctx);
    return ctx;
  };
  const directories = (c: Context) => {
    const root = join(output, "synthetic-engine", c.label);
    return existsSync(root) ? readdirSync(root).map((n) => join(root, n)) : [];
  };
  const p05 = async (c: Context, pause_at?: WorkerConfig["pause_at"]) => {
    const cfg: WorkerConfig = {
      store: c.config,
      graph_directory: graph.directory,
      output_root: join(output, "synthetic-engine", c.label),
      event_time_utc: c.now,
      owner_id: "worker-" + runtime.processes.length,
      ...(pause_at ? { pause_at } : {}),
    };
    return runtime.spawn(
      "p05-" + c.label + "-" + runtime.processes.length,
      "ingestion_worker",
      cfg,
    );
  };
  const finished = async (child: OwnedIngestionProcess) => {
    const message = await child.message((m) => m.type === "RESULT");
    const exit = await child.exited();
    assertNoSensitiveDiagnostics(child.diagnostics.join(""), secrets());
    record("WORKER", message.code);
    return { message, exit };
  };
  const ingest = async (
    c: Context,
    index: number,
    suffix: string,
    reordered = false,
  ) => {
    const v = scenario.expected[index]!,
      p = c.credentials[index]!.principal;
    const samples = scenario.simulation.observations.filter(
      (s) => s.vehicle_id === v.vehicle_id,
    );
    const batches = buildIngestBatches(
      samples,
      suffix,
      graph.graphId,
      windowStart,
    ).map((b) => ({
      ...b,
      ...(v.trip_activity === "PARKED"
        ? { trip_activity: "PARKED" as const }
        : {}),
    }));
    const ordered = reordered
      ? [batches.at(-1)!, ...batches.slice(0, -1)]
      : batches;
    for (const b of ordered) {
      const time = Math.max(
        Date.parse(c.now),
        Date.parse(b.samples.at(-1)!.event_time_utc),
      );
      await advance(c, new Date(time).toISOString());
      const response = await request(c, p, b);
      if (response.status !== 202)
        throw new Error(
          "Synthetic aggregation trip refused / 합성 집계 여행 거부",
        );
      if (reordered) {
        const duplicate = await request(c, p, b);
        if (duplicate.code !== "DUPLICATE")
          throw new Error("Duplicate was not recognized / 중복 미인식");
      }
    }
    return p;
  };
  const complete = async (c: Context, collectPrimary = true) => {
    const before = new Set(directories(c));
    const worker = await p05(c);
    const done = await finished(worker);
    if (done.message.code !== "SUCCEEDED")
      throw new Error(
        "Real P05 matching did not succeed / 실제 P05매칭 미완료",
      );
    const created = directories(c).filter((p) => !before.has(p));
    if (created.length !== 1)
      throw new Error(
        "Expected one actual matcher attempt / 실제 매칭 시도1개 필요",
      );
    const matching = parseJson(
      readFileSync(join(created[0]!, "result.json")),
    ) as MatchingResult;
    workerAttempts.push({
      case: c.label,
      pid: worker.child?.pid,
      exit: done.exit,
      attempt_paths: created.map((path) => path.slice(output.length + 1)),
      semantic_sha256: matching.semantic_sha256,
      primary_replay: collectPrimary,
    });
    writeFileSync(
      join(output, "worker-attempts.json"),
      JSON.stringify(workerAttempts, null, 2) + "\n",
    );
    if (collectPrimary) c.primaryMatching.push(matching);
    return matching;
  };
  const target = (draft: AggregationDraft) =>
    draft.entries.find(
      (e) =>
        e.edge_id === scenario.target.edge_id &&
        e.forward === scenario.target.forward &&
        e.source_class === "SYNTHETIC",
    );
  const saveResult = (
    id: string,
    nameEn: string,
    nameKo: string,
    r: AggregationResult,
  ) => {
    write(output, "synthetic-evaluation/" + id + ".json", r);
    if (r.code !== "FINALIZED")
      throw new Error("Expected finalized candidate / 확정후보 필요");
    checkPublicDraft(r.draft, secrets());
    const bytes = canonical(r.draft);
    if (sha256(bytes) !== r.canonical_sha256)
      throw new Error(
        "Canonical draft digest mismatch / 후보 표준 해시 불일치",
      );
    writeFileSync(join(output, "drafts", id + ".json"), bytes, { flag: "wx" });
    displayed.push({
      case_id: id,
      name_en: nameEn,
      name_ko: nameKo,
      draft: r.draft,
      canonical_sha256: r.canonical_sha256,
      evidence_path: "drafts/" + id + ".json",
    });
    return r.draft;
  };
  const snapshot = async (c: Context, name: string) => {
    const state = await c.aggregation.inspect();
    write(output, "readbacks/" + name + ".json", state);
    return state;
  };
  const plainCandidates = async (c: Context, name: string) => {
    const pool = new pg.Pool({
      connectionString: c.config.database_url,
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      const rows = (
        await pool.query(
          "SELECT window_start,window_end,convert_from(canonical_json,'UTF8') AS canonical_json,canonical_sha256,catalog_sha256 FROM routelens_p06.candidates WHERE namespace=$1 AND graph_id=$2 AND aggregation_policy='seoul-window-median-v1' AND source_class='SYNTHETIC' ORDER BY window_start",
          [c.config.namespace, c.config.graph_id],
        )
      ).rows as {
        window_start: Date;
        window_end: Date;
        canonical_json: string;
        canonical_sha256: string;
        catalog_sha256: string;
      }[];
      write(output, "readbacks/" + name + ".json", rows);
      return rows;
    } finally {
      await pool.end();
    }
  };
  const aggregateWorker = async (
    c: Context,
    pause_at?: AggregationPhase,
    window = windowStart,
  ) => {
    const cfg: AggregationWorkerConfig = {
      aggregation: c.aggregateConfig,
      window_start: window,
      event_time_utc: c.now,
      ...(pause_at ? { pause_at } : {}),
    };
    return runtime.spawn(
      "p06-" + c.label + "-" + runtime.processes.length,
      "aggregation_worker",
      cfg,
    );
  };
  try {
    await runtime.start();
    // Verify pre-P06 persisted-row compatibility, without claiming an old binary ran.
    const legacyConfig: StoreConfig = {
      database_url: runtime.databaseUrl,
      namespace:
        "p06-" + runtime.runId.replace(/-/g, "").slice(0, 12) + "-legacy",
      graph_id: graph.graphId,
      matching_policy: "seoul-observed-v2",
    };
    const legacyCredentials: ServiceCredential[] = [
      {
        token: randomBytes(24).toString("hex"),
        principal: {
          contributor_id: "legacy-person",
          vehicle_id: "p06-speed-3",
          consent_version: "pilot-consent-v1",
        },
      },
    ];
    allCredentials.push(...legacyCredentials);
    const legacyStore = new IngestionStore(legacyConfig);
    ownedStores.push(legacyStore);
    await legacyStore.initialize(legacyCredentials.map((c) => c.principal));
    const legacyService = runtime.spawn("api-legacy", "ingestion_service", {
      store: legacyConfig,
      credentials: legacyCredentials,
      event_time_utc: windowStart,
      port: 0,
    } satisfies ServiceConfig);
    const legacyReady = await legacyService.message(
      (m) => m.type === "READY" && m.kind === "service",
    );
    const migration: ReceiptContext = {
      label: "legacy",
      config: legacyConfig,
      store: legacyStore,
      credentials: legacyCredentials,
      service: legacyService,
      url: "http://127.0.0.1:" + legacyReady.port,
      now: windowStart,
    };
    const original = scenario.simulation.observations.filter(
      (p) => p.vehicle_id === "p06-speed-3",
    );
    const batch = buildIngestBatches(
      original,
      "migration",
      graph.graphId,
      windowStart,
      "seoul-observed-v2",
    )[0]!;
    await advance(migration, batch.samples.at(-1)!.event_time_utc);
    await request(migration, migration.credentials[0]!.principal, batch);
    const beforeActivity = await legacyStore.inspect(
      legacyCredentials[0]!.principal,
    );
    const next = buildIngestBatches(
      original,
      "migration",
      graph.graphId,
      windowStart,
      "seoul-observed-v2",
    )[1]!;
    await advance(migration, next.samples.at(-1)!.event_time_utc);
    const activityConflict = await request(
      migration,
      legacyCredentials[0]!.principal,
      { ...next, trip_activity: "PARKED" },
    );
    const afterActivity = await legacyStore.inspect(
      legacyCredentials[0]!.principal,
    );
    write(output, "synthetic-evaluation/activity-conflict.json", {
      before: beforeActivity,
      after: afterActivity,
      response: activityConflict,
    });
    check(
      "mid-trip-activity-conflict",
      activityConflict.status === 409 &&
        canonical(beforeActivity.trips).equals(canonical(afterActivity.trips)),
      "A later PARKED batch cannot change a committed TRAVEL trip.",
      "나중PARKED배치가 저장된TRAVEL여행을 바꾸지 못합니다.",
      409,
      activityConflict.status,
      "synthetic-evaluation/activity-conflict.json",
    );
    const migrationPool = new pg.Pool({
      connectionString: migration.config.database_url,
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      const before = (
        await migrationPool.query(
          "SELECT request_hash FROM routelens_p05.batches WHERE namespace=$1 AND batch_id=$2",
          [migration.config.namespace, batch.batch_id],
        )
      ).rows[0].request_hash;
      check(
        "legacy-travel-hash",
        before === sha256(canonical(batch)),
        "Default TRAVEL retains the legacy request bytes hash.",
        "기본TRAVEL이 기존요청 바이트 해시를 보존합니다.",
        sha256(canonical(batch)),
        before,
        "scenario.json",
      );
      await migrationPool.query(
        "ALTER TABLE routelens_p05.trips DROP COLUMN trip_activity",
      );
      await migration.store.initialize(
        migration.credentials.map((c) => c.principal),
      );
      const replay = await request(
        migration,
        migration.credentials[0]!.principal,
        { ...batch, trip_activity: "TRAVEL" },
      );
      const after = (
        await migrationPool.query(
          "SELECT b.request_hash,t.trip_activity FROM routelens_p05.batches b JOIN routelens_p05.trips t USING(namespace,contributor_id,trip_id) WHERE b.namespace=$1 AND b.batch_id=$2",
          [migration.config.namespace, batch.batch_id],
        )
      ).rows[0];
      write(output, "readbacks/activity-migration.json", {
        before_hash: before,
        after_hash: after.request_hash,
        activity: after.trip_activity,
        response: replay,
      });
      check(
        "activity-additive-migration",
        replay.code === "DUPLICATE" &&
          after.request_hash === before &&
          after.trip_activity === "TRAVEL",
        "Activity-column migration preserves committed legacy hashes and exact retry semantics.",
        "활동열 추가이전표현의 커밋해시와 정확재시도 의미를 보존합니다.",
        { code: "DUPLICATE", activity: "TRAVEL" },
        after,
        "readbacks/activity-migration.json",
      );
    } finally {
      await migrationPool.end();
      await legacyStore.close();
      ownedStores.splice(ownedStores.indexOf(legacyStore), 1);
    }
    const populations = new Map<number, Context>();
    for (const count of [0, 1, 4, 5]) {
      const c = await create("count-" + count);
      populations.set(count, c);
      for (let i = 0; i < count; i++) await ingest(c, i, "primary-" + i, true);
      if (count === 5) await ingest(c, 5, "parked-sixth", true);
      await advance(c, at(59000));
      for (let i = 0; i < count + (count === 5 ? 1 : 0); i++) await complete(c);
      if (count === 1 || count === 5) {
        await ingest(c, 0, "same-person-repeat", true);
        await complete(c, false);
      }
      const stored = await c.store.inspect();
      write(output, "synthetic-evaluation/" + c.label + "-stored.json", stored);
      if (count)
        for (const expected of scenario.expected.slice(0, count)) {
          const rows = stored.traversals.filter(
            (t) =>
              t.contributor_id ===
                c.credentials.find(
                  (x) => x.principal.vehicle_id === expected.vehicle_id,
                )!.principal.contributor_id &&
              t.trip_id.startsWith("primary") &&
              t.edge_id === scenario.target.edge_id &&
              t.forward === scenario.target.forward,
          );
          check(
            c.label + "-target-" + expected.vehicle_id,
            rows.length === 1 &&
              Math.abs(rows[0]!.duration_s - expected.duration_s) <= 0.15,
            "Every authored travel contributor supports the target; signal wait remains within 150 ms.",
            "직접 만든 각이동 기여자가 대상구간을 지지하며 신호대기를150밀리초 이내로 보존합니다.",
            { duration_s: expected.duration_s, tolerance_s: 0.15 },
            rows.map((r) => ({ duration_s: r.duration_s })),
            "synthetic-evaluation/" + c.label + "-stored.json",
          );
        }
      if (count < 5) {
        await advance(c, at(90000));
        const r = await c.aggregation.finalize(windowStart, c.now);
        const d = saveResult(
          "count-" + count,
          count + (count === 1 ? " contributor" : " contributors"),
          count + "명",
          r,
        );
        const want = count === 0 ? "UNKNOWN" : "INSUFFICIENT";
        const selected = r.selections.find(
          (x) =>
            x.edge_id === scenario.target.edge_id &&
            x.forward === scenario.target.forward,
        );
        check(
          "count-" + count,
          target(d)?.status === want &&
            target(d)?.speed_mps === null &&
            selected?.eligible_contributors === count,
          "Independent populations preserve the zero/one/four eligibility denominator.",
          "독립 차량군이0·1·4명 적격 분모를 보존합니다.",
          { status: want, contributors: count },
          {
            entry: target(d),
            private_contributors: selected?.eligible_contributors,
          },
          "drafts/count-" + count + ".json",
        );
      }
    }
    const five = populations.get(5)!;
    await advance(five, at(89999));
    const open = await five.aggregation.finalize(windowStart, five.now);
    const openState = await snapshot(five, "before-deadline");
    check(
      "exact-open-deadline",
      open.code === "WINDOW_OPEN" && openState.candidates.length === 0,
      "At deadline minus one millisecond, no draft is persisted.",
      "마감1밀리초 전에는 후보를 저장하지 않습니다.",
      "WINDOW_OPEN",
      open.code,
      "readbacks/before-deadline.json",
    );
    await advance(five, at(90000));
    const beforeCommit = await aggregateWorker(five, "AFTER_AGGREGATE_WRITE");
    await beforeCommit.message(
      (m) => m.type === "PHASE" && m.phase === "AFTER_AGGREGATE_WRITE",
    );
    const uncommitted = await snapshot(five, "before-aggregate-commit");
    await beforeCommit.stop("SIGKILL");
    const beforeExit = await beforeCommit.exited();
    const rolledBack = await snapshot(five, "after-aggregate-write-kill");
    check(
      "aggregate-write-rollback",
      beforeExit.signal === "SIGKILL" &&
        uncommitted.candidates.length === 0 &&
        rolledBack.candidates.length === 0,
      "Actual pre-commit worker SIGKILL leaves no partial candidate row.",
      "실제 커밋전 처리자SIGKILL이 일부 후보행을 남기지 않습니다.",
      0,
      rolledBack.candidates.length,
      "readbacks/after-aggregate-write-kill.json",
    );
    const afterCommit = await aggregateWorker(five, "AFTER_AGGREGATE_COMMIT");
    await afterCommit.message(
      (m) => m.type === "PHASE" && m.phase === "AFTER_AGGREGATE_COMMIT",
    );
    const committed = await snapshot(five, "after-aggregate-commit");
    await afterCommit.stop("SIGKILL");
    const afterExit = await afterCommit.exited();
    const twins = await Promise.all([
      aggregateWorker(five),
      aggregateWorker(five),
    ]);
    const twinsDone = await Promise.all(twins.map(finished));
    const afterRetry = await snapshot(five, "aggregate-concurrent-retry");
    check(
      "aggregate-commit-retry",
      afterExit.signal === "SIGKILL" &&
        committed.candidates.length === 1 &&
        afterRetry.candidates.length === 1 &&
        twinsDone.every(
          (r) =>
            r.message.canonical_sha256 ===
            committed.candidates[0]!.canonical_sha256,
        ),
      "Two actual workers and lost-response retry converge to one identical committed candidate.",
      "실제 처리자2개·응답유실 재시도가 동일한 커밋 후보1개로 수렴합니다.",
      committed.candidates[0]?.canonical_sha256,
      twinsDone.map((x) => x.message.canonical_sha256),
      "readbacks/aggregate-concurrent-retry.json",
    );
    const full = await five.aggregation.finalize(windowStart, five.now);
    const live = saveResult(
      "count-5",
      "Five contributors, repeat and explicitly PARKED moving sixth",
      "5명·반복·명시PARKED 이동6번째",
      full,
    );
    const selected = full.selections.find(
      (s) =>
        s.edge_id === scenario.target.edge_id &&
        s.forward === scenario.target.forward,
    );
    check(
      "live-independent-median",
      target(live)?.status === "LIVE" &&
        target(live)?.sample_bucket === "5-9" &&
        selected?.eligible_contributors === 5 &&
        Math.abs(
          (target(live)!.speed_mps! - scenario.expected_speed_mps) /
            scenario.expected_speed_mps,
        ) <= 0.02 &&
        full.rejections.some((r) => r.reason === "PARKED") &&
        full.rejections.some((r) => r.reason === "REPEATED_CONTRIBUTOR"),
      "Five unique travel contributors yield the independent median speed; repeat and PARKED do not inflate it.",
      "고유 이동기여자5명이 독립 중앙값 속도를 만들고 반복·주차는 부풀리지 않습니다.",
      {
        contributors: 5,
        speed_mps: scenario.expected_speed_mps,
        relative_tolerance: 0.02,
      },
      { entry: target(live), selection: selected },
      "synthetic-evaluation/count-5.json",
    );
    // Actual late P05 completion uses the authoritative clock, not the worker's old config.
    for (const [label, completedAt] of [
      ["just-before", 89999],
      ["exact", 90000],
      ["after", 90001],
    ] as const) {
      const c = await create("late-" + label);
      await ingest(c, 0, "late-trip");
      await advance(c, at(59000));
      const worker = await p05(c, "AFTER_MATCH");
      await worker.message(
        (m) => m.type === "PHASE" && m.phase === "AFTER_MATCH",
      );
      await advance(c, at(completedAt));
      let prior: AggregationDraft | undefined;
      if (completedAt >= 90000) {
        const initial = await c.aggregation.finalize(windowStart, c.now);
        if (initial.code === "FINALIZED") prior = initial.draft;
      }
      worker.send({ type: "RESUME", phase: "AFTER_MATCH" });
      const done = await finished(worker);
      if (done.message.code !== "SUCCEEDED")
        throw new Error("Late matching did not commit / 지연매칭 저장실패");
      if (completedAt < 90000) await advance(c, at(90000));
      const finalized = await c.aggregation.finalize(windowStart, c.now);
      const draft = saveResult(
        "late-" + label,
        "P05 completion " + label,
        "P05완료 " + label,
        finalized,
      );
      const selection = finalized.selections.find(
        (s) =>
          s.edge_id === scenario.target.edge_id &&
          s.forward === scenario.target.forward,
      );
      const pool = new pg.Pool({
        connectionString: c.config.database_url,
        max: 1,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
      try {
        const available = (
          await pool.query(
            "SELECT code,at_event_utc FROM routelens_p05.events WHERE namespace=$1 AND code='SUCCEEDED'",
            [c.config.namespace],
          )
        ).rows;
        write(
          output,
          "synthetic-evaluation/late-" + label + "-availability.json",
          available,
        );
        check(
          "late-" + label,
          available.length === 1 &&
            new Date(available[0].at_event_utc).getTime() ===
              Date.parse(at(completedAt)) &&
            selection?.eligible_contributors ===
              (completedAt < 90000 ? 1 : 0) &&
            target(draft)?.status ===
              (completedAt < 90000 ? "INSUFFICIENT" : "UNKNOWN") &&
            (!prior || canonical(prior).equals(canonical(draft))),
          "P05 completion before the deadline is eligible; exact or later completion cannot change the closed window.",
          "마감전 P05완료는 적격이고 정확한마감·이후완료는 닫힌창을 바꾸지 못합니다.",
          {
            available_at: at(completedAt),
            eligible: completedAt < 90000 ? 1 : 0,
          },
          { available, selected: selection?.eligible_contributors },
          "synthetic-evaluation/late-" + label + "-availability.json",
        );
      } finally {
        await pool.end();
      }
    }
    // A real HTTP revoke blocks behind the paused finalizer's clock/contributor locks.
    const race = await aggregateWorker(five, "AFTER_AGGREGATE_WRITE");
    await race.message(
      (m) => m.type === "PHASE" && m.phase === "AFTER_AGGREGATE_WRITE",
    );
    const revoke = request(
      five,
      five.credentials[4]!.principal,
      undefined,
      "/v1/consent/revoke",
    ).then(
      (value) => ({ value }),
      (error) => ({ error: String(error) }),
    );
    const monitor = new pg.Pool({
      connectionString: five.config.database_url,
      max: 1,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    let blockers: unknown[] = [];
    try {
      const until = performance.now() + 2000;
      while (performance.now() < until) {
        const rows = (
          await monitor.query(
            "SELECT w.pid,w.wait_event_type,w.wait_event,ARRAY(SELECT b.pid FROM pg_stat_activity b WHERE b.pid=ANY(pg_blocking_pids(w.pid)) AND b.application_name='routelens-p06') AS aggregation_blockers FROM pg_stat_activity w WHERE w.datname=current_database() AND w.application_name='routelens-p05' AND w.wait_event_type='Lock'",
          )
        ).rows.filter((r) => r.aggregation_blockers.length > 0);
        if (rows.length) {
          blockers = rows;
          break;
        }
        await pause(25);
      }
      const backendPids = [
        ...new Set(
          (
            blockers as { pid: number; aggregation_blockers: number[] }[]
          ).flatMap((row) => [row.pid, ...row.aggregation_blockers]),
        ),
      ];
      const lockRows = backendPids.length
        ? (
            await monitor.query(
              "SELECT pid,locktype,mode,granted,relation::regclass::text AS relation_name FROM pg_locks WHERE pid=ANY($1::int[]) ORDER BY pid,locktype,mode",
              [backendPids],
            )
          ).rows
        : [];
      write(output, "readbacks/revoke-lock-wait.json", {
        paused_worker_pid: race.child?.pid,
        waiters: blockers,
        locks: lockRows,
      });
      check(
        "revoke-actual-lock-wait",
        blockers.length === 1,
        "The actual revoke backend waits on the owned paused aggregate backend.",
        "실제 철회DB처리가 소유한대기 집계DB처리의 잠금을 기다립니다.",
        1,
        blockers.length,
        "readbacks/revoke-lock-wait.json",
      );
    } finally {
      await monitor.end();
    }
    race.send({ type: "RESUME", phase: "AFTER_AGGREGATE_WRITE" });
    await finished(race);
    const revokeReply = await revoke;
    if ("error" in revokeReply)
      throw new Error("HTTP revoke did not complete / HTTP철회 미완료");
    const revoked = revokeReply.value;
    const invalidated = await snapshot(five, "revoke-before-recompute");
    check(
      "same-transaction-invalidation",
      revoked.status === 200 && invalidated.candidates.length === 0,
      "Acknowledged HTTP revocation has already removed the old candidate in the deletion transaction.",
      "HTTP철회 응답때 삭제트랜잭션이 이미 옛후보를 제거했습니다.",
      0,
      invalidated.candidates.length,
      "readbacks/revoke-before-recompute.json",
    );
    const revokedResult = await five.aggregation.finalize(
      windowStart,
      five.now,
    );
    const revokedDraft = saveResult(
      "revoked",
      "Revoked: five become four",
      "철회:5명에서4명",
      revokedResult,
    );
    check(
      "revoked-four",
      target(revokedDraft)?.status === "INSUFFICIENT" &&
        target(revokedDraft)?.speed_mps === null &&
        revokedResult.selections.find(
          (s) =>
            s.edge_id === scenario.target.edge_id &&
            s.forward === scenario.target.forward,
        )?.eligible_contributors === 4,
      "Recomputation after revocation has four contributors and no public speed.",
      "철회뒤 재계산은4명이며 공개속도가 없습니다.",
      "INSUFFICIENT",
      target(revokedDraft),
      "drafts/revoked.json",
    );
    // Separate actual population preserves an eligible LIVE window for expiry proof.
    const expiry = await create("expiry-five");
    for (let i = 0; i < 5; i++) await ingest(expiry, i, "expiry-" + i);
    await advance(expiry, at(59000));
    for (let i = 0; i < 5; i++) await complete(expiry);
    await advance(expiry, at(90000));
    const expiryLive = await expiry.aggregation.finalize(
      windowStart,
      expiry.now,
    );
    if (
      expiryLive.code !== "FINALIZED" ||
      target(expiryLive.draft)?.status !== "LIVE"
    )
      throw new Error(
        "Expiry population is not eligible / 만료검사 차량군 적격실패",
      );
    await advance(expiry, at(150000));
    const newer = await expiry.aggregation.finalize(at(60000), expiry.now);
    const newerDraft = saveResult(
      "new-empty-window",
      "New empty window",
      "새 빈창",
      newer,
    );
    check(
      "new-window-no-inheritance",
      target(newerDraft)?.status === "UNKNOWN" &&
        target(newerDraft)?.speed_mps === null,
      "A newer empty window never inherits an older LIVE value.",
      "새 빈창이 이전LIVE값을 이어받지 않습니다.",
      "UNKNOWN",
      target(newerDraft),
      "drafts/new-empty-window.json",
    );
    const cachedBefore = await plainCandidates(expiry, "cache-before-expiry");
    await advance(expiry, at(240000));
    const readExpired = await snapshot(expiry, "read-path-expired");
    const cachedAfter = await plainCandidates(expiry, "cache-after-expiry");
    const oldBefore = cachedBefore.find(
      (row) =>
        Date.parse(row.window_start as unknown as string) ===
        Date.parse(windowStart),
    );
    const oldRead = readExpired.candidates.find(
      (row) => row.window_start === windowStart,
    );
    const oldAfter = cachedAfter.find(
      (row) =>
        Date.parse(row.window_start as unknown as string) ===
        Date.parse(windowStart),
    );
    check(
      "cached-read-expiry",
      !!oldBefore &&
        target(JSON.parse(oldBefore.canonical_json))?.status === "LIVE" &&
        !!oldRead &&
        target(JSON.parse(oldRead.canonical_json))?.status === "STALE" &&
        !!oldAfter &&
        target(JSON.parse(oldAfter.canonical_json))?.speed_mps === null,
      "The read path expires cached LIVE bytes before finalize is called.",
      "확정호출 전에 읽기경로가 캐시LIVE바이트를 만료시킵니다.",
      { before: "LIVE", after: "STALE", speed_mps: null },
      {
        before: oldBefore && target(JSON.parse(oldBefore.canonical_json)),
        read: oldRead && target(JSON.parse(oldRead.canonical_json)),
        after: oldAfter && target(JSON.parse(oldAfter.canonical_json)),
      },
      "readbacks/cache-after-expiry.json",
    );
    const stale = await expiry.aggregation.finalize(windowStart, expiry.now);
    const staleDraft = saveResult(
      "expired",
      "Expired at 240 seconds",
      "240초에 만료",
      stale,
    );
    const staleCaller = await expiry.aggregation.finalize(
      windowStart,
      at(90000),
    );
    check(
      "exact-expiry",
      target(staleDraft)?.status === "STALE" &&
        target(staleDraft)?.speed_mps === null &&
        target(staleDraft)?.sample_bucket === null &&
        staleCaller.code === "FINALIZED" &&
        canonical(staleCaller.draft).equals(canonical(staleDraft)),
      "At exact expiry, current persisted time removes speed; a stale caller cannot revive it.",
      "정확한 만료때 저장시계가 속도를 지우고 옛호출시각도 복원하지 못합니다.",
      "STALE",
      target(staleDraft),
      "drafts/expired.json",
    );
    const retained = at(86460000);
    await advance(expiry, retained);
    const firstSweep = await expiry.aggregation.sweep(retained);
    const secondSweep = await expiry.aggregation.sweep(retained);
    const plainAfterSweep = await plainCandidates(
      expiry,
      "retention-before-inspect",
    );
    write(output, "readbacks/retention-sweep-results.json", {
      first: firstSweep,
      second: secondSweep,
      plain_rows: plainAfterSweep,
    });
    const purged = await snapshot(expiry, "candidate-retention");
    const past = await expiry.aggregation.finalize(windowStart, at(90000));
    check(
      "candidate-retention",
      firstSweep.deleted === 1 &&
        secondSweep.deleted === 0 &&
        plainAfterSweep.length === 1 &&
        Date.parse(plainAfterSweep[0]!.window_start as unknown as string) ===
          Date.parse(at(60000)) &&
        purged.candidates.length === 1 &&
        past.code === "RETENTION_EXPIRED",
      "The old candidate is deleted at window end plus 24 hours and cannot be recreated; the later window remains until its own deadline.",
      "창끝24시간에 옛후보가 삭제되고 재생성되지 않으며 나중창은 자체기한까지 남습니다.",
      {
        first_deleted: 1,
        second_deleted: 0,
        old_rows: 0,
        newer_rows: 1,
        code: "RETENTION_EXPIRED",
      },
      {
        first: firstSweep,
        second: secondSweep,
        plain_rows: plainAfterSweep.length,
        code: past.code,
      },
      "readbacks/retention-sweep-results.json",
    );
    await advance(expiry, at(86520000));
    const allFirst = await expiry.aggregation.sweep(expiry.now);
    const allSecond = await expiry.aggregation.sweep(expiry.now);
    const plainAllPurged = await plainCandidates(
      expiry,
      "all-purged-before-inspect",
    );
    write(output, "readbacks/all-purge-results.json", {
      first: allFirst,
      second: allSecond,
      plain_rows: plainAllPurged,
    });
    const allPurged = await snapshot(expiry, "all-candidates-purged");
    check(
      "all-candidates-purged",
      allFirst.deleted === 1 &&
        allSecond.deleted === 0 &&
        plainAllPurged.length === 0 &&
        allPurged.candidates.length === 0,
      "Repeated retention sweep leaves zero candidate rows.",
      "반복 보관기한 정리뒤 후보행이0개입니다.",
      { first_deleted: 1, second_deleted: 0, plain_rows: 0 },
      {
        first: allFirst,
        second: allSecond,
        plain_rows: plainAllPurged.length,
        inspected_rows: allPurged.candidates.length,
      },
      "readbacks/all-purge-results.json",
    );
    const catalogRace = await create("catalog-race");
    await advance(catalogRace, at(90000));
    const raceConfigs = [
      catalogRace.aggregateConfig,
      {
        ...catalogRace.aggregateConfig,
        catalog: catalogRace.aggregateConfig.catalog.slice(0, -1),
      },
    ];
    const catalogWorkers = raceConfigs.map((aggregation, i) =>
      runtime.spawn("p06-catalog-" + i, "aggregation_worker", {
        aggregation,
        window_start: windowStart,
        event_time_utc: catalogRace.now,
      } satisfies AggregationWorkerConfig),
    );
    const catalogExits = await Promise.all(
      catalogWorkers.map((w) => w.exited()),
    );
    const catalogRows = await plainCandidates(
      catalogRace,
      "catalog-conflict-plain",
    );
    const winner = catalogExits.findIndex((e) => e.code === 0);
    const catalogHashes = raceConfigs.map((c) =>
      sha256(canonical(normalizedCatalog(c.catalog))),
    );
    write(output, "synthetic-evaluation/catalog-conflict.json", {
      pids: catalogWorkers.map((w) => w.child?.pid),
      exits: catalogExits,
      config_catalog_hashes: catalogHashes,
      stored: catalogRows,
    });
    check(
      "catalog-conflict-atomic",
      winner >= 0 &&
        catalogExits.filter((e) => e.code === 0).length === 1 &&
        catalogExits.filter((e) => e.code === 1).length === 1 &&
        catalogRows.length === 1 &&
        catalogRows[0]!.catalog_sha256 === catalogHashes[winner],
      "Concurrent different-catalog finalizers cannot overwrite the winning catalog row.",
      "동시 다른구간목록 확정이 승리한목록행을 덮어쓰지 못합니다.",
      { success: 1, failure: 1, rows: 1 },
      {
        exits: catalogExits,
        catalog_rows: catalogRows.length,
        winning_hash: catalogRows[0]?.catalog_sha256,
      },
      "synthetic-evaluation/catalog-conflict.json",
    );
    await advance(catalogRace, at(86460000));
    await catalogRace.aggregation.sweep(catalogRace.now);
    const catalogRemoved = await plainCandidates(
      catalogRace,
      "catalog-conflict-removed",
    );
    if (catalogRemoved.length)
      throw new Error(
        "Catalog fault fixture was not purged / 목록장애 시험행이 정리되지 않았습니다",
      );
    const actualCandidateRows = [];
    for (const c of contexts) {
      const actual = await c.aggregation.inspect();
      for (const row of actual.candidates) {
        checkPublicDraft(
          JSON.parse(row.canonical_json) as AggregationDraft,
          secrets(),
        );
        if (sha256(Buffer.from(row.canonical_json)) !== row.canonical_sha256)
          throw new Error(
            "Stored candidate bytes/hash mismatch / 저장 후보 바이트·해시 불일치",
          );
      }
      actualCandidateRows.push({ case: c.label, ...actual });
    }
    write(
      output,
      "synthetic-evaluation/all-candidate-rows.json",
      actualCandidateRows,
    );
    const publicFiles = readdirSync(join(output, "drafts"));
    for (const file of publicFiles)
      checkPublicDraft(
        parseJson(
          readFileSync(join(output, "drafts", file)),
        ) as AggregationDraft,
        secrets(),
      );
    check(
      "public-candidate-whitelist",
      publicFiles.length === displayed.length,
      "Every actual exported candidate uses only the public whitelist and contains no private credentials or raw coordinates.",
      "실제 내보낸 모든후보가 공개허용필드만 쓰고 비공개인증·원시좌표가 없습니다.",
      displayed.length,
      publicFiles.length,
      "drafts/count-5.json",
    );
    const mergeMatching = (
      runs: MatchingResult[],
    ): NonNullable<SimulationReportData["matching"]> => ({
      policy_id: "seoul-observed-v3",
      input_samples: runs.reduce((a, r) => a + r.input_samples, 0),
      matched_samples: runs.reduce((a, r) => a + r.matched_samples, 0),
      excluded_samples: runs.reduce((a, r) => a + r.excluded_samples, 0),
      accepted_traversals: runs.reduce((a, r) => a + r.accepted_traversals, 0),
      excluded_traversals: runs.reduce((a, r) => a + r.excluded_traversals, 0),
      points: runs.flatMap((r) => r.points),
      traversals: runs.flatMap((r) => r.traversals),
      cases: [],
    });
    const caseRuns: Record<string, MatchingResult[]> = {
      "count-0": [],
      "count-1": populations.get(1)!.primaryMatching,
      "count-4": populations.get(4)!.primaryMatching,
      "count-5": five.primaryMatching,
      revoked: five.primaryMatching.filter(
        (r) =>
          !r.points.some(
            (p) => p.vehicle_id === scenario.expected[4]!.vehicle_id,
          ),
      ),
      expired: expiry.primaryMatching,
    };
    const primary = five.primaryMatching;
    result = {
      policy_id: "seoul-window-median-v1",
      target: scenario.target,
      window_start: windowStart,
      deadline: at(90000),
      valid_until: at(240000),
      cases: displayed,
      population: {
        duration_ms: scenario.spec.duration_ms,
        vehicles: scenario.spec.vehicles.map((v) => ({
          vehicle_id: v.vehicle_id,
          truth: scenario.simulation.truth.samples.filter(
            (s) => s.vehicle_id === v.vehicle_id,
          ),
          observations: scenario.simulation.observations.filter(
            (s) => s.vehicle_id === v.vehicle_id,
          ),
          omissions: [],
          traversals: scenario.simulation.truth.traversals.filter(
            (t) => t.vehicle_id === v.vehicle_id,
          ),
        })),
        matching: mergeMatching(primary),
        case_vehicle_ids: Object.fromEntries(
          Object.entries(caseRuns).map(([key, runs]) => [
            key,
            [
              ...new Set(
                runs.flatMap((r) => r.points.map((p) => p.vehicle_id)),
              ),
            ],
          ]),
        ),
        case_matching: Object.fromEntries(
          Object.entries(caseRuns).map(([key, runs]) => [
            key,
            mergeMatching(runs),
          ]),
        ),
      },
      assertions_passed: assertions.length,
      assertions_total: assertions.length,
      cleanup_verified: false,
    };
  } catch (error) {
    failure = error;
    record("INTEGRATION", "FAILED");
  } finally {
    for (const store of [...ownedStores].reverse())
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
  }
  if (failure || !cleanup || !result) {
    write(output, "failure.json", {
      status: "FAIL",
      message_en: "P06 actual integration did not complete.",
      message_ko: "P06 실제통합이 완료되지 않았습니다.",
      error: String(failure),
      cleanup_verified: cleanup,
    });
    throw failure ?? new Error("P06 cleanup incomplete / P06정리 미완료");
  }
  check(
    "owned-cleanup",
    cleanup,
    "All owned processes, engines, PostgreSQL volume, private files and ports were removed.",
    "소유 프로세스·엔진·PostgreSQL볼륨·비공개파일·포트를 제거했습니다.",
    true,
    cleanup,
    "runtime/cleanup.json",
  );
  result.cleanup_verified = true;
  result.assertions_passed = assertions.length;
  result.assertions_total = assertions.length;
  write(output, "report-aggregation.json", result);
  writeFileSync(
    join(output, "summary.md"),
    "# Unsigned synthetic aggregation / 서명전 합성집계\n\nPASS: actual short Seoul GPS, HTTP ingestion, matching, stored contributions and median drafts.\n통과: 실제서울 짧은GPS·HTTP수집·매칭·저장기여·중앙값후보.\n\nNot P07 publication, P08 routing activation or real live traffic.\nP07게시·P08경로활성화·실제 실시간교통이 아닙니다.\n",
  );
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error("Source changed during P06 / P06실행중 소스변경");
  write(output, "manifest.json.tmp", {
    schema_version: "0.1",
    source,
    graph_id: graph.graphId,
    graph_manifest_sha256: graph.manifestSha256,
    implementation_sha256: fingerprint,
    status: "PASS",
    cleanup_verified: cleanup,
    output_sha256: evidenceHashes(output),
    completed_at_utc: new Date().toISOString(),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return { aggregation: result, assertions };
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
          "Usage / 사용법: aggregation:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY",
        );
        return 0;
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!graph || !output || graph.startsWith("-") || output.startsWith("-"))
      throw new Error("Graph and new output required / 그래프·새출력 필요");
    await runAggregationChecks(graph, output);
    return 0;
  } catch (error) {
    io.error("P06 incomplete / P06미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
