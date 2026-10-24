import {readFileSync} from 'node:fs';
import {array, choice, cliArguments, consoleIO, type ConsoleIO, fail, identifier, isMain, number, parseJson, record, sha256, text} from './shared.js';

interface Counts {total: number; reviewed_open_data: number; synthetic: number; draft: number; uncertain: number}
export interface CorpusReport {
  schema_version: string; region_id: string; counts: Record<'route' | 'match', Counts>;
  ready_for_m0_measurement: boolean; blockers: string[]; blockers_ko: string[]; corpus_sha256?: string;
}
function point(value: unknown, path: string, bbox: number[], sample = false): number[] {
  record(value, path, sample ? ['latitude', 'longitude', 'elapsed_s', 'accuracy_m'] : ['latitude', 'longitude']);
  number(value.latitude, path + '.latitude', bbox[1]!, bbox[3]!);
  number(value.longitude, path + '.longitude', bbox[0]!, bbox[2]!);
  if (sample) {
    number(value.elapsed_s, path + '.elapsed_s', 0, 86400);
    number(value.accuracy_m, path + '.accuracy_m', 0.01, 10000);
  }
  return sample ? [value.latitude, value.longitude, value.elapsed_s as number, value.accuracy_m as number] : [value.latitude, value.longitude];
}
export function validate(corpus: unknown): CorpusReport {
  record(corpus, 'corpus', ['schema_version', 'region', 'sources', 'cases']);
  if (corpus.schema_version !== '0.1') fail('schema_version', 'unsupported version', '지원하지 않는 버전입니다');
  const region = corpus.region;
  record(region, 'region', ['id', 'bbox']); identifier(region.id, 'region.id');
  array(region.bbox, 'region.bbox', 4, 4);
  region.bbox.forEach((value, index) => number(value, `region.bbox[${index}]`, -(index % 2 ? 90 : 180), index % 2 ? 90 : 180));
  const bbox = region.bbox as number[];
  if (bbox[0]! >= bbox[2]! || bbox[1]! >= bbox[3]!) fail('region.bbox', 'bounds must increase; antimeridian regions are not supported', '서쪽은 동쪽보다, 남쪽은 북쪽보다 작아야 하며 날짜변경선을 지나는 지역은 지원하지 않습니다');
  array(corpus.sources, 'sources');
  const sources = new Map<string, Record<string, unknown>>();
  corpus.sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    record(source, path, ['id', 'kind', 'reference', 'license', 'redistribution']); identifier(source.id, path + '.id');
    if (sources.has(source.id)) fail(path, 'duplicate source id', '출처 식별자가 중복되었습니다');
    choice(source.kind, path + '.kind', ['synthetic', 'open_data']);
    choice(source.redistribution, path + '.redistribution', ['allowed', 'unresolved']);
    text(source.reference, path + '.reference'); text(source.license, path + '.license'); sources.set(source.id, source);
  });
  array(corpus.cases, 'cases');
  const empty = (): Counts => ({total: 0, reviewed_open_data: 0, synthetic: 0, draft: 0, uncertain: 0});
  const counts = {route: empty(), match: empty()};
  const ids = new Set<string>(), inputs = new Set<string>(), unresolved = new Set<string>();
  corpus.cases.forEach((item, index) => {
    const path = `cases[${index}]`;
    record(item, path, ['id', 'kind', 'source_id', 'status', 'input'], ['review']); identifier(item.id, path + '.id');
    if (ids.has(item.id)) fail(path, 'duplicate case id', '사례 식별자가 중복되었습니다'); ids.add(item.id);
    choice(item.kind, path + '.kind', ['route', 'match']); choice(item.status, path + '.status', ['draft', 'reviewed', 'uncertain']);
    identifier(item.source_id, path + '.source_id'); const source = sources.get(item.source_id);
    if (!source) fail(path, 'unknown source id', '등록되지 않은 출처 식별자입니다');
    if (source.redistribution !== 'allowed') unresolved.add(item.source_id);
    let fingerprint: string;
    if (item.kind === 'route') {
      record(item.input, path + '.input', ['origin', 'destination']);
      const start = point(item.input.origin, path + '.input.origin', bbox), end = point(item.input.destination, path + '.input.destination', bbox);
      if (start.every((value, i) => value === end[i])) fail(path, 'origin and destination must differ', '출발지와 목적지는 달라야 합니다');
      fingerprint = JSON.stringify(['route', start, end]);
    } else {
      record(item.input, path + '.input', ['samples']); array(item.input.samples, path + '.input.samples', 2);
      let previous = -1;
      const trace = item.input.samples.map((sample, i) => {
        const location = point(sample, `${path}.input.samples[${i}]`, bbox, true);
        if (location[2]! <= previous) fail(path, 'sample elapsed_s must strictly increase', '표본의 elapsed_s 값은 이전 표본보다 커야 합니다');
        previous = location[2]!; return location;
      });
      fingerprint = JSON.stringify(['match', trace]);
    }
    if (inputs.has(fingerprint)) fail(path, 'duplicate evaluation input, even if ids differ', '식별자가 달라도 같은 평가 입력을 중복 등록할 수 없습니다'); inputs.add(fingerprint);
    if (item.status === 'reviewed') {
      record(item.review, path + '.review', ['expectation', 'evidence_reference']);
      text(item.review.expectation, path + '.review.expectation'); text(item.review.evidence_reference, path + '.review.evidence_reference');
      if (source.redistribution !== 'allowed') fail(path, 'reviewed cases require resolved redistribution rights', '검토된 사례는 재배포 권한이 확인되어야 합니다');
    } else if (Object.hasOwn(item, 'review')) fail(path, 'review must be absent until status is reviewed', 'status가 reviewed일 때만 review를 포함할 수 있습니다');
    const count = counts[item.kind as 'route' | 'match']; count.total++;
    if (source.kind === 'synthetic') count.synthetic++;
    else if (item.status === 'reviewed') count.reviewed_open_data++;
    if (item.status === 'draft' || item.status === 'uncertain') count[item.status]++;
  });
  const blockers: string[] = [], blockers_ko: string[] = [];
  for (const kind of ['route', 'match'] as const) if (counts[kind].reviewed_open_data < 100) {
    blockers.push(`${kind}: ${counts[kind].reviewed_open_data}/100 reviewed open-data cases`);
    blockers_ko.push(`${kind}: 검토된 공개 자료 사례 ${counts[kind].reviewed_open_data}/100개`);
  }
  if (unresolved.size) {blockers.push('referenced sources have unresolved redistribution rights'); blockers_ko.push('참조된 출처 중 재배포 권한이 확인되지 않은 출처가 있습니다');}
  return {schema_version: '0.1', region_id: region.id, counts, ready_for_m0_measurement: !blockers.length, blockers, blockers_ko};
}
export function main(argv = process.argv.slice(2), io: ConsoleIO = consoleIO): number {
  try {
    const args = cliArguments(argv, 'corpus');
    if (args.help) {io.out('usage / 사용법: npm run corpus -- CORPUS [--require-ready]\nValidate M0 evaluation inputs, not routing quality. / M0 평가 입력을 검사하며 경로 품질을 검증하지 않습니다.\nCORPUS: evaluation corpus JSON file / 평가 자료 JSON 파일\n--require-ready: exit 1 unless both real-road quotas are met / 실제 도로 사례 기준을 모두 충족하지 못하면 종료 코드 1\n-h, --help: show help / 도움말 표시'); return 0;}
    const raw = readFileSync(args.input), report = validate(parseJson(raw)); report.corpus_sha256 = sha256(raw);
    io.out(JSON.stringify(report, null, 2)); return args.ready && !report.ready_for_m0_measurement ? 1 : 0;
  } catch (error) {io.error(`Invalid corpus: ${String(error)}\n평가 자료가 유효하지 않습니다. 파일·JSON 형식·입력 계약을 확인하세요.`); return 2;}
}
if (isMain(import.meta.url)) process.exitCode = main();
