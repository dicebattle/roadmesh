/** NAV-01 acceptance reuses the single owned P11 browser/native runtime.
 * NAV-01 통과 검사는 P11의 단일 소유 브라우저·엔진 실행을 재사용합니다. */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { canonical, sha256 } from "./shared.js";
import { decodeGatewayShape } from "./gateway_controller.js";
import { nativeRouteGuidance, type GuidanceLanguage } from "./guidance.js";
import { validateClientRoute } from "./client_server.js";
import { RouteClientState } from "../web/pilot/state.js";
import type { GatewaySuccess } from "./gateway_public_types.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
export const GUIDANCE_CASE_IDS = [
  "native-baseline-en", "native-baseline-ko", "native-traffic-en", "native-traffic-ko",
  "exact-native-binding", "legacy-wire", "unknown-locale", "missing-guidance", "wrong-locale",
  "invalid-index", "broken-continuity", "inconsistent-metrics", "unsafe-text",
  "language-reset", "input-clears", "mobile-readable",
].map(id => "nav01-" + id);
export function requireGuidanceCases(cases: SimulationAssertion[]): void {
  if (cases.length !== 16 || new Set(cases.map(c => c.assertion_id)).size !== 16 ||
      GUIDANCE_CASE_IDS.some(id => !cases.some(c => c.assertion_id === id && c.status === "PASS")))
    throw Error("NAV-01 required cases incomplete / NAV-01 필수 검사 미완료");
}
export class GuidanceChecks {
  readonly assertions: SimulationAssertion[] = [];
  private routes: GatewaySuccess[] = [];
  constructor(private readonly output: string) { mkdirSync(join(output, "guidance")); }
  check(id: string, passed: boolean, en: string, ko: string, actual: unknown): void {
    const assertion_id = "nav01-" + id, evidence_path = "guidance/" + id + ".json";
    if (!GUIDANCE_CASE_IDS.includes(assertion_id) || this.assertions.some(a => a.assertion_id === assertion_id))
      throw Error("Unexpected guidance case / 안내 검사 목록 오류");
    writeFileSync(join(this.output, evidence_path), JSON.stringify(actual, null, 2) + "\n", {flag:"wx"});
    this.assertions.push({ assertion_id, status: passed ? "PASS" : "FAIL", message_en: en, message_ko: ko,
      expected: true, actual: passed, evidence_path });
    if (!passed) throw Error(en + " / " + ko);
  }
  route(id: string, route: GatewaySuccess, language: GuidanceLanguage, traffic: boolean, displayed: string[]): void {
    validateClientRoute(route, route.graph_id, language);
    const instructions = route.guidance!.maneuvers.map(m => m.instruction);
    this.check(id, route.guidance!.language === language && (traffic ? route.snapshot_id !== null : route.snapshot_id === null) &&
      canonical(instructions).equals(canonical(displayed)) && (language !== "ko-KR" || instructions.some(s => /[가-힣]/u.test(s))),
      "Actual native route and ordered browser instructions use the requested locale: " + language,
      "실제 엔진 경로·브라우저 순서 안내의 요청 언어 확인: " + language,
      {route, displayed});
    this.routes.push(route);
  }
  finish(): SimulationAssertion[] {
    const requests = join(this.output, "fixture/gateway/runtime/requests"), originals: Array<any> = [];
    for (const route of this.routes) {
      const directory = readdirSync(requests).find(n => n.startsWith(route.request_id + "-"));
      assert.ok(directory, "Original gateway request missing / 중계 원요청 누락");
      const base = join(requests,directory), input = JSON.parse(readFileSync(join(base,"request.json"),"utf8"));
      assert.equal(sha256(canonical(input)),route.request_sha256);
      const attempts = JSON.parse(readFileSync(join(base,"attempts.json"),"utf8")) as any[];
      const selected = attempts.find(a => a.outcome === "VALIDATED" && a.node_id === route.node_id);
      assert.ok(selected, "Validated native attempt missing / 검증한 엔진 시도 누락");
      const raw = selected.body.engine_result, trip = raw.route.trip;
      assert.equal(raw.request.language, route.guidance!.language);
      assert.deepEqual(decodeGatewayShape(trip.legs[0].shape), route.geometry.coordinates);
      assert.deepEqual(route.guidance!.maneuvers, trip.legs[0].maneuvers.map((m:any,index:number) => ({
        index, native_type:m.type, instruction:m.instruction, distance_m:m.length*1000, duration_s:m.time,
        begin_shape_index:m.begin_shape_index, end_shape_index:m.end_shape_index,
      })));
      // Find the actual retained daemon original, not only the gateway's copy.
      // 중계 복사본뿐 아니라 실제 데몬 원본까지 찾아 대조합니다.
      const nodes = join(this.output,"fixture/nodes",route.node_id), wanted = sha256(canonical(raw.route));
      const nativeFiles = readdirSync(nodes,{recursive:true,withFileTypes:true})
        .filter(e=>e.isFile() && e.name === "route.response.json")
        .map(e=>join(e.parentPath,e.name));
      const native = nativeFiles.find(p=>sha256(canonical(JSON.parse(readFileSync(p,"utf8"))))===wanted);
      assert.ok(native,"Native daemon original missing / 엔진 데몬 원본 누락");
      originals.push({request_id:route.request_id, request_sha256:route.request_sha256,
        native_route_path:native.slice(this.output.length+1), native_sha256:sha256(readFileSync(native)),
        geometry_vertices:route.geometry.coordinates.length, maneuver_count:route.guidance!.maneuvers.length,
        language:trip.language, distance_m:route.distance_m, duration_s:route.duration_s});
    }
    this.check("exact-native-binding", this.routes.length === 4, "Every published maneuver equals retained native originals on the exact geometry.",
      "공개 안내 전체를 정확한 지형·보존 엔진 원본과 대조했습니다.", originals);
    const route = this.routes[0]!, language=route.guidance!.language;
    for (const [id, mutate] of [
      ["missing-guidance", (r:any) => delete r.guidance],
      ["wrong-locale", (r:any) => r.guidance.language = "ko-KR"],
      ["invalid-index", (r:any) => r.guidance.maneuvers[0].end_shape_index = r.geometry.coordinates.length],
      ["broken-continuity", (r:any) => r.guidance.maneuvers[1].begin_shape_index = -1],
      ["inconsistent-metrics", (r:any) => r.guidance.maneuvers[0].duration_s += 10],
      ["unsafe-text", (r:any) => r.guidance.maneuvers[0].instruction = "<script>alert(1)</script>"],
    ] as const) {
      const malformed=structuredClone(route); mutate(malformed);
      let rejected=false; try {validateClientRoute(malformed,route.graph_id,language);} catch {rejected=true;}
      const state=new RouteClientState(), generation=state.begin(route.request_id);
      const browserRejected=!state.result(generation,route.request_id,malformed,language) && state.route===null;
      this.check(id,rejected && browserRejected,"Invalid same-run guidance is refused by both client boundaries: "+id,
        "같은 실행 안내 오류를 서버·브라우저 경계에서 거부: "+id,{malformed,server_rejected:rejected,browser_rejected:browserRejected});
    }
    requireGuidanceCases(this.assertions);
    writeFileSync(join(this.output,"guidance/assertions.json"), JSON.stringify(this.assertions,null,2)+"\n",{flag:"wx"});
    return this.assertions;
  }
}
