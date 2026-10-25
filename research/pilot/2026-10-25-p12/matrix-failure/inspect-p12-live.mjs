/** Main-owned read-only SQL witness; private configuration values never leave this process.
 * 메인 소유 읽기 전용 SQL 관측이며 비공개 설정 값은 이 프로세스 밖에 남기지 않습니다. */
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import pg from 'pg';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);if(fs.existsSync(out))throw Error('New output required / 새 출력 필요');
const until=performance.now()+900000;let pool;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 while(performance.now()<until){
  const marker=path.join(root,'scenarios/public/sequence-1.jws.txt'),ownership=path.join(root,'scenarios/runtime/ownership.json');
  if(!fs.existsSync(marker)||!fs.existsSync(ownership)){await pause(1000);continue;}
  const owner=JSON.parse(fs.readFileSync(ownership)),publisher=owner.processes.find(x=>x.role==='p12-publication'&&!x.exited);
  if(!publisher){await pause(100);continue;}
  const ps=spawnSync('ps',['-p',String(publisher.pid),'-o','args='],{encoding:'utf8'});if(ps.status!==0){await pause(100);continue;}
  const configPath=ps.stdout.match(/--config\s+(\S+\.json)\s*$/)?.[1];if(!configPath||!fs.existsSync(configPath)){await pause(100);continue;}
  const config=JSON.parse(fs.readFileSync(configPath)),store=config.publication.aggregation.store;
  pool??=new pg.Pool({connectionString:store.database_url,max:1,connectionTimeoutMillis:2000,statement_timeout:2000});
  const client=await pool.connect();let result;
  try {
   await client.query('BEGIN READ ONLY');
   const q={clock:'SELECT event_time_utc FROM routelens_p05.namespace_clock WHERE namespace=$1',traversals:'SELECT count(*)::int AS count FROM routelens_p05.traversals WHERE namespace=$1',publications:'SELECT sequence,traffic_snapshot_id,octet_length(artifact) AS artifact_bytes FROM routelens_p07.publications WHERE namespace=$1 ORDER BY sequence',consumers:'SELECT consumer_id,high_water,last_snapshot_id,octet_length(artifact) AS artifact_bytes FROM routelens_p07.consumer_states WHERE namespace=$1 ORDER BY consumer_id'};
   result={queries:q,namespace:store.namespace,clock:(await client.query(q.clock,[store.namespace])).rows,traversals:(await client.query(q.traversals,[store.namespace])).rows,publications:(await client.query(q.publications,[store.namespace])).rows,consumers:(await client.query(q.consumers,[store.namespace])).rows};
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  const p=result.publications[0],snapshot=p?.traffic_snapshot_id;
  if(result.traversals[0]?.count===15&&result.publications.length===1&&result.consumers.length===3&&result.consumers.every(c=>Number(c.high_water)===1&&c.last_snapshot_id===snapshot&&c.artifact_bytes>0)){
   const proof={status:'PASS',inspected_at:new Date().toISOString(),transaction:'BEGIN READ ONLY',...result,scope_en:'Actual same-run owned local SQL at accepted sequence1; credentials are excluded.',scope_ko:'같은 실행의 소유 로컬 SQL에서 수용 순번1을 조회했으며 인증값은 제외했습니다.'};
   const text=JSON.stringify(proof,null,2);if(text.includes(store.database_url)||/postgres(?:ql)?:\/\//.test(text))throw Error('Private value refused / 비공개 값 거부');
   fs.writeFileSync(out,text+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',traversals:15,publications:1,consumers:3,snapshot}));break;
  }
  await pause(100);
 }
 if(!fs.existsSync(out))throw Error('Live SQL witness timed out / 실행 SQL 관측 기한 초과');
} finally {await pool?.end();}
