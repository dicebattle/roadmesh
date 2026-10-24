import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { verifyRegionalChild, main } from "../tools/seoul_checks.js";
import { sha256 } from "../tools/shared.js";
import { temporary, captured } from "./helpers.js";
test("regional manifest binds source, graph and files without source cache path / 지역 목록의 출처·그래프·파일 연결과 캐시경로 독립", (t) => {
  const root = temporary(t),
    directory = join(root, "graph");
  mkdirSync(directory);
  writeFileSync(join(directory, "proof.json"), "{}");
  const source = { commit: "a".repeat(40), dirty: false };
  const manifest = {
    status: "PASS",
    source,
    graph_id: "actual-graph",
    files_sha256: {
      "proof.json": sha256(readFileSync(join(directory, "proof.json"))),
    },
  };
  const save = () =>
    writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest));
  save();
  verifyRegionalChild(directory, source, "actual-graph");
  assert.throws(() =>
    verifyRegionalChild(directory, { ...source, dirty: true }, "actual-graph"),
  );
  assert.throws(() => verifyRegionalChild(directory, source, "other-graph"));
  writeFileSync(join(directory, "proof.json"), "changed");
  assert.throws(() => verifyRegionalChild(directory, source, "actual-graph"));
});
test("regional child refuses missing hashes and symlink evidence / 지역 하위 실행의 해시 누락·심볼릭 링크 거부", (t) => {
  const root = temporary(t),
    source = { commit: "a".repeat(40), dirty: false };
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({ status: "PASS", source, output_sha256: {} }),
  );
  assert.throws(() => verifyRegionalChild(root, source));
  const outside = join(root, "outside");
  writeFileSync(outside, "data");
  symlinkSync(outside, join(root, "link"));
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({
      status: "PASS",
      source,
      output_sha256: { link: sha256(Buffer.from("data")) },
    }),
  );
  assert.throws(() => verifyRegionalChild(root, source));
});
test("whole-system CLI retains new-only output and source option help / 전체 실행의 새 출력과 원본 선택 도움말", (t) => {
  const out = captured();
  assert.equal(main(["--help"], out.io), 0);
  assert.match(out.output[0]!, /--source/);
  assert.equal(main(["--source", "--output"], captured().io), 2);
  const root = temporary(t);
  writeFileSync(join(root, "keep"), "preserved");
  assert.equal(main(["--output", root], captured().io), 2);
  assert.equal(readFileSync(join(root, "keep"), "utf8"), "preserved");
});
