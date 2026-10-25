/** Existing byte/validation contract, usable without filesystem or CLI imports. / 파일·CLI 없이 재사용하는 기존 바이트·검사 계약. */
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  parseTree,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";
import { InputError, fail } from "./input_error.js";
export { InputError, fail } from "./input_error.js";
export function record(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(path, "expected an object", "객체가 필요합니다");
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)))
    fail(path, "missing required fields", "필수 필드가 누락되었습니다");
  if (keys.some((key) => !required.includes(key) && !optional.includes(key)))
    fail(path, "unexpected fields", "허용되지 않은 필드가 있습니다");
}
export function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    fail(path, "expected non-empty text", "비어 있지 않은 문자열이 필요합니다");
}
export function identifier(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value))
    fail(
      path,
      "expected a lowercase identifier (1–80 characters)",
      "소문자 식별자가 필요합니다(1~80자)",
    );
}
export function integer(
  value: unknown,
  path: string,
  low: number,
  high = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < low ||
    value > high
  )
    fail(
      path,
      "expected a safe integer within the allowed range",
      "허용 범위 안의 안전한 정수가 필요합니다",
    );
}
export function number(
  value: unknown,
  path: string,
  low: number,
  high: number,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < low ||
    value > high ||
    (Number.isInteger(value) && !Number.isSafeInteger(value))
  )
    fail(
      path,
      "expected a finite number within the allowed range",
      "허용 범위 안의 유한한 숫자가 필요합니다",
    );
}
export function array(
  value: unknown,
  path: string,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    fail(
      path,
      `expected an array with at least ${minimum} items and at most ${maximum}`,
      `항목이 최소 ${minimum}개, 최대 ${maximum}개인 배열이 필요합니다`,
    );
}
export function choice(
  value: unknown,
  path: string,
  choices: readonly string[],
): asserts value is string {
  if (typeof value !== "string" || !choices.includes(value))
    fail(path, "unsupported value", "지원하지 않는 값입니다");
}
export function parseJson(raw: Uint8Array | string): unknown {
  const source =
    typeof raw === "string"
      ? raw
      : new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw);
  const errors: ParseError[] = [];
  const tree = parseTree(source, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (!tree || errors.length)
    fail(
      "JSON",
      "invalid strict JSON; comments and trailing commas are forbidden",
      "엄격한 JSON 형식이 아니며 주석·후행 쉼표는 허용되지 않습니다",
    );
  function inspect(node: JsonNode): void {
    if (node.type === "object") {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key: unknown = property.children?.[0]?.value;
        if (typeof key !== "string" || keys.has(key))
          fail("JSON", "duplicate object key", "객체 키가 중복되었습니다");
        keys.add(key);
      }
    }
    if (node.type === "number") {
      const value: unknown = node.value;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value))
      )
        fail(
          "JSON",
          "unsafe or nonfinite number",
          "안전 범위 밖이거나 비유한 숫자입니다",
        );
    }
    for (const child of node.children ?? []) inspect(child);
  }
  inspect(tree);
  return JSON.parse(source) as unknown;
}
export function canonical(value: unknown): Buffer {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === "object")
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, ordered((item as Record<string, unknown>)[key])]),
      );
    return item;
  }
  const json = JSON.stringify(ordered(value));
  if (json === undefined)
    throw new InputError("Invalid canonical JSON / 표준 JSON 값이 아닙니다");
  return Buffer.from(
    json.replace(
      /[\u007f-\uffff]/g,
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    ),
  );
}
export const sha256 = (raw: Uint8Array): string =>
  createHash("sha256").update(raw).digest("hex");
