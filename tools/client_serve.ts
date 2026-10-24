/** One local interactive pilot, bounded lifetime and private supervisor controls.
 * 로컬 대화형 파일럿 하나·제한된 수명·비공개 감독 제어. */
import { resolve } from "node:path";
import { ClientRuntime } from "./client_runtime.js";
import { privateConfig } from "./ingestion_ipc.js";
import { ROOT, isMain, identifier } from "./shared.js";
import type {
  ClientControl,
  ClientMessage,
  ClientRuntimeConfig,
} from "./client_types.js";
export async function serveClient(
  config: ClientRuntimeConfig,
): Promise<number> {
  const abort = new AbortController();
  let runtime: ClientRuntime | undefined;
  const send = (message: ClientMessage) => process.send?.(message);
  const stop = () => {
    abort.abort();
    void runtime?.close();
  };
  const control = (value: unknown) => {
    void (async () => {
      if (!value || typeof value !== "object") return;
      const m = value as ClientControl;
      try {
        identifier(m.control_id, "control_id");
        if (m.type === "SHUTDOWN") {
          send({
            type: "CONTROL_RESULT",
            control_id: m.control_id,
            code: "APPLIED",
          });
          stop();
          return;
        }
        const live = runtime;
        if (!live) throw Error("Pilot preparing / 파일럿 준비 중");
        let result: unknown;
        if (m.type === "ADVANCE") result = await live.advance(m.event_ms);
        else if (m.type === "PUBLISH")
          result =
            m.mode === "live"
              ? await live.publishLive()
              : m.mode === "correction"
                ? await live.publishCorrection()
                : (() => {
                    throw Error();
                  })();
        else if (m.type === "KILL_NODE")
          result = await live.nodeKill(m.node_id);
        else if (m.type === "RESTART_NODE")
          result = await live.restartNode(m.node_id);
        else if (m.type === "GATEWAY_CONTROL")
          result = await live.gatewayControl(
            m.message as Parameters<ClientRuntime["gatewayControl"]>[0],
          );
        else if (m.type === "NODE_CONTROL")
          result = await live.nodeControl(
            m.node_id,
            m.message as Parameters<ClientRuntime["nodeControl"]>[1],
          );
        else if (m.type === "CONTEXT") result = await live.context();
        else throw Error();
        send({
          type: "CONTROL_RESULT",
          control_id: m.control_id,
          code: "APPLIED",
          ...(result === undefined ? {} : { result }),
        });
      } catch {
        send({
          type: "CONTROL_RESULT",
          control_id: m.control_id ?? "invalid",
          code: "REJECTED",
          message_en: "Private pilot control was rejected.",
          message_ko: "비공개 파일럿 제어를 거부했습니다.",
        });
      }
    })();
  };
  process.on("message", control);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("disconnect", stop);
  try {
    runtime = await ClientRuntime.start(config, abort.signal);
    if (abort.signal.aborted) {
      await runtime.close();
      return 1;
    }
    send({
      type: "READY",
      kind: "route-client",
      pid: process.pid,
      origin: runtime.origin,
      graph_id: runtime.bootstrap.graph_id,
      clock_mode: config.clock_mode,
    });
    if (!process.send)
      process.stdout.write(
        `Local synthetic pilot / 로컬 합성 파일럿: ${runtime.origin}\nStops after15minutes /15분 뒤 종료합니다.\n`,
      );
    const clean = await runtime.ended;
    send({ type: "STOPPED", cleanup_verified: clean });
    return clean ? 0 : 1;
  } finally {
    process.off("message", control);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.off("disconnect", stop);
  }
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    let config: ClientRuntimeConfig;
    if (args[0] === "--config")
      config = privateConfig<ClientRuntimeConfig>(args);
    else {
      let graph = "",
        output = "";
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--graph" && !graph) graph = args[++i] ?? "";
        else if (args[i] === "--output" && !output) output = args[++i] ?? "";
        else throw Error();
      }
      if (!graph || !output) throw Error();
      config = {
        graph_directory: resolve(graph),
        output_directory: resolve(output),
        assets_directory: resolve(ROOT, "dist/web/pilot"),
        clock_mode: "automatic",
      };
    }
    return await serveClient(config);
  } catch {
    process.stderr.write(
      "Use pilot:serve -- --graph VERIFIED_GRAPH --output NEW_DIRECTORY / 검증 지도와 새 출력 폴더를 지정하세요\n",
    );
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
