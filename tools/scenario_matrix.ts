/** Exact same-run scenario references, never historical PASS concatenation. / 과거 통과를 합치지 않는 같은 실행 시나리오 참조. */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { canonical, parseJson, sha256 } from "./shared.js";
import type { SimulationAssertion } from "./vehicle_simulator.js";
export interface ScenarioIdentity {
  source: { commit: string; dirty: boolean };
  implementation_sha256: string;
  graph_id: string;
}
/** Hash persisted JSON, including Date/Buffer.toJSON, rather than a memory-only prototype view.
 * 메모리 전용 프로토타입 표현 대신 Date/Buffer.toJSON을 포함한 저장 JSON 형태를 해시합니다. */
export function persistedScenarioAssertions(
  assertions: SimulationAssertion[],
): SimulationAssertion[] {
  return parseJson(JSON.stringify(assertions)) as SimulationAssertion[];
}
export const SCENARIO_BINDINGS = {
  S01: ["p09-baseline-same-daemon"],
  S02: ["p09-two-node-live-detour", "p06-live-independent-median"],
  S03: ["p06-count-0", "p06-count-1", "p06-count-4"],
  S04: [
    "tiny-p04-waiting-retained",
    "p06-mid-trip-activity-conflict",
    "p06-live-independent-median",
  ],
  S05: [
    "teheran-noise-accepted-precision",
    "teheran-gap-no-gap-bridging",
    "tiny-p04-parallel-excluded",
  ],
  S06: [
    "p05-concurrent-duplicates",
    "p05-filled-gap-and-final-lock",
    "p06-late-exact",
  ],
  S07: [
    "p05-recover-after_lease",
    "p05-recover-after_insert",
    "p06-aggregate-commit-retry",
  ],
  S08: ["p12-publisher-reset", "p12-partition-expiry"],
  S09: ["p07-bad-signature", "p07-old-sequence", "p07-wrong-graph"],
  S10: [
    "p09-obsolete-result-rejected",
    "p10-result-version-change",
    "p12-domain-version-change",
  ],
  S11: ["p12-transport-reset", "p12-transport-blackhole", "p10-both-down"],
  S12: [
    "p12-outside-coverage",
    "p12-no-path",
    "p12-no-suitable-road",
    "p12-excluded-node-not-selected",
    "p12-both-excluded",
  ],
  S13: [
    "p12-non-car-http",
    "p12-non-car-body-spoof",
    "p12-car-retry-preserved",
    "p12-namespace-isolation",
  ],
  S14: [
    "p05-pending-revoke-fenced",
    "p05-retention-no-revival",
    "p06-all-candidates-purged",
  ],
  S15: [
    "p12-supervisor-abort",
    "p12-supervisor-failure",
    "p11-owned-cleanup",
    "p11-browser-cleanup",
  ],
} as const;
export type ScenarioId = keyof typeof SCENARIO_BINDINGS;
export interface ScenarioMatrix extends ScenarioIdentity {
  schema_version: "p12-0.1";
  assertions_sha256: string;
  cleanup_verified: true;
  modules: Array<{ path: string; sha256: string }>;
  rows: Array<{
    scenario_id: ScenarioId;
    basis: "ACTUAL_SEOUL_WITH_EXPLICIT_TINY_REGRESSIONS";
    references: Array<{
      assertion_id: string;
      assertion_sha256: string;
      evidence_path: string;
      evidence_sha256: string;
    }>;
  }>;
  note_en: string;
  note_ko: string;
}
function fail(): never {
  throw Error(
    "Same-run scenario matrix rejected / 같은 실행 시나리오 행렬 거부",
  );
}
function safeEvidence(root: string, path: string): Buffer {
  if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) fail();
  const full = resolve(root, path),
    stat = lstatSync(full),
    rel = relative(realpathSync(root), realpathSync(full));
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    stat.size > 64 * 1024 * 1024
  )
    fail();
  return readFileSync(full);
}
export function buildScenarioMatrix(
  root: string,
  identity: ScenarioIdentity,
  assertions: SimulationAssertion[],
): ScenarioMatrix {
  assertions = persistedScenarioAssertions(assertions);
  const byId = new Map(assertions.map((a) => [a.assertion_id, a]));
  if (
    byId.size !== assertions.length ||
    assertions.some((a) => a.status !== "PASS")
  )
    fail();
  const modules = [
    "seoul",
    "ingestion",
    "aggregation",
    "publication",
    "traffic",
    "nodes",
    "gateway",
    "client",
  ]
    .map((p) => p + "/manifest.json")
    .concat("scenarios/runtime-manifest.json")
    .map((path) => {
      const bytes = safeEvidence(root, path),
        m = JSON.parse(bytes.toString());
      if (
        m.status !== "PASS" ||
        m.cleanup_verified !== true ||
        m.graph_id !== identity.graph_id ||
        m.implementation_sha256 !== identity.implementation_sha256 ||
        !canonical(m.source).equals(canonical(identity.source))
      )
        fail();
      return { path, sha256: sha256(bytes) };
    });
  const matrix: ScenarioMatrix = {
    ...structuredClone(identity),
    schema_version: "p12-0.1",
    assertions_sha256: sha256(canonical(assertions)),
    cleanup_verified: true,
    modules,
    rows: (
      Object.entries(SCENARIO_BINDINGS) as Array<
        [ScenarioId, readonly string[]]
      >
    ).map(([scenario_id, ids]) => ({
      scenario_id,
      basis: "ACTUAL_SEOUL_WITH_EXPLICIT_TINY_REGRESSIONS",
      references: ids.map((id) => {
        const a = byId.get(id);
        if (!a) fail();
        return {
          assertion_id: id,
          assertion_sha256: sha256(canonical(a)),
          evidence_path: a.evidence_path,
          evidence_sha256: sha256(safeEvidence(root, a.evidence_path)),
        };
      }),
    })),
    note_en:
      "The primary graph is actual Seoul OSM. Waiting and parallel-road checks explicitly include tiny synthetic regressions. Controlled local faults are not Internet loss measurements or real-road accuracy certification.",
    note_ko:
      "주요 지도는 실제 서울 OSM이며 대기·평행도로 검사는 작은 합성 회귀 자료를 명시적으로 포함합니다. 통제한 로컬 장애는 인터넷 손실률 측정이나 실제 도로 정확도 인증이 아닙니다.",
  };
  return matrix;
}
export function verifyScenarioMatrix(
  root: string,
  identity: ScenarioIdentity,
  assertions: SimulationAssertion[],
  matrix: unknown,
): void {
  const expected = buildScenarioMatrix(root, identity, assertions);
  if (!canonical(expected).equals(canonical(matrix))) fail();
}
