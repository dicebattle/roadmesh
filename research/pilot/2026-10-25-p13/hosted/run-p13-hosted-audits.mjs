import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const [rootArg, source, label] = process.argv.slice(2);
if (!rootArg || !/^[a-f0-9]{40}$/.test(source ?? '') || !/^p13-[a-z0-9-]+$/.test(label ?? ''))
  throw Error('Expected root, exact source and new label / 원문·정확한 소스·새 이름이 필요합니다');
const root = path.resolve(rootArg), prefix = 'data/' + label;
const runtime = 'ba9395ec5ba3ac6dc5d1e296a9334b0bbebd72053b46674692f1c58a84556bfa';
const output = name => prefix + '-' + name + '.json';
const jobs = [
  ['signatures', 'data/inspect-p13-hosted-signatures.mjs', [root + '/publication', output('signatures')]],
  ['state', 'data/inspect-p13-hosted-state.mjs', [root + '/publication', 'hosted', output('state')]],
  ['whole', 'data/inspect-p13-whole-hosted.mjs', [root, '--output', output('whole'), '--expected-source', source]],
  ['cloudflare', 'data/inspect-p13-parity-hosted.mjs', [root + '/cloudflare', output('cloudflare'), prefix + '-sqlite-copy']],
  ['domain', 'data/inspect-p13-domain-hosted.mjs', [root + '/scenarios', output('domain'), source]],
  ['client', 'data/inspect-p13-client-hosted.mjs', [root + '/client', source, runtime, output('client')]],
  ['gateway', 'data/inspect-p10-in-p13-hosted.mjs', [root + '/gateway', root + '/seoul/graph', '--output', output('gateway'), '--expected-source', source]],
  ['nodes', 'data/inspect-p09-in-p13-hosted.mjs', [root + '/nodes', root + '/seoul/graph', '--expected-source', source, '--output', output('nodes')]],
  ['traffic', '/Users/dice/Documents/routelens/data/inspect-p08-hosted.mjs', [root + '/traffic', root + '/seoul/graph', '--output', output('traffic')]],
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
