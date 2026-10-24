import {
  evaluateTraversals,
  verifyMatchingEvidence,
} from "../tools/matching_checks.js";
import { evidenceHashes } from "../tools/map_matcher.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildReportData,
  IntegrationFailure,
  main,
  runChecks,
  verifySimulationManifest,
} from "../tools/simulation_checks.js";
import { canonical, sha256 } from "../tools/shared.js";
import {
  generateSimulation,
  type SimulationSpec,
} from "../tools/vehicle_simulator.js";
import { type GraphBundle } from "../tools/graph_bundle.js";
import type { GraphFixture, EdgeMapping } from "../tools/graph_evidence.js";
import { captured, fixture, temporary } from "./helpers.js";

test("report data reflects actual generated values and simulation duration / 보고 자료의 실제 생성값·시뮬레이션 시간", () => {
  const bundle: GraphBundle = {
    directory: "unit-only",
    graphId: "unit-graph",
    manifest: {},
    manifestSha256: "unit-hash",
    fixture: fixture<GraphFixture>("fixtures/graph/tiny-city.json"),
    edges: fixture<{ edge_map: EdgeMapping[] }>(
      "fixtures/graph/engine-reference.json",
    ).edge_map,
  };
  const spec = fixture<SimulationSpec>("fixtures/simulation/demo.json");
  spec.graph_id = bundle.graphId;
  const result = generateSimulation(spec, bundle);
  const report = buildReportData(
    { commit: "a".repeat(40), dirty: true },
    bundle,
    spec,
    result.truth,
    result.observations,
    result.omissions,
    [],
    result.assertions,
    "b".repeat(64),
  );
  assert.equal(report.summary.duration_ms, 120000);
  assert.equal(report.summary.vehicle_count, 3);
  assert.equal(report.summary.observation_count, 177);
  assert.equal(report.summary.omission_count, 10);
  assert.equal(report.roads.length, 11);
  assert.ok(report.roads.every((road) => road.forward));
  assert.equal(
    report.vehicles.reduce((sum, vehicle) => sum + vehicle.truth.length, 0),
    187,
  );
  assert.ok(
    report.limitations.some((item) => item.message_en.includes("P12/P14b")),
  );
});
test("fresh failed stage cannot reuse a saved PASS or write completion / 새 단계 실패가 과거 성공을 재사용하지 않음", (t) => {
  const directory = temporary(t),
    output = join(directory, "integration"),
    calls: string[] = [];
  assert.throws(
    () =>
      runChecks(output, (script) => {
        calls.push(script);
        return {
          status: 9,
          stdout: '{"status":"PASS"}',
          stderr: "deliberate failure",
        };
      }),
    IntegrationFailure,
  );
  assert.deepEqual(calls, ["evaluation_corpus"]);
  assert.throws(() => readFileSync(join(output, "manifest.json")));
  assert.match(readFileSync(join(output, "summary.md"), "utf8"), /FAIL/);
  const commands = JSON.parse(
    readFileSync(join(output, "commands.json"), "utf8"),
  );
  assert.equal(commands[0].actual_exit, 9);
  assert.equal(commands[0].expected_exit, 0);
});
test("child manifest verifies source plus every raw and semantic hash / 하위 실행 소스·원본·의미 해시 검사", (t) => {
  const directory = temporary(t),
    source = { commit: "a".repeat(40), dirty: true },
    values: Record<string, unknown> = {
      "truth.json": { samples: [], traversals: [] },
      "observations.json": [],
      "omissions.json": [],
      "assertions.json": [],
      "summary.md": "unit-only",
    };
  const hashes: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    const raw = JSON.stringify(value);
    writeFileSync(join(directory, name), raw);
    hashes[name] = sha256(Buffer.from(raw));
  }
  const manifest = {
    source,
    output_sha256: hashes,
    truth_sha256: sha256(canonical(values["truth.json"])),
    observations_sha256: sha256(canonical([])),
    omissions_sha256: sha256(canonical([])),
  };
  verifySimulationManifest(directory, manifest, source);
  assert.throws(
    () =>
      verifySimulationManifest(directory, manifest, {
        ...source,
        dirty: false,
      }),
    IntegrationFailure,
  );
  writeFileSync(join(directory, "truth.json"), "tampered");
  assert.throws(
    () => verifySimulationManifest(directory, manifest, source),
    IntegrationFailure,
  );
});
test("integration refuses existing output and CLI help stays explicit / 통합 기존 출력 거부·명확한 도움말", (t) => {
  const existing = join(temporary(t), "existing");
  mkdirSync(existing);
  writeFileSync(join(existing, "keep"), "unchanged");
  let called = false;
  assert.throws(() =>
    runChecks(existing, () => {
      called = true;
      throw new Error("must not run");
    }),
  );
  assert.equal(called, false);
  assert.equal(readFileSync(join(existing, "keep"), "utf8"), "unchanged");
  assert.equal(main([], captured().io), 2);
  const help = captured();
  assert.equal(main(["--help"], help.io), 0);
  assert.match(help.output[0]!, /Fresh corpus.*새로 실행/);
});

test("P04 evaluation counts false and missed traversals and enforces timing / P04 잘못된·누락 통과와 시간 오차 검사", () => {
  const truth = {
    samples: [],
    traversals: [
      {
        vehicle_id: "v",
        edge_id: "1",
        label: "DE",
        forward: true,
        entered_at_ms: 1000,
        exited_at_ms: 2000,
        distance_m: 10,
      },
    ],
  };
  const traversal = {
    traversal_id: "t",
    vehicle_id: "v",
    edge_id: "1",
    label: "DE",
    forward: true,
    status: "ACCEPTED" as const,
    entered_at_ms: 1001,
    exited_at_ms: 2002,
    reason_codes: [],
    source_sample_ids: [],
    entry_bracket: null,
    exit_bracket: null,
    reason_messages: [],
  };
  const result = {
    policy_id: "p",
    matching_id: "m",
    graph_id: "g",
    input_samples: 2,
    matched_samples: 2,
    excluded_samples: 0,
    accepted_traversals: 1,
    excluded_traversals: 0,
    points: [],
    traversals: [traversal],
    semantic_sha256: "",
  };
  assert.equal(evaluateTraversals(result, truth, "v", 5).passed, true);
  assert.equal(
    evaluateTraversals(
      { ...result, traversals: [{ ...traversal, exited_at_ms: 2010 }] },
      truth,
      "v",
      5,
    ).passed,
    false,
  );
  const wrong = evaluateTraversals(
    { ...result, traversals: [{ ...traversal, edge_id: "wrong" }] },
    truth,
    "v",
    5,
  );
  assert.equal(wrong.false_traversals, 1);
  assert.equal(wrong.missed_traversals, 1);
  assert.equal(wrong.passed, false);
  assert.equal(
    evaluateTraversals(result, truth, "v", 750, ["EF"]).passed,
    false,
  );
});
test("P04 evidence verifier binds source, graph, raw files and result semantics / P04 출처·그래프·원본·결과 의미 연결 검사", (t) => {
  const root = temporary(t);
  const input = join(root, "envelope.json");
  writeFileSync(input, "{}");
  const directory = join(root, "matching");
  mkdirSync(directory);
  const source = { commit: "a".repeat(40), dirty: true };
  const graph = { graphId: "g", manifestSha256: "graph-hash" } as GraphBundle;
  const core = {
    policy_id: "p",
    matching_id: "m",
    graph_id: "g",
    input_samples: 0,
    matched_samples: 0,
    excluded_samples: 0,
    accepted_traversals: 0,
    excluded_traversals: 0,
    points: [],
    traversals: [],
  };
  const result = { ...core, semantic_sha256: sha256(canonical(core)) };
  for (const [name, value] of Object.entries({
    "input.json": {},
    "result.json": result,
    "assertions.json": [],
    "commands.json": [],
    "summary.md": "fixture",
  }))
    writeFileSync(join(directory, name), JSON.stringify(value));
  const manifest = {
    status: "PASS",
    cleanup_verified: true,
    graph_id: "g",
    graph_manifest_sha256: "graph-hash",
    source,
    input_sha256: sha256(readFileSync(input)),
    semantic_sha256: result.semantic_sha256,
    output_sha256: evidenceHashes(directory),
  };
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest));
  verifyMatchingEvidence(directory, input, graph, source, result);
  assert.throws(() =>
    verifyMatchingEvidence(
      directory,
      input,
      graph,
      { ...source, dirty: false },
      result,
    ),
  );
  assert.throws(() =>
    verifyMatchingEvidence(
      directory,
      input,
      { ...graph, graphId: "wrong" },
      source,
      result,
    ),
  );
  writeFileSync(join(directory, "commands.json"), "tampered");
  assert.throws(() =>
    verifyMatchingEvidence(directory, input, graph, source, result),
  );
});
