import {closeSync, mkdirSync, openSync, readSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {platform, release, arch} from 'node:os';
import {array, canonical, cliArguments, consoleIO, type ConsoleIO, fail, identifier, integer, isMain, parseJson, record, ROOT, sha256, text} from './shared.js';
import {PythonRandom} from './python_random.js';
export {canonical, ROOT} from './shared.js';
export const MAX_BYTES = 1024 * 1024;
export const MAX_EVENTS = 20000;
export interface Vehicle {vehicle_id: string; departure_ms: number; step_ms: number; start_jitter_ms: number; route_labels: string[]}
export interface Fault {fault_id: string; at_ms: number; target_vehicle_id: string; kind: 'marker'}
export interface Assertion {assertion_id: string; kind: string; expected: unknown; event_kind?: string}
export interface Scenario {schema_version: '0.1'; scenario_id: string; fixture_graph_id: string; seed: number; start_time_utc: string; duration_s: number; vehicles: Vehicle[]; faults: Fault[]; assertions: Assertion[]}
export type EventKind = 'vehicle_departure' | 'fixture_edge_enter' | 'fault_marker';
export interface PilotEvent {sequence: number; kind: EventKind; entity_id: string; offset_ms: number; event_time_utc: string; fixture_label?: string; fault_id?: string}
export interface AssertionResult extends Assertion {required: true; status: 'PASS' | 'FAIL' | 'SKIPPED'; actual: unknown; evidence_path: string | null; message_en: string; message_ko: string}
function unique(items: Record<string, unknown>[], key: string, path: string): void {
  const seen = new Set<string>();
  for (const item of items) {identifier(item[key], path + '.' + key); if (seen.has(item[key])) fail(path, 'duplicate identifier', '식별자가 중복되었습니다'); seen.add(item[key]);}
}
export function validate(spec: unknown): Scenario {
  record(spec, 'scenario', ['schema_version', 'scenario_id', 'fixture_graph_id', 'seed', 'start_time_utc', 'duration_s', 'vehicles', 'faults', 'assertions']);
  if (spec.schema_version !== '0.1') fail('schema_version', 'unsupported version', '지원하지 않는 버전입니다');
  identifier(spec.scenario_id, 'scenario_id'); identifier(spec.fixture_graph_id, 'fixture_graph_id');
  integer(spec.seed, 'seed', 0, 0xffffffff); integer(spec.duration_s, 'duration_s', 1, 3600);
  const start = spec.start_time_utc;
  if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(start)) fail('start_time_utc', 'expected UTC RFC3339 whole seconds ending in Z', 'Z로 끝나는 UTC RFC3339 초 단위 시각이 필요합니다');
  const timestamp = Date.parse(start);
  if (!Number.isFinite(timestamp) || start.startsWith('0000') || new Date(timestamp).toISOString().replace('.000Z', 'Z') !== start || timestamp + spec.duration_s * 1000 > Date.parse('9999-12-31T23:59:59.999Z')) fail('start_time_utc', 'invalid or overflowing timestamp', '유효하지 않거나 범위를 초과하는 시각입니다');
  array(spec.vehicles, 'vehicles', 1, 100); array(spec.faults, 'faults', 0); array(spec.assertions, 'assertions', 1);
  let eventCount = spec.faults.length;
  const vehicles: Record<string, unknown>[] = [];
  for (const vehicle of spec.vehicles) {
    record(vehicle, 'vehicle', ['vehicle_id', 'departure_ms', 'step_ms', 'start_jitter_ms', 'route_labels']);
    integer(vehicle.departure_ms, 'vehicle.departure_ms', 0); integer(vehicle.step_ms, 'vehicle.step_ms', 1); integer(vehicle.start_jitter_ms, 'vehicle.start_jitter_ms', 0);
    array(vehicle.route_labels, 'route_labels', 1, 100); for (const label of vehicle.route_labels) text(label, 'route_labels');
    if (vehicle.departure_ms + vehicle.start_jitter_ms + (vehicle.route_labels.length - 1) * vehicle.step_ms > spec.duration_s * 1000) fail('vehicle', 'maximum event time exceeds duration', '최대 출발 지연을 포함한 마지막 이벤트가 기간을 초과합니다');
    eventCount += 1 + vehicle.route_labels.length; vehicles.push(vehicle);
  }
  unique(vehicles, 'vehicle_id', 'vehicles'); const vehicleIds = new Set(vehicles.map(v => v.vehicle_id));
  const faults: Record<string, unknown>[] = [];
  for (const fault of spec.faults) {
    record(fault, 'fault', ['fault_id', 'at_ms', 'target_vehicle_id', 'kind']); integer(fault.at_ms, 'fault.at_ms', 0, spec.duration_s * 1000);
    if (typeof fault.target_vehicle_id !== 'string' || !vehicleIds.has(fault.target_vehicle_id)) fail('fault.target_vehicle_id', 'unknown vehicle', '등록되지 않은 차량입니다');
    if (fault.kind !== 'marker') fail('fault.kind', 'only marker is supported', 'marker만 지원합니다'); faults.push(fault);
  }
  unique(faults, 'fault_id', 'faults');
  if (eventCount > MAX_EVENTS) fail('scenario', 'event count exceeds 20000', '이벤트가 20000개를 초과합니다');
  const assertions: Record<string, unknown>[] = [];
  for (const assertion of spec.assertions) {
    record(assertion, 'assertion', ['assertion_id', 'kind', 'expected'], ['event_kind']); text(assertion.kind, 'assertion.kind');
    if (assertion.kind === 'event_kind_count') text(assertion.event_kind, 'assertion.event_kind');
    else if (Object.hasOwn(assertion, 'event_kind')) fail('assertion.event_kind', 'only valid for event_kind_count', 'event_kind_count에서만 사용할 수 있습니다');
    if (['event_count', 'event_kind_count', 'last_event_ms'].includes(assertion.kind)) integer(assertion.expected, 'assertion.expected', 0);
    else if (assertion.kind === 'event_digest' && (typeof assertion.expected !== 'string' || !/^[0-9a-f]{64}$/.test(assertion.expected))) fail('assertion.expected', 'expected 64 lowercase hexadecimal characters', '소문자 16진수 64자리가 필요합니다');
    assertions.push(assertion);
  }
  unique(assertions, 'assertion_id', 'assertions'); return spec as unknown as Scenario;
}
export function loadScenario(path: string): {spec: Scenario; scenarioDigest: string} {
  const descriptor = openSync(path, 'r'); const buffer = Buffer.alloc(MAX_BYTES + 1);
  let length = 0;
  try {while (length < buffer.length) {const read = readSync(descriptor, buffer, length, buffer.length - length, null); if (!read) break; length += read;}} finally {closeSync(descriptor);}
  if (length > MAX_BYTES) fail('scenario', 'input exceeds 1 MiB', '입력이 1MiB를 초과합니다');
  const raw = buffer.subarray(0, length); return {spec: validate(parseJson(raw)), scenarioDigest: sha256(raw)};
}
export class EventClock {
  offset_ms = 0;
  advance(offset: number): number {integer(offset, 'clock', 0); if (offset < this.offset_ms) fail('clock', 'event time cannot move backward', '이벤트 시각은 역행할 수 없습니다'); this.offset_ms = offset; return offset;}
}
export function schedule(spec: Scenario, clock = new EventClock()): {events: PilotEvent[]; digest: string} {
  const rng = new PythonRandom(spec.seed);
  type Pending = {offset: number; kind: EventKind; entity: string; ordinal: number; extra: {fixture_label?: string; fault_id?: string}};
  const pending: Pending[] = [];
  for (const vehicle of [...spec.vehicles].sort((a, b) => compare(a.vehicle_id, b.vehicle_id))) {
    const departure = vehicle.departure_ms + rng.randint(vehicle.start_jitter_ms);
    pending.push({offset: departure, kind: 'vehicle_departure', entity: vehicle.vehicle_id, ordinal: 0, extra: {}});
    vehicle.route_labels.forEach((label, index) => pending.push({offset: departure + index * vehicle.step_ms, kind: 'fixture_edge_enter', entity: vehicle.vehicle_id, ordinal: index, extra: {fixture_label: label}}));
  }
  [...spec.faults].sort((a, b) => compare(a.fault_id, b.fault_id)).forEach((fault, index) => pending.push({offset: fault.at_ms, kind: 'fault_marker', entity: fault.target_vehicle_id, ordinal: index, extra: {fault_id: fault.fault_id}}));
  const priority = {vehicle_departure: 0, fixture_edge_enter: 1, fault_marker: 2};
  pending.sort((a, b) => a.offset - b.offset || priority[a.kind] - priority[b.kind] || compare(a.entity, b.entity) || a.ordinal - b.ordinal);
  const start = Date.parse(spec.start_time_utc);
  const events = pending.map((event, index): PilotEvent => {clock.advance(event.offset); return {sequence: index + 1, kind: event.kind, entity_id: event.entity, offset_ms: event.offset, event_time_utc: new Date(start + event.offset).toISOString(), ...event.extra};});
  return {events, digest: sha256(canonical(events))};
}
function compare(a: string, b: string): number {return a < b ? -1 : a > b ? 1 : 0;}
export function evaluate(spec: Scenario, events: PilotEvent[], digest: string): AssertionResult[] {
  return spec.assertions.map(assertion => {
    let actual: unknown;
    switch (assertion.kind) {
      case 'event_count': actual = events.length; break;
      case 'event_kind_count': actual = events.filter(event => event.kind === assertion.event_kind).length; break;
      case 'last_event_ms': actual = events.at(-1)!.offset_ms; break;
      case 'event_digest': actual = digest; break;
      default: return {...assertion, required: true, status: 'SKIPPED', actual: null, evidence_path: null, message_en: 'Unsupported assertion; required check was skipped.', message_ko: '지원하지 않는 검사이며 필수 검사가 생략되었습니다.'};
    }
    const passed = actual === assertion.expected;
    return {...assertion, required: true, status: passed ? 'PASS' : 'FAIL', actual, evidence_path: 'events.json', message_en: passed ? 'Expectation matched.' : 'Expectation did not match.', message_ko: passed ? '기대값과 일치합니다.' : '기대값과 일치하지 않습니다.'};
  });
}
export function sourceIdentity(git: (args: string[]) => string = args => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe']})): {commit: string | null; dirty: boolean | null} {
  try {const commit = git(['rev-parse', 'HEAD']).trim(); const status = git(['status', '--porcelain', '--untracked-files=normal']); if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error('Invalid commit'); return {commit, dirty: !!status};} catch {return {commit: null, dirty: null};}
}
export type WriteEvidence = (path: string, contents: string) => void;
export function run(path: string, output: string, write: WriteEvidence = (destination, contents) => writeFileSync(destination, contents, {encoding: 'utf8', flag: 'wx'})): number {
  const started = new Date().toISOString(), {spec, scenarioDigest} = loadScenario(path), {events, digest} = schedule(spec), assertions = evaluate(spec, events, digest);
  const passed = assertions.every(assertion => assertion.status === 'PASS');
  const manifest = {schema_version: '0.1', run_id: randomUUID(), scenario_id: spec.scenario_id, source: sourceIdentity(), python: null, node: process.versions.node, platform: `${platform()}-${release()}-${arch()}`,
    scenario_sha256: scenarioDigest, event_sha256: digest, started_at_utc: started, completed_at_utc: '', event_count: events.length, fixture_graph_id: spec.fixture_graph_id,
    graph_resolved: false, graph_loaded: false, engine_executed: false, image_digests: [], aggregation_policy: null, status: passed ? 'PASS' : 'FAIL', seed: spec.seed,
    evidence: {events: 'events.json', assertions: 'assertions.json', summary: 'summary.md'}};
  const summary = `# Pilot evidence / 파일럿 증거\n\nResult / 결과: ${manifest.status}\n\nScenario / 시나리오: \`${spec.scenario_id}\`\n\nEvents / 이벤트: ${events.length}; SHA-256: \`${digest}\`\n\nSynthetic scheduler only: no routing engine, loaded graph, GPS, traffic speed, image or aggregation policy.\n합성 일정 생성만 수행했습니다. 경로 엔진·그래프 로딩·GPS·교통속도·이미지·집계 정책은 실행하거나 적용하지 않았습니다.\n\nRequired assertions / 필수 검사:\n\n${assertions.map(item => `- \`${item.assertion_id}\`: ${item.status} — ${item.message_en} / ${item.message_ko}\n`).join('')}\nEvidence / 증거: [manifest.json](manifest.json), [events.json](events.json), [assertions.json](assertions.json).\n`;
  mkdirSync(output); // Exclusive creation also refuses files and dangling symlinks / 기존 경로·심볼릭 링크도 거부합니다.
  const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
  write(join(output, 'events.json'), json(events)); write(join(output, 'assertions.json'), json(assertions)); write(join(output, 'summary.md'), summary);
  manifest.completed_at_utc = new Date().toISOString();
  const temporary = join(output, 'manifest.json.tmp');
  try {write(temporary, json(manifest)); renameSync(temporary, join(output, 'manifest.json'));} catch (error) {rmSync(temporary, {force: true}); throw error;}
  return passed ? 0 : 1;
}
export function main(argv = process.argv.slice(2), io: ConsoleIO = consoleIO): number {
  try {
    const args = cliArguments(argv, 'pilot');
    if (args.help) {io.out('usage / 사용법: npm run pilot -- SCENARIO --output NEW_DIRECTORY\nSchedule synthetic events only. / 합성 이벤트 일정만 생성합니다.\nSCENARIO: scenario JSON / 시나리오 JSON\n--output: new evidence directory; existing paths are refused / 새 증거 폴더이며 기존 경로는 거부합니다\nExit 0: all required assertions pass; 1: failed/skipped; 2: invalid input/output. / 종료 코드 0: 필수 검사 통과, 1: 실패·생략, 2: 입력·출력 오류\n-h, --help: show help / 도움말 표시'); return 0;}
    const code = run(args.input, args.output); io.out(`Evidence written: ${args.output}; exit ${code}. / 증거 저장: ${args.output}; 종료 코드 ${code}.`); return code;
  } catch (error) {io.error(`Pilot input/output error; partial output is incomplete evidence. / 파일럿 입력·출력 오류이며 일부 출력은 미완료 증거입니다.\n${String(error)}`); return 2;}
}
if (isMain(import.meta.url)) process.exitCode = main();
