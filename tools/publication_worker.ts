import { isMain } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import { PublicationStore } from "./publication_store.js";
import {
  publicationNotify,
  publicationBarrier,
} from "./publication_runtime.js";
import type { PublicationWorkerConfig } from "./publication_types.js";
export async function runPublicationWorker(
  config: PublicationWorkerConfig,
): Promise<number> {
  const store = new PublicationStore(config.publication);
  try {
    await store.verifyInitialized();
    publicationNotify({ type: "READY", kind: "publisher", pid: process.pid });
    const result = await store.publish(
      config.window_start,
      config.event_time_utc,
      config.signer,
      () => publicationBarrier("AFTER_PUBLICATION_WRITE", config.pause_at),
    );
    if (result.publication)
      await publicationBarrier("AFTER_PUBLICATION_COMMIT", config.pause_at);
    publicationNotify({
      type: "RESULT",
      code: result.code,
      sequence: result.publication?.sequence,
      traffic_snapshot_id: result.publication?.traffic_snapshot_id ?? null,
    });
    return result.publication ? 0 : 1;
  } catch {
    process.stderr.write(
      "Synthetic publication worker did not complete / 합성 게시 작업자가 처리를 완료하지 못했습니다\n",
    );
    return 1;
  } finally {
    await store.close();
  }
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    return await runPublicationWorker(
      privateConfig<PublicationWorkerConfig>(args),
    );
  } catch {
    process.stderr.write(
      "Use --config PRIVATE_JSON for the publication worker / 게시 작업자는 --config PRIVATE_JSON을 사용하세요\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
