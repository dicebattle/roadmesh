/** Compare actual PostgreSQL originals with local workerd/Queues/SQLite effects. / 실제 PostgreSQL 원문과 로컬 Cloudflare 효과 비교. */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { canonical, parseJson, sha256, isMain } from "./shared.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { aggregateWindow } from "./traffic_aggregation.js";
import type {
  AggregationContribution,
  AggregationInput,
  AggregationResult,
} from "./aggregation_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
import { evidenceHashes } from "./map_matcher.js";
import { pause } from "./ingestion_runtime.js";
import { OwnedCloudflareRuntime } from "./cloudflare_runtime.js";
import type {
  ParityScope,
  QueueNotice,
} from "../infra/cloudflare/contracts.js";
export const CLOUDFLARE_CASE_IDS =
  "fresh-source shared-core actual-queue count-0 count-1 count-4 count-5 batch-duplicate repeated-contributor parked window-open late-before late-exact late-after exact-expiry revoke-invalidates retention-no-revival batch-conflict wrong-graph wrong-source namespace-isolation unknown-fields concurrent-duplicate queue-ack-retry queue-hash-rejected durable-outbox restart-persistence recovered-dispatch immutable-catalog public-privacy canonical-parity owned-cleanup"
    .split(" ")
    .map((x) => "p13-" + x);
export interface CloudflareReport {
  assertions_total: number;
  assertions_passed: number;
  cleanup_verified: boolean;
  cases: Array<{
    case_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }>;
  parity: Array<{
    case_id: string;
    canonical_sha256: string | null;
    evidence_path: string;
  }>;
  runtime_en: string;
  runtime_ko: string;
}
interface Snapshot {
  schema_version: string;
  source: { commit: string; dirty: boolean };
  implementation_sha256: string;
  graph_id: string;
  input: AggregationInput;
  result: AggregationResult;
}
interface Inspection {
  now_utc: string;
  contributions: AggregationContribution[];
  receipts: Array<{
    id: string;
    hash: string;
    payload: string;
    state: string;
    deliveries: number;
  }>;
  candidates: unknown[];
  queue_events: Array<{
    batch: string;
    hash: string;
    attempt: number;
    code: string;
  }>;
}
export function requireCloudflareCases(values: SimulationAssertion[]): void {
  if (
    values.length !== 32 ||
    new Set(values.map((a) => a.assertion_id)).size !== 32 ||
    CLOUDFLARE_CASE_IDS.some(
      (id) => !values.some((a) => a.assertion_id === id && a.status === "PASS"),
    )
  )
    throw new Error("P13 required cases incomplete / P13 필수 사례 미완료");
}
export async function runCloudflareChecks(
  graphDirectory: string,
  aggregationDirectory: string,
  outputPath: string,
  developmentOnly = false,
): Promise<{
  cloudflare: CloudflareReport;
  assertions: SimulationAssertion[];
}> {
  const output = resolve(outputPath);
  mkdirSync(output);
  mkdirSync(join(output, "readbacks"));
  mkdirSync(join(output, "parity"));
  const graph = loadSeoulGraph(graphDirectory),
    source = sourceIdentity(),
    fingerprint = implementationFingerprint(),
    aggregationRoot = resolve(aggregationDirectory),
    read = (p: string): unknown =>
      parseJson(readFileSync(join(aggregationRoot, p))),
    m = read("manifest.json") as {
      status: string;
      source: Snapshot["source"];
      graph_id: string;
      implementation_sha256: string;
      output_sha256: Record<string, string>;
    };
  const assertions: SimulationAssertion[] = [],
    parity: CloudflareReport["parity"] = [];
  const save = (name: string, value: unknown) => {
    writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
    return name;
  };
  const check = (
    id: string,
    ok: boolean,
    en: string,
    ko: string,
    actual: unknown,
    path: string,
  ) => {
    assertions.push({
      assertion_id: "p13-" + id,
      status: ok ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected: true,
      actual,
      evidence_path: path,
    });
    writeFileSync(
      join(output, "assertions.json"),
      JSON.stringify(assertions, null, 2) + "\n",
    );
    if (!ok) throw new Error(en + " / " + ko);
  };
  if (m.status !== "PASS" || m.graph_id !== graph.graphId)
    throw new Error(
      "P13 requires a verified same-graph PostgreSQL run / P13은 같은 지도에서 검증한 PostgreSQL 실행이 필요합니다",
    );
  const names = [
      "count-0",
      "count-1",
      "count-4",
      "count-5",
      "late-just-before",
      "late-exact",
      "late-after",
      "revoked",
      "expired",
      "new-empty-window",
      "window-open",
    ],
    snapshots = new Map<string, Snapshot>();
  for (const id of names) {
    const p = "parity-inputs/" + id + ".json",
      bytes = readFileSync(join(aggregationRoot, p));
    if (sha256(bytes) !== m.output_sha256[p])
      throw new Error(
        "Original parity input hash mismatch / 원 비교 입력 해시 불일치",
      );
    const s = read(p) as Snapshot;
    if (
      s.schema_version !== "p13-input-0.1" ||
      s.graph_id !== graph.graphId ||
      !canonical(s.source).equals(canonical(m.source)) ||
      s.implementation_sha256 !== m.implementation_sha256
    )
      throw new Error(
        "Original parity provenance mismatch / 원 비교 출처 불일치",
      );
    if (!canonical(aggregateWindow(s.input)).equals(canonical(s.result)))
      throw new Error(
        "PostgreSQL original is not reproducible / PostgreSQL 원문 재현 불가",
      );
    snapshots.set(id, s);
    save("parity/" + id + "-postgresql.json", {
      source_path: p,
      source_sha256: sha256(bytes),
      ...s,
    });
  }
  if (!developmentOnly) {
    const ok =
      source.commit !== null &&
      source.dirty === false &&
      canonical(source).equals(canonical(m.source)) &&
      fingerprint === m.implementation_sha256;
    check(
      "fresh-source",
      ok,
      "The PostgreSQL and Worker cases share this clean source, runtime and actual Seoul graph.",
      "PostgreSQL·Worker 사례가 이번 깨끗한 소스·실행·실제 서울 지도를 공유합니다.",
      {
        source,
        aggregation_source: m.source,
        implementation_sha256: fingerprint,
      },
      save("readbacks/source.json", {
        source,
        aggregation_source: m.source,
        graph_id: graph.graphId,
        implementation_sha256: fingerprint,
      }),
    );
  }
  const scopes: ParityScope[] = names.map((id) => {
      const s = snapshots.get(id)!;
      return {
        scope_id: id,
        namespace: s.input.namespace,
        graph_id: graph.graphId,
        shard_id: "p13-" + id,
        catalog: s.input.catalog,
        initial_event_time_utc: s.input.now_utc,
      };
    }),
    five = snapshots.get("count-5")!,
    runtimeScope = (id: string): ParityScope => ({
      scope_id: id,
      namespace: five.input.namespace,
      graph_id: graph.graphId,
      shard_id: "p13-" + id,
      catalog: five.input.catalog,
      initial_event_time_utc: five.input.now_utc,
    });
  scopes.push(runtimeScope("queue"), runtimeScope("outbox"), {
    ...runtimeScope("isolated"),
    namespace: "p13-isolated",
  });
  const runtime = new OwnedCloudflareRuntime(join(output, "runtime"), scopes);
  let error: unknown, cleanup: { cleanup_verified: boolean } | undefined;
  const request = async (
    id: string,
    op: string,
    payload?: unknown,
    expected = 200,
  ) => {
    const r = await runtime.request(id, op, payload);
    if (r.status !== expected)
      throw new Error(
        `P13 ${id}/${op} expected ${expected}, got ${r.status} / P13 응답 상태 불일치`,
      );
    return r;
  };
  const inspect = async (id: string): Promise<Inspection> =>
    (await request(id, "inspect")).body as Inspection;
  const wait = async (
    id: string,
    predicate: (v: Inspection) => boolean,
  ): Promise<Inspection> => {
    const end = Date.now() + 15000;
    while (true) {
      const value = await inspect(id);
      if (predicate(value)) return value;
      if (Date.now() > end)
        throw new Error(
          "Actual local queue did not reach the required state / 실제 로컬 큐가 필요한 상태에 도달하지 못했습니다",
        );
      await pause(100);
    }
  };
  const stage = async (
    id: string,
    batch: string,
    contributions: AggregationContribution[],
    defer = false,
  ) => {
    const r = await request(
      id,
      "batches",
      {
        batch_id: batch,
        contributions,
        ...(defer ? { dispatch: "defer" } : {}),
      },
      202,
    );
    return (r.body as { notice: QueueNotice }).notice;
  };
  try {
    await runtime.start();
    for (const id of names) {
      const s = snapshots.get(id)!;
      await stage(id, "original", s.input.contributions);
      await wait(id, (x) =>
        x.receipts.some((r) => r.id === "original" && r.state === "APPLIED"),
      );
      const result = (
        await request(id, "finalize", { window_start: s.input.window_start })
      ).body as AggregationResult;
      const path = save("parity/" + id + "-worker.json", result);
      const same = canonical(result).equals(canonical(s.result));
      if (!same)
        throw new Error(
          "Actual Worker/DO output differs from PostgreSQL: " +
            id +
            " / 실제 Worker·DO의 PostgreSQL 비교 불일치",
        );
      parity.push({
        case_id: id,
        canonical_sha256: result.canonical_sha256,
        evidence_path: path,
      });
      if (
        [
          "count-0",
          "count-1",
          "count-4",
          "count-5",
          "window-open",
          "late-just-before",
          "late-exact",
          "late-after",
        ].includes(id)
      ) {
        const caseId = id === "late-just-before" ? "late-before" : id;
        check(
          caseId,
          same,
          "Actual local queue and SQLite match the PostgreSQL " +
            id +
            " output.",
          "실제 로컬 큐·SQLite가 PostgreSQL " + id + " 결과와 같습니다.",
          { code: result.code, canonical_sha256: result.canonical_sha256 },
          path,
        );
      }
    }
    check(
      "shared-core",
      true,
      "Every transported original reproduces the unchanged shared core.",
      "전달한 모든 원문이 변경하지 않은 공유 집계 규칙으로 재현됩니다.",
      { originals: names.length },
      save("readbacks/shared-core.json", {
        originals: names,
        source: m.source,
        implementation_sha256: m.implementation_sha256,
      }),
    );
    const fiveResult = five.result;
    check(
      "repeated-contributor",
      fiveResult.rejections.some((r) => r.reason === "REPEATED_CONTRIBUTOR"),
      "Repeated contributors do not inflate the accepted output.",
      "반복 기여자는 수용 결과를 부풀리지 않습니다.",
      fiveResult.rejections,
      "parity/count-5-worker.json",
    );
    check(
      "parked",
      fiveResult.rejections.some((r) => r.reason === "PARKED"),
      "Explicit PARKED movement stays excluded.",
      "명시한 주차 이동은 제외됩니다.",
      fiveResult.rejections,
      "parity/count-5-worker.json",
    );
    const original = five.input.contributions,
      notice = await stage("queue", "ack-retry", original, true);
    await request("queue", "fault", {
      batch_id: "ack-retry",
      ack_loss_once: true,
    });
    await request("queue", "queue", notice, 202);
    const retried = await wait(
      "queue",
      (x) =>
        x.queue_events.some((e) => e.code === "COMMITTED_ACK_LOST") &&
        x.queue_events.some((e) => e.code === "DUPLICATE" && e.attempt >= 2),
    );
    const unique = new Set(original.map((c) => c.observation_id)).size;
    check(
      "queue-ack-retry",
      retried.contributions.length === unique &&
        retried.receipts[0]?.deliveries === 2,
      "A real queue retry after committed acknowledgement loss has one stored effect.",
      "저장 뒤 확인 유실의 실제 큐 재전달에도 저장 효과는 한 번입니다.",
      retried,
      save("readbacks/ack-retry.json", retried),
    );
    check(
      "actual-queue",
      retried.queue_events.every((e) => e.attempt >= 1) &&
        retried.queue_events.length >= 2,
      "The actual workerd Queue handler recorded delivery attempts.",
      "실제 workerd 큐 처리자가 전달 시도를 기록했습니다.",
      retried.queue_events,
      "readbacks/ack-retry.json",
    );
    const duplicate = await request(
      "queue",
      "batches",
      { batch_id: "ack-retry", contributions: original },
      202,
    );
    await wait("queue", (x) => x.receipts[0]!.deliveries >= 3);
    check(
      "batch-duplicate",
      (duplicate.body as { code: string }).code === "DUPLICATE" &&
        (await inspect("queue")).contributions.length === unique,
      "Duplicate HTTP submission preserves one committed payload.",
      "HTTP 중복 제출은 한 저장 내용을 유지합니다.",
      duplicate.body,
      save("readbacks/duplicate.json", duplicate),
    );
    const conflict = await runtime.request("queue", "batches", {
      batch_id: "ack-retry",
      contributions: [],
    });
    check(
      "batch-conflict",
      conflict.status === 409 &&
        (conflict.body as { code: string }).code === "BATCH_CONFLICT",
      "Same batch ID with changed bytes is rejected.",
      "같은 배치 ID의 다른 바이트를 거부합니다.",
      conflict,
      save("readbacks/conflict.json", conflict),
    );
    const twins = await Promise.all([
      request(
        "queue",
        "batches",
        { batch_id: "twins", contributions: original },
        202,
      ),
      request(
        "queue",
        "batches",
        { batch_id: "twins", contributions: original },
        202,
      ),
    ]);
    const twinState = await wait("queue", (x) =>
      x.receipts.some((r) => r.id === "twins" && r.deliveries >= 2),
    );
    check(
      "concurrent-duplicate",
      twins
        .map((r) => (r.body as { code: string }).code)
        .sort()
        .join(",") === "ACCEPTED,DUPLICATE" &&
        twinState.contributions.length === unique,
      "Concurrent duplicated submissions converge without repeated effects.",
      "동시 중복 제출은 효과를 반복하지 않고 수렴합니다.",
      { twins, state: twinState },
      save("readbacks/concurrent.json", { twins, state: twinState }),
    );
    const forged = { ...notice, sha256: "f".repeat(64) };
    await request("queue", "queue", forged, 202);
    const forgery = await wait("queue", (x) =>
      x.queue_events.some(
        (e) => e.hash === forged.sha256 && e.code === "NOTICE_REJECTED",
      ),
    );
    check(
      "queue-hash-rejected",
      forgery.contributions.length === unique,
      "A forged queue reference cannot apply data.",
      "위조한 큐 참조가 자료를 반영하지 못합니다.",
      forgery,
      save("readbacks/queue-forgery.json", forgery),
    );
    const wrongGraph = await runtime.request("queue", "batches", {
      batch_id: "wrong-graph",
      contributions: [{ ...original[0]!, graph_id: "f".repeat(64) }],
    });
    check(
      "wrong-graph",
      wrongGraph.status === 422,
      "A foreign graph is rejected before staging.",
      "다른 지도를 저장 준비 전에 거부합니다.",
      wrongGraph,
      save("readbacks/wrong-graph.json", wrongGraph),
    );
    const wrongSource = await runtime.request("queue", "batches", {
      batch_id: "wrong-source",
      contributions: [{ ...original[0]!, source_class: "CAR" }],
    });
    check(
      "wrong-source",
      wrongSource.status === 403,
      "Only the configured synthetic source is admitted.",
      "설정한 합성 출처만 접수합니다.",
      wrongSource,
      save("readbacks/wrong-source.json", wrongSource),
    );
    const extra = await runtime.request(
      "queue",
      "batches",
      '{"batch_id":"extra","batch_id":"duplicate","contributions":[]}',
    );
    const unexpected = await runtime.request("queue", "batches", {
      batch_id: "extra-field",
      contributions: [],
      namespace: "forged",
    });
    check(
      "unknown-fields",
      extra.status === 422 && unexpected.status === 422,
      "Duplicate JSON fields cannot alter the trusted handoff.",
      "중복 JSON 필드로 신뢰 전달을 바꾸지 못합니다.",
      extra,
      save("readbacks/strict-json.json", extra),
    );
    const isolation = await inspect("isolated");
    check(
      "namespace-isolation",
      isolation.contributions.length === 0 && isolation.receipts.length === 0,
      "A separately configured namespace retains no other scope effects.",
      "별도 설정 영역에는 다른 범위의 효과가 없습니다.",
      isolation,
      save("readbacks/isolation.json", isolation),
    );
    const revoked = snapshots.get("revoked")!,
      removed = original
        .map((c) => c.contributor_id)
        .find(
          (id) =>
            !revoked.input.contributions.some((c) => c.contributor_id === id),
        );
    if (!removed)
      throw new Error("No actual revoked contributor / 실제 철회 기여자 없음");
    await request("count-5", "revoke", { contributor_id: removed });
    const oldCandidate = await runtime.request(
      "count-5",
      "candidate?window_start=" + encodeURIComponent(five.input.window_start),
    );
    const recomputed = (
      await request("count-5", "finalize", {
        window_start: five.input.window_start,
      })
    ).body as AggregationResult;
    const revokeState = await inspect("count-5");
    check(
      "revoke-invalidates",
      oldCandidate.status === 404 &&
        canonical(recomputed.draft).equals(canonical(revoked.result.draft)) &&
        !revokeState.receipts.some((r) =>
          r.payload.includes('"contributor_id":"' + removed + '"'),
        ),
      "Revocation removes the old candidate and matched receipt content atomically.",
      "철회가 기존 후보와 매칭 접수 내용을 같은 트랜잭션에서 제거합니다.",
      { oldCandidate, recomputed, state: revokeState },
      save("readbacks/revocation.json", {
        oldCandidate,
        recomputed,
        state: revokeState,
      }),
    );
    await request("queue", "finalize", {
      window_start: five.input.window_start,
    });
    await request("queue", "advance", {
      now_utc: snapshots.get("expired")!.input.now_utc,
    });
    const expired = await request(
      "queue",
      "candidate?window_start=" + encodeURIComponent(five.input.window_start),
    );
    check(
      "exact-expiry",
      canonical(expired.body).equals(
        canonical(snapshots.get("expired")!.result.draft),
      ),
      "The read path removes live speed at exact persisted expiry.",
      "읽기 경로가 저장된 정확한 만료 시각에 교통 속도를 제거합니다.",
      expired,
      save("readbacks/expiry.json", expired),
    );
    await request("queue", "advance", { now_utc: "2026-10-25T00:01:00.000Z" });
    await request("queue", "queue", notice, 202);
    const retained = await wait(
      "queue",
      (x) => x.receipts.find((r) => r.id === "ack-retry")!.deliveries >= 4,
    );
    const old = await runtime.request("queue", "batches", {
      batch_id: "old",
      contributions: original,
    });
    check(
      "retention-no-revival",
      old.status === 410 &&
        retained.contributions.length === 0 &&
        retained.candidates.length === 0 &&
        retained.receipts.every((r) => r.payload === "[]"),
      "Retention removes payloads and delayed notices cannot revive them.",
      "보관 만료가 내용을 제거하고 지연 통지가 되살리지 못합니다.",
      { retained, old },
      save("readbacks/retention.json", { retained, old }),
    );
    const pendingNotice = await stage("outbox", "pending", original, true),
      pending = await inspect("outbox");
    check(
      "durable-outbox",
      pending.contributions.length === 0 &&
        pending.receipts[0]?.state === "PENDING",
      "A receipt and unsent outbox are durable before queue dispatch.",
      "큐 발신 전에 접수와 미발신 대기를 영속 저장합니다.",
      pending,
      save("readbacks/outbox-before.json", pending),
    );
    await runtime.stop();
    await runtime.start();
    const resumed = await inspect("outbox");
    check(
      "restart-persistence",
      canonical(resumed).equals(canonical(pending)),
      "A new workerd process reads the same pending durable state.",
      "새 workerd 프로세스가 같은 영속 대기를 읽습니다.",
      { resumed, notice: pendingNotice },
      save("readbacks/outbox-restart.json", { resumed, notice: pendingNotice }),
    );
    await request("outbox", "flush", {});
    const flushed = await wait(
      "outbox",
      (x) => x.receipts[0]?.state === "APPLIED",
    );
    const recovered = (
      await request("outbox", "finalize", {
        window_start: five.input.window_start,
      })
    ).body as AggregationResult;
    check(
      "recovered-dispatch",
      flushed.contributions.length === unique &&
        canonical(recovered).equals(canonical(five.result)),
      "Recovered outbox dispatch reaches identical PostgreSQL bytes through the real queue.",
      "복구한 발신 대기가 실제 큐를 통해 같은 PostgreSQL 바이트에 도달합니다.",
      { flushed, recovered },
      save("readbacks/outbox-flushed.json", { flushed, recovered }),
    );
    await runtime.stop();
    const index = scopes.findIndex((s) => s.scope_id === "outbox"),
      originalScope = scopes[index]!;
    scopes[index] = {
      ...originalScope,
      catalog: originalScope.catalog.map((e, i) =>
        i === 0 ? { ...e, distance_m: e.distance_m + 1 } : e,
      ),
    };
    await runtime.start();
    const changed = await runtime.request("outbox", "inspect");
    check(
      "immutable-catalog",
      changed.status === 409 &&
        (changed.body as { code: string }).code === "SCOPE_CHANGED",
      "Restarting with a changed catalog cannot reinterpret existing durable state.",
      "목록을 바꿔 재시작해도 기존 영속 상태를 재해석하지 못합니다.",
      changed,
      save("readbacks/catalog-change.json", changed),
    );
    await runtime.stop();
    scopes[index] = originalScope;
    await runtime.start();
    const published = await request(
      "outbox",
      "candidate?window_start=" + encodeURIComponent(five.input.window_start),
    );
    const text = JSON.stringify(published.body);
    check(
      "public-privacy",
      canonical(published.body).equals(canonical(five.result.draft)) &&
        !text.includes("contributor_id") &&
        !text.includes("observation_id") &&
        !text.includes("available_at_utc"),
      "Candidate reads contain only the unchanged public draft.",
      "후보 읽기는 기존 공개 후보 필드만 포함합니다.",
      {
        bytes: Buffer.byteLength(published.text),
        sha256: sha256(Buffer.from(published.text)),
      },
      save("readbacks/public-candidate.json", published),
    );
    check(
      "canonical-parity",
      parity.length === 11,
      "All eleven actual PostgreSQL inputs match local Worker results byte for byte.",
      "실제 PostgreSQL 입력11개가 로컬 Worker 결과와 바이트 단위로 같습니다.",
      parity,
      save("readbacks/canonical-parity.json", parity),
    );
  } catch (e) {
    error = e;
    save("failure.json", {
      message_en: "P13 local parity did not complete.",
      message_ko: "P13 로컬 비교가 완료되지 않았습니다.",
      detail: String(e),
    });
  } finally {
    cleanup = await runtime.close();
  }
  check(
    "owned-cleanup",
    cleanup.cleanup_verified,
    "All owned workerd/Wrangler identities and ports stopped; private configuration was removed.",
    "소유 workerd·Wrangler 식별자와 포트를 종료하고 비공개 설정을 제거했습니다.",
    cleanup,
    "runtime/cleanup.json",
  );
  if (error) throw error;
  if (!developmentOnly) {
    requireCloudflareCases(assertions);
    if (
      fingerprint !== implementationFingerprint() ||
      !canonical(sourceIdentity()).equals(canonical(source))
    )
      throw new Error("Source changed during P13 / P13 실행 중 소스 변경");
  }
  const report: CloudflareReport = {
    assertions_total: assertions.length,
    assertions_passed: assertions.filter((a) => a.status === "PASS").length,
    cleanup_verified: cleanup.cleanup_verified,
    cases: assertions.map((a) => ({
      case_id: a.assertion_id,
      status: a.status,
      message_en: a.message_en,
      message_ko: a.message_ko,
      evidence_path: a.evidence_path!,
    })),
    parity,
    runtime_en:
      "Actual local Wrangler/workerd, SQLite Durable Objects and Queues. Post-matching parity only; no hosted consumer-concurrency or production claim.",
    runtime_ko:
      "실제 로컬 Wrangler·workerd·SQLite Durable Objects·Queues입니다. 매칭 후 비교이며 원격 소비자 동시성·운영 완료가 아닙니다.",
  };
  save("report-cloudflare.json", report);
  save("manifest.json.tmp", {
    schema_version: "p13-0.1",
    source,
    graph_id: graph.graphId,
    implementation_sha256: fingerprint,
    status: developmentOnly ? "DEVELOPMENT_ONLY" : "PASS",
    cleanup_verified: cleanup.cleanup_verified,
    original_postgresql_source: m.source,
    original_postgresql_implementation_sha256: m.implementation_sha256,
    output_sha256: evidenceHashes(output),
  });
  renameSync(join(output, "manifest.json.tmp"), join(output, "manifest.json"));
  return { cloudflare: report, assertions };
}
export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    let graph = "",
      aggregation = "",
      output = "",
      development = false;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--graph" && !graph) graph = argv[++i] ?? "";
      else if (a === "--aggregation" && !aggregation)
        aggregation = argv[++i] ?? "";
      else if (a === "--output" && !output) output = argv[++i] ?? "";
      else if (a === "--development-only" && !development) development = true;
      else
        throw new Error(
          "Unknown or duplicate argument / 알 수 없거나 중복 인자",
        );
    }
    if (!graph || !aggregation || !output)
      throw new Error(
        "Usage / 사용법: cloudflare:check -- --graph GRAPH --aggregation SAME_RUN_P06 --output NEW [--development-only]",
      );
    const result = await runCloudflareChecks(
      graph,
      aggregation,
      output,
      development,
    );
    console.log(
      `${development ? "DEVELOPMENT_ONLY" : "PASS"}: ${result.assertions.length} P13 checks / P13 검사${result.assertions.length}개`,
    );
    return 0;
  } catch (e) {
    console.error("P13 incomplete / P13 미완료: " + String(e));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
