/** Authored parser fixtures; real upstream outcomes remain separate. / 직접 작성한 파서 자료이며 실제 엔진 결과와 구분합니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nativeRouteRequest,
  readNativeRouteRejection,
} from "../tools/route_contract.js";
import { validateTrafficRequest } from "../tools/traffic_runtime.js";
import { validateGatewayRequest } from "../tools/gateway_controller.js";
import type { TrafficRouteRequest } from "../tools/traffic_types.js";

test("Native opt-in preserves legacy bytes and constrains both locations / 엔진 선택 정책은 기존 바이트를 보존하고 두 위치를 제한", () => {
  const r: TrafficRouteRequest = {
    graph_id: "a".repeat(64),
    locations: [
      { lon: 127.029, lat: 37.4984 },
      { lon: 127.049, lat: 37.5045 },
    ],
  };
  const legacy = {
    locations: r.locations,
    costing: "auto",
    units: "kilometers",
    language: "en-US",
    date_time: { type: 0 },
  };
  assert.equal(JSON.stringify(nativeRouteRequest(r)), JSON.stringify(legacy));
  const bounded = { ...r, snap_policy: "nearest_road_100m" as const };
  validateTrafficRequest(bounded, r.graph_id);
  assert.deepEqual(
    nativeRouteRequest(bounded).locations,
    r.locations.map((p) => ({
      ...p,
      search_cutoff: 100,
      minimum_reachability: 0,
    })),
  );
  for (const snap_policy of [undefined, null, "", "nearest", 100]) {
    assert.throws(() =>
      validateTrafficRequest({ ...r, snap_policy } as any, r.graph_id),
    );
    assert.throws(() =>
      validateGatewayRequest({
        schema_version: "0.1",
        request_id: "test",
        origin: { longitude: 127, latitude: 37.5 },
        destination: { longitude: 127, latitude: 37.5 },
        profile: "car",
        traffic_policy: "prefer_live",
        snap_policy,
      }),
    );
  }
});

test("Only bounded regular strict route400 errors170/171/442 become domain failures / 제한된 정상 파일의 엄격 경로400·170·171·442만 업무 오류", () => {
  const root = mkdtempSync(join(tmpdir(), "routelens-native-errors-")),
    path = join(root, "error.json");
  const error = (error_code: number) => ({
    error_code,
    error: "Private upstream text",
    status_code: 400,
    status: "Bad Request",
  });
  try {
    for (const code of [170, 171, 442]) {
      writeFileSync(path, JSON.stringify(error(code)));
      const parsed = readNativeRouteRejection(path, "400");
      assert.equal(parsed.native_code, code);
      assert.equal(
        parsed.reason,
        code === 171 ? "NO_SUITABLE_ROAD" : "NO_PATH",
      );
      assert.ok(!parsed.message.includes("Private"));
      for (const status of ["200", "404", "500", "400\n"])
        assert.throws(() => readNativeRouteRejection(path, status));
    }
    for (const raw of [
      JSON.stringify(error(441)),
      JSON.stringify(error(999)),
      JSON.stringify({ ...error(442), error_code: "442" }),
      JSON.stringify({ ...error(442), status_code: 500 }),
      JSON.stringify({ ...error(442), status: "Internal Server Error" }),
      '{"error_code":171,"error_code":442,"error":"x","status_code":400,"status":"Bad Request"}',
      '{"error_code":442,}',
      "{bad}",
      JSON.stringify({ ...error(442), extra: true }),
    ]) {
      writeFileSync(path, raw);
      assert.throws(() => readNativeRouteRejection(path, "400"));
    }
    writeFileSync(path, JSON.stringify(error(442)) + " ".repeat(65536));
    assert.throws(
      () => readNativeRouteRejection(path, "400"),
      /ENGINE_RESPONSE_LIMIT/,
    );
    writeFileSync(path, JSON.stringify(error(442)));
    symlinkSync(path, join(root, "link.json"));
    assert.throws(
      () => readNativeRouteRejection(join(root, "link.json"), "400"),
      /ENGINE_RESPONSE_LIMIT/,
    );
    assert.throws(
      () => readNativeRouteRejection(root, "400"),
      /ENGINE_RESPONSE_LIMIT/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
