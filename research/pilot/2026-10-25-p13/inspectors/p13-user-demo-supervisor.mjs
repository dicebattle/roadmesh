/** Main-owned demo controller. Private IPC only; never a public fault endpoint.
 * 메인 소유 시연 제어기. 비공개 IPC만 사용하며 공개 장애 API를 만들지 않습니다. */
import fs from 'node:fs';import path from 'node:path';import {fork} from 'node:child_process';import readline from 'node:readline';import assert from 'node:assert/strict';
const [graphArg,outArg]=process.argv.slice(2),graph=fs.realpathSync(graphArg),out=path.resolve(outArg);assert.ok(!fs.existsSync(out));fs.mkdirSync(out);
const config=path.join(out,'config.json'),pilot=path.join(out,'pilot');fs.writeFileSync(config,JSON.stringify({graph_directory:graph,output_directory:pilot,assets_directory:path.resolve('dist/web/pilot'),clock_mode:'automatic',lifetime_ms:900000}),{mode:0o600,flag:'wx'});
const stdout=fs.openSync(path.join(out,'stdout.log'),'wx'),stderr=fs.openSync(path.join(out,'stderr.log'),'wx');
const child=fork(path.resolve('dist/tools/client_serve.js'),['--config',config],{stdio:['ignore',stdout,stderr,'ipc']});
const messages=[];let exited=false;const save=()=>fs.writeFileSync(path.join(out,'messages.json'),JSON.stringify(messages,null,2)+'\n');
const lines=readline.createInterface({input:process.stdin,terminal:false});
child.on('message',m=>{messages.push(m);save();console.log(JSON.stringify(m));});
const stop=()=>{if(!exited&&child.connected)child.send({type:'SHUTDOWN',control_id:'demo-shutdown'});};
process.once('SIGINT',stop);process.once('SIGTERM',stop);lines.once('close',stop);
lines.on('line',line=>{try{const m=JSON.parse(line);assert.ok(typeof m.control_id==='string');assert.ok(child.connected);child.send(m);}catch(e){console.error('Rejected private control / 비공개 제어 거부: '+String(e));}});
child.once('exit',(code,signal)=>{exited=true;fs.writeFileSync(path.join(out,'exit.json'),JSON.stringify({pid:child.pid,code,signal},null,2)+'\n');save();fs.closeSync(stdout);fs.closeSync(stderr);fs.unlinkSync(config);lines.close();process.exitCode=code??1;console.log(JSON.stringify({type:'EXIT',code,signal}));});
console.log(JSON.stringify({type:'STARTED',pid:child.pid,output:out}));
