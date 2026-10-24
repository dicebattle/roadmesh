import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { IngestionStore } from "./ingestion_store.js";
import type {
  WorkerConfig,
  CompletionInput,
  Claim,
} from "./ingestion_types.js";
import { utc } from "./ingestion_validation.js";
import { privateConfig, notify, barrier } from "./ingestion_ipc.js";
import { isMain, parseJson } from "./shared.js";
import { loadSeoulGraph } from "./seoul_bundle.js";
import { runSeoulMatching } from "./seoul_simulation.js";
import { geodesicSphere } from "./geodesy.js";
import type { EdgeMapping } from "./graph_evidence.js";
import type { MatchingResult } from "./matching_evidence.js";
export function contributionInput(
  claim: Claim,
  result: MatchingResult,
  edges: EdgeMapping[],
): CompletionInput {
  if (
    result.policy_id !== claim.matching_policy ||
    result.graph_id !== claim.graph_id ||
    result.matching_id !== claim.matching_id
  )
    throw new Error(
      "Pinned matching identity differs / 고정 매칭 식별자가 다릅니다",
    );
  const epoch = utc(claim.trip_start_utc);
  return {
    semantic_sha256: result.semantic_sha256,
    matched_samples: result.matched_samples,
    excluded_samples: result.excluded_samples,
    accepted: result.traversals.flatMap((value, occurrence) => {
      if (value.status !== "ACCEPTED") return [];
      const edge = edges.find(
        (edge) =>
          edge.edge_id === value.edge_id && edge.forward === value.forward,
      );
      if (!edge || value.entered_at_ms === null || value.exited_at_ms === null)
        throw new Error(
          "Accepted traversal lacks engine geometry / 수용 통과의 엔진 지형이 없습니다",
        );
      return [
        {
          traversal_id: value.traversal_id,
          edge_id: value.edge_id,
          forward: value.forward,
          occurrence,
          entered_at_utc: new Date(epoch + value.entered_at_ms).toISOString(),
          exited_at_utc: new Date(epoch + value.exited_at_ms).toISOString(),
          distance_m: geodesicSphere.length(edge.directed_geometry),
          duration_s: (value.exited_at_ms - value.entered_at_ms) / 1000,
          source_class: "SYNTHETIC" as const,
        },
      ];
    }),
  };
}
export async function runWorker(config: WorkerConfig): Promise<number> {
  utc(config.event_time_utc);
  const owner = config.owner_id ?? `worker-${randomUUID()}`;
  const store = new IngestionStore(config.store);
  let claim: Claim | null = null;
  try {
    await store.initialize();
    notify({ type: "READY", kind: "worker", owner_id: owner });
    claim = await store.claim(owner, config.event_time_utc, config.lease_ms);
    if (!claim) {
      notify({ type: "RESULT", code: "IDLE" });
      return 0;
    }
    await barrier("AFTER_LEASE", config.pause_at);
    const bundle = loadSeoulGraph(config.graph_directory);
    if (bundle.graphId !== claim.graph_id)
      throw new Error("Graph pin differs / 그래프 고정값이 다릅니다");
    const outputRoot = resolve(config.output_root);
    if (!outputRoot.toLowerCase().includes("synthetic"))
      throw new Error(
        "Synthetic evidence output is required / 합성 증거 출력 경로가 필요합니다",
      );
    mkdirSync(outputRoot, { recursive: true });
    const output = join(
      outputRoot,
      `${claim.matching_id}-${claim.attempt}-${randomUUID()}`,
    );
    const result = runSeoulMatching(
      bundle,
      {
        schema_version: "0.1",
        matching_id: claim.matching_id,
        graph_id: claim.graph_id,
        observations: claim.observations,
      },
      output,
      "full",
      claim.matching_policy,
    );
    await barrier("AFTER_MATCH", config.pause_at);
    const edges = parseJson(
      readFileSync(join(output, "candidate-edges.json")),
    ) as EdgeMapping[];
    const input = contributionInput(claim, result, edges);
    const completed = await store.complete(
      claim,
      input,
      config.event_time_utc,
      () => barrier("AFTER_INSERT", config.pause_at),
    );
    notify({ type: "RESULT", ...completed });
    return completed.code === "SUCCEEDED" ? 0 : 1;
  } catch {
    if (claim) {
      const failed = await store
        .fail(claim, "MATCHING_FAILED", config.event_time_utc)
        .catch(() => ({ code: "STORE_UNAVAILABLE", attempt: claim!.attempt }));
      notify({ type: "RESULT", ...failed });
    }
    process.stderr.write(
      "Synthetic worker did not complete / 합성 작업자가 처리를 완료하지 못했습니다\n",
    );
    return 1;
  } finally {
    await store.close();
  }
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    return await runWorker(privateConfig<WorkerConfig>(args));
  } catch {
    process.stderr.write(
      "Use --config PRIVATE_JSON for the synthetic worker / 합성 작업자는 --config PRIVATE_JSON을 사용하세요\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
