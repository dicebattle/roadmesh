import { isGuidanceLanguage } from "./guidance.js";
/** Owned real engine invocation and private phase barriers / 소유 실제 엔진 실행·비공개 단계 대기. */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson, sha256 } from "./shared.js";
import {
  GraphCommands,
  OwnedGraphContainer,
  engineJson,
} from "./test_graph.js";
import { verifyTrafficGeneration } from "./traffic_compiler.js";
import { boundedTrafficFile, trafficReject } from "./traffic_bundle.js";
import { nativeRouteRequest } from "./route_contract.js";
import type {
  TrafficBundle,
  TrafficGeneration,
  TrafficHooks,
  TrafficMessage,
  TrafficPhase,
  TrafficPhaseDetail,
  TrafficRouteRequest,
} from "./traffic_types.js";
export function trafficNotify(message: TrafficMessage): void {
  process.send?.(message);
}
export async function trafficBarrier(
  phase: TrafficPhase,
  selected: TrafficPhase | undefined,
  detail: TrafficPhaseDetail = {},
): Promise<void> {
  if (phase !== selected) return;
  if (!process.send) trafficReject("PRIVATE_IPC_REQUIRED");
  await new Promise<void>((done, reject) => {
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
        done();
      }
    };
    const disconnect = () => {
      cleanup();
      reject(new Error("Parent disconnected / 부모 연결이 끊겼습니다"));
    };
    process.on("message", message);
    process.once("disconnect", disconnect);
    trafficNotify({ type: "PHASE", phase, pid: process.pid, ...detail });
  });
}
export function validateTrafficRequest(
  request: TrafficRouteRequest | undefined,
  graphId: string,
): asserts request is TrafficRouteRequest {
  if (
    !request ||
    Object.keys(request).some(k => !["graph_id", "locations", "snap_policy", "guidance_language"].includes(k)) ||
    !["graph_id", "locations"].every(k => Object.hasOwn(request, k)) ||
    (Object.hasOwn(request, "guidance_language") && !isGuidanceLanguage(request.guidance_language)) ||
    (Object.hasOwn(request, "snap_policy") && request.snap_policy !== "nearest_road_100m") ||
    request.graph_id !== graphId ||
    !Array.isArray(request.locations) ||
    request.locations.length !== 2
  )
    trafficReject("INVALID_ROUTE_REQUEST");
  for (const point of request.locations) {
    if (
      !point ||
      Object.keys(point).sort().join(",") !== "lat,lon" ||
      !Number.isFinite(point.lon) ||
      !Number.isFinite(point.lat) ||
      Math.abs(point.lon) > 180 ||
      Math.abs(point.lat) > 90
    )
      trafficReject("INVALID_ROUTE_REQUEST");
  }
}
export interface TrafficEngineResult {
  request: unknown;
  route: unknown;
  trace: unknown;
}
export async function runTrafficEngine(
  bundle: TrafficBundle,
  generation: TrafficGeneration,
  request: TrafficRouteRequest,
  generationRoot: string,
  hooks: TrafficHooks = {},
): Promise<TrafficEngineResult> {
  validateTrafficRequest(request, bundle.graph_id);
  verifyTrafficGeneration(generation);
  const root = join(resolve(generationRoot), "runtime");
  mkdirSync(root, { recursive: true });
  const output = join(root, randomUUID());
  mkdirSync(output);
  const commands = new GraphCommands(output),
    container = new OwnedGraphContainer(commands);
  writeFileSync(
    join(output, "ownership.json"),
    JSON.stringify({
      container: container.name,
      run_id: container.runId,
      output,
      planned_before_creation: true,
    }) + "\n",
  );
  const stop = () => {
    try {
      container.cleanup();
    } finally {
      process.exit(130);
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let cleanup = false;
  try {
    const bytes = boundedTrafficFile(generation.traffic_path);
    if (sha256(bytes) !== generation.traffic_sha256)
      trafficReject("GENERATION_CONFLICT");
    writeFileSync(join(output, "traffic.tar"), bytes, { flag: "wx" });
    const config = parseJson(
      readFileSync(join(bundle.graph_directory, "config.json")),
    ) as {
      mjolnir: Record<string, unknown>;
    };
    Object.assign(config.mjolnir, {
      tile_dir: "/graph/tiles",
      tile_extract: "",
      traffic_extract: "/work/traffic.tar",
      admin: "/graph/no-admin.sqlite",
      timezone: "/graph/no-timezone.sqlite",
    });
    writeFileSync(
      join(output, "config.json"),
      JSON.stringify(config, null, 2) + "\n",
    );
    container.start(bundle.image_id, output, bundle.graph_directory, {
      memory: "4g",
    });
    await hooks.phase?.("AFTER_ENGINE_READY", {
      engine_container: container.name,
      engine_run_directory: output,
    });
    const version = container
      .exec(["valhalla_service", "--version"])
      .stdout.trim();
    if (version !== "3.9.1") trafficReject("ENGINE_IDENTITY");
    const native = nativeRouteRequest(request);
    writeFileSync(
      join(output, "route.request.json"),
      JSON.stringify(native, null, 2) + "\n",
    );
    const route = engineJson(
      container.exec(
        [
          "valhalla_service",
          "/work/config.json",
          "route",
          "/work/route.request.json",
        ],
        120000,
      ).stdout,
    ) as {
      trip?: {
        status?: number;
        summary?: {
          time?: number;
          length?: number;
          cost?: number;
        };
        legs?: Array<{
          shape?: string;
        }>;
      };
    };
    if (
      route.trip?.status !== 0 ||
      !route.trip.summary ||
      !Number.isFinite(route.trip.summary.time) ||
      !Number.isFinite(route.trip.summary.length) ||
      !Number.isFinite(route.trip.summary.cost) ||
      route.trip.legs?.length !== 1 ||
      !route.trip.legs[0]?.shape
    )
      trafficReject("INVALID_ENGINE_RESPONSE");
    writeFileSync(
      join(output, "route.response.json"),
      JSON.stringify(route, null, 2) + "\n",
    );
    const traceRequest = {
      encoded_polyline: route.trip.legs[0].shape,
      shape_match: "edge_walk",
      costing: "auto",
      date_time: { type: 0 },
      filters: {
        action: "include",
        attributes: ["edge.id", "edge.length", "edge.speed", "shape"],
      },
    };
    writeFileSync(
      join(output, "trace.request.json"),
      JSON.stringify(traceRequest, null, 2) + "\n",
    );
    const trace = engineJson(
      container.exec(
        [
          "valhalla_service",
          "/work/config.json",
          "trace_attributes",
          "/work/trace.request.json",
        ],
        120000,
      ).stdout,
    ) as {
      edges?: unknown[];
    };
    if (!Array.isArray(trace.edges) || !trace.edges.length)
      trafficReject("INVALID_ENGINE_RESPONSE");
    writeFileSync(
      join(output, "trace.response.json"),
      JSON.stringify(trace, null, 2) + "\n",
    );
    await hooks.phase?.("AFTER_ROUTE_RESULT");
    return { request: native, route, trace };
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    cleanup = container.cleanup();
    writeFileSync(
      join(output, "cleanup.json"),
      JSON.stringify({ cleanup_verified: cleanup }) + "\n",
    );
    if (!cleanup) trafficReject("ENGINE_CLEANUP");
  }
}
