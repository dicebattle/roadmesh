import { isMain } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import { runTrafficOperation } from "./traffic_controller.js";
import { trafficNotify, trafficBarrier } from "./traffic_runtime.js";
import type { TrafficWorkerConfig } from "./traffic_types.js";
/** Exit0 successful compile/route,1 rejected/unavailable,2 private input error.
 * 종료0 생성/경로 성공,1 거부/사용불가,2 비공개 입력 오류. */
export async function runTrafficWorker(
  config: TrafficWorkerConfig,
): Promise<number> {
  trafficNotify({ type: "READY", kind: "traffic", pid: process.pid });
  const result = await runTrafficOperation(config, {
    phase: (phase, detail) => trafficBarrier(phase, config.pause_at, detail),
  });
  trafficNotify({ type: "RESULT", ...result });
  return result.code === "READY" || result.code === "ROUTE" ? 0 : 1;
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    return await runTrafficWorker(privateConfig<TrafficWorkerConfig>(args));
  } catch {
    process.stderr.write(
      "Use --config PRIVATE_JSON for traffic operations / 교통정보 작업은 --config PRIVATE_JSON을 사용하세요\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
