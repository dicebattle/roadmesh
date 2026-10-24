import { isMain } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import { AggregationStore } from "./aggregation_store.js";
import type {
  AggregationPhase,
  AggregationWorkerConfig,
  AggregationWorkerMessage,
} from "./aggregation_types.js";
function notify(value: AggregationWorkerMessage): void {
  process.send?.(value);
}
async function pause(
  phase: AggregationPhase,
  selected: AggregationPhase | undefined,
): Promise<void> {
  if (phase !== selected) return;
  if (!process.send)
    throw new Error(
      "Private parent IPC is required / 비공개 부모 통신이 필요합니다",
    );
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      process.off("message", message);
      process.off("disconnect", disconnect);
    };
    const message = (value: unknown) => {
      if (
        value &&
        typeof value === "object" &&
        "type" in value &&
        value.type === "RESUME" &&
        "phase" in value &&
        value.phase === phase
      ) {
        cleanup();
        resolve();
      }
    };
    const disconnect = () => {
      cleanup();
      reject(new Error("Parent disconnected / 부모 연결이 끊겼습니다"));
    };
    process.on("message", message);
    process.once("disconnect", disconnect);
    notify({ type: "PHASE", phase, pid: process.pid });
  });
}
export async function runAggregationWorker(
  config: AggregationWorkerConfig,
): Promise<number> {
  const store = new AggregationStore(config.aggregation);
  try {
    await store.verifyInitialized();
    notify({ type: "READY", kind: "aggregation", pid: process.pid });
    const result = await store.finalize(
      config.window_start,
      config.event_time_utc,
      () => pause("AFTER_AGGREGATE_WRITE", config.pause_at),
    );
    if (result.code === "FINALIZED")
      await pause("AFTER_AGGREGATE_COMMIT", config.pause_at);
    notify({
      type: "RESULT",
      code: result.code,
      canonical_sha256: result.canonical_sha256,
    });
    return 0;
  } catch {
    process.stderr.write(
      "Synthetic aggregation worker did not complete / 합성 집계 작업자가 처리를 완료하지 못했습니다\n",
    );
    return 1;
  } finally {
    await store.close();
  }
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    return await runAggregationWorker(
      privateConfig<AggregationWorkerConfig>(args),
    );
  } catch {
    process.stderr.write(
      "Use --config PRIVATE_JSON for the synthetic aggregation worker / 합성 집계 작업자는 --config PRIVATE_JSON을 사용하세요\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
