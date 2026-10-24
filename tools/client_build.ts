/** Local-only browser assets / 외부 연결 없는 브라우저 자료. */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { ROOT, isMain, consoleIO, type ConsoleIO, sha256 } from "./shared.js";
export async function buildClientAssets(
  outputDirectory = resolve(ROOT, "dist/web/pilot"),
): Promise<string> {
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  await build({
    entryPoints: [resolve(ROOT, "web/pilot/main.ts")],
    outfile: join(output, "client.js"),
    bundle: true,
    platform: "browser",
    target: ["es2022"],
    format: "iife",
    legalComments: "inline",
    logLevel: "silent",
    metafile: true,
  });
  copyFileSync(
    resolve(ROOT, "web/pilot/index.html"),
    join(output, "index.html"),
  );
  copyFileSync(
    resolve(ROOT, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),
    join(output, "maplibre-worker.js"),
  );
  const files = ["index.html", "client.js", "client.css", "maplibre-worker.js"];
  writeFileSync(
    join(output, "build-manifest.json"),
    JSON.stringify(
      {
        schema_version: "0.1",
        message_en:
          "Bundled local frontend and map worker; no remote assets are required.",
        message_ko:
          "로컬 화면·지도 작업자를 묶었으며 외부 자료가 필요하지 않습니다.",
        files_sha256: Object.fromEntries(
          files.map((file) => [file, sha256(readFileSync(join(output, file)))]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  return output;
}
export async function main(
  args = process.argv.slice(2),
  io: ConsoleIO = consoleIO,
): Promise<number> {
  try {
    if (args.length)
      throw new Error(
        "No build arguments accepted / 빌드 인자를 받지 않습니다",
      );
    const output = await buildClientAssets();
    io.out("Client assets built / 클라이언트 자료 생성: " + output);
    return 0;
  } catch (error) {
    io.error("Client build failed / 클라이언트 생성 실패: " + String(error));
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = await main();
