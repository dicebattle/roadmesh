import { isMain } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import { PublicationConsumer } from "./publication_consumer.js";
import {
  publicationNotify,
  publicationBarrier,
} from "./publication_runtime.js";
import type { ConsumerWorkerConfig } from "./publication_types.js";
export async function runConsumerWorker(
  config: ConsumerWorkerConfig,
): Promise<number> {
  const store = new PublicationConsumer(config.consumer);
  try {
    await store.verifyInitialized();
    publicationNotify({ type: "READY", kind: "consumer", pid: process.pid });
    const result = await store.pull(config.event_time_utc, () =>
      publicationBarrier("AFTER_CONSUMER_VERIFY", config.pause_at),
    );
    if (result.code !== "REJECTED")
      await publicationBarrier("AFTER_CONSUMER_COMMIT", config.pause_at);
    publicationNotify({ type: "RESULT", ...result });
    return result.code === "REJECTED" ? 1 : 0;
  } catch {
    process.stderr.write(
      "Synthetic consumer worker did not complete / 합성 수신 작업자가 처리를 완료하지 못했습니다\n",
    );
    return 1;
  } finally {
    await store.close();
  }
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    return await runConsumerWorker(privateConfig<ConsumerWorkerConfig>(args));
  } catch {
    process.stderr.write(
      "Use --config PRIVATE_JSON for the consumer worker / 수신 작업자는 --config PRIVATE_JSON을 사용하세요\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
