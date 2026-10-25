/** Existing P08 byte checks run off the HTTP event loop / 기존 P08 바이트 검사는 HTTP 이벤트 루프 밖에서 실행합니다. */
import { parentPort, workerData } from "node:worker_threads";
import { loadTrafficBundle } from "./traffic_bundle.js";
import {
  compileTrafficGeneration,
  verifyTrafficGeneration,
} from "./traffic_compiler.js";
import type { TrafficGeneration, VerifiedTrafficInput } from "./traffic_types.js";
export interface GatewayCompilerPaths {
  bundle_directory: string;
  graph_directory: string;
  generation_root: string;
}
export type GatewayCompilerJob =
  | { id: number; operation: "load" }
  | { id: number; operation: "prepare"; input: VerifiedTrafficInput }
  | { id: number; operation: "verify"; generation: TrafficGeneration };
/** Structured clone turns Buffer into Uint8Array; preserve its exact view bytes.
 * 구조 복제가 Buffer를 Uint8Array로 바꾸므로 정확한 보기 바이트를 복원합니다. */
export function restoreCompilerInput(
  input: VerifiedTrafficInput,
): VerifiedTrafficInput {
  if (input === null) return null;
  if (!(input.artifact instanceof Uint8Array))
    throw Error("INVALID_ARTIFACT_BYTES");
  return { ...input, artifact: Buffer.from(input.artifact) };
}
async function execute(
  paths: GatewayCompilerPaths,
  job: GatewayCompilerJob,
): Promise<unknown> {
  if (job.operation === "verify") {
    verifyTrafficGeneration(job.generation);
    return null;
  }
  // No previously verified bundle or generation is used as authorization for a later job.
  // 이전 작업에서 검증한 묶음·세대를 다음 작업의 승인으로 재사용하지 않습니다.
  const bundle = loadTrafficBundle(
    paths.bundle_directory,
    paths.graph_directory,
  );
  if (job.operation === "load") return bundle;
  if (job.operation !== "prepare") throw Error("INVALID_COMPILER_OPERATION");
  return compileTrafficGeneration(
    bundle,
    restoreCompilerInput(job.input),
    paths.generation_root,
  );
}
if (parentPort && workerData?.role === "gateway-compiler") {
  const port = parentPort,
    paths = workerData as GatewayCompilerPaths;
  let serial = Promise.resolve();
  port.on("message", (job: GatewayCompilerJob) => {
    serial = serial.then(async () => {
      try {
        const result = await execute(paths, job);
        port.postMessage({ id: job.id, ok: true, result });
      } catch (error) {
        const e = error as { reason?: unknown; code?: unknown };
        const reason = String(e?.reason ?? e?.code ?? "COMPILER_JOB_FAILED");
        port.postMessage({
          id: job.id,
          ok: false,
          reason: /^[A-Z0-9_]{1,80}$/.test(reason)
            ? reason
            : "COMPILER_JOB_FAILED",
        });
      }
    });
  });
}
