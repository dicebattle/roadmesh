import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {TestContext} from 'node:test';
import {ROOT, type ConsoleIO} from '../tools/shared.js';
export function temporary(t: TestContext): string {const directory = mkdtempSync(join(tmpdir(), 'routelens-test-')); t.after(() => rmSync(directory, {recursive: true, force: true})); return directory;}
export function fixture<T>(path: string): T {return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;}
export function captured(): {io: ConsoleIO; output: string[]; errors: string[]} {
  const output: string[] = [], errors: string[] = []; return {io: {out: value => output.push(value), error: value => errors.push(value)}, output, errors};
}
export type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {return value as ObjectValue;}
export function objects(value: unknown): ObjectValue[] {return value as ObjectValue[];}
export function child(value: unknown, key: string): ObjectValue {return object(object(value)[key]);}
export function first(value: unknown, key: string, index = 0): ObjectValue {return objects(object(value)[key])[index]!;}
