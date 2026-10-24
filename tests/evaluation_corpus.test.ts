import assert from 'node:assert/strict';
import test from 'node:test';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {main, validate} from '../tools/evaluation_corpus.js';
import {InputError} from '../tools/shared.js';
import {captured, child, first, fixture, object, objects, temporary, type ObjectValue} from './helpers.js';
const corpus = (): ObjectValue => fixture('fixtures/evaluation/synthetic-seoul.json');

test('synthetic example never counts as real-road evidence / 합성 자료는 실제 도로 근거에서 제외', () => {
  const input = corpus(); for (const item of objects(input.cases)) Object.assign(item, {status: 'reviewed', review: {expectation: 'synthetic test', evidence_reference: 'test fixture'}});
  const report = validate(input); assert.equal(report.ready_for_m0_measurement, false); assert.equal(report.counts.route.reviewed_open_data, 0); assert.equal(report.counts.match.synthetic, 1);
});
test('invalid coordinates / 잘못된 좌표 거부', () => {
  for (const value of [true, '37.5', NaN, Infinity, 91, 37.1]) {const input = corpus(); child(child(first(input, 'cases'), 'input'), 'origin').latitude = value; assert.throws(() => validate(input), InputError);}
});
test('invalid bbox / 잘못된 경계 거부', () => {
  for (const bbox of [[127, 37, 126, 38], [126, 37, 127, 37], [126, 37, 127, 91], [126, 37, 127, 38, 39]]) {const input = corpus(); child(input, 'region').bbox = bbox; assert.throws(() => validate(input), InputError);}
});
test('duplicate cases never inflate quota / 중복 사례의 기준 수 증가 방지', () => {
  const input = corpus(); objects(input.cases).push(structuredClone(first(input, 'cases'))); assert.throws(() => validate(input), /duplicate case id/);
  objects(input.cases).at(-1)!.id = 'different-id'; assert.throws(() => validate(input), /duplicate evaluation input/);
});
test('unknown and duplicate sources / 미등록·중복 출처 거부', () => {
  const input = corpus(); first(input, 'cases').source_id = 'missing'; assert.throws(() => validate(input), /unknown source/);
  objects(input.sources).push(structuredClone(first(input, 'sources'))); assert.throws(() => validate(input), /duplicate source/);
});
test('review requires evidence and rights / 검토 근거와 재배포 권한 필수', () => {
  const input = corpus(), item = first(input, 'cases'); item.status = 'reviewed'; assert.throws(() => validate(input), InputError);
  item.review = {expectation: 'turn restriction', evidence_reference: ' '}; assert.throws(() => validate(input), InputError);
  child(item, 'review').evidence_reference = 'review record'; first(input, 'sources').redistribution = 'unresolved'; assert.throws(() => validate(input), /redistribution/);
});
test('stationary samples allowed and timestamps increase / 정지 표본 허용·시각 증가 필수', () => {
  const input = corpus(), samples = objects(child(first(input, 'cases', 1), 'input').samples);
  samples[1]!.latitude = samples[0]!.latitude; samples[1]!.longitude = samples[0]!.longitude; validate(input);
  for (const elapsed of [0, -1]) {samples[1]!.elapsed_s = elapsed; assert.throws(() => validate(input), InputError);}
});
test('malformed shapes are validation errors / 잘못된 구조를 검증 오류로 처리', () => {
  const changes: ((value: ObjectValue) => void)[] = [c => {c.schema_version = '9';}, c => {c.cases = {};}, c => {first(c, 'cases').kind = [];}, c => {first(c, 'cases').status = 'approved';}, c => {first(c, 'cases').review = {};}, c => {const input = child(first(c, 'cases'), 'input'); input.destination = input.origin;}];
  for (const change of changes) {const input = corpus(); change(input); assert.throws(() => validate(input), InputError);}
});
test('readiness threshold excludes uncertain cases / 준비 기준에서 불확실 사례 제외', () => {
  const input = corpus(); first(input, 'sources').kind = 'open_data'; const templates = objects(input.cases); input.cases = [];
  ['route', 'match'].forEach((kind, kindIndex) => {for (let index = 0; index < 100; index++) {
    const item = structuredClone(templates[kindIndex]!); Object.assign(item, {id: `${kind}-${index}`, status: 'reviewed', review: {expectation: 'test-only review', evidence_reference: 'test-only evidence'}});
    const location = kind === 'route' ? child(child(item, 'input'), 'origin') : first(child(item, 'input'), 'samples');
    location.latitude = Number(location.latitude) + index * 0.00001; objects(input.cases).push(item);
  }});
  assert.equal(validate(input).ready_for_m0_measurement, true); const last = objects(input.cases).at(-1)!; last.status = 'uncertain'; delete last.review;
  assert.equal(validate(input).ready_for_m0_measurement, false); assert.equal(validate(input).counts.match.reviewed_open_data, 99);
});
test('readiness explanations retain English and Korean / 준비 설명 영문·국문 보존', () => {
  const input = corpus(), report = validate(input);
  assert.deepEqual(report.blockers, ['route: 0/100 reviewed open-data cases', 'match: 0/100 reviewed open-data cases']);
  assert.deepEqual(report.blockers_ko, ['route: 검토된 공개 자료 사례 0/100개', 'match: 검토된 공개 자료 사례 0/100개']);
  first(input, 'sources').redistribution = 'unresolved'; const unresolved = validate(input); assert.equal(unresolved.blockers.length, unresolved.blockers_ko.length); assert.match(unresolved.blockers_ko.at(-1)!, /재배포 권한/);
});
test('validation diagnostic has English before Korean / 검증 진단 영어 우선', () => {
  const input = corpus(); input.cases = []; assert.throws(() => validate(input), /expected an array.*\/ 항목이 최소 1개/);
});
test('CLI help and argument errors are bilingual / 도움말과 인자 오류 이중 언어', () => {
  const out = captured(); assert.equal(main(['--help'], out.io), 0); const help = out.output.join('\n');
  for (const part of ['usage / 사용법:', 'evaluation corpus JSON file / 평가 자료 JSON 파일', 'show help / 도움말', 'exit 1 unless', '종료 코드 1']) assert.ok(help.includes(part));
  for (const args of [[], ['example.json', '--unknown']]) {const error = captured(); assert.equal(main(args, error.io), 2); assert.match(error.errors.join(''), /arguments.*\/.*인자/);}
});
test('CLI exits and nonstandard JSON / 종료 코드와 비표준 JSON 거부', t => {
  const directory = temporary(t), path = join(directory, 'corpus.json'); writeFileSync(path, JSON.stringify(corpus()));
  const out = captured(); assert.equal(main([path], out.io), 0); assert.equal(object(JSON.parse(out.output[0]!)).corpus_sha256?.toString().length, 64);
  assert.equal(main([path, '--require-ready'], captured().io), 1);
  for (const raw of ['{"schema_version":"0.1","schema_version":"0.2"}', 'NaN', '{', '[]']) {writeFileSync(path, raw); const error = captured(); assert.equal(main([path], error.io), 2); assert.match(error.errors[0]!, /^Invalid corpus:/); assert.match(error.errors[0]!, /평가 자료가 유효하지 않습니다/);}
});
