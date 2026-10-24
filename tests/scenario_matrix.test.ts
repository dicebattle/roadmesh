/** Authored copies exercise rejection; no actual scenario pass is claimed. / 작성한 복사본의 거부 검사이며 실제 시나리오 통과 주장이 아닙니다. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildScenarioMatrix,
  verifyScenarioMatrix,
  SCENARIO_BINDINGS,
  type ScenarioIdentity,
} from "../tools/scenario_matrix.js";
import {
  SCENARIO_CASE_IDS,
  requireScenarioCases,
} from "../tools/scenario_checks.js";
import type { SimulationAssertion } from "../tools/vehicle_simulator.js";
const identity: ScenarioIdentity = {
  source: { commit: "a".repeat(40), dirty: false },
  implementation_sha256: "b".repeat(64),
  graph_id: "c".repeat(64),
};
test("Matrix rejects missing, duplicate, failed, changed, foreign and forged originals / 행렬은 누락·중복·실패·변경·다른 출처·위조 원문 거부", () => {
  const root = mkdtempSync(join(tmpdir(), "routelens-matrix-"));
  const ids = [...new Set(Object.values(SCENARIO_BINDINGS).flat())];
  const assertions: SimulationAssertion[] = ids.map((assertion_id) => ({
    assertion_id,
    status: "PASS",
    message_en: "Authored unit fixture",
    message_ko: "작성한 단위 자료",
    expected: true,
    actual: true,
    evidence_path: assertion_id + ".json",
  }));
  try {
    for (const a of assertions)
      writeFileSync(
        join(root, a.evidence_path),
        JSON.stringify({ authored_fixture: true, id: a.assertion_id }),
      );
    for (const dir of [
      "seoul",
      "ingestion",
      "aggregation",
      "publication",
      "traffic",
      "nodes",
      "gateway",
      "client",
      "scenarios",
    ]) {
      mkdirSync(join(root, dir));
      writeFileSync(
        join(
          root,
          dir,
          dir === "scenarios" ? "runtime-manifest.json" : "manifest.json",
        ),
        JSON.stringify({ ...identity, status: "PASS", cleanup_verified: true }),
      );
    }
    const matrix = buildScenarioMatrix(root, identity, assertions);
    verifyScenarioMatrix(root, identity, assertions, matrix);
    assert.equal(matrix.rows.length, 15);
    for (const altered of [
      { ...matrix, rows: matrix.rows.slice(1) },
      { ...matrix, rows: [...matrix.rows, matrix.rows[0]] },
      { ...matrix, source: { ...identity.source, commit: "f".repeat(40) } },
      { ...matrix, graph_id: "f".repeat(64) },
      { ...matrix, cleanup_verified: false },
      { ...matrix, implementation_sha256: "0".repeat(64) },
    ])
      assert.throws(() =>
        verifyScenarioMatrix(root, identity, assertions, altered),
      );
    assert.throws(() =>
      buildScenarioMatrix(root, identity, assertions.slice(1)),
    );
    assert.throws(() =>
      buildScenarioMatrix(root, identity, [...assertions, assertions[0]!]),
    );
    for (const status of ["FAIL", "SKIPPED"] as const)
      assert.throws(() =>
        buildScenarioMatrix(
          root,
          identity,
          assertions.map((a, i) =>
            i === 0 ? { ...a, status } : a,
          ) as SimulationAssertion[],
        ),
      );
    writeFileSync(join(root, assertions[0]!.evidence_path), "changed");
    assert.throws(() =>
      verifyScenarioMatrix(root, identity, assertions, matrix),
    );
    writeFileSync(
      join(root, "client/manifest.json"),
      JSON.stringify({
        ...identity,
        status: "PASS",
        cleanup_verified: true,
        source: { ...identity.source, commit: "0".repeat(40) },
      }),
    );
    assert.throws(() => buildScenarioMatrix(root, identity, assertions));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("P12 retains exactly24 mandatory original outcomes / P12 원 판정24개 정확히 유지", () => {
  const cases: SimulationAssertion[] = SCENARIO_CASE_IDS.map(
    (assertion_id) => ({
      assertion_id,
      status: "PASS",
      message_en: "Fixture",
      message_ko: "자료",
      expected: true,
      actual: true,
      evidence_path: "raw.json",
    }),
  );
  requireScenarioCases(cases);
  assert.throws(() => requireScenarioCases(cases.slice(1)));
  assert.throws(() => requireScenarioCases([...cases, cases[0]!]));
  assert.throws(() =>
    requireScenarioCases(
      cases.map((a, i) =>
        i === 0 ? { ...a, status: "SKIPPED" } : a,
      ) as SimulationAssertion[],
    ),
  );
});
