import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fail, parseJson } from "./value_contract.js";
export * from "./value_contract.js";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const loadJson = (path: string): unknown =>
  parseJson(readFileSync(path));
export const isMain = (url: string): boolean =>
  !!process.argv[1] && url === pathToFileURL(resolve(process.argv[1])).href;
export interface ConsoleIO {
  out(message: string): void;
  error(message: string): void;
}
export const consoleIO: ConsoleIO = {
  out: (message) => console.log(message),
  error: (message) => console.error(message),
};
export function cliArguments(
  argv: string[],
  mode: "corpus" | "pilot" | "checks",
): { input: string; output: string; ready: boolean; help: boolean } {
  const result = { input: "", output: "", ready: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") result.help = true;
    else if (argument === "--require-ready" && mode === "corpus")
      result.ready = true;
    else if (argument === "--output" && mode !== "corpus" && !result.output) {
      const output = argv[++index];
      if (!output || output.startsWith("-"))
        fail(
          "arguments",
          "expected a new output directory",
          "새 출력 폴더가 필요합니다",
        );
      result.output = output;
    } else if (!argument.startsWith("-") && mode !== "checks" && !result.input)
      result.input = argument;
    else
      fail(
        "arguments",
        "unknown or duplicate argument; see --help",
        "알 수 없거나 중복된 인자입니다. --help를 확인하세요",
      );
  }
  if (
    !result.help &&
    ((!result.input && mode !== "checks") ||
      (!result.output && mode !== "corpus"))
  )
    fail(
      "arguments",
      "missing required arguments; see --help",
      "필수 인자가 누락되었습니다. --help를 확인하세요",
    );
  return result;
}
