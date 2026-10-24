/** Current durable P07 authorization at each selection boundary / 모든 선택 경계에서 현재 영속 P07 승인. */
import { GraphError } from "./test_graph.js";
import { canonical } from "./shared.js";
import { PublicationConsumer } from "./publication_consumer.js";
import { PublicationError } from "./publication_crypto.js";
import {
  loadTrafficBundle,
  TrafficError,
  trafficReject,
} from "./traffic_bundle.js";
import {
  compileTrafficGeneration,
  verifyTrafficGeneration,
} from "./traffic_compiler.js";
import { runTrafficEngine, validateTrafficRequest } from "./traffic_runtime.js";
import type { AcceptedInspection } from "./publication_types.js";
import {
  COMPILER_POLICY,
  type TrafficBundle,
  type TrafficGeneration,
  type TrafficHooks,
  type TrafficProvenance,
  type TrafficResult,
  type TrafficWorkerConfig,
} from "./traffic_types.js";
function sameSelection(a: AcceptedInspection, b: AcceptedInspection): void {
  if (
    a.high_water !== b.high_water ||
    a.active?.manifest.traffic_snapshot_id !==
      b.active?.manifest.traffic_snapshot_id ||
    a.active?.manifest.valid_until !== b.active?.manifest.valid_until
  )
    trafficReject("ACCEPTED_STATE_CHANGED");
}
function provenance(
  bundle: TrafficBundle,
  generation: TrafficGeneration,
  state: AcceptedInspection,
): TrafficProvenance {
  const traffic_mode = state.active
    ? generation.live_edges.length
      ? "LIVE"
      : "NO_LIVE_COVERAGE"
    : "NO_USABLE_SNAPSHOT";
  const messages = {
    LIVE: [
      "Fresh accepted synthetic traffic is applied.",
      "현재 수용한 합성 교통정보를 적용했습니다.",
    ],
    NO_LIVE_COVERAGE: [
      "Accepted snapshot has no eligible live edges; default speeds are used.",
      "수용한 자료에 유효한 실시간 구간이 없어 기본 속도를 사용합니다.",
    ],
    NO_USABLE_SNAPSHOT: [
      "No usable accepted snapshot; default speeds are used.",
      "사용 가능한 수용 자료가 없어 기본 속도를 사용합니다.",
    ],
  } as const;
  return {
    graph_id: bundle.graph_id,
    high_water: state.high_water,
    sequence: generation.sequence,
    traffic_snapshot_id: generation.traffic_snapshot_id,
    compiler_policy: COMPILER_POLICY,
    generation_id: generation.generation_id,
    traffic_sha256: generation.traffic_sha256,
    traffic_byte_length: generation.traffic_byte_length,
    checked_at_event_time: state.checked_at_event_time,
    valid_until: generation.valid_until,
    traffic_mode,
    engine: { image_id: bundle.image_id, version: "3.9.1" },
    message_en: messages[traffic_mode][0],
    message_ko: messages[traffic_mode][1],
  };
}
export async function runTrafficOperation(
  config: TrafficWorkerConfig,
  hooks: TrafficHooks = {},
): Promise<TrafficResult> {
  let consumer: PublicationConsumer | undefined;
  try {
    if (config.operation !== "compile" && config.operation !== "route")
      trafficReject("INVALID_OPERATION");
    const bundle = loadTrafficBundle(
      config.bundle_directory,
      config.graph_directory,
    );
    if (
      bundle.graph_id !== config.expected_graph_id ||
      config.consumer.store.graph_id !== bundle.graph_id
    )
      trafficReject("GRAPH_MISMATCH");
    const catalog = config.consumer.catalogs.find(
      (c) => c.graph_id === bundle.graph_id,
    );
    if (
      !catalog ||
      !canonical(
        [...catalog.edges].sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
      ).equals(
        canonical(
          [...bundle.catalog].sort((a, b) =>
            a.edge_id.localeCompare(b.edge_id),
          ),
        ),
      )
    )
      trafficReject("CATALOG_MISMATCH");
    if (config.operation === "route")
      validateTrafficRequest(config.request, bundle.graph_id);
    consumer = new PublicationConsumer(config.consumer);
    const initial = await consumer.inspectAccepted();
    if (initial.active && initial.active.manifest.graph_id !== bundle.graph_id)
      trafficReject("GRAPH_MISMATCH");
    const generation = await compileTrafficGeneration(
      bundle,
      initial.active,
      config.generation_root,
      hooks,
    );
    await hooks.phase?.("AFTER_TRAFFIC_SELECTION");
    const selected = await consumer.inspectAccepted();
    sameSelection(initial, selected);
    // Re-open the bundle/cache after a controlled pause before any engine can read it.
    // 제어된 대기 뒤 엔진이 읽기 전에 묶음·캐시를 다시 검증합니다.
    loadTrafficBundle(config.bundle_directory, config.graph_directory);
    verifyTrafficGeneration(generation);
    if (config.operation === "compile")
      return {
        code: "READY",
        generation,
        provenance: provenance(bundle, generation, selected),
      };
    const engine_result = await runTrafficEngine(
      bundle,
      generation,
      config.request!,
      config.generation_root,
      {
        phase: async (phase, detail) => {
          await hooks.phase?.(phase, detail);
          if (phase === "AFTER_ENGINE_READY") {
            sameSelection(selected, await consumer!.inspectAccepted());
            loadTrafficBundle(config.bundle_directory, config.graph_directory);
            verifyTrafficGeneration(generation);
          }
        },
      },
    );
    const final = await consumer.inspectAccepted();
    sameSelection(selected, final);
    verifyTrafficGeneration(generation);
    const p = provenance(bundle, generation, final);
    return {
      code: "ROUTE",
      traffic_mode: p.traffic_mode,
      engine_result,
      provenance: p,
    };
  } catch (error) {
    return {
      code: config.operation === "compile" ? "REJECTED" : "UNAVAILABLE",
      reason:
        error instanceof TrafficError
          ? error.reason
          : error instanceof PublicationError
            ? error.code
            : error instanceof GraphError
              ? "ENGINE_UNAVAILABLE"
              : "TRAFFIC_OPERATION_FAILED",
      message_en:
        "Traffic operation is unavailable; no successful route is returned.",
      message_ko:
        "교통정보 작업을 사용할 수 없어 성공 경로를 반환하지 않습니다.",
    };
  } finally {
    await consumer?.close();
  }
}
