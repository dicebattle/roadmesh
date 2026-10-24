import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { IngestionStore } from "./ingestion_store.js";
import {
  IngestionError,
  type ServiceConfig,
  type ParentMessage,
  type Principal,
} from "./ingestion_types.js";
import { utc, issue, principalValid } from "./ingestion_validation.js";
import { privateConfig, notify, barrier } from "./ingestion_ipc.js";
import { parseJson, isMain } from "./shared.js";
const response = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
};
export function readBoundedBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      req.off("data", data);
      req.off("end", end);
      req.off("error", error);
      req.off("aborted", aborted);
    };
    const error = () => {
      cleanup();
      reject(
        new IngestionError(
          400,
          "INVALID_JSON",
          "Request body was interrupted.",
          "요청 본문이 중단되었습니다.",
        ),
      );
    };
    const aborted = error;
    const data = (part: Buffer) => {
      size += part.length;
      if (size > 65536) {
        cleanup();
        req.resume();
        reject(
          new IngestionError(
            413,
            "PAYLOAD_TOO_LARGE",
            "Request exceeds 64 KiB.",
            "요청이 64 KiB를 초과합니다.",
          ),
        );
      } else chunks.push(part);
    };
    const end = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    req.on("data", data);
    req.once("end", end);
    req.once("error", error);
    req.once("aborted", aborted);
  });
}
export async function startService(
  config: ServiceConfig,
  suppliedStore?: Pick<
    IngestionStore,
    | "initialize"
    | "advanceEventTime"
    | "accept"
    | "inspect"
    | "revoke"
    | "close"
  >,
) {
  utc(config.event_time_utc);
  if (!Array.isArray(config.credentials) || !config.credentials.length)
    throw new Error("Credentials are required / 인증 정보가 필요합니다");
  const tokens = new Set<string>();
  for (const value of config.credentials) {
    principalValid(value.principal);
    if (
      typeof value.token !== "string" ||
      value.token.length < 32 ||
      tokens.has(value.token)
    )
      throw new Error(
        "Credential configuration is invalid / 인증 설정이 올바르지 않습니다",
      );
    tokens.add(value.token);
  }
  const store = suppliedStore ?? new IngestionStore(config.store);
  await store.initialize(config.credentials.map((value) => value.principal));
  let eventTime = await store.advanceEventTime(config.event_time_utc);
  const authenticate = (req: IncomingMessage): Principal => {
    const authorization = req.headers.authorization;
    if (!authorization || !/^Bearer [^\s]+$/.test(authorization))
      issue(
        401,
        "UNAUTHORIZED",
        "Bearer authorization is required.",
        "Bearer 인증이 필요합니다.",
      );
    const token = authorization.slice(7);
    const hashed = createHash("sha256").update(token).digest();
    const found = config.credentials.find((value) =>
      timingSafeEqual(
        hashed,
        createHash("sha256").update(value.token).digest(),
      ),
    );
    if (!found)
      issue(
        401,
        "UNAUTHORIZED",
        "Authorization is required.",
        "인증이 필요합니다.",
      );
    return found.principal;
  };
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const path = req.url ?? "";
        if (req.method === "GET" && path === "/health") {
          response(res, 200, {
            code: "READY",
            message_en: "Synthetic pilot service is ready.",
            message_ko: "합성 파일럿 서비스가 준비되었습니다.",
          });
          return;
        }
        const principal = authenticate(req);
        if (req.method === "POST" && path === "/v1/observations/batches") {
          const body = await readBoundedBody(req);
          let value: unknown;
          try {
            value = parseJson(body);
          } catch {
            issue(
              400,
              "INVALID_JSON",
              "Strict JSON is required.",
              "엄격한 JSON이 필요합니다.",
            );
          }
          const accepted = await store.accept(
            principal,
            value as never,
            eventTime,
          );
          await barrier("AFTER_ACCEPT_COMMIT", config.pause_at);
          response(res, 202, {
            ...accepted,
            message_en: "Batch is durably recorded.",
            message_ko: "배치가 영속적으로 기록되었습니다.",
          });
          return;
        }
        if (req.method === "POST" && path === "/v1/consent/revoke") {
          await store.revoke(principal, eventTime);
          response(res, 200, {
            code: "REVOKED",
            message_en: "Consent revoked and pilot data removed.",
            message_ko: "동의가 철회되었고 파일럿 데이터가 삭제되었습니다.",
          });
          return;
        }
        if (
          req.method === "GET" &&
          /^\/v1\/trips\/[a-z0-9][a-z0-9_-]{0,79}$/.test(path)
        ) {
          const result = await store.inspect(
            principal,
            path.slice("/v1/trips/".length),
          );
          const trip = result.trips[0];
          if (!trip) {
            response(res, 404, {
              code: "NOT_FOUND",
              message_en: "Trip was not found.",
              message_ko: "여행을 찾을 수 없습니다.",
            });
            return;
          }
          response(res, 200, {
            trip_id: trip.trip_id,
            state: trip.state,
            sample_count: trip.sample_count,
            batch_count: trip.batch_count,
            traversal_count: trip.traversal_count,
            message_en: "Trip processing status.",
            message_ko: "여행 처리 상태입니다.",
          });
          return;
        }
        response(res, 404, {
          code: "NOT_FOUND",
          message_en: "Endpoint was not found.",
          message_ko: "요청 경로를 찾을 수 없습니다.",
        });
      } catch (error) {
        const safe =
          error instanceof IngestionError
            ? error
            : new IngestionError(
                503,
                "STORE_UNAVAILABLE",
                "Request did not complete.",
                "요청이 완료되지 않았습니다.",
              );
        response(res, safe.status, {
          code: safe.code,
          message_en: safe.message_en,
          message_ko: safe.message_ko,
        });
      }
    })();
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port ?? 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No listener / 수신 주소가 없습니다");
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    process.off("message", onMessage);
  };
  const onMessage = async (value: ParentMessage) => {
    if (value?.type === "EVENT_TIME") {
      try {
        if (utc(value.event_time_utc) < utc(eventTime)) throw new Error();
        eventTime = await store.advanceEventTime(value.event_time_utc);
        notify({ type: "EVENT_TIME_SET", event_time_utc: eventTime });
      } catch {
        process.stderr.write(
          "Event time update rejected / 이벤트 시각 변경이 거부되었습니다\n",
        );
      }
    } else if (value?.type === "CLOSE") void close();
  };
  process.on("message", onMessage);
  notify({ type: "READY", kind: "service", port: address.port });
  return { port: address.port, close };
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    await startService(privateConfig<ServiceConfig>(args));
    return 0;
  } catch {
    process.stderr.write(
      "Synthetic ingestion service could not start / 합성 수집 서비스를 시작하지 못했습니다\n",
    );
    return 2;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
