/** Shared error identity without Node dependencies / Node 의존 없는 공통 오류 식별자. */
export class InputError extends Error {}
export function fail(path: string, en: string, ko: string): never {
  throw new InputError(`${path}: ${en} / ${ko}`);
}
