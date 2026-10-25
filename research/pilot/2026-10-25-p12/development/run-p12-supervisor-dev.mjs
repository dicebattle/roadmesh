import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {OwnedIngestionRuntime,portIsOpen} from '../dist/tools/ingestion_runtime.js';
import {processTree,identityAlive} from '../dist/tools/client_checks.js';
const root=resolve('data/p12-supervisor-dev01');mkdirSync(root);
const owner=new OwnedIngestionRuntime(join(root,'driver'),root),results=[];
try {
  for(const mode of ['abort','failure']) {
    const output=join(root,mode);
    const child=owner.spawn('supervisor-'+mode,'scenario_supervisor',{graph_directory:'/Users/dice/Documents/routelens/data/p11-main-20261025/seoul/graph',output});
    const baseline=await child.message(m=>m.type==='BASELINE',420000);
    const identities=processTree(child.child.pid);writeFileSync(join(root,mode+'-before.json'),JSON.stringify({baseline,identities},null,2));
    if(mode==='abort')child.child.kill('SIGTERM');else child.send({type:'THROW_PARENT'});
    const exit=await child.exited(90000),get=p=>JSON.parse(readFileSync(join(output,p)));
    const result={mode,exit,browser:get('browser/cleanup.json'),nested:get('client/cleanup.json'),outer:get('outer/cleanup.json'),remaining:identities.filter(identityAlive),port_closed:!(await portIsOpen(Number(new URL(baseline.origin).port)))};
    results.push(result);writeFileSync(join(root,'results.json'),JSON.stringify(results,null,2));
    if(exit.code===0||exit.signal||!result.browser.cleanup_verified||!result.nested.cleanup_verified||!result.outer.cleanup_verified||result.remaining.length||!result.port_closed)throw Error('Actual supervisor proof failed / 실제 감독 검증 실패');
  }
} finally {const cleaned=await owner.cleanup();writeFileSync(join(root,'driver-cleanup.json'),JSON.stringify({cleanup_verified:cleaned}));}
