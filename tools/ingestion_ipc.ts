import { lstatSync, readFileSync } from "node:fs";
import { parseJson } from "./shared.js";
import type { Phase, ParentMessage, ChildMessage } from "./ingestion_types.js";
export function privateConfig<T>(args: string[]): T {
  if (args.length !== 2 || args[0] !== "--config")
    throw new Error(
      "Use --config PRIVATE_JSON / --config PRIVATE_JSON을 사용하세요",
    );
  const path = args[1]!;
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 65536)
    throw new Error(
      "Private configuration must be a bounded mode-0600 file / 비공개 설정은 0600 권한의 제한된 파일이어야 합니다",
    );
  return parseJson(readFileSync(path)) as T;
}
export function notify(message: ChildMessage): void {
  process.send?.(message);
}
export async function barrier(
  phase: Phase,
  selected: Phase | undefined,
): Promise<void> {
  if (phase !== selected) return;
  if (!process.send)
    throw new Error(
      "Private IPC is required for phase barriers / 단계 대기에는 비공개 IPC가 필요합니다",
    );
  await new Promise<void>((resolve, reject) => {
    const listener = (value: ParentMessage) => {
      if (value?.type === "RESUME" && value.phase === phase) {
        cleanup();
        resolve();
      }
    };
    const disconnected = () => {
      cleanup();
      reject(new Error("Parent disconnected / 부모 연결이 끊겼습니다"));
    };
    const cleanup = () => {
      process.off("message", listener);
      process.off("disconnect", disconnected);
    };
    process.on("message", listener);
    process.once("disconnect", disconnected);
    notify({ type: "PHASE", phase, pid: process.pid });
  });
}
