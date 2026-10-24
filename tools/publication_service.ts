import { createServer, type ServerResponse } from "node:http";
import { isMain } from "./shared.js";
import { privateConfig } from "./ingestion_ipc.js";
import { PublicationStore } from "./publication_store.js";
import { publicationNotify } from "./publication_runtime.js";
import type { PublicationServiceConfig } from "./publication_types.js";
const errorResponse = (
  res: ServerResponse,
  status: number,
  code: string,
  en: string,
  ko: string,
) => {
  const bytes = Buffer.from(
    JSON.stringify({ code, message_en: en, message_ko: ko }),
  );
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": bytes.length,
    "cache-control": "no-store",
    ...(status === 405 ? { allow: "GET" } : {}),
  });
  res.end(bytes);
};
export async function startPublicationService(
  config: PublicationServiceConfig,
  suppliedStore?: Pick<
    PublicationStore,
    "verifyInitialized" | "current" | "artifact" | "close"
  >,
) {
  const store = suppliedStore ?? new PublicationStore(config.publication);
  try {
    await store.verifyInitialized();
  } catch (error) {
    await store.close();
    throw error;
  }
  const server = createServer((req, res) => {
    void (async () => {
      try {
        if (req.method !== "GET") {
          errorResponse(
            res,
            405,
            "METHOD_NOT_ALLOWED",
            "Only GET is supported.",
            "GET 요청만 지원합니다.",
          );
          return;
        }
        const namespace = config.publication.aggregation.store.namespace,
          prefix = `/v1/simulations/${namespace}`,
          path = req.url ?? "";
        if (path === `${prefix}/regions/seoul-pilot-corridors-v1/current`) {
          const result = await store.current();
          if (result.code === "MISSING") {
            errorResponse(
              res,
              404,
              "CURRENT_MISSING",
              "Current publication was not found.",
              "현재 게시 자료를 찾을 수 없습니다.",
            );
            return;
          }
          if (result.code === "EXPIRED") {
            errorResponse(
              res,
              410,
              "CURRENT_EXPIRED",
              "Current publication expired.",
              "현재 게시 자료가 만료되었습니다.",
            );
            return;
          }
          if (!result.publication)
            throw new Error("Publication unavailable / 게시 자료가 없습니다");
          const bytes = Buffer.from(result.publication.jws);
          res.writeHead(200, {
            "content-type": "application/jose",
            "content-length": bytes.length,
            "cache-control": "no-store",
          });
          res.end(bytes);
          return;
        }
        const artifactPrefix = `${prefix}/artifacts/`;
        if (
          path.startsWith(artifactPrefix) &&
          /^[a-f0-9]{64}$/.test(path.slice(artifactPrefix.length))
        ) {
          const hash = path.slice(artifactPrefix.length),
            record = await store.artifact(hash);
          if (!record) {
            errorResponse(
              res,
              404,
              "ARTIFACT_MISSING",
              "Artifact was not found.",
              "내용 파일을 찾을 수 없습니다.",
            );
            return;
          }
          res.writeHead(200, {
            "content-type": "application/json",
            "content-length": record.artifact.length,
            "cache-control": "no-store",
            "x-content-sha256": record.traffic_snapshot_id,
            etag: `"${record.traffic_snapshot_id}"`,
          });
          res.end(Buffer.from(record.artifact));
          return;
        }
        errorResponse(
          res,
          404,
          "NOT_FOUND",
          "Endpoint was not found.",
          "요청 경로를 찾을 수 없습니다.",
        );
      } catch {
        errorResponse(
          res,
          503,
          "STORE_UNAVAILABLE",
          "Publication is unavailable.",
          "게시 자료를 사용할 수 없습니다.",
        );
      }
    })();
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port ?? 0, "127.0.0.1", resolve);
    });
  } catch {
    await store.close();
    throw new Error(
      "Publication service could not listen / 게시 서비스를 시작하지 못했습니다",
    );
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No loopback listener / 로컬 수신 주소가 없습니다");
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    process.off("message", message);
  };
  const message = (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "CLOSE"
    )
      void close();
  };
  process.on("message", message);
  publicationNotify({
    type: "READY",
    kind: "publication-service",
    pid: process.pid,
    port: address.port,
  });
  return { port: address.port, close };
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    await startPublicationService(
      privateConfig<PublicationServiceConfig>(args),
    );
    return 0;
  } catch {
    process.stderr.write(
      "Synthetic publication service could not start / 합성 게시 서비스를 시작하지 못했습니다\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
