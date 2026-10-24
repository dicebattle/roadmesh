import { createServer, type Server } from "node:http";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, extname } from "node:path";
import { isMain } from "./shared.js";
export function startReportServer(
  directory: string,
  options: { port?: number; timeoutMs?: number } = {},
): Server {
  const root = realpathSync(directory);
  if (!statSync(root).isDirectory())
    throw new Error("Expected a directory / 폴더가 필요합니다");
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]!);
      const path = realpathSync(
        resolve(root, "." + (pathname === "/" ? "/index.html" : pathname)),
      );
      const rel = relative(root, path);
      if (
        rel === ".." ||
        rel.startsWith("../") ||
        isAbsolute(rel) ||
        !statSync(path).isFile()
      )
        throw new Error("Outside directory");
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".txt": "text/plain; charset=utf-8",
      };
      response.writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      response.end(readFileSync(path));
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(
        "Not found or outside report directory / 파일이 없거나 보고서 폴더 밖입니다",
      );
    }
  });
  const timer = setTimeout(() => server.close(), options.timeoutMs ?? 900000);
  timer.unref();
  server.on("close", () => clearTimeout(timer));
  server.listen(options.port ?? 0, "127.0.0.1");
  return server;
}
if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 3)
      throw new Error(
        "Usage: report:serve -- DIRECTORY / 사용법: report:serve -- 폴더",
      );
    const server = startReportServer(process.argv[2]!);
    server.on("listening", () => {
      const addr = server.address();
      console.log(
        "Report / 보고서: http://127.0.0.1:" +
          (typeof addr === "object" && addr ? addr.port : "") +
          " · closes after 15 minutes / 15분 후 종료",
      );
    });
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.on(signal, () => server.close());
  } catch (error) {
    console.error(String(error));
    process.exitCode = 2;
  }
}
