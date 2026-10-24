import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, lstatSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { ROOT, isMain } from "./shared.js";
/** Hash runtime sources, including new files awaiting the final commit. */
export function implementationFingerprint(root = ROOT): string {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root },
  )
    .toString()
    .split("\0")
    .filter((p) =>
      /^(tools\/|fixtures\/|infra\/|web\/|package(?:-lock)?\.json$|tsconfig\.json$)/.test(
        p,
      ),
    );
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) {
    const full = resolve(root, path);
    if (lstatSync(full).isSymbolicLink())
      throw new Error(
        "Runtime symlink refused / 실행 소스 심볼릭 링크를 거부합니다",
      );
    const bytes = readFileSync(full);
    hash.update(path + "\0" + bytes.length + "\0").update(bytes);
  }
  return hash.digest("hex");
}
export interface MediaManifest {
  source_commit: string;
  implementation_sha256: string;
  report_path: string;
  report_sha256: string;
  capture_method: string;
  assets: { path: string; sha256: string }[];
}
export function checkMedia(
  root = ROOT,
  manifestPath = "docs/media/latest.json",
): void {
  const digest = (path: string) => {
    if (isAbsolute(path) || path.split(/[\\/]/).includes(".."))
      throw new Error("Unsafe media path / 안전하지 않은 미디어 경로");
    const full = realpathSync(resolve(root, path));
    const rel = relative(realpathSync(root), full);
    if (rel.startsWith("../") || rel === ".." || isAbsolute(rel))
      throw new Error("Media path escaped / 미디어 경로가 폴더 밖입니다");
    return createHash("sha256").update(readFileSync(full)).digest("hex");
  };
  const m = JSON.parse(
    readFileSync(resolve(root, manifestPath), "utf8"),
  ) as MediaManifest;
  if (
    !/^[a-f0-9]{40}$/.test(m.source_commit) ||
    !m.capture_method?.trim() ||
    !m.assets?.length
  )
    throw new Error("Incomplete media metadata / 미디어 정보가 불완전합니다");
  execFileSync("git", ["cat-file", "-e", m.source_commit + "^{commit}"], {
    cwd: root,
    stdio: "pipe",
  });
  if (m.implementation_sha256 !== implementationFingerprint(root))
    throw new Error(
      "Stale recording: implementation changed / 구현이 변경되어 녹화를 갱신해야 합니다",
    );
  if (
    !/^[a-f0-9]{64}$/.test(m.report_sha256) ||
    digest(m.report_path) !== m.report_sha256
  )
    throw new Error("Report hash mismatch / 보고서 해시 불일치");
  const html = readFileSync(resolve(root, m.report_path), "utf8");
  const embedded = html.match(
    /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!embedded)
    throw new Error("Missing report provenance / 보고서 출처 누락");
  const report = JSON.parse(embedded) as {
    source?: { commit?: string; dirty?: boolean };
    implementation_sha256?: string;
  };
  if (
    report.source?.commit !== m.source_commit ||
    report.source.dirty !== false ||
    report.implementation_sha256 !== m.implementation_sha256
  )
    throw new Error("Recording provenance mismatch / 녹화 출처 불일치");
  const required = [".mp4", ".gif", ".png"];
  for (const extension of required)
    if (!m.assets.some((asset) => asset.path.toLowerCase().endsWith(extension)))
      throw new Error(
        "Missing required MP4, GIF or PNG / 필수 MP4·GIF·PNG 자료 누락",
      );
  const videos = m.assets.filter((asset) =>
    asset.path.toLowerCase().endsWith(".mp4"),
  );
  const previews = m.assets.filter((asset) =>
    asset.path.toLowerCase().endsWith(".gif"),
  );
  for (const readme of ["README.md", "README.ko.md"]) {
    const text = readFileSync(resolve(root, readme), "utf8");
    const targets = [
      ...text.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g),
    ].map((match) => match[1]);
    for (const group of [videos, previews])
      if (
        !group.some(
          (asset) =>
            targets.includes(asset.path) || targets.includes("./" + asset.path),
        )
      )
        throw new Error(
          "README lacks current video or preview link / README에 현재 영상 또는 미리보기 링크가 없습니다",
        );
  }
  for (const asset of m.assets)
    if (
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      digest(asset.path) !== asset.sha256
    )
      throw new Error(
        "Missing or modified recording / 녹화 파일이 없거나 변경되었습니다",
      );
}
if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 2)
      throw new Error("Usage: media:check / 사용법: media:check");
    checkMedia();
    console.log(
      "PASS: recording fingerprint and hashes / 통과: 녹화 구현 지문·해시 일치",
    );
  } catch (error) {
    console.error(
      "FAIL: media evidence unavailable or invalid / 실패: 미디어 증거가 없거나 유효하지 않습니다\n" +
        String(error),
    );
    process.exitCode = 1;
  }
}
