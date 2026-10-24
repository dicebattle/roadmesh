import {mkdirSync, readFileSync, writeFileSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonical, cliArguments, consoleIO, type ConsoleIO, isMain, ROOT, sha256} from './shared.js';
import type {AssertionResult, PilotEvent, Scenario} from './pilot_runner.js';
interface ProcessResult {status: number | null; stdout: string; stderr: string; error?: Error}
export type ExecutePilot = (scenario: string, output: string) => ProcessResult;
interface CheckResult {case: string; status: 'PASS' | 'FAIL'; errors: string[]; expected_exit?: number; actual_exit?: number | null}
function exists(path: string): boolean {try {lstatSync(path); return true;} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error;}}
export function check(output: string, execute: ExecutePilot = (scenario, destination) => spawnSync(process.execPath, [fileURLToPath(new URL('./pilot_runner.js', import.meta.url)), scenario, '--output', destination], {cwd: ROOT, encoding: 'utf8', timeout: 30000})): number {
  mkdirSync(output);
  const results: CheckResult[] = [];
  const fixture = JSON.parse(readFileSync(join(ROOT, 'fixtures/pilot/success.json'), 'utf8')) as Scenario;
  const variants = [
    {name: 'success-a', spec: structuredClone(fixture), code: 0, status: 'PASS'},
    {name: 'success-b', spec: structuredClone(fixture), code: 0, status: 'PASS'},
    {name: 'failed', spec: structuredClone(fixture), code: 1, status: 'FAIL'},
    {name: 'unsupported', spec: structuredClone(fixture), code: 1, status: 'SKIPPED'},
    {name: 'invalid', spec: structuredClone(fixture), code: 2, status: null},
  ];
  variants[2]!.spec.assertions[0]!.expected = 0;
  variants[3]!.spec.assertions[0]!.kind = 'future-check';
  (variants[4]!.spec as unknown as Record<string, unknown>).seed = true;
  const digests = new Map<string, string>();
  try {
    for (const {name, spec, code, status} of variants) {
      const scenario = join(output, name + '.json'), destination = join(output, name);
      writeFileSync(scenario, JSON.stringify(spec, null, 2), 'utf8');
      const process = execute(scenario, destination);
      writeFileSync(join(output, name + '.stdout.txt'), process.stdout ?? '', 'utf8');
      writeFileSync(join(output, name + '.stderr.txt'), process.stderr ?? '', 'utf8');
      const errors: string[] = [];
      if (process.error || process.status !== code) errors.push('unexpected exit code / 예상과 다른 종료 코드');
      if (status !== null) {
        const manifest = JSON.parse(readFileSync(join(destination, 'manifest.json'), 'utf8')) as {status: string; event_sha256: string};
        const assertions = JSON.parse(readFileSync(join(destination, 'assertions.json'), 'utf8')) as AssertionResult[];
        const events = JSON.parse(readFileSync(join(destination, 'events.json'), 'utf8')) as PilotEvent[];
        const summary = readFileSync(join(destination, 'summary.md'), 'utf8'); digests.set(name, manifest.event_sha256);
        if (manifest.status !== (code === 0 ? 'PASS' : 'FAIL') || assertions.length !== spec.assertions.length || assertions[0]?.status !== status || assertions.slice(1).some(item => item.status !== 'PASS') || assertions.some(item => item.required !== true)) errors.push('unexpected assertion report / 검사 보고서가 예상과 다릅니다');
        if (manifest.event_sha256 !== sha256(canonical(events))) errors.push('event digest mismatch / 이벤트 해시 불일치');
        if (!summary.includes('Pilot evidence / 파일럿 증거')) errors.push('missing bilingual summary / 이중 언어 요약 누락');
      } else if (exists(destination)) errors.push('invalid input wrote evidence / 잘못된 입력이 증거를 생성했습니다');
      results.push({case: name, expected_exit: code, actual_exit: process.status, status: errors.length ? 'FAIL' : 'PASS', errors});
    }
    if (digests.get('success-a') !== digests.get('success-b')) results.push({case: 'replay', status: 'FAIL', errors: ['replay differs / 재생 결과 불일치']});
  } catch (error) {results.push({case: 'wrapper', status: 'FAIL', errors: [`Evidence check failed / 증거 검사 실패: ${String(error)}`]});}
  finally {writeFileSync(join(output, 'checks.json'), JSON.stringify(results, null, 2) + '\n', 'utf8');}
  return results.some(result => result.status === 'FAIL') ? 1 : 0;
}
export function main(argv = process.argv.slice(2), io: ConsoleIO = consoleIO): number {
  try {
    const args = cliArguments(argv, 'checks');
    if (args.help) {io.out('usage / 사용법: npm run pilot:checks -- --output NEW_DIRECTORY\nCheck replay, failed/skipped assertions and invalid input. / 재생·검사 실패와 생략·잘못된 입력을 검사합니다.\n--output: new evidence directory / 새 증거 폴더\nExit 0: expected behavior; 1: verification failure; 2: arguments/output error. / 종료 코드 0: 기대 동작 일치, 1: 검증 실패, 2: 인자·출력 오류\n-h, --help: show help / 도움말 표시'); return 0;}
    const code = check(args.output); io.out(`Pilot CLI checks exit ${code}; evidence: ${args.output}. / 파일럿 CLI 검사 종료 코드 ${code}; 증거: ${args.output}.`); return code;
  } catch (error) {io.error(`Cannot write checks; inspect arguments and output path. / 검사 결과를 저장할 수 없습니다. 인자와 출력 경로를 확인하세요: ${String(error)}`); return 2;}
}
if (isMain(import.meta.url)) process.exitCode = main();
