import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import {
  renderSimulationReport,
  type SimulationReportData,
} from "../tools/simulation_report.js";
import { startReportServer } from "../tools/report_server.js";
import {
  checkMedia,
  implementationFingerprint,
} from "../tools/media_manifest.js";
const data: SimulationReportData = {
  schema_version: "0.1",
  source: { commit: "old-commit", dirty: true },
  graph_id: "graph-actual",
  generated_at_utc: "2026-01-01T00:00:00Z",
  implementation_sha256: "fingerprint",
  summary: {
    status: "PASS",
    assertions_passed: 1,
    assertions_total: 1,
    vehicle_count: 1,
    observation_count: 1,
    omission_count: 0,
    duration_ms: 1000,
  },
  roads: [
    {
      label: "AB",
      edge_id: "1",
      forward: true,
      car_access: true,
      coordinates: [
        [0, 0],
        [0.001, 0],
      ],
    },
  ],
  vehicles: [
    {
      vehicle_id: "v",
      truth: [{ offset_ms: 0, longitude: 0, latitude: 0, edge_id: "1" }],
      observations: [],
      omissions: [],
      traversals: [],
    },
  ],
  stages: [],
  assertions: [],
  limitations: [],
};
test("offline renderer preserves supplied provenance and escapes script termination / 입력 출처 보존과 스크립트 종료 문자 처리", () => {
  const input = structuredClone(data);
  input.graph_id = "</script><script>alert(1)</script>";
  const html = renderSimulationReport(input);
  assert(!html.includes(input.graph_id));
  assert(html.includes("\\u003c/script"));
  const raw = html.match(
    /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1]!;
  assert.deepEqual(JSON.parse(raw), input);
  assert(html.includes("prefers-reduced-motion"));
  assert(html.includes("data-ko"));
  assert.throws(
    () => renderSimulationReport({} as SimulationReportData),
    /Missing report/,
  );
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1]!);
});
test("server serves loopback files and rejects traversal or symlink escapes / 로컬 파일 제공과 경로 탈출·심볼릭 링크 거부", async () => {
  const root = mkdtempSync(join(tmpdir(), "routelens-report-"));
  const outside = mkdtempSync(join(tmpdir(), "routelens-outside-"));
  writeFileSync(join(root, "index.html"), "report");
  writeFileSync(join(outside, "secret"), "private");
  symlinkSync(join(outside, "secret"), join(root, "escape"));
  const server = startReportServer(root, { timeoutMs: 5000 });
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port;
    assert.equal(await (await fetch(url)).text(), "report");
    assert.equal((await fetch(url + "/escape")).status, 404);
    assert.equal((await fetch(url + "/%2e%2e%2fsecret")).status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
test("missing media is a failure rather than an empty pass / 미디어 누락 시 통과하지 않고 실패", () => {
  const root = mkdtempSync(join(tmpdir(), "routelens-media-"));
  try {
    assert.throws(() => checkMedia(root), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("media gate rejects changed source, asset, report and commit reference / 소스·자산·보고서·커밋 참조 변경 거부", () => {
  const root = mkdtempSync(join(tmpdir(), "routelens-manifest-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root }).toString().trim();
  const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.invalid"]);
    writeFileSync(join(root, "package.json"), "{}");
    git(["add", "."]);
    git(["commit", "-qm", "fixture"]);
    const commit = git(["rev-parse", "HEAD"]);
    const fingerprint = implementationFingerprint(root);
    const report = renderSimulationReport({
      ...data,
      source: { commit, dirty: false },
      implementation_sha256: fingerprint,
    });
    writeFileSync(join(root, "report.html"), report);
    writeFileSync(join(root, "video.mp4"), "test bytes, not a recording");
    writeFileSync(join(root, "preview.gif"), "preview");
    writeFileSync(join(root, "screen.png"), "screen");
    for (const name of ["README.md", "README.ko.md"])
      writeFileSync(
        join(root, name),
        "[Video](video.mp4) ![Preview](preview.gif)",
      );
    const manifest = {
      source_commit: commit,
      implementation_sha256: fingerprint,
      report_path: "report.html",
      report_sha256: hash(report),
      capture_method: "test fixture only",
      assets: [
        { path: "video.mp4", sha256: hash("test bytes, not a recording") },
        { path: "preview.gif", sha256: hash("preview") },
        { path: "screen.png", sha256: hash("screen") },
      ],
    };
    const save = () =>
      writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
    save();
    checkMedia(root, "manifest.json");
    const screenshot = manifest.assets.pop()!;
    save();
    assert.throws(
      () => checkMedia(root, "manifest.json"),
      /Missing required MP4/,
    );
    manifest.assets.push(screenshot);
    save();
    for (const readme of ["README.md", "README.ko.md"]) {
      writeFileSync(join(root, readme), "![Preview](preview.gif)");
      assert.throws(() => checkMedia(root, "manifest.json"), /README lacks/);
      writeFileSync(
        join(root, readme),
        "[Video](video.mp4) ![Preview](preview.gif)",
      );
    }
    writeFileSync(join(root, "package.json"), "changed");
    assert.throws(() => checkMedia(root, "manifest.json"), /Stale recording/);
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "video.mp4"), "modified");
    assert.throws(
      () => checkMedia(root, "manifest.json"),
      /modified recording/,
    );
    writeFileSync(join(root, "video.mp4"), "test bytes, not a recording");
    writeFileSync(join(root, "report.html"), report + "changed");
    assert.throws(() => checkMedia(root, "manifest.json"), /Report hash/);
    writeFileSync(join(root, "report.html"), report);
    const forged = report.replace(commit, "b".repeat(40));
    writeFileSync(join(root, "report.html"), forged);
    manifest.report_sha256 = hash(forged);
    save();
    assert.throws(
      () => checkMedia(root, "manifest.json"),
      /provenance mismatch/,
    );
    writeFileSync(join(root, "report.html"), report);
    manifest.report_sha256 = hash(report);
    manifest.source_commit = "a".repeat(40);
    save();
    assert.throws(() => checkMedia(root, "manifest.json"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("viewer focuses fixed vehicle truth bounds and offers full fixture extent / 고정된 차량 정답 범위와 전체 시험도로 전환", () => {
  const input = structuredClone(data);
  input.vehicles[0]!.truth.push({
    offset_ms: 1000,
    longitude: 0.001,
    latitude: 0.001,
    edge_id: "1",
  });
  input.roads.push({
    ...input.roads[0]!,
    label: "island",
    coordinates: [
      [0.012, 0.012],
      [0.013, 0.013],
    ],
  });
  const html = renderSimulationReport(input);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  new Function(script);
  const body = script.match(/function bounds\(\) \{([\s\S]*?)\n    \}/)![1]!;
  const bounds = new Function(
    "data",
    "$",
    "viewportWidth",
    "viewportHeight",
    body,
  );
  assert.equal(bounds(input, () => ({ checked: false }), 900, 560).maxX, 0.001);
  assert.equal(bounds(input, () => ({ checked: true }), 900, 560).maxX, 0.013);
  assert(html.includes('id="all-roads"'));
  assert(html.includes("index * 20"));
});

test("optional matching evidence preserves results and bilingual exclusion reasons / 선택 매칭 증거의 결과와 이중 언어 제외 사유 보존", () => {
  const input = structuredClone(data);
  input.matching = {
    policy_id: "tiny-city-matching-v1",
    input_samples: 2,
    matched_samples: 1,
    excluded_samples: 1,
    accepted_traversals: 0,
    excluded_traversals: 1,
    points: [
      {
        sample_id: "s:1",
        vehicle_id: "v",
        offset_ms: 0,
        longitude: 0,
        latitude: 0,
        edge_id: "1",
        status: "MATCHED",
        reason_codes: [],
      },
      {
        sample_id: "s:2",
        vehicle_id: "v",
        offset_ms: 1000,
        longitude: 0.001,
        latitude: 0,
        edge_id: null,
        status: "EXCLUDED",
        reason_codes: ["AMBIGUOUS_PARALLEL"],
      },
    ],
    traversals: [
      {
        traversal_id: "t:1",
        vehicle_id: "v",
        edge_id: "1",
        label: "AB",
        status: "EXCLUDED",
        entered_at_ms: 0,
        exited_at_ms: null,
        reason_codes: ["PARTIAL_EXIT", "OBSERVATION_GAP"],
      },
    ],
    cases: [
      {
        case_id: "midpoint",
        name_en: "Parallel midpoint",
        name_ko: "평행도로 중간점",
        status: "PASS",
        input_samples: 1,
        matched_samples: 0,
        excluded_samples: 1,
        accepted_traversals: 0,
        excluded_traversals: 0,
      },
    ],
  };
  const html = renderSimulationReport(input);
  const raw = html.match(
    /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
  )![1]!;
  assert.deepEqual(JSON.parse(raw).matching, input.matching);
  assert(html.includes('id="matched"'));
  assert(html.includes("P03 + P04"));
  assert(html.includes("Complete traversal accepted"));
  assert(html.includes("완전 통과 수용"));
  for (const code of [
    "AMBIGUOUS_PARALLEL",
    "PARTIAL_ENTRY",
    "PARTIAL_EXIT",
    "OBSERVATION_GAP",
    "DISCONTINUITY",
    "UNMATCHED",
    "DISTANCE_EXCEEDED",
    "INSUFFICIENT_POINTS",
  ])
    assert(html.includes(code));
  assert(html.includes("미등록 사유"));
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1]!);
  const legacy = renderSimulationReport(data);
  assert(legacy.includes("ROUTELENS / P03</div>"));
  assert(
    !JSON.parse(
      legacy.match(
        /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
      )![1]!,
    ).matching,
  );
});
