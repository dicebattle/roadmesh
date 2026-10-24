import pg from "pg";
/** Actual HTTP/PostgreSQL/process evidence for bounded synthetic P05 ingestion. */
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  lstatSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  canonical,
  parseJson,
  sha256,
  isMain,
  consoleIO,
  type ConsoleIO,
} from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { IngestionStore } from "./ingestion_store.js";
import type {
  IngestBatch,
  Principal,
  StoreConfig,
  ServiceCredential,
  ServiceConfig,
  WorkerConfig,
  StoreInspection,
  StoredTraversal,
  Phase,
} from "./ingestion_types.js";
import type { Observation, SimulationAssertion } from "./vehicle_simulator.js";
import type { MatchingResult } from "./matching_evidence.js";
import {
  OwnedIngestionRuntime,
  type OwnedIngestionProcess,
  pause,
  confirmedAbsent,
} from "./ingestion_runtime.js";
import { implementationFingerprint } from "./media_manifest.js";
import { evidenceHashes } from "./map_matcher.js";
import type { SimulationReportData } from "./simulation_report.js";
export function buildIngestBatches(
  samples: Observation[],
  tripId: string,
  graphId: string,
  tripStart: string,
  matchingPolicy: IngestBatch["matching_policy"] = "seoul-observed-v3",
): IngestBatch[] {
  const batches: IngestBatch[] = [];
  for (let start = 0; start < samples.length; start += 57) {
    const slice = samples.slice(start, Math.min(start + 60, samples.length));
    batches.push({
      schema_version: "0.1",
      batch_id: tripId + "-b" + batches.length,
      trip_id: tripId,
      batch_seq: batches.length,
      is_final: start + 60 >= samples.length,
      graph_id: graphId,
      matching_policy: matchingPolicy,
      consent_version: "pilot-consent-v1",
      source_class: "SYNTHETIC",
      trip_start_utc: tripStart,
      samples: slice,
    });
    if (start + 60 >= samples.length) break;
  }
  return batches;
}
export function normalizeStored(rows: StoredTraversal[]): unknown[] {
  return [...rows]
    .sort(
      (a, b) =>
        Date.parse(a.entered_at_utc) - Date.parse(b.entered_at_utc) ||
        a.occurrence - b.occurrence,
    )
    .map((r) => ({
      edge_id: r.edge_id,
      forward: r.forward,
      entered_at_ms: Date.parse(r.entered_at_utc),
      exited_at_ms: Date.parse(r.exited_at_utc),
    }));
}
export function assertNoSensitiveDiagnostics(
  text: string,
  secrets: string[],
): void {
  if (
    secrets.some((s) => s && text.includes(s)) ||
    /postgres(?:ql)?:\/\/|"(?:longitude|latitude|database_url|token|password)"\s*:/i.test(
      text,
    )
  )
    throw new Error(
      "Sensitive diagnostic field detected / 민감 진단 필드 감지",
    );
}
const write = (root: string, path: string, value: unknown) =>
  writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const safeState = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(safeState)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key]) =>
                !["contributor_id", "namespace", "owner_id"].includes(key),
            )
            .map(([key, v]) => [key, safeState(v)]),
        )
      : value;
export interface IngestionCheckResult {
  ingestion: NonNullable<SimulationReportData["ingestion"]>;
  assertions: SimulationAssertion[];
}
export async function runIngestionChecks(
  graphDirectory: string,
  workloadDirectory: string,
  outputPath: string,
): Promise<IngestionCheckResult> {
  const output = resolve(outputPath);
  mkdirSync(output);
  mkdirSync(join(output, "readbacks"));
  const graph = loadSeoulGraph(graphDirectory);
  const observations = parseJson(
    readFileSync(join(workloadDirectory, "observations.json")),
  ) as Observation[];
  const spec = parseJson(
    readFileSync(join(workloadDirectory, "spec.json")),
  ) as { start_time_utc: string };
  const reference = parseJson(
    readFileSync(join(workloadDirectory, "matching/result.json")),
  ) as MatchingResult;
  if (!["seoul-observed-v2", "seoul-observed-v3"].includes(reference.policy_id))
    throw new Error(
      "Unsupported reference matching policy / 미지원 기준 매칭 정책",
    );
  const source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  if (!source.commit || source.dirty === null)
    throw new Error("Source identity unavailable / 소스 식별 불가");
  const runtime = new OwnedIngestionRuntime(join(output, "runtime"), output);
  const assertions: SimulationAssertion[] = [];
  const events: { phase: string; code: string; elapsed_ms: number }[] = [];
  const started = performance.now();
  let store: IngestionStore | undefined,
    service: OwnedIngestionProcess | undefined;
  let config: StoreConfig;
  let serviceUrl = "";
  let submitted = 0,
    duplicates = 0,
    recovered = 0;
  let cleanup = false;
  const credentials: ServiceCredential[] = [];
  const cases: NonNullable<SimulationReportData["ingestion"]>["cases"] = [];
  const record = (phase: string, code: string) => {
    events.push({ phase, code, elapsed_ms: performance.now() - started });
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
      assertion_id: "p05-" + id,
      status: pass ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected,
      actual: safeState(actual),
      evidence_path: path,
    });
    writeFileSync(
      join(output, "assertions.json"),
      JSON.stringify(assertions, null, 2) + "\n",
    );
    if (!pass) throw new Error(en + " / " + ko);
  };
  const contentDigest = async (p: Principal) => {
    const pool = new pg.Pool({ connectionString: config.database_url, max: 1 });
    try {
      const digests: Record<string, unknown> = {};
      for (const [table, order] of [
        ["trips", "trip_id"],
        ["batches", "trip_id,batch_seq"],
        ["samples", "trip_id,sample_id"],
        ["traversals", "trip_id,observation_id"],
      ] as const) {
        const row =
          table === "samples"
            ? "(to_jsonb(t)-'observation') || jsonb_build_object('observation_sha256',CASE WHEN observation IS NULL THEN NULL ELSE encode(sha256(convert_to(observation::text,'UTF8')),'hex') END)"
            : "to_jsonb(t)";
        const sql =
          "SELECT encode(sha256(convert_to(COALESCE(string_agg((" +
          row +
          ")::text,E'\\n' ORDER BY " +
          order +
          "),''),'UTF8')),'hex') AS digest,count(*)::int AS row_count FROM routelens_p05." +
          table +
          " t WHERE namespace=$1 AND contributor_id=$2";
        digests[table] = (
          await pool.query(sql, [config.namespace, p.contributor_id])
        ).rows[0];
      }
      return digests;
    } finally {
      await pool.end();
    }
  };
  const snapshot = async (name: string, p?: Principal, trip?: string) => {
    const value = await store!.inspect(p, trip);
    write(output, "readbacks/" + name + ".json", safeState(value));
    return value;
  };
  const principal = (id: string, vehicle: string): Principal => {
    const p: Principal = {
      contributor_id: "p05-" + id,
      vehicle_id: vehicle,
      consent_version: "pilot-consent-v1",
    };
    credentials.push({ token: randomBytes(24).toString("hex"), principal: p });
    return p;
  };
  const vehicleIds = [...new Set(observations.map((s) => s.vehicle_id))].sort();
  const principals = vehicleIds.map((id, i) => principal("vehicle-" + i, id));
  const extra = Array.from({ length: 12 }, (_, i) =>
    principal("case-" + i, vehicleIds[0]!),
  );
  const abortPrincipal = principal("engine-abort", "teheran-clean");
  let orphanEngineId: string | undefined;
  const token = (p: Principal) =>
    credentials.find((c) => c.principal.contributor_id === p.contributor_id)!
      .token;
  const secrets = () =>
    credentials.map((c) => c.token).concat(config?.database_url ?? "");
  const startService = async (
    pauseAt?: "AFTER_ACCEPT_COMMIT",
    eventTime = currentEventTime,
  ) => {
    const cfg: ServiceConfig = {
      store: config,
      credentials,
      event_time_utc: eventTime,
      port: 0,
      ...(pauseAt ? { pause_at: pauseAt } : {}),
    };
    service = runtime.spawn(
      "api-" + runtime.processes.length,
      "ingestion_service",
      cfg,
    );
    const ready = await service!.message(
      (m) => m?.type === "READY" && m.kind === "service",
    );
    serviceUrl = "http://127.0.0.1:" + ready.port;
    return service;
  };
  const clock = async (time: string) => {
    const p = service!;
    const mark = p.messages.length;
    p.send({ type: "EVENT_TIME", event_time_utc: time });
    await p.message(
      (m) =>
        p.messages.indexOf(m) >= mark &&
        m?.type === "EVENT_TIME_SET" &&
        m.event_time_utc === time,
    );
  };
  const request = async (
    p: Principal | undefined,
    body: unknown,
    path = "/v1/observations/batches",
    method = "POST",
    raw = false,
  ) => {
    const response = await fetch(serviceUrl + path, {
      method,
      headers: {
        ...(p ? { Authorization: "Bearer " + token(p) } : {}),
        "Content-Type": "application/json",
      },
      ...(method !== "GET"
        ? { body: raw ? String(body) : JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    assertNoSensitiveDiagnostics(text, secrets());
    runtime.assertSafe(text);
    const value = JSON.parse(text) as { code?: string; state?: string };
    submitted++;
    if (value.code === "DUPLICATE") duplicates++;
    record("HTTP", response.status + ":" + (value.code ?? value.state ?? ""));
    return { status: response.status, body: value };
  };
  const worker = async (pauseAt?: WorkerConfig["pause_at"], lease = 120000) => {
    const cfg: WorkerConfig = {
      store: config,
      graph_directory: graph.directory,
      output_root: join(output, "synthetic-engine"),
      event_time_utc: currentEventTime,
      owner_id: "worker-" + runtime.processes.length,
      lease_ms: lease,
      ...(pauseAt ? { pause_at: pauseAt } : {}),
    };
    return runtime.spawn(
      "worker-" + runtime.processes.length,
      "ingestion_worker",
      cfg,
    );
  };
  let currentEventTime = spec.start_time_utc;
  const setClock = async (time: string) => {
    currentEventTime = time;
    await clock(time);
  };
  const finishWorker = async (w: OwnedIngestionProcess) => {
    const result = await w.message((m) => m?.type === "RESULT");
    const exited = await w.exited();
    record("WORKER", result.code);
    assertNoSensitiveDiagnostics(w.diagnostics.join(""), secrets());
    return { result, exited };
  };
  const waitLease = async (inspection: StoreInspection) => {
    const trip = inspection.trips.find((t) => t.state === "LEASED");
    if (!trip?.lease_until_utc)
      throw new Error("No leased trip / 임대한 여행 없음");
    const delay = Math.max(
      0,
      Date.parse(trip.lease_until_utc) - Date.now() + 100,
    );
    const start = performance.now();
    await pause(delay);
    record("LEASE_WAIT", "elapsed:" + Math.round(performance.now() - start));
    return performance.now() - start;
  };
  let result: IngestionCheckResult | undefined;
  let failure: unknown;
  try {
    config = {
      database_url: await runtime.start(),
      namespace: "pilot-" + runtime.runId.replace(/-/g, ""),
      graph_id: graph.graphId,
      matching_policy: reference.policy_id as StoreConfig["matching_policy"],
    };
    store = new IngestionStore(config);
    await store.initialize([...principals, ...extra, abortPrincipal]);
    await startService();
    const streams = vehicleIds.map((id, i) => ({
      p: principals[i]!,
      batches: buildIngestBatches(
        observations.filter((s) => s.vehicle_id === id),
        "base-" + i,
        graph.graphId,
        spec.start_time_utc,
        config.matching_policy,
      ),
    }));
    const all = streams
      .flatMap((s) => s.batches.map((b) => ({ p: s.p, b })))
      .sort(
        (a, b) => a.b.samples.at(-1)!.offset_ms - b.b.samples.at(-1)!.offset_ms,
      );
    for (const { p, b } of all) {
      await setClock(b.samples.at(-1)!.event_time_utc);
      const r = await request(p, b);
      if (r.status !== 202 || r.body.code !== "ACCEPTED")
        throw new Error(
          "Baseline batch refused / 기본 배치 거부: " + r.body.code,
        );
    }
    const baselineReady = await snapshot("baseline-ready");
    check(
      "all-nine-http",
      streams.length === 9 &&
        baselineReady.trips.filter((t) => t.state === "READY").length === 9 &&
        streams.every((s) => s.batches.every((b) => b.samples.length <= 60)),
      "All nine Seoul vehicles are durably READY after actual bounded HTTP batches.",
      "서울9대가 실제 제한 HTTP 배치 접수 뒤 영속 READY 상태입니다.",
      9,
      baselineReady.trips.filter((t) => t.state === "READY").length,
      "readbacks/baseline-ready.json",
    );
    const first = streams[0]!;
    const beforeDuplicate = await store.inspect(first.p);
    const duplicate = await Promise.all([
      request(first.p, first.batches[0]!),
      request(first.p, first.batches[0]!),
    ]);
    const afterDuplicate = await snapshot("duplicates", first.p);
    check(
      "concurrent-duplicates",
      duplicate.every((r) => r.status === 202 && r.body.code === "DUPLICATE") &&
        beforeDuplicate.counts.samples === afterDuplicate.counts.samples &&
        beforeDuplicate.counts.traversals === afterDuplicate.counts.traversals,
      "Concurrent exact duplicates preserve sample and traversal counts.",
      "동시 정확 중복이 표본·통과 수를 보존합니다.",
      beforeDuplicate.counts,
      afterDuplicate.counts,
      "readbacks/duplicates.json",
    );
    const beforeConflictDigest = await contentDigest(first.p);
    const conflicts: IngestBatch[] = [];
    for (const mutate of [
      (b: IngestBatch) => {
        b.samples[0]!.longitude += 0.000001;
      },
      (b: IngestBatch) => {
        b.batch_id += "new";
      },
      (b: IngestBatch) => {
        b.graph_id = "wrong";
      },
      (b: IngestBatch) => {
        b.trip_start_utc = "2020-01-01T00:00:00Z";
      },
      (b: IngestBatch) => {
        b.is_final = true;
      },
      (b: IngestBatch) => {
        b.matching_policy = "wrong" as IngestBatch["matching_policy"];
      },
      (b: IngestBatch) => {
        b.samples[0]!.vehicle_id = "wrong";
      },
    ]) {
      const b = structuredClone(first.batches[0]!);
      mutate(b);
      conflicts.push(b);
    }
    const conflictResponses = [];
    for (const b of conflicts)
      conflictResponses.push(await request(first.p, b));
    const afterConflicts = await snapshot("conflicts", first.p);
    const afterConflictDigest = await contentDigest(first.p);
    write(output, "readbacks/conflict-content-digests.json", {
      before: beforeConflictDigest,
      after: afterConflictDigest,
    });
    check(
      "conflicts-atomic",
      canonical(beforeConflictDigest).equals(canonical(afterConflictDigest)) &&
        conflictResponses.every((r) => [409, 422].includes(r.status)) &&
        canonical({ ...beforeDuplicate.counts, events: 0 }).equals(
          canonical({ ...afterConflicts.counts, events: 0 }),
        ),
      "Body, sequence, version, start, final and authenticated-vehicle conflicts leave storage unchanged.",
      "본문·순서·버전·시작·마지막·인증차량 충돌이 저장을 바꾸지 않습니다.",
      true,
      conflictResponses.map((r) => r.status),
      "readbacks/conflicts.json",
    );
    const wrongConfig: WorkerConfig = {
      store: { ...config, graph_id: "f".repeat(64) },
      graph_directory: graph.directory,
      output_root: join(output, "synthetic-engine"),
      event_time_utc: currentEventTime,
      owner_id: "wrong-graph-worker",
    };
    const wrongWorker = runtime.spawn(
      "wrong-graph-worker",
      "ingestion_worker",
      wrongConfig,
    );
    const wrongResult = await finishWorker(wrongWorker);
    const afterWrong = await snapshot("wrong-graph-worker");
    check(
      "wrong-worker-graph",
      wrongResult.result.code === "IDLE" &&
        afterWrong.trips.every((t) => t.attempt === 0),
      "A worker pinned to a different graph cannot consume an attempt.",
      "다른 그래프로 고정한 처리자가 시도횟수를 소비하지 않습니다.",
      "IDLE",
      wrongResult.result.code,
      "readbacks/wrong-graph-worker.json",
    );
    const attemptLinks: unknown[] = [];
    const attemptDirectories = () =>
      existsSync(join(output, "synthetic-engine"))
        ? readdirSync(join(output, "synthetic-engine")).map(
            (name) => "synthetic-engine/" + name,
          )
        : [];
    for (const phase of [
      "AFTER_LEASE",
      "AFTER_MATCH",
      "AFTER_INSERT",
    ] as const) {
      const attemptsBefore = new Set(attemptDirectories());
      const w = await worker(phase, phase === "AFTER_LEASE" ? 1200 : 12000);
      await w.message((m) => m?.type === "PHASE" && m.phase === phase);
      const leased = await snapshot("crash-" + phase.toLowerCase());
      const interruptedAttempts = attemptDirectories().filter(
        (path) => !attemptsBefore.has(path),
      );
      await w.stop("SIGKILL");
      const exit = await w.exited();
      if (phase === "AFTER_INSERT") {
        const after = await snapshot("uncommitted-insert");
        check(
          "uncommitted-rollback",
          after.counts.traversals === leased.counts.traversals,
          "SIGKILL before commit leaves no partial traversal writes.",
          "커밋 전 SIGKILL이 일부 통과 저장을 남기지 않습니다.",
          leased.counts.traversals,
          after.counts.traversals,
          "readbacks/uncommitted-insert.json",
        );
      }
      await waitLease(leased);
      const recoveredWorker = await worker();
      const completed = await finishWorker(recoveredWorker);
      const recoveredAttempts = attemptDirectories().filter(
        (path) =>
          !attemptsBefore.has(path) && !interruptedAttempts.includes(path),
      );
      attemptLinks.push({
        phase,
        interrupted_pid: w.child?.pid,
        recovered_pid: recoveredWorker.child?.pid,
        interrupted_attempts: interruptedAttempts,
        recovered_attempts: recoveredAttempts,
      });
      writeFileSync(
        join(output, "attempt-links.json"),
        JSON.stringify(attemptLinks, null, 2) + "\n",
      );
      recovered++;
      check(
        "recover-" + phase.toLowerCase(),
        exit.signal === "SIGKILL" && completed.result.code === "SUCCEEDED",
        "A distinct worker recovers after an actual killed process and real lease expiry.",
        "실제 프로세스 종료·현실 임대 만료 뒤 다른 처리자가 복구합니다.",
        "SUCCEEDED",
        completed.result.code,
        "events.json",
      );
    }
    // A paused old owner is resumed only after another process commits its job.
    const old = await worker("AFTER_LEASE", 1200);
    await old.message((m) => m?.type === "PHASE" && m.phase === "AFTER_LEASE");
    const oldLease = await snapshot("stale-owner-leased");
    await waitLease(oldLease);
    const winner = await worker();
    const winnerResult = await finishWorker(winner);
    const beforeStale = await snapshot("before-stale-resume");
    old.send({ type: "RESUME", phase: "AFTER_LEASE" });
    const stale = await finishWorker(old);
    const afterStale = await snapshot("after-stale-resume");
    check(
      "stale-owner-fenced",
      winnerResult.result.code === "SUCCEEDED" &&
        stale.result.code === "LEASE_LOST" &&
        canonical(beforeStale.traversals).equals(
          canonical(afterStale.traversals),
        ),
      "A stale process resumes and loses its fence without mutating committed rows.",
      "오래된 프로세스가 재개돼 소유권을 잃고 저장 행을 바꾸지 않습니다.",
      "LEASE_LOST",
      stale.result.code,
      "readbacks/after-stale-resume.json",
    );
    const racers = await Promise.all([worker(), worker()]);
    const raceResults = await Promise.all(racers.map(finishWorker));
    check(
      "two-workers",
      raceResults.every((r) => r.result.code === "SUCCEEDED"),
      "Two actual worker processes claim different remaining jobs.",
      "서로 다른 실제 처리자2개가 남은 작업을 확보했습니다.",
      2,
      raceResults.length,
      "events.json",
    );
    for (let i = 0; i < 3; i++) await finishWorker(await worker());
    const baselineDone = await snapshot("baseline-succeeded");
    const expectedCount = reference.traversals.filter(
      (t) => t.status === "ACCEPTED",
    ).length;
    let equal = true;
    for (const stream of streams) {
      const actual = baselineDone.traversals.filter(
        (t) => t.contributor_id === stream.p.contributor_id,
      );
      const expected = reference.traversals
        .filter(
          (t) =>
            t.vehicle_id === stream.p.vehicle_id && t.status === "ACCEPTED",
        )
        .sort((a, b) => a.entered_at_ms! - b.entered_at_ms!)
        .map((t) => ({
          edge_id: t.edge_id,
          forward: t.forward,
          entered_at_ms: Date.parse(spec.start_time_utc) + t.entered_at_ms!,
          exited_at_ms: Date.parse(spec.start_time_utc) + t.exited_at_ms!,
        }));
      equal &&= canonical(normalizeStored(actual)).equals(canonical(expected));
    }
    check(
      "fresh-p04-equality",
      equal &&
        baselineDone.counts.traversals === expectedCount &&
        new Set(baselineDone.traversals.map((t) => t.observation_id)).size ===
          expectedCount &&
        baselineDone.counts.raw_payloads === 0,
      "Stored edge, direction, occurrence and observed times equal all fresh P04 traversals; IDs remain unique.",
      "저장 구간·방향·순번·관측시각이 새 P04 통과 전체와 같고 식별자가 고유합니다.",
      expectedCount,
      baselineDone.counts,
      "readbacks/baseline-succeeded.json",
    );
    const baselineEvents = runtime.commands
      .command([
        "exec",
        runtime.name,
        "psql",
        "-U",
        "postgres",
        "-d",
        "routelens",
        "-At",
        "-c",
        "SELECT COALESCE(json_agg(json_build_object('code',code,'state',state,'fence',fence::text,'attempt',attempt,'at_event_utc',at_event_utc,'at_database_utc',at_database_utc)),'[]'::json) FROM routelens_p05.events WHERE namespace='" +
          config.namespace +
          "';",
      ])
      .stdout.trim();
    assertNoSensitiveDiagnostics(baselineEvents, secrets());
    write(output, "database-events.json", JSON.parse(baselineEvents));
    write(output, "reference-comparison.json", {
      identity_normalization_en:
        "P04 matching-session IDs differ from private trip IDs; compare directed edge occurrences and UTC boundary contents. Stored observation IDs are checked for uniqueness and retry stability.",
      identity_normalization_ko:
        "P04 매칭 세션과 비공개 여행 식별자는 다르므로 방향 구간 순번·UTC 경계를 대조합니다. 저장 식별자의 고유성과 재시도 안정성을 별도로 검사합니다.",
      expected_traversals: expectedCount,
      actual_traversals: baselineDone.counts.traversals,
      equal,
    });
    const retryAfterSuccess = await request(first.p, first.batches[0]!);
    const afterSuccessRetry = await snapshot("success-retry", first.p);
    check(
      "success-retry-stable",
      retryAfterSuccess.body.code === "DUPLICATE" &&
        canonical(afterSuccessRetry.traversals).equals(
          canonical(
            baselineDone.traversals.filter(
              (t) => t.contributor_id === first.p.contributor_id,
            ),
          ),
        ) &&
        afterSuccessRetry.trips.every((t) => t.raw_payload_count === 0),
      "Successful retries preserve stored IDs and never revive raw payloads.",
      "성공 뒤 재시도가 저장ID를 보존하고 원문을 복원하지 않습니다.",
      "DUPLICATE",
      retryAfterSuccess.body.code,
      "readbacks/success-retry.json",
    );
    const status = await request(
      first.p,
      undefined,
      "/v1/trips/" + first.batches[0]!.trip_id,
      "GET",
    );
    check(
      "authenticated-status",
      status.status === 200 && status.body.state === "SUCCEEDED",
      "Authenticated status reports completion without raw locations.",
      "인증한 상태 조회가 원시위치 없이 완료를 표시합니다.",
      "SUCCEEDED",
      status.body.state,
      "events.json",
    );
    const simple = (
      p: Principal,
      id: string,
      count = 4,
      start = currentEventTime,
    ): IngestBatch => ({
      schema_version: "0.1",
      batch_id: id + "-b0",
      trip_id: id,
      batch_seq: 0,
      is_final: true,
      graph_id: graph.graphId,
      matching_policy: config.matching_policy,
      consent_version: "pilot-consent-v1",
      source_class: "SYNTHETIC",
      trip_start_utc: start,
      samples: Array.from({ length: count }, (_, i) => ({
        ...observations.find((s) => s.vehicle_id === p.vehicle_id)!,
        sample_id: id + "-s" + i,
        vehicle_id: p.vehicle_id,
        offset_ms: i * 500,
        event_time_utc: new Date(Date.parse(start) + i * 500).toISOString(),
      })),
    });
    const orderPrincipal = extra[0]!;
    const orderInput = simple(orderPrincipal, "order", 130);
    const ordered = buildIngestBatches(
      orderInput.samples,
      "order",
      graph.graphId,
      orderInput.trip_start_utc,
      config.matching_policy,
    );
    await setClock(ordered.at(-1)!.samples.at(-1)!.event_time_utc);
    await request(orderPrincipal, ordered[0]!);
    await request(orderPrincipal, ordered[2]!);
    const waiting = await snapshot("sequence-waiting", orderPrincipal);
    const idle = await finishWorker(await worker());
    check(
      "final-before-gap",
      waiting.trips[0]?.state === "WAITING" && idle.result.code === "IDLE",
      "A final batch does not make a sequence gap claimable.",
      "마지막 배치가 와도 순서 누락은 확보할 수 없습니다.",
      "WAITING",
      waiting.trips[0]?.state,
      "readbacks/sequence-waiting.json",
    );
    await request(orderPrincipal, ordered[1]!);
    const ready = await snapshot("sequence-ready", orderPrincipal);
    const extension = {
      ...ordered.at(-1)!,
      batch_id: "order-extension",
      batch_seq: 3,
    };
    const extensionResponse = await request(orderPrincipal, extension);
    check(
      "filled-gap-and-final-lock",
      ready.trips[0]?.state === "READY" && extensionResponse.status === 409,
      "Filling the earlier gap makes READY; post-final extension is refused.",
      "앞 순서 누락을 채우면 READY가 되고 마지막 뒤 확장은 거부됩니다.",
      409,
      extensionResponse.status,
      "readbacks/sequence-ready.json",
    );
    await store.revoke(orderPrincipal, currentEventTime);
    const boundary = extra[1]!,
      now = Date.parse(currentEventTime) + 100000;
    await setClock(new Date(now).toISOString());
    const ageResults = [];
    for (const [id, delta, want] of [
      ["age-exact", -120000, 202],
      ["age-too-old", -120001, 422],
      ["future-under", 29999, 202],
      ["future-exact", 30000, 422],
    ] as const) {
      const batch = simple(
        boundary,
        id,
        1,
        new Date(now + delta).toISOString(),
      );
      const response = await request(boundary, batch);
      ageResults.push({ id, status: response.status, expected: want });
    }
    check(
      "event-time-boundaries",
      ageResults.every((r) => r.status === r.expected),
      "Trusted event-time enforces exact 120 s age and 30 s future boundaries.",
      "신뢰 관측시간이 정확한120초 과거·30초 미래 경계를 적용합니다.",
      true,
      ageResults,
      "events.json",
    );
    await store.revoke(boundary, currentEventTime);
    const limits = extra[2]!;
    await setClock(currentEventTime);
    const normal = simple(limits, "limits", 2);
    const overlapBase = {
      ...simple(limits, "overlap-conflict", 2),
      is_final: false,
    };
    await request(limits, overlapBase);
    const beforeOverlap = await store.inspect(limits, "overlap-conflict");
    const changedOverlap = structuredClone(overlapBase);
    changedOverlap.batch_id = "overlap-conflict-b1";
    changedOverlap.batch_seq = 1;
    changedOverlap.samples[0]!.longitude += 0.000001;
    const overlapConflict = await request(limits, changedOverlap);
    const afterOverlap = await snapshot(
      "sample-content-conflict",
      limits,
      "overlap-conflict",
    );
    check(
      "overlap-content-conflict",
      overlapConflict.status === 409 &&
        canonical(beforeOverlap.trips).equals(canonical(afterOverlap.trips)),
      "A changed overlap sample in a new sequence is rejected atomically.",
      "새 순서의 중첩표본 내용변경을 원자적으로 거부합니다.",
      409,
      overlapConflict.status,
      "readbacks/sample-content-conflict.json",
    );

    const rejectionResponses = [];
    rejectionResponses.push([401, (await request(undefined, normal)).status]);
    rejectionResponses.push([
      400,
      (
        await request(
          limits,
          '{"schema_version":"0.1","schema_version":"0.1"}',
          undefined,
          undefined,
          true,
        )
      ).status,
    ]);
    rejectionResponses.push([
      413,
      (await request(limits, " ".repeat(65537), undefined, undefined, true))
        .status,
    ]);
    rejectionResponses.push([
      422,
      (await request(limits, simple(limits, "too-many-samples", 61))).status,
    ]);
    rejectionResponses.push([
      422,
      (await request(limits, { ...normal, batch_seq: 128 })).status,
    ]);
    rejectionResponses.push([
      422,
      (await request(limits, { ...normal, unknown: true })).status,
    ]);
    rejectionResponses.push([
      403,
      (await request(limits, { ...normal, source_class: "REAL" })).status,
    ]);
    const malformed = simple(limits, "malformed", 2);
    malformed.samples[1]!.offset_ms = 0;
    rejectionResponses.push([422, (await request(limits, malformed)).status]);
    check(
      "http-validation-and-auth",
      rejectionResponses.every(([want, got]) => want === got),
      "HTTP rejects unauthenticated, duplicate-key, oversized, over-count, malformed and non-synthetic requests.",
      "HTTP가 미인증·중복키·과대본문·개수초과·잘못된입력·비합성요청을 거부합니다.",
      true,
      rejectionResponses,
      "events.json",
    );
    const limitSamples = Array.from({ length: 3002 }, (_, i) => ({
      ...normal.samples[0]!,
      sample_id: "max-s" + i,
      offset_ms: i * 99,
      event_time_utc: new Date(
        Date.parse(normal.trip_start_utc) + i * 99,
      ).toISOString(),
    }));
    for (let index = 0; index < 3001; index += 60) {
      const samples = limitSamples.slice(index, Math.min(index + 60, 3001));
      await setClock(samples.at(-1)!.event_time_utc);
      const b = {
        ...normal,
        batch_id: "max-b" + index,
        trip_id: "max-trip",
        batch_seq: index / 60,
        is_final: false,
        samples,
      };
      if ((await request(limits, b)).status !== 202)
        throw new Error(
          "Failed below distinct-sample bound / 고유표본 한도 전 접수 실패",
        );
    }
    await setClock(limitSamples.at(-1)!.event_time_utc);
    const over = await request(limits, {
      ...normal,
      batch_id: "max-over",
      trip_id: "max-trip",
      batch_seq: 51,
      is_final: false,
      samples: [limitSamples.at(-1)!],
    });
    const limitState = await snapshot("sample-limit", limits, "max-trip");
    check(
      "distinct-sample-limit",
      over.status === 429 && limitState.trips[0]?.sample_count === 3001,
      "The 3002nd distinct observation is rejected atomically.",
      "3002번째 고유관측을 원자적으로 거부합니다.",
      { http_status: 429, sample_count: 3001 },
      {
        http_status: over.status,
        sample_count: limitState.trips[0]?.sample_count,
      },
      "readbacks/sample-limit.json",
    );
    await store.revoke(limits, currentEventTime);
    const capacity = extra[3]!;
    await setClock(currentEventTime);
    const capacityResponses = [];
    for (let i = 0; i < 21; i++)
      capacityResponses.push(
        await request(capacity, {
          ...simple(capacity, "capacity-" + i, 1),
          is_final: false,
        }),
      );
    check(
      "active-trip-capacity",
      capacityResponses.slice(0, 20).every((r) => r.status === 202) &&
        capacityResponses[20]?.status === 429,
      "A contributor may hold twenty active trips, but not twenty-one.",
      "기여자 활성여행20개는 허용하고21개는 거부합니다.",
      429,
      capacityResponses[20]?.status,
      "events.json",
    );
    await store.revoke(capacity, currentEventTime);
    const front = extra[10]!;
    await request(front, simple(front, "a-expired-first", 2));
    await setClock(
      new Date(Date.parse(currentEventTime) + 600001).toISOString(),
    );
    await request(front, simple(front, "z-ready-after-expired", 2));
    const beyond = await finishWorker(await worker());
    const frontState = await snapshot("expired-front-ready-behind", front);
    check(
      "expired-front-not-blocking",
      beyond.result.code === "SUCCEEDED" &&
        frontState.trips.find((t) => t.trip_id === "a-expired-first")?.state ===
          "EXPIRED" &&
        frontState.trips.find((t) => t.trip_id === "z-ready-after-expired")
          ?.state === "SUCCEEDED",
      "Claim skips an expired first trip and processes the next READY trip.",
      "확보가 만료된 앞여행을 건너뛰고 다음 READY여행을 처리합니다.",
      "SUCCEEDED",
      beyond.result.code,
      "readbacks/expired-front-ready-behind.json",
    );
    await store.revoke(front, currentEventTime);
    const crashPrincipal = extra[4]!,
      crashBatch = {
        ...simple(crashPrincipal, "api-crash", 2),
        is_final: false,
      };
    await service!.stop();
    await startService("AFTER_ACCEPT_COMMIT");
    await setClock(currentEventTime);
    const pending = request(crashPrincipal, crashBatch).then(
      () => false,
      () => true,
    );
    await service!.message(
      (m) => m?.type === "PHASE" && m.phase === "AFTER_ACCEPT_COMMIT",
    );
    const committed = await snapshot("api-before-response", crashPrincipal);
    await service!.stop("SIGKILL");
    const responseLost = await pending;
    await store.close();
    store = undefined;
    await runtime.restartDatabase();
    config = { ...config, database_url: runtime.databaseUrl };
    store = new IngestionStore(config);
    await store.initialize([...principals, ...extra, abortPrincipal]);
    await startService(undefined, spec.start_time_utc);
    const staleRestart = await request(
      extra[11]!,
      simple(extra[11]!, "stale-after-restart", 1, spec.start_time_utc),
    );
    check(
      "old-api-clock-fenced",
      staleRestart.status === 422,
      "Restarting an API with old clock configuration cannot admit stale new observations.",
      "과거 시계 설정으로 API를 재시작해도 오래된 신규관측을 접수할 수 없습니다.",
      422,
      staleRestart.status,
      "events.json",
    );
    const replay = await request(crashPrincipal, crashBatch);
    const restarted = await snapshot("api-durable-restart", crashPrincipal);
    check(
      "api-db-restart",
      responseLost &&
        replay.body.code === "DUPLICATE" &&
        committed.trips[0]?.sample_count === restarted.trips[0]?.sample_count,
      "Committed acceptance survives a killed API, lost response and same-volume PostgreSQL restart.",
      "커밋 접수가 API종료·응답유실·같은볼륨 PostgreSQL재시작 뒤 유지됩니다.",
      "DUPLICATE",
      replay.body.code,
      "readbacks/api-durable-restart.json",
    );
    await store.revoke(crashPrincipal, currentEventTime);
    const enginePrincipal = extra[5]!,
      far = simple(enginePrincipal, "engine-failure", 2);
    far.samples = far.samples.map((p, i) => ({
      ...p,
      longitude: 1 + i * 0.0001,
      latitude: 1,
      accuracy_m: 1,
    }));
    await setClock(far.samples.at(-1)!.event_time_utc);
    await request(enginePrincipal, far);
    const engineResults = [];
    for (let i = 0; i < 3; i++)
      engineResults.push(await finishWorker(await worker()));
    const failed = await snapshot("engine-terminal", enginePrincipal);
    check(
      "actual-engine-terminal",
      engineResults[0]?.result.code === "RETRY" &&
        engineResults[1]?.result.code === "RETRY" &&
        engineResults[2]?.result.code === "FAILED" &&
        failed.trips[0]?.attempt === 3 &&
        failed.trips[0]?.state === "FAILED" &&
        failed.trips[0]?.raw_payload_count === 0 &&
        failed.traversals.length === 0,
      "Three actual engine failures reach FAILED and purge raw context without accepted rows.",
      "실제 엔진3회실패가 FAILED가 되고 수용행 없이 원문을 삭제합니다.",
      ["RETRY", "RETRY", "FAILED"],
      engineResults.map((r) => r.result.code),
      "readbacks/engine-terminal.json",
    );
    const expiryPrincipal = extra[6]!,
      expiryBatch = {
        ...simple(expiryPrincipal, "raw-expiry", 2),
        is_final: false,
      };
    await setClock(currentEventTime);
    await request(expiryPrincipal, expiryBatch);
    const rawDeadline = new Date(
      Date.parse(expiryBatch.trip_start_utc) + 600001,
    ).toISOString();
    await setClock(rawDeadline);
    await store.sweep(rawDeadline);
    await store.sweep(rawDeadline);
    const expiredReplay = await request(expiryPrincipal, expiryBatch);
    const expired = await snapshot("raw-expired", expiryPrincipal);
    check(
      "raw-expiry-replay",
      expiredReplay.status === 410 &&
        expired.trips[0]?.state === "EXPIRED" &&
        expired.trips[0]?.raw_payload_count === 0,
      "Raw expiry and repeated sweep reject replay without reviving payloads.",
      "원문 만료·반복정리가 재전송을 거부하고 원문을 복원하지 않습니다.",
      410,
      expiredReplay.status,
      "readbacks/raw-expired.json",
    );
    const revokedPrincipal = extra[7]!,
      revokedBatch = {
        ...simple(revokedPrincipal, "revoked-before-final", 2),
        is_final: false,
      };
    await setClock(currentEventTime);
    await request(revokedPrincipal, revokedBatch);
    const revokeResponse = await request(
      revokedPrincipal,
      undefined,
      "/v1/consent/revoke",
    );
    await request(revokedPrincipal, undefined, "/v1/consent/revoke");
    await store.initialize([revokedPrincipal]);
    const revokedReplay = await request(revokedPrincipal, revokedBatch);
    const revoked = await snapshot("revoked-before-final", revokedPrincipal);
    check(
      "revoked-not-reinitialized",
      revokeResponse.status === 200 &&
        revokedReplay.status === 403 &&
        revoked.trips.every((t) => t.raw_payload_count === 0) &&
        revoked.traversals.length === 0,
      "Repeated revoke and initialize do not reactivate consent or raw data.",
      "반복철회·초기화가 동의·원문을 되살리지 않습니다.",
      403,
      revokedReplay.status,
      "readbacks/revoked-before-final.json",
    );
    for (const [kind, p] of [
      ["expiry", extra[8]!],
      ["revoke", extra[9]!],
    ] as const) {
      await setClock(currentEventTime);
      const batch = simple(p, "pending-" + kind, 4);
      await request(p, batch);
      const w = await worker("AFTER_MATCH");
      await w.message((m) => m?.type === "PHASE" && m.phase === "AFTER_MATCH");
      if (kind === "expiry") {
        const pendingDeadline = new Date(
          Date.parse(batch.trip_start_utc) + 600001,
        ).toISOString();
        await setClock(pendingDeadline);
      } else {
        await store.revoke(p, currentEventTime);
        await store.revoke(p, currentEventTime);
      }
      w.send({ type: "RESUME", phase: "AFTER_MATCH" });
      const finished = await finishWorker(w);
      if (kind === "expiry") {
        const beforeSweep = await snapshot("pending-expiry-before-sweep", p);
        check(
          "event-clock-without-sweep",
          finished.result.code === "LEASE_LOST" &&
            beforeSweep.traversals.length === 0,
          "Database event-clock expiry alone fences a paused old worker before sweeping.",
          "DB관측시계 만료만으로 정리 전에도 대기중 옛처리자를 막습니다.",
          "LEASE_LOST",
          finished.result.code,
          "readbacks/pending-expiry-before-sweep.json",
        );
        await store.sweep(currentEventTime);
        await store.sweep(currentEventTime);
      }
      const state = await snapshot("pending-" + kind, p);
      check(
        "pending-" + kind + "-fenced",
        finished.result.code === "LEASE_LOST" &&
          state.trips.every((t) => t.raw_payload_count === 0) &&
          state.traversals.length === 0,
        "Pending completion cannot restore data after expiry or consent revocation.",
        "만료·동의철회 뒤 대기중 완료가 자료를 복원할 수 없습니다.",
        "LEASE_LOST",
        finished.result.code,
        "readbacks/pending-" + kind + ".json",
      );
    }
    const dedupeDeadline = new Date(
      Date.parse(currentEventTime) + 86400001,
    ).toISOString();
    await setClock(dedupeDeadline);
    await store.sweep(dedupeDeadline);
    await store.sweep(dedupeDeadline);
    const oldReplay = await request(first.p, first.batches[0]!);
    const deleted = await snapshot("retention-24h");
    check(
      "retention-no-revival",
      oldReplay.status !== 202 &&
        deleted.counts.raw_payloads === 0 &&
        deleted.counts.traversals === 0 &&
        deleted.counts.samples === 0 &&
        deleted.counts.batches === 0,
      "Twenty-four-hour deletion removes dedupe and contributions; old input cannot revive them.",
      "24시간삭제가 중복정보·기여를 지우고 과거입력이 복원하지 못합니다.",
      0,
      deleted.counts,
      "readbacks/retention-24h.json",
    );
    const dbEvents = runtime.commands
      .command([
        "exec",
        runtime.name,
        "psql",
        "-U",
        "postgres",
        "-d",
        "routelens",
        "-At",
        "-c",
        "SELECT COALESCE(json_agg(json_build_object('code',code,'state',state,'fence',fence::text,'attempt',attempt,'at_event_utc',at_event_utc,'at_database_utc',at_database_utc)),'[]'::json) FROM routelens_p05.events WHERE namespace='" +
          config.namespace +
          "';",
      ])
      .stdout.trim();
    assertNoSensitiveDiagnostics(dbEvents, secrets());
    write(output, "database-events-after-retention.json", JSON.parse(dbEvents));
    // Keep ordinary deletion/event read-backs immutable before the new abort trip.
    const beforeAbort = await snapshot("before-engine-abort");
    const abortSamples = observations
      .filter((p) => p.vehicle_id === "teheran-clean")
      .map((p, index) => ({
        ...p,
        sample_id: "engine-abort-s" + index,
        event_time_utc: new Date(
          Date.parse(currentEventTime) + p.offset_ms,
        ).toISOString(),
      }));
    check(
      "engine-abort-fixture",
      abortSamples.length === 423,
      "The orphan-engine probe uses all 423 authored Teheran clean observations.",
      "잔여 엔진 검사가 직접 만든 테헤란 깨끗한 관측423개 전체를 사용합니다.",
      423,
      abortSamples.length,
      "readbacks/before-engine-abort.json",
    );
    const abortStart = currentEventTime;
    const abortBatches = buildIngestBatches(
      abortSamples,
      "engine-abort",
      graph.graphId,
      abortStart,
      config.matching_policy,
    );
    write(output, "engine-abort-plan.json", {
      message_en:
        "Pause an actually running engine, kill its worker process group, and verify owned orphan cleanup.",
      message_ko:
        "실행중 엔진을 일시정지한 뒤 처리자 그룹을 종료하고 소유한 잔여 컨테이너 정리를 확인합니다.",
      samples: abortSamples.length,
      previous_raw_payloads: beforeAbort.counts.raw_payloads,
      attempt_output_root: "synthetic-engine",
      observation_payload_retained_here: false,
    });
    for (const batch of abortBatches) {
      await setClock(batch.samples.at(-1)!.event_time_utc);
      const response = await request(abortPrincipal, batch);
      if (response.status !== 202)
        throw new Error("Engine abort input refused / 엔진 중단 입력 거부");
    }
    const beforeAbortAttempts = new Set(attemptDirectories());
    const abortWorker = await worker();
    await abortWorker.message(
      (m) => m?.type === "READY" && m.kind === "worker",
    );
    const engineDeadline = performance.now() + 30000;
    let observedTop = "";
    let observedMount = "";
    while (performance.now() < engineDeadline && !orphanEngineId) {
      const inventory = runtime.commands.command(
        ["ps", "--filter", "label=io.routelens.run_id", "--format", "{{.ID}}"],
        10000,
      );
      for (const candidate of inventory.stdout
        .trim()
        .split(/\s+/)
        .filter(Boolean)) {
        const details = runtime.commands.command(
          [
            "inspect",
            "--format",
            '{{json .Mounts}}|{{.Name}}|{{ index .Config.Labels "io.routelens.run_id" }}|{{.State.Running}}|{{.State.Paused}}',
            candidate,
          ],
          10000,
          true,
        );
        if (details.status !== 0) continue;
        const [mountText, name, label, running, paused] = details.stdout
          .trim()
          .split("|");
        if (
          name !== "/routelens-p02-" + label ||
          !/^[a-f0-9-]{36}$/.test(label ?? "") ||
          running !== "true" ||
          paused !== "false"
        )
          continue;
        const mounts = JSON.parse(mountText!) as {
          Source: string;
          Destination: string;
        }[];
        const exact = mounts.find(
          (m) =>
            m.Destination === "/work" &&
            attemptDirectories().some(
              (path) =>
                !beforeAbortAttempts.has(path) &&
                resolve(output, path) === resolve(m.Source),
            ),
        );
        if (!exact) continue;
        const remainingMs = Math.floor(engineDeadline - performance.now());
        if (remainingMs < 1500)
          throw new Error(
            "Owned engine observation deadline elapsed / 소유 엔진 관찰 시간이 끝났습니다",
          );
        // Observe and stop inside this already verified container. Only locate
        // or trace_attributes is eligible; the version probe is not work.
        // No command line, request body or environment is printed.
        const seconds = Math.max(1, Math.floor(remainingMs / 1000) - 1);
        const observer = String.raw`
deadline=$(($(date +%s) + ${seconds}))
while [ "$(date +%s)" -lt "$deadline" ]; do
  for path in /proc/[0-9]*; do
    exe=$(readlink "$path/exe" 2>/dev/null) || continue
    case "$exe" in */valhalla_service) ;; *) continue ;; esac
    action=$(tr '\000' '\n' < "$path/cmdline" 2>/dev/null | awk '$0=="locate" || $0=="trace_attributes" {print; exit}')
    case "$action" in locate|trace_attributes) ;; *) continue ;; esac
    pid=$(basename "$path")
    kill -STOP "$pid" 2>/dev/null || continue
    check=0
    while [ "$check" -lt 10 ]; do
      actual=$(readlink "$path/exe" 2>/dev/null) || break
      state=$(awk '/^State:/ {print $2}' "$path/status" 2>/dev/null)
      if [ "$actual" = "$exe" ] && [ "$state" = T ]; then
        printf '{"pid":%s,"exe":"%s","state":"T","action":"%s"}\n' "$pid" "$exe" "$action"
        exit 0
      fi
      check=$((check + 1))
      sleep 0.005
    done
    kill -CONT "$pid" 2>/dev/null || true
  done
  sleep 0.01
done
exit 3
`;
        const stopped = runtime.commands.command(
          ["exec", candidate, "sh", "-c", observer],
          remainingMs,
          true,
        );
        if (stopped.status !== 0)
          throw new Error(
            "No executing locate/trace_attributes was stopped before the deadline / 기한 내 실행중 locate·trace_attributes를 정지하지 못했습니다",
          );
        assertNoSensitiveDiagnostics(stopped.stdout, secrets());
        runtime.assertSafe(stopped.stdout);
        const proof = JSON.parse(stopped.stdout) as {
          pid: number;
          exe: string;
          state: string;
          action: string;
        };
        if (
          !Number.isSafeInteger(proof.pid) ||
          proof.pid <= 0 ||
          !/^\/[a-zA-Z0-9_./-]+\/valhalla_service$/.test(proof.exe) ||
          proof.state !== "T" ||
          !["locate", "trace_attributes"].includes(proof.action)
        )
          throw new Error(
            "Stopped engine identity/state was not verified / 정지 엔진의 식별·상태를 확인하지 못했습니다",
          );
        write(output, "engine-abort-stopped-process.json", proof);
        runtime.commands.command(
          ["pause", candidate],
          Math.max(1, Math.floor(engineDeadline - performance.now())),
        );
        const pausedTop = runtime.commands.command(
          ["top", candidate, "-eo", "pid,comm,stat"],
          Math.max(1, Math.floor(engineDeadline - performance.now())),
        );
        assertNoSensitiveDiagnostics(pausedTop.stdout, secrets());
        runtime.assertSafe(pausedTop.stdout);
        if (
          !pausedTop.stdout
            .split("\n")
            .some((line) =>
              /\bvalhalla_servic(?:e)?\b.*\bT[a-zA-Z+<]*\b/.test(line),
            )
        )
          throw new Error(
            "Stopped engine disappeared before container pause / 컨테이너 일시정지 전에 정지 엔진이 사라졌습니다",
          );
        orphanEngineId = runtime.commands
          .command(["inspect", "--format", "{{.Id}}", candidate], 10000)
          .stdout.trim();
        observedTop = pausedTop.stdout;
        observedMount = exact.Source;
        break;
      }
      if (!orphanEngineId) {
        if (
          abortWorker.child?.exitCode !== null &&
          abortWorker.child?.exitCode !== undefined
        )
          throw new Error(
            "Worker completed before live engine observation / 실행중 엔진 확인 전에 처리자가 종료됨",
          );
        await pause(50);
      }
    }
    if (!orphanEngineId)
      throw new Error(
        "No owned running valhalla_service found within 30 seconds / 30초 안에 소유한 실행중 valhalla_service를 찾지 못했습니다",
      );
    writeFileSync(join(output, "engine-abort-top.txt"), observedTop, {
      flag: "wx",
    });
    await abortWorker.stop("SIGKILL");
    const abortExit = await abortWorker.exited();
    const orphanState = runtime.commands
      .command(
        [
          "inspect",
          "--format",
          "{{.Id}}|{{.State.Running}}|{{.State.Paused}}",
          orphanEngineId,
        ],
        10000,
      )
      .stdout.trim()
      .split("|");
    write(output, "engine-abort-before-cleanup.json", {
      engine_id: orphanEngineId,
      worker_pid: abortWorker.child?.pid,
      worker_exit: abortExit,
      attempt_mount: observedMount,
      engine_running: orphanState[1] === "true",
      engine_paused: orphanState[2] === "true",
      message_en:
        "An executing engine was paused, then its worker was killed; the exact orphan remains for cleanup.",
      message_ko:
        "실행중 엔진을 일시정지한 뒤 처리자를 종료했으며 정확한 잔여 컨테이너가 정리 대상으로 남았습니다.",
    });
    check(
      "running-engine-orphan",
      abortExit.signal === "SIGKILL" &&
        orphanState[0] === orphanEngineId &&
        orphanState[1] === "true" &&
        orphanState[2] === "true",
      "An executing engine was paused before the worker was killed, leaving a verified owned container.",
      "실행중 엔진을 일시정지한 뒤 처리자를 종료하고 소유 잔여 컨테이너를 확인했습니다.",
      true,
      { signal: abortExit.signal, paused: orphanState[2] },
      "engine-abort-before-cleanup.json",
    );
    for (const p of runtime.processes)
      assertNoSensitiveDiagnostics(p.diagnostics.join(""), secrets());
    const diagnostics = runtime.processes.map((p) => ({
      role: p.role,
      messages: p.messages,
      diagnostics: p.diagnostics.join(""),
    }));
    assertNoSensitiveDiagnostics(JSON.stringify(diagnostics), secrets());
    write(output, "process-events.json", diagnostics);
    cases.push(
      ...assertions.map((a) => ({
        case_id: a.assertion_id,
        status: a.status,
        message_en: a.message_en,
        message_ko: a.message_ko,
        evidence_path: a.evidence_path,
      })),
    );
    result = {
      ingestion: {
        scenario_count: 10,
        assertions_passed: assertions.filter((a) => a.status === "PASS").length,
        assertions_total: assertions.length,
        submitted_batches: submitted,
        duplicate_responses: duplicates,
        stored_traversals: expectedCount,
        reference_traversals: expectedCount,
        recovered_workers: recovered,
        cleanup_verified: false,
        events,
        cases,
        evidence: [
          {
            name_en: "Database read-back and deletion",
            name_ko: "DB 재조회·삭제",
            path: "readbacks/retention-24h.json",
          },
          {
            name_en: "Actual state events",
            name_ko: "실제 상태 이벤트",
            path: "database-events.json",
          },
          {
            name_en: "Process and IPC events",
            name_ko: "프로세스·통신 이벤트",
            path: "process-events.json",
          },
        ],
      },
      assertions,
    };
  } catch (error) {
    failure = error;
    record("INTEGRATION", "FAILED");
  } finally {
    try {
      if (store) await store.close();
    } catch (error) {
      failure ??= error;
    } finally {
      cleanup = await runtime.cleanup();
    }
    try {
      const diagnostics = runtime.processes.map((p) => ({
        role: p.role,
        pid: p.child?.pid,
        exit_code: p.child?.exitCode,
        signal: p.child?.signalCode,
        messages: p.messages,
        diagnostics: p.diagnostics.join(""),
      }));
      const raw = JSON.stringify(diagnostics);
      assertNoSensitiveDiagnostics(raw, secrets());
      runtime.assertSafe(raw);
      writeFileSync(
        join(output, "process-events-final.json"),
        JSON.stringify(diagnostics, null, 2) + "\n",
      );
    } catch (error) {
      failure ??= error;
    }
  }
  if (!cleanup)
    failure = new Error("Owned cleanup incomplete / 소유자원 정리 미완료");
  if (failure || !result) {
    write(output, "failure.json", {
      status: "FAIL",
      message_en: "P05 did not complete.",
      message_ko: "P05 실행이 완료되지 않았습니다.",
      error: String(failure),
      cleanup_verified: cleanup,
    });
    throw failure ?? new Error("P05 incomplete / P05 미완료");
  }
  const orphanAbsent =
    !!orphanEngineId &&
    confirmedAbsent(
      runtime.commands.command(
        ["inspect", "--format", "{{.Id}}", orphanEngineId],
        10000,
        true,
      ),
    );
  write(output, "engine-abort-after-cleanup.json", {
    engine_id: orphanEngineId,
    absent: orphanAbsent,
    cleanup_verified: cleanup,
  });
  check(
    "orphan-engine-removed",
    orphanAbsent && cleanup,
    "The exact paused orphan engine is absent after owned cleanup.",
    "소유 자원 정리 뒤 정확한 일시정지 잔여 엔진의 부재를 확인했습니다.",
    true,
    orphanAbsent,
    "engine-abort-after-cleanup.json",
  );
  result.ingestion.cases.push({
    case_id: "p05-orphan-engine-removed",
    status: "PASS",
    message_en:
      "An executing engine was paused before its worker was killed; the orphan container was removed.",
    message_ko:
      "실행중 엔진을 일시정지한 뒤 처리자를 종료하고 남은 컨테이너를 정리했습니다.",
    evidence_path: "engine-abort-after-cleanup.json",
  });
  result.ingestion.evidence.push({
    name_en: "Running engine pause, worker kill and orphan cleanup",
    name_ko: "실행중 엔진 일시정지·처리자 종료·잔여 정리",
    path: "engine-abort-before-cleanup.json",
  });
  result.ingestion.cleanup_verified = true;
  check(
    "owned-cleanup",
    cleanup,
    "Owned processes, engine containers, PostgreSQL volume and ports are absent.",
    "소유 프로세스·엔진컨테이너·PostgreSQL볼륨·포트의 부재를 확인했습니다.",
    true,
    cleanup,
    "runtime/cleanup.json",
  );
  result.ingestion.assertions_passed = assertions.length;
  result.ingestion.assertions_total = assertions.length;
  result.ingestion.cases.push({
    case_id: "p05-owned-cleanup",
    status: "PASS",
    message_en: "Owned cleanup verified.",
    message_ko: "소유 자원 정리 확인.",
    evidence_path: "runtime/cleanup.json",
  });
  write(output, "report-ingestion.json", result.ingestion);
  writeFileSync(
    join(output, "summary.md"),
    "# Durable synthetic ingestion / 영속 합성 수집\n\nPASS: actual HTTP, PostgreSQL and separate worker processes.\n통과: 실제 HTTP·PostgreSQL·별도처리자.\n\nLogical primary-store deletion only; not WAL/backups erasure, production authentication or P06 aggregation.\n주저장소 논리삭제이며 WAL/백업완전삭제·운영인증·P06집계 검증이 아닙니다.\n",
  );
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(source))
  )
    throw new Error("Source changed during P05 / P05 실행중 소스 변경");
  write(output, "manifest.json.tmp", {
    schema_version: "0.1",
    source,
    status: "PASS",
    graph_id: graph.graphId,
    graph_manifest_sha256: graph.manifestSha256,
    implementation_sha256: fingerprint,
    cleanup_verified: cleanup,
    output_sha256: evidenceHashes(output),
    completed_at_utc: new Date().toISOString(),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return result;
}
export async function main(
  argv = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    let graph = "",
      workload = "",
      output = "";
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--graph") graph = argv[++i] ?? "";
      else if (argv[i] === "--workload") workload = argv[++i] ?? "";
      else if (argv[i] === "--output") output = argv[++i] ?? "";
      else if (argv[i] === "--help") {
        io.out(
          "Usage / 사용법: ingestion:check -- --graph SEOUL_GRAPH --workload FRESH_WORKLOAD --output NEW_DIRECTORY",
        );
        return 0;
      } else throw new Error("Unknown argument / 알 수 없는 인자");
    }
    if (!graph || !workload || !output)
      throw new Error("Required arguments missing / 필수인자 누락");
    await runIngestionChecks(graph, workload, output);
    return 0;
  } catch (error) {
    io.error("P05 incomplete / P05 미완료: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
