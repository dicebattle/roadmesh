import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {evaluate, main as pilotMain, schedule, validate as validateScenario, type AssertionResult, type PilotEvent, type Scenario} from '../tools/pilot_runner.js';
import {main as corpusMain, validate as validateCorpus, type CorpusReport} from '../tools/evaluation_corpus.js';
import {PythonRandom} from '../tools/python_random.js';
import {InputError, parseJson} from '../tools/shared.js';
import {captured, fixture, temporary} from './helpers.js';
interface References {
  source_revision: string;
  jitter: {seed: number; bounds: number[]; values: number[]}[];
  pilot: {name: string; scenario: Scenario; events: PilotEvent[]; event_sha256: string; assertions: AssertionResult[]; exit_code: number}[];
  corpus: {name: string; corpus: unknown; report: CorpusReport; exit_code: number; strict_exit_code: number}[];
  invalid: {name: string; raw: string; pilot_exit_code: number; corpus_exit_code: number}[];
}
const reference = fixture<References>('fixtures/compat/python-0095b3b.json');
test('CPython MT19937 rejection draws match all reference seeds / Python 시드별 거절 추출 동등성', () => {
  assert.equal(reference.source_revision, '0095b3b2611b1ced21e8c39f788d9799bf58dbd9');
  for (const {seed, bounds, values} of reference.jitter) {const rng = new PythonRandom(seed); assert.deepEqual(bounds.map(high => rng.randint(high)), values, `seed=${seed}`);}
});
test('Python event streams, SHA and assertions remain identical / Python 이벤트·해시·검사 동등성', t => {
  const directory = temporary(t);
  for (const ref of reference.pilot) {
    validateScenario(ref.scenario); const result = schedule(ref.scenario);
    assert.deepEqual(result.events, ref.events, ref.name); assert.equal(result.digest, ref.event_sha256, ref.name); assert.deepEqual(evaluate(ref.scenario, result.events, result.digest), ref.assertions, ref.name);
    const path = join(directory, ref.name + '.json'), output = join(directory, ref.name); writeFileSync(path, JSON.stringify(ref.scenario));
    assert.equal(pilotMain([path, '--output', output], captured().io), ref.exit_code, ref.name);
    const stored = JSON.parse(readFileSync(join(output, 'events.json'), 'utf8')) as unknown; assert.deepEqual(stored, ref.events);
  }
});
test('Python readiness report and exits remain identical / Python 준비 판정·종료 코드 동등성', t => {
  const directory = temporary(t);
  for (const ref of reference.corpus) {
    assert.deepEqual(validateCorpus(ref.corpus), ref.report, ref.name); const path = join(directory, ref.name + '.json'); writeFileSync(path, JSON.stringify(ref.corpus));
    assert.equal(corpusMain([path], captured().io), ref.exit_code); assert.equal(corpusMain([path, '--require-ready'], captured().io), ref.strict_exit_code);
  }
});
test('Python invalid JSON exits remain identical / Python 잘못된 JSON 종료 코드 동등성', t => {
  const directory = temporary(t);
  for (const ref of reference.invalid) {
    const path = join(directory, ref.name + '.json'); writeFileSync(path, ref.raw);
    assert.equal(pilotMain([path, '--output', join(directory, ref.name)], captured().io), ref.pilot_exit_code);
    assert.equal(corpusMain([path], captured().io), ref.corpus_exit_code);
  }
});
test('strict parser rejects comments, trailing commas and unsafe numbers / 엄격 파서의 주석·후행 쉼표·안전 범위 검사', () => {
  for (const raw of ['{"x":1,"\\u0078":2}', '{"nested":{"x":1,"x":2}}', '{/*comment*/"x":1}', '{"x":1,}', '[1,]', 'NaN', 'Infinity', '1e999', '9007199254740993']) assert.throws(() => parseJson(raw), InputError);
  assert.throws(() => parseJson(Buffer.from([0xff])));
  assert.deepEqual(parseJson('{"__proto__":{"safe":true}}'), JSON.parse('{"__proto__":{"safe":true}}'));
  assert.equal(parseJson('9007199254740991'), Number.MAX_SAFE_INTEGER);
});
