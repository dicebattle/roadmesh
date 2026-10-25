/** P12 actual Seoul faults plus same-run S01–S15 assembly. / P12 실제 서울 장애·같은 실행 S01~S15 구성. */
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ScenarioRuntime, scenarioControl } from "./scenario_runtime.js";
import { processTree, identityAlive } from "./client_checks.js";
import { sourceIdentity } from "./pilot_runner.js";
import { implementationFingerprint } from "./media_manifest.js";
import { evidenceHashes } from "./map_matcher.js";
import { canonical, sha256, isMain } from "./shared.js";
import { pause, portIsOpen } from "./ingestion_runtime.js";
import { buildIngestBatches } from "./ingestion_checks.js";
import { TRAFFIC_START } from "./traffic_scenario.js";
import { IngestionStore } from "./ingestion_store.js";
import { PublicationConsumer } from "./publication_consumer.js";
import {
  buildScenarioMatrix,
  persistedScenarioAssertions,
  verifyScenarioMatrix,
  type ScenarioIdentity,
} from "./scenario_matrix.js";
import type { GatewayRequest } from "./gateway_types.js";
import type { ServiceConfig } from "./ingestion_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";

export const SCENARIO_CASE_IDS = [
  "fresh-source",
  "bounded-native-success",
  "no-suitable-road",
  "no-path",
  "outside-coverage",
  "domain-version-change",
  "malformed-domain-response",
  "excluded-node-healthy",
  "excluded-node-not-selected",
  "both-excluded",
  "transport-reset",
  "transport-blackhole",
  "publisher-reset",
  "partition-expiry",
  "non-car-http",
  "non-car-body-spoof",
  "car-retry-preserved",
  "namespace-isolation",
  "same-run-matrix",
  "matrix-missing-rejected",
  "matrix-forged-success-rejected",
  "supervisor-abort",
  "supervisor-failure",
  "owned-cleanup",
].map((id) => "p12-" + id);
export function requireScenarioCases(a: SimulationAssertion[]): void {
  if (
    a.length !== 24 ||
    new Set(a.map((x) => x.assertion_id)).size !== 24 ||
    SCENARIO_CASE_IDS.some(
      (id) => !a.some((x) => x.assertion_id === id && x.status === "PASS"),
    )
  )
    throw Error("P12 required cases incomplete / P12 필수 검사 미완료");
}
export interface ScenarioPrior {
  root: string;
  assertions: SimulationAssertion[];
}
export interface ScenarioReport {
  assertions_passed: number;
  assertions_total: number;
  cleanup_verified: boolean;
  cases: Array<{
    case_id: string;
    status: string;
    message_en: string;
    message_ko: string;
    evidence_path: string;
  }>;
  matrix_path: string | null;
  screenshots: Array<{ label_en: string; label_ko: string; path: string }>;
}
const publicFailure = (r: any, status: number, reason: string) =>
  r.status === status &&
  r.body?.code === "ERROR" &&
  r.body.reason === reason &&
  Object.keys(r.body).sort().join(",") ===
    "code,message_en,message_ko,reason" &&
  typeof r.body.message_en === "string" &&
  typeof r.body.message_ko === "string";
export async function runScenarioChecks(
  graph: string,
  out: string,
  prior?: ScenarioPrior,
  supervisors = true,
) {
  const output = resolve(out),
    h = new ScenarioRuntime(output),
    assertions: SimulationAssertion[] = [],
    source = sourceIdentity(),
    fingerprint = implementationFingerprint();
  if (!source.commit || source.dirty === null)
    throw Error("Scenario source unknown / 시나리오 소스 불명");
  let cleanup = false,
    failure: unknown;
  const identity: ScenarioIdentity = {
    source: { commit: source.commit, dirty: source.dirty },
    implementation_sha256: fingerprint,
    graph_id: "",
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
      assertion_id: "p12-" + id,
      status: ok ? "PASS" : "FAIL",
      message_en: en,
      message_ko: ko,
      expected: true,
      actual,
      evidence_path: path,
    });
    h.write("assertions-current.json", assertions);
    if (!ok) throw Error("P12 criterion failed / P12 기준 미달: " + id);
  };
  const request = (
    id: string,
    destination = { longitude: 127.049, latitude: 37.5045 },
  ): GatewayRequest => ({
    schema_version: "0.1",
    request_id: id,
    origin: { longitude: 127.029, latitude: 37.4984 },
    destination,
    profile: "car",
    traffic_policy: "prefer_live",
    snap_policy: "nearest_road_100m",
  });
  const attemptFile = (id: string) => {
    const root = h.gatewayRoots.at(-1)!,
      match = readdirSync(join(root, "requests")).filter((n) =>
        n.startsWith(id + "-"),
      );
    if (match.length !== 1)
      throw Error("Unique attempt evidence required / 고유 시도 근거 필요");
    return join(root, "requests", match[0]!, "attempts.json");
  };
  const attempts = (id: string) =>
    JSON.parse(readFileSync(attemptFile(id), "utf8")) as any[];
  const route = async (r: GatewayRequest) => {
    const reply = await h.route(r);
    if (
      reply.status !== 200 &&
      !publicFailure(reply, reply.status, reply.body?.reason)
    )
      throw Error("Public failure leaked fields / 공개 실패 필드 유출");
    if (
      reply.status === 200 &&
      [
        "engine_result",
        "provenance",
        "native_code",
        "native_daemon",
        "token",
      ].some((k) => k in reply.body)
    )
      throw Error("Public success leaked fields / 공개 성공 필드 유출");
    return reply;
  };
  try {
    await h.start(graph);
    identity.graph_id = h.source.graph.graphId;
    const f = h.source;
    check(
      "fresh-source",
      JSON.parse(readFileSync(join(output, "source/db.json"), "utf8"))
        .traversals.length === 15,
      "Fresh actual HTTP/P05/P06 Seoul source contains fifteen traversals.",
      "새 실제 HTTP·P05·P06 서울 원본의 통과15개를 확인합니다.",
      15,
      "source/db.json",
    );
    const baseline = await route(request("bounded-success"));
    check(
      "bounded-native-success",
      baseline.status === 200 &&
        baseline.body.traffic_mode === "BASE_ONLY" &&
        attempts("bounded-success").length === 1,
      "Explicit bounded search reaches the real native baseline without changing legacy defaults.",
      "명시한 제한 탐색으로 실제 엔진 기본 경로를 구하고 기존 기본값은 유지합니다.",
      baseline,
      "requests/bounded-success.json",
    );
    for (const [id, target, reason] of [
      [
        "no-suitable-road",
        { longitude: 127.080961, latitude: 37.549272 },
        "NO_SUITABLE_ROAD",
      ],
      ["no-path", { longitude: 127.070395, latitude: 37.507408 }, "NO_PATH"],
    ] as const) {
      const reply = await route(request(id, target)),
        a = attempts(id);
      check(
        id,
        publicFailure(reply, 422, reason) &&
          a.length === 1 &&
          a[0].body.code === "ROUTE_REJECTED",
        "Original native route400 is bound to the exact request and returned without retry.",
        "원 엔진 경로400을 정확한 요청과 연결하고 재시도 없이 반환합니다.",
        { reply, attempts: a },
        "requests/" + id + ".json",
      );
    }
    const outside = await route(
      request("outside-coverage", { longitude: 127.26, latitude: 37.5 }),
    );
    check(
      "outside-coverage",
      publicFailure(outside, 422, "OUT_OF_COVERAGE") &&
        !readdirSync(join(h.gatewayRoots.at(-1)!, "requests")).some((n) =>
          n.startsWith("outside-coverage-"),
        ),
      "Verified source-lock bounds reject valid global coordinates before dispatch.",
      "검증한 원본 잠금 범위로 유효한 지구 좌표도 전달 전에 거부합니다.",
      outside,
      "requests/outside-coverage.json",
    );
    await scenarioControl(h.gateway, {
      type: "SET_GATEWAY_PAUSE",
      phase: "AFTER_GATEWAY_NODE_RESULT",
      request_id: "changed-domain",
    });
    const cursor = h.gateway.messages.length;
    const pending = route(
      request("changed-domain", { longitude: 127.070395, latitude: 37.507408 }),
    );
    await h.gateway.message(
      (m) =>
        h.gateway.messages.indexOf(m) >= cursor &&
        m.type === "PHASE" &&
        m.request_id === "changed-domain",
      30000,
    );
    const publication = await h.publish();
    await scenarioControl(h.gateway, {
      type: "RESUME",
      phase: "AFTER_GATEWAY_NODE_RESULT",
      request_id: "changed-domain",
    });
    const changed = await pending;
    await scenarioControl(h.gateway, {
      type: "SET_GATEWAY_PAUSE",
      phase: null,
    });
    check(
      "domain-version-change",
      publicFailure(changed, 409, "TRAFFIC_CHANGED"),
      "Final gateway authority rejects a completed native domain result after actual publication changes.",
      "실제 게시 변경 뒤 완료된 엔진 업무 결과를 최종 중계 승인이 거부합니다.",
      changed,
      "requests/changed-domain.json",
    );
    h.nodes[0]!.proxy.mode = "malformed-domain";
    const malformed = await route(
      request("malformed-domain", {
        longitude: 127.070395,
        latitude: 37.507408,
      }),
    );
    check(
      "malformed-domain-response",
      publicFailure(malformed, 422, "NO_PATH") &&
        attempts("malformed-domain").length === 2 &&
        attempts("malformed-domain")[0].outcome !== "VALIDATED",
      "A forged domain request hash is rejected and one independent real peer is retried.",
      "위조한 업무 요청 해시를 거부하고 다른 실제 노드를 한 번 재시도합니다.",
      { malformed, attempts: attempts("malformed-domain") },
      "requests/malformed-domain.json",
    );
    h.nodes[0]!.proxy.mode = "normal";
    const healthy = await h.nodeStatus(0);
    h.write("readbacks/excluded-healthy.json", healthy);
    check(
      "excluded-node-healthy",
      healthy.ready &&
        healthy.active?.traffic_snapshot_id === publication.traffic_snapshot_id,
      "Node A remains independently healthy before administrative exclusion.",
      "관리상 제외 전에 A가 독립적으로 정상임을 확인합니다.",
      healthy,
      "readbacks/excluded-healthy.json",
    );
    await h.restartGateway([h.nodes[0]!.config.node_id]);
    const excluded = await route(request("excluded-a")),
      stillHealthy = await h.nodeStatus(0);
    const excludedStatuses = JSON.parse(
      readFileSync(
        resolve(attemptFile("excluded-a"), "..", "statuses.json"),
        "utf8",
      ),
    ) as Array<{ node_id: string }>;
    check(
      "excluded-node-not-selected",
      excluded.status === 200 &&
        excluded.body.node_id === h.nodes[1]!.config.node_id &&
        stillHealthy.ready &&
        excludedStatuses.length === 1 &&
        excludedStatuses[0]!.node_id === h.nodes[1]!.config.node_id &&
        attempts("excluded-a").every(
          (a) => a.node_id === h.nodes[1]!.config.node_id,
        ),
      "A healthy excluded node is neither probed nor dispatched; the same durable gateway consumer uses B.",
      "정상이어도 제외한 노드를 조회·전달하지 않고 같은 영속 중계 수신자로 B를 사용합니다.",
      { excluded, stillHealthy },
      "requests/excluded-a.json",
    );
    await h.restartGateway(h.nodes.map((n) => n.config.node_id));
    const both = await route(request("both-excluded"));
    check(
      "both-excluded",
      publicFailure(both, 503, "NO_HEALTHY_NODE") &&
        attempts("both-excluded").length === 0,
      "Excluding both healthy nodes returns no service with zero attempts.",
      "정상 두 노드를 모두 제외하면 시도 없이 사용 불가를 반환합니다.",
      both,
      "requests/both-excluded.json",
    );
    await h.restartGateway([]);
    h.nodes[0]!.proxy.mode = "reset";
    const reset = await route(request("tcp-reset"));
    await pause(50);
    const resetEvent = h.nodes[0]!.proxy.events.find(
      (e) => e.mode === "reset" && e.path === "/internal/v1/route",
    );
    h.write("readbacks/tcp-reset.json", {
      reset,
      event: resetEvent,
      attempts: attempts("tcp-reset"),
    });
    check(
      "transport-reset",
      reset.status === 200 &&
        reset.body.node_id === h.nodes[1]!.config.node_id &&
        attempts("tcp-reset").length === 2 &&
        reset.elapsed_ms < 12000 &&
        !!resetEvent?.reset_ms &&
        resetEvent.forwarded === false &&
        !!resetEvent.closed_ms,
      "An actual route socket is reset before native forwarding; one bounded peer retry succeeds.",
      "실제 경로 소켓을 엔진 전달 전에 닫고 제한된 다른 노드 재시도에 성공합니다.",
      { reset, event: resetEvent },
      "readbacks/tcp-reset.json",
    );
    h.nodes[0]!.proxy.mode = "blackhole";
    const stalled = await route(request("tcp-blackhole"));
    await pause(100);
    const held = h.nodes[0]!.proxy.events.find(
        (e) => e.mode === "blackhole" && e.path === "/internal/v1/route",
      ),
      a = attempts("tcp-blackhole");
    h.write("readbacks/tcp-blackhole.json", {
      stalled,
      event: held,
      attempts: a,
    });
    check(
      "transport-blackhole",
      stalled.status === 200 &&
        stalled.body.node_id === h.nodes[1]!.config.node_id &&
        a.length === 2 &&
        stalled.elapsed_ms < 12000 &&
        a[0].elapsed_end_ms - a[0].elapsed_start_ms >= 3800 &&
        a[0].elapsed_end_ms - a[0].elapsed_start_ms < 5000 &&
        held?.held_without_headers === true &&
        held.forwarded === false &&
        !!held.closed_ms,
      "A real accepted connection sends no headers until abort; the4s peer bound preserves the12s total.",
      "실제 수락 연결이 취소까지 헤더를 보내지 않아도4초 노드 제한과12초 전체 제한을 유지합니다.",
      { stalled, event: held, attempts: a },
      "readbacks/tcp-blackhole.json",
    );
    h.nodes[0]!.proxy.mode = "normal";

    // Authenticated class is outside the body; compare actual CAR rows and candidate bytes.
    // 인증 종류는 본문 밖에 두고 실제 자동차 행·후보 바이트를 대조합니다.
    const nonCarCredentials = (["BUS", "OTHER"] as const).map(
      (vehicle_class, index) => ({
        token: randomBytes(24).toString("hex"),
        principal: { ...f.credentials[index]!.principal, vehicle_class },
      }),
    );
    h.secrets.push(...nonCarCredentials.map((c) => c.token));
    const nonCar = h.owner.spawn("p12-non-car-api", "ingestion_service", {
      store: f.config,
      credentials: nonCarCredentials,
      event_time_utc: f.now,
      port: 0,
    } satisfies ServiceConfig);
    const nc = await nonCar.message(
      (m) => m.type === "READY" && m.kind === "service",
    );
    h.ports.push(Number(nc.port));
    const before = {
      stored: await f.ingestion.inspect(),
      aggregate: await f.aggregate.inspect(),
    };
    h.write("readbacks/car-before.json", before);
    const trip = f.scene.expected[0]!,
      batch = buildIngestBatches(
        f.scene.observations.filter((p) => p.vehicle_id === trip.vehicle_id),
        trip.trip_id,
        f.graph.graphId,
        TRAFFIC_START,
      )[0]!;
    const sendNonCar = async (index: number, value: unknown) => {
      const r = await fetch(
        `http://127.0.0.1:${nc.port}/v1/observations/batches`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + nonCarCredentials[index]!.token,
            "content-type": "application/json",
          },
          body: JSON.stringify(value),
          signal: AbortSignal.timeout(5000),
        },
      );
      return { status: r.status, body: (await r.json()) as any };
    };
    const nonCarReplies = await Promise.all(
      nonCarCredentials.map((_, i) => sendNonCar(i, batch)),
    );
    h.write("readbacks/non-car.json", nonCarReplies);
    check(
      "non-car-http",
      nonCarReplies.every(
        (r) => r.status === 403 && r.body.code === "VEHICLE_NOT_ALLOWED",
      ),
      "Actual authenticated BUS and OTHER HTTP requests are rejected before persistence.",
      "실제 인증 버스·기타 HTTP 요청을 저장 전에 거부합니다.",
      nonCarReplies,
      "readbacks/non-car.json",
    );
    const spoof = await sendNonCar(0, { ...batch, vehicle_class: "CAR" });
    h.write("readbacks/non-car-spoof.json", spoof);
    check(
      "non-car-body-spoof",
      spoof.status === 403 && spoof.body.code === "VEHICLE_NOT_ALLOWED",
      "A body claiming CAR cannot override the authenticated BUS principal.",
      "본문의 자동차 주장이 인증된 버스 주체를 바꾸지 못합니다.",
      spoof,
      "readbacks/non-car-spoof.json",
    );
    const carRetry = await f.post(0, "/v1/observations/batches", batch),
      after = {
        stored: await f.ingestion.inspect(),
        aggregate: await f.aggregate.inspect(),
      };
    h.write("readbacks/car-after.json", { carRetry, after });
    check(
      "car-retry-preserved",
      carRetry.status === 202 &&
        (carRetry.body as any).code === "DUPLICATE" &&
        canonical(before).equals(canonical(after)),
      "Legacy CAR retry remains duplicate and rejected classes change no CAR rows, counts or aggregate bytes.",
      "기존 자동차 재시도는 중복으로 유지되고 거부한 차량 종류가 자동차 행·개수·집계 바이트를 바꾸지 못합니다.",
      {
        carRetry,
        before_sha256: sha256(canonical(before)),
        after_sha256: sha256(canonical(after)),
      },
      "readbacks/car-after.json",
    );
    const realSource = await f.post(0, "/v1/observations/batches", {
      ...batch,
      source_class: "REAL",
    });
    const foreignConfig = {
      ...h.gatewayConfig.consumer,
      consumer_id: "foreign",
      store: { ...f.config, namespace: "production-p12-isolation" },
    };
    const foreignStore = new IngestionStore(foreignConfig.store);
    h.stores.push(foreignStore);
    await foreignStore.initialize();
    const foreign = new PublicationConsumer(foreignConfig);
    h.stores.push(foreign);
    await foreign.initialize();
    const refused = await foreign.accept(
        publication.jws,
        Buffer.from(publication.artifact),
        f.now,
      ),
      foreignState = await foreign.inspectAccepted();
    h.write("readbacks/isolation.json", { realSource, refused, foreignState });
    check(
      "namespace-isolation",
      realSource.status === 403 &&
        (realSource.body as any).code === "SOURCE_NOT_ALLOWED" &&
        refused.code === "REJECTED" &&
        foreignState.active === null &&
        foreignState.high_water === 0,
      "Existing actual source and signed namespace guards refuse cross-scope contamination.",
      "기존 실제 출처·서명 영역 보호가 범위 간 혼입을 거부합니다.",
      { realSource, refused, foreignState },
      "readbacks/isolation.json",
    );
    h.publisherProxy.mode = "reset";
    await h.reconcile();
    const partition = await route(request("publisher-reset")),
      state = await h.consumers[2]!.inspectAccepted();
    h.write("readbacks/publisher-reset.json", {
      partition,
      state,
      events: h.publisherProxy.events,
    });
    check(
      "publisher-reset",
      partition.status === 200 &&
        partition.body.snapshot_id === publication.traffic_snapshot_id &&
        state.active?.manifest.sequence === publication.sequence &&
        h.publisherProxy.events.some(
          (e) => e.mode === "reset" && e.forwarded === false && !!e.reset_ms,
        ),
      "Publisher TCP interruption retains only the still-valid independently accepted snapshot.",
      "게시 TCP 중단에서도 아직 유효하고 독립 수용한 자료만 유지합니다.",
      { partition, state },
      "readbacks/publisher-reset.json",
    );
    await h.advance(420000);
    const expired = await route(request("partition-expiry")),
      expiryState = await h.consumers[2]!.inspectAccepted();
    h.write("readbacks/partition-expiry.json", { expired, expiryState });
    check(
      "partition-expiry",
      expired.status === 200 &&
        expired.body.snapshot_id === null &&
        expired.body.traffic_mode === "BASE_ONLY" &&
        expiryState.active === null,
      "Exact authoritative expiry removes accepted live traffic while publisher TCP remains interrupted.",
      "게시 TCP가 계속 끊겨 있어도 정확한 승인 시각 만료에 실시간 자료를 제거합니다.",
      { expired, expiryState },
      "readbacks/partition-expiry.json",
    );

    if (supervisors)
      for (const mode of ["abort", "failure"] as const) {
        const dir = join(output, "supervisors", mode),
          child = h.owner.spawn("p12-outer-" + mode, "scenario_supervisor", {
            graph_directory: f.graph.directory,
            output: dir,
          });
        const baseline = await child.message(
          (m) => m.type === "BASELINE" && m.kind === "scenario-supervisor",
          420000,
        );
        const identities = processTree(child.child!.pid!);
        h.write(`readbacks/supervisor-${mode}-before.json`, {
          baseline,
          identities,
        });
        if (mode === "abort") child.child!.kill("SIGTERM");
        else child.send({ type: "THROW_PARENT" });
        const exit = await child.exited(90000);
        const browserCleanup = JSON.parse(
            readFileSync(join(dir, "browser/cleanup.json"), "utf8"),
          ),
          nested = JSON.parse(
            readFileSync(join(dir, "client/cleanup.json"), "utf8"),
          ),
          outer = JSON.parse(
            readFileSync(join(dir, "outer/cleanup.json"), "utf8"),
          );
        const port = Number(new URL(String(baseline.origin)).port);
        const alive = identities.filter(identityAlive);
        const proof = {
          exit,
          browserCleanup,
          nested,
          outer,
          remaining: alive,
          port_closed: !(await portIsOpen(port)),
        };
        h.write(`readbacks/supervisor-${mode}-after.json`, proof);
        check(
          "supervisor-" + mode,
          exit.code !== 0 &&
            exit.signal === null &&
            browserCleanup.cleanup_verified &&
            nested.cleanup_verified &&
            outer.cleanup_verified &&
            alive.length === 0 &&
            proof.port_closed,
          "An actual outer supervisor stops its live browser/native client after baseline and preserves fault diagnostics.",
          "실제 상위 감독자가 기본 경로 뒤 살아 있는 브라우저·엔진 클라이언트를 종료하고 장애 진단을 보존합니다.",
          proof,
          `readbacks/supervisor-${mode}-after.json`,
        );
      }
  } catch (error) {
    failure = error;
  } finally {
    cleanup = await h.close();
  }
  if (failure || !cleanup) {
    h.write("failure.json", {
      status: "FAIL",
      error: String(failure ?? "Cleanup incomplete"),
      cleanup_verified: cleanup,
    });
    throw failure ?? Error("Scenario cleanup failed / 시나리오 정리 실패");
  }
  if (prior) {
    if (!supervisors || prior.assertions.length !== 334)
      throw Error("Whole prior334 required / 같은 실행 기존334개 필요");
    const combined = persistedScenarioAssertions([
      ...prior.assertions,
      ...assertions.map((a) => ({
        ...a,
        evidence_path: "scenarios/" + a.evidence_path,
      })),
    ]);
    h.write("runtime-manifest.json", {
      ...identity,
      status: "PASS",
      cleanup_verified: cleanup,
      assertions_sha256: sha256(
        canonical(persistedScenarioAssertions(assertions)),
      ),
    });
    h.write("matrix-inputs.json", { ...identity, assertions: combined });
    const matrix = buildScenarioMatrix(prior.root, identity, combined);
    h.write("matrix.json", matrix);
    verifyScenarioMatrix(prior.root, identity, combined, matrix);
    check(
      "same-run-matrix",
      matrix.rows.length === 15,
      "All fifteen scenarios bind exact same-run originals and assertions.",
      "15개 시나리오 모두 같은 실행의 정확한 원문·판정에 연결합니다.",
      matrix.rows.map((r) => r.scenario_id),
      "matrix.json",
    );
    const missing = structuredClone(matrix);
    missing.rows.splice(0, 1);
    h.write("negative-matrix-missing.json", {
      negative_fixture: true,
      matrix: missing,
    });
    let rejected = false;
    try {
      verifyScenarioMatrix(prior.root, identity, combined, missing);
    } catch {
      rejected = true;
    }
    check(
      "matrix-missing-rejected",
      rejected,
      "A copied matrix missing a required scenario fails closed.",
      "필수 시나리오가 빠진 행렬 복사본을 거부합니다.",
      rejected,
      "negative-matrix-missing.json",
    );
    const forged = structuredClone(matrix);
    forged.rows[0]!.references[0]!.evidence_sha256 = "0".repeat(64);
    h.write("negative-matrix-forged.json", {
      negative_fixture: true,
      matrix: forged,
    });
    rejected = false;
    try {
      verifyScenarioMatrix(prior.root, identity, combined, forged);
    } catch {
      rejected = true;
    }
    check(
      "matrix-forged-success-rejected",
      rejected,
      "A copied success claim with forged original bytes fails closed.",
      "원문 바이트 해시를 위조한 성공 주장 복사본을 거부합니다.",
      rejected,
      "negative-matrix-forged.json",
    );
  }
  check(
    "owned-cleanup",
    cleanup,
    "All owned scenario processes, engines, database volume, proxy sockets and ports are closed.",
    "소유 시나리오 프로세스·엔진·DB볼륨·대리 소켓·포트를 정리했습니다.",
    cleanup,
    "cleanup.json",
  );
  if (prior) requireScenarioCases(assertions);
  if (
    implementationFingerprint() !== fingerprint ||
    !canonical(sourceIdentity()).equals(canonical(identity.source))
  )
    throw Error("Scenario source changed / 시나리오 소스 변경");
  h.write("assertions.json", assertions);
  const report: ScenarioReport = {
    assertions_passed: assertions.filter((a) => a.status === "PASS").length,
    assertions_total: assertions.length,
    cleanup_verified: cleanup,
    cases: assertions.map((a) => ({
      case_id: a.assertion_id,
      status: a.status,
      message_en: a.message_en,
      message_ko: a.message_ko,
      evidence_path: a.evidence_path,
    })),
    matrix_path: prior ? "matrix.json" : null,
    screenshots: supervisors
      ? ["abort", "failure"].map((mode) => ({
          label_en: "Live baseline before supervisor " + mode,
          label_ko: "감독 " + mode + " 전 실제 기본 경로",
          path: `supervisors/${mode}/screenshots/baseline.png`,
        }))
      : [],
  };
  h.write("report.json", report);
  h.write("manifest.json", {
    schema_version: "0.1",
    ...identity,
    graph_manifest_sha256: h.source.graph.manifestSha256,
    status: prior ? "PASS" : "DEVELOPMENT_ONLY",
    cleanup_verified: cleanup,
    output_sha256: evidenceHashes(output),
    message_en:
      "Development-only runs without prior334 are not full P12 acceptance.",
    message_ko: "기존334개 없는 개발 실행은 P12 전체 통과가 아닙니다.",
  });
  return { scenarios: report, assertions };
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.length === 1 && args[0] === "--help") {
      process.stdout.write(
        "scenario:check --graph VERIFIED_GRAPH --output NEW_DIRECTORY [--runtime-only]\nDevelopment-only faults; simulation:check assembles full same-run acceptance.\n개발 장애 검사이며 같은 실행 전체 통과는 simulation:check로 구성합니다.\n",
      );
      return 0;
    }
    let graph = "",
      output = "",
      runtimeOnly = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--runtime-only" && !runtimeOnly) runtimeOnly = true;
      else if ((a === "--graph" && !graph) || (a === "--output" && !output)) {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw Error();
        if (a === "--graph") graph = value;
        else output = value;
      } else throw Error();
    }
    if (!graph || !output) throw Error();
    const result = await runScenarioChecks(
      resolve(graph),
      resolve(output),
      undefined,
      !runtimeOnly,
    );
    process.stdout.write(
      `Development checks / 개발 검사: ${result.assertions.length}; full P12 not claimed / P12 전체 통과 아님\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      "Scenario check failed; graph and new output required / 시나리오 검사 실패·지도와 새 출력 경로 필요: " +
        String(error) +
        "\n",
    );
    return 1;
  }
}
if (isMain(import.meta.url))
  void main().then((code) => {
    process.exitCode = code;
  });
