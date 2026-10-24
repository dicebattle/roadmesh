import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EventClock, evaluate, loadScenario, main, MAX_BYTES, run, schedule, sourceIdentity, validate, type AssertionResult, type Scenario} from '../tools/pilot_runner.js';
import {check, type ExecutePilot} from '../tools/pilot_checks.js';
import {canonical, InputError, ROOT, sha256} from '../tools/shared.js';
import {captured, fixture, temporary, type ObjectValue} from './helpers.js';
const scenario = (): Scenario => fixture('fixtures/pilot/success.json');
function save(directory: string, spec: unknown = scenario(), name = 'scenario.json'): string {const path = join(directory, name); writeFileSync(path, JSON.stringify(spec)); return path;}
const cli = (path: string, output: string): number => main([path, '--output', output], captured().io);

test('seeded replay and different seed / 동일·다른 시드 재생', () => {
  const spec = scenario(); validate(spec); const expected = schedule(spec); assert.deepEqual(schedule(spec), expected); spec.seed = 8; assert.notEqual(schedule(spec).digest, expected.digest);
  assert.equal(expected.digest, sha256(canonical(expected.events))); assert.equal(expected.events.length, 7);
  assert.deepEqual(expected.events.map(event => event.sequence), [1, 2, 3, 4, 5, 6, 7]); assert.equal(expected.events.at(-1)!.event_time_utc, '2026-10-24T00:00:00.500Z');
  assert.deepEqual(expected.events.filter(event => event.kind === 'fault_marker').map(event => event.fault_id), ['marker-a', 'marker-b']);
  assert.ok(expected.events.every(event => !('latitude' in event) && !('speed' in event)));
});
test('declaration reordering and Unicode canonicalization / 선언 순서·유니코드 표준화', () => {
  const spec = scenario(); spec.vehicles[0]!.route_labels = ['도로']; const expected = schedule(spec); spec.vehicles.reverse(); spec.faults.reverse(); assert.deepEqual(schedule(spec), expected); assert.ok(canonical(expected.events).includes(Buffer.from('\\u')));
});
test('clock reversal and injection / 시계 역행·주입', () => {
  const clock = new EventClock(); clock.advance(100); assert.throws(() => clock.advance(99), InputError); assert.throws(() => clock.advance(true as unknown as number), InputError);
  const injected = new EventClock(); schedule(scenario(), injected); assert.equal(injected.offset_ms, 500);
});
test('malformed fields and values / 잘못된 필드·값 거부', () => {
  const mutations: ((spec: Scenario) => void)[] = [];
  for (const [key, value] of Object.entries({schema_version: '2', extra: true, seed: true, duration_s: 0, start_time_utc: '2026-10-24T00:00:00+00:00'})) mutations.push(s => {Object.assign(s, {[key]: value});});
  for (const [key, value] of [['seed', -1], ['seed', 2 ** 32], ['seed', Number.MAX_SAFE_INTEGER + 1], ['duration_s', 3601], ['duration_s', true], ['start_time_utc', '2026-02-30T00:00:00Z'], ['start_time_utc', '9999-12-31T23:59:59Z'], ['start_time_utc', '0000-01-01T00:00:00Z'], ['vehicles', []], ['assertions', []], ['faults', {}], ['scenario_id', 'UPPER']] as const) mutations.push(s => {Object.assign(s, {[key]: value});});
  for (const [key, value] of [['step_ms', 0], ['departure_ms', true], ['start_jitter_ms', -1], ['route_labels', []], ['route_labels', ['']], ['unknown', 1]] as const) mutations.push(s => {Object.assign(s.vehicles[0]!, {[key]: value});});
  for (const [key, value] of [['target_vehicle_id', 'missing'], ['kind', 'kill-process'], ['at_ms', 1001]] as const) mutations.push(s => {Object.assign(s.faults[0]!, {[key]: value});});
  mutations.push(s => {s.assertions[0]!.expected = true;}, s => {s.assertions[0]!.event_kind = 'vehicle_departure';}, s => {delete s.assertions[1]!.event_kind;}, s => {Object.assign(s.assertions[0]!, {kind: 'event_digest', expected: 'A'.repeat(64)});});
  for (const mutation of mutations) {const spec = scenario(); mutation(spec); assert.throws(() => validate(spec), InputError);}
  for (const key of ['vehicles', 'faults', 'assertions'] as const) {const spec = scenario(); (spec[key] as unknown[]).push(structuredClone(spec[key][0])); assert.throws(() => validate(spec), /duplicate identifier/);}
});
test('maximum jitter and collection limits / 최대 지연·배열 한도', () => {
  const spec = scenario(); Object.assign(spec.vehicles[0]!, {departure_ms: 900, start_jitter_ms: 101}); assert.throws(() => validate(spec), InputError);
  spec.vehicles[0]!.start_jitter_ms = 100; validate(spec); spec.vehicles[0]!.route_labels = Array<string>(101).fill('edge'); assert.throws(() => validate(spec), InputError);
  spec.vehicles = Array.from({length: 101}, (_, index) => ({...spec.vehicles[1]!, vehicle_id: `car-${index}`})); assert.throws(() => validate(spec), InputError);
});
test('event limit boundary / 이벤트 한도 경계', () => {
  const spec = scenario(); spec.faults = Array.from({length: 19995}, (_, index) => ({fault_id: `f-${index}`, at_ms: 0, target_vehicle_id: 'car-a', kind: 'marker'})); validate(spec);
  spec.faults.push({fault_id: 'too-many', at_ms: 0, target_vehicle_id: 'car-a', kind: 'marker'}); assert.throws(() => validate(spec), InputError);
});
test('JSON and byte limits / JSON·바이트 한도', t => {
  const directory = temporary(t), path = join(directory, 'scenario.json');
  for (const raw of ['{"seed":1,"seed":2}', 'NaN', 'Infinity', '{}', '[]', '{']) {writeFileSync(path, raw); assert.throws(() => loadScenario(path));}
  const raw = JSON.stringify(scenario()); writeFileSync(path, raw + ' '.repeat(MAX_BYTES - Buffer.byteLength(raw))); loadScenario(path); writeFileSync(path, raw + ' '.repeat(MAX_BYTES + 1 - Buffer.byteLength(raw))); assert.throws(() => loadScenario(path), InputError);
});
test('assertion kinds and required skip / 검사 종류·필수 생략 처리', () => {
  const spec = scenario(), {events, digest} = schedule(spec); spec.assertions.push({assertion_id: 'digest', kind: 'event_digest', expected: digest});
  assert.ok(evaluate(spec, events, digest).every(item => item.status === 'PASS' && item.evidence_path === 'events.json'));
  spec.assertions[0]!.expected = 0; assert.equal(evaluate(spec, events, digest)[0]!.status, 'FAIL'); spec.assertions[0]!.kind = 'future'; spec.assertions[0]!.expected = {reserved: true}; validate(spec);
  const skipped = evaluate(spec, events, digest)[0]!; assert.equal(skipped.status, 'SKIPPED'); assert.equal(skipped.required, true); assert.equal(skipped.evidence_path, null);
});
test('CLI evidence exits and provenance / 실행 증거·종료 코드·출처', t => {
  const directory = temporary(t), path = save(directory), destination = join(directory, 'pass'); assert.equal(cli(path, destination), 0);
  const manifest = JSON.parse(readFileSync(join(destination, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(manifest.source, sourceIdentity()); assert.equal(manifest.scenario_sha256, sha256(readFileSync(path)));
  for (const key of ['engine_executed', 'graph_loaded', 'graph_resolved']) assert.equal(manifest[key], false);
  assert.deepEqual(manifest.image_digests, []); assert.equal(manifest.aggregation_policy, null); assert.equal(manifest.python, null); assert.equal(manifest.node, process.versions.node);
  assert.deepEqual(new Set(Object.values(manifest.evidence as ObjectValue)), new Set(['events.json', 'assertions.json', 'summary.md']));
  const summary = readFileSync(join(destination, 'summary.md'), 'utf8'); assert.match(summary, /Pilot evidence \/ 파일럿 증거/); assert.match(summary, /합성 일정 생성만/);
  assert.equal(cli(path, join(directory, 'replay')), 0); const replay = JSON.parse(readFileSync(join(directory, 'replay/manifest.json'), 'utf8')) as ObjectValue;
  assert.notEqual(manifest.run_id, replay.run_id); assert.equal(manifest.event_sha256, replay.event_sha256);
  const spec = scenario(); for (const [kind, status] of [['event_count', 'FAIL'], ['future', 'SKIPPED']]) {spec.assertions[0]!.kind = kind!; spec.assertions[0]!.expected = 0; const input = save(directory, spec); assert.equal(cli(input, join(directory, kind!)), 1); const report = JSON.parse(readFileSync(join(directory, kind!, 'assertions.json'), 'utf8')) as AssertionResult[]; assert.equal(report[0]!.status, status);}
  Object.assign(spec, {seed: true}); assert.equal(cli(save(directory, spec), join(directory, 'invalid')), 2); assert.equal(existsSync(join(directory, 'invalid')), false);
});
test('unknown source identity / 소스 확인 실패는 미확인', () => {assert.deepEqual(sourceIdentity(() => {throw new Error('git unavailable');}), {commit: null, dirty: null}); assert.deepEqual(sourceIdentity(() => 'bad-commit'), {commit: null, dirty: null});});
test('existing output and symlinks preserved / 기존 출력·심볼릭 링크 보존', t => {
  const directory = temporary(t), path = save(directory), existing = join(directory, 'existing'); mkdirSync(existing); const sentinel = join(existing, 'keep'); writeFileSync(sentinel, 'unchanged');
  assert.equal(cli(path, existing), 2); assert.equal(readFileSync(sentinel, 'utf8'), 'unchanged');
  for (const target of [existing, join(directory, 'absent')]) {const link = join(directory, 'link-' + basename(target)); symlinkSync(target, link, 'dir'); assert.equal(cli(path, link), 2); assert.ok(lstatSync(link).isSymbolicLink());}
  assert.equal(cli(path, sentinel), 2);
});
test('write errors and argument errors exit two / 출력·인자 오류 종료 코드 2', t => {
  const directory = temporary(t), path = save(directory), output = join(directory, 'partial'); assert.throws(() => run(path, output, () => {throw new Error('disk full');})); assert.equal(existsSync(join(output, 'summary.md')), false);
  for (const args of [[], [path], [path, '--output', 'x', '--unknown']]) assert.equal(main(args, captured().io), 2);
  assert.equal(main([path, '--output', join(directory, 'missing/child')], captured().io), 2);
});
test('CLI wrapper checks exits and reports / 검사 도구가 종료 코드·보고서를 함께 확인', t => {
  const directory = temporary(t), output = join(directory, 'checks'); assert.equal(check(output), 0);
  const results = JSON.parse(readFileSync(join(output, 'checks.json'), 'utf8')) as {status: string}[]; assert.equal(results.length, 5); assert.ok(results.every(item => item.status === 'PASS'));
  const corrupt: ExecutePilot = (input, destination) => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/pilot_runner.js', import.meta.url)), input, '--output', destination], {cwd: ROOT, encoding: 'utf8'});
    if (basename(destination) === 'success-a') {const reportPath = join(destination, 'assertions.json'); const report = JSON.parse(readFileSync(reportPath, 'utf8')) as AssertionResult[]; report[0]!.status = 'FAIL'; writeFileSync(reportPath, JSON.stringify(report));} return result;
  };
  assert.equal(check(join(directory, 'corrupted'), corrupt), 1);
});
test('same-time priority and stable fault order / 같은 시각 순서·장애 안정 순서', () => {
  const spec = scenario(); for (const vehicle of spec.vehicles) Object.assign(vehicle, {start_jitter_ms: 0, departure_ms: 0}); for (const fault of spec.faults) fault.at_ms = 0;
  const expected = schedule(spec), atZero = expected.events.filter(event => event.offset_ms === 0);
  assert.deepEqual(atZero.map(event => event.kind), ['vehicle_departure', 'vehicle_departure', 'fixture_edge_enter', 'fixture_edge_enter', 'fault_marker', 'fault_marker']);
  assert.deepEqual(atZero.slice(0, 2).map(event => event.entity_id), ['car-a', 'car-b']); assert.deepEqual(atZero.slice(-2).map(event => event.fault_id), ['marker-a', 'marker-b']);
  spec.vehicles.reverse(); spec.faults.reverse(); assert.deepEqual(schedule(spec), expected);
});
test('partial write cannot leave completion manifest / 부분 쓰기는 완료 목록을 남기지 않음', t => {
  const directory = temporary(t), path = save(directory);
  for (const failingName of ['events.json', 'assertions.json', 'summary.md', 'manifest.json.tmp']) {
    const output = join(directory, failingName), written: string[] = [];
    assert.throws(() => run(path, output, (destination, data) => {written.push(basename(destination)); if (basename(destination) === failingName) {if (failingName === 'manifest.json.tmp') writeFileSync(destination, data); throw new Error('injected write failure');} writeFileSync(destination, data);}));
    assert.equal(existsSync(join(output, 'manifest.json')), false); assert.equal(existsSync(join(output, 'manifest.json.tmp')), false);
    if (failingName === 'manifest.json.tmp') assert.deepEqual(written, ['events.json', 'assertions.json', 'summary.md', 'manifest.json.tmp']);
  }
});
