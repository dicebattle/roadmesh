import type {
  PublicationPhase,
  PublicationMessage,
} from "./publication_types.js";
export function publicationNotify(message: PublicationMessage): void {
  process.send?.(message);
}
export async function publicationBarrier(
  phase: PublicationPhase,
  selected: PublicationPhase | undefined,
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
    publicationNotify({ type: "PHASE", phase, pid: process.pid });
  });
}
