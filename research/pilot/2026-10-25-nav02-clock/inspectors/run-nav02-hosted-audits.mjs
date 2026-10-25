import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const [rootArg, source, label] = process.argv.slice(2);
if (!rootArg || !/^[a-f0-9]{40}$/.test(source ?? '') || !/^nav02-[a-z0-9-]+$/.test(label ?? ''))
  throw Error('Expected root, exact source and new label / 원문·정확한 소스·새 이름이 필요합니다');
const root = path.resolve(rootArg), prefix = 'data/' + label;
const runtime = '70af32dc05269aee3a739e234e8db66718bfd1ee86c70b4d84c776be2c5a1db4';
const output = name => prefix + '-' + name + '.json';
const jobs = [
  ['signatures', 'data/inspect-nav02-signatures-hosted.mjs', [root + '/publication', output('signatures')]],
  ['state', 'data/inspect-nav02-state-hosted.mjs', [root + '/publication', 'hosted', output('state')]],
  ['whole', 'data/inspect-nav02-whole-hosted.mjs', [root, '--output', output('whole'), '--expected-source', source]],
  ['cloudflare', 'data/inspect-p13-parity-hosted.mjs', [root + '/cloudflare', output('cloudflare'), prefix + '-sqlite-copy']],
  ['domain', 'data/inspect-nav02-domain-hosted.mjs', [root + '/scenarios', output('domain'), source]],
  ['client', 'data/inspect-nav02-client-hosted.mjs', [root + '/client', source, runtime, output('client')]],
  ['progress', 'data/inspect-nav02-progress-hosted.mjs', [root + '/client', source, runtime, output('progress')]],
  ['gateway', 'data/inspect-nav02-gateway-hosted.mjs', [root + '/gateway', root + '/seoul/graph', '--output', output('gateway'), '--expected-source', source]],
  ['nodes', 'data/inspect-nav02-nodes-hosted.mjs', [root + '/nodes', root + '/seoul/graph', '--expected-source', source, '--output', output('nodes')]],
  ['traffic', 'data/inspect-nav02-traffic-hosted.mjs', [root + '/traffic', root + '/seoul/graph', '--output', output('traffic')]],
];
const results = [];
for (const [name, script, args] of jobs) {
  const log = prefix + '-' + name + '.log';
  const fd = fs.openSync(log, 'wx');
  let result;
  try { result = spawnSync(process.execPath, [script, ...args], {stdio: ['ignore', fd, fd]}); }
  finally { fs.closeSync(fd); }
  results.push({name, script, args, exit: result.status, signal: result.signal, log});
  console.log(JSON.stringify(results.at(-1)));
  if (result.status !== 0) break;
}
const status = results.length === jobs.length && results.every(r => r.exit === 0) ? 'PASS' : 'FAIL';
fs.writeFileSync(prefix + '-audit-commands.json', JSON.stringify({status, source, runtime, results}, null, 2) + '\n', {flag: 'wx'});
if (status !== 'PASS') process.exitCode = 1;
