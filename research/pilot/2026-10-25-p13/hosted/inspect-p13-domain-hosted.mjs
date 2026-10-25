import fs from 'node:fs';
import {readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash,createPublicKey,verify} from 'node:crypto';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);
const json=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
function stable(v){return Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;}
function canonical(v){return Buffer.from(JSON.stringify(stable(v)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));}
function must(ok,s){if(!ok)throw Error(s);}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const m=json(join(root,'manifest.json'));let hashes=0;
const omitted=[];const allowed=new Map(['bundle','supervisors/abort/client/bundle','supervisors/failure/client/bundle'].map(p=>[p+'/graph.tar',json(join(root,p,'manifest.json')).graph_extract_sha256]));for(const [p,h]of Object.entries(m.output_sha256)){const f=join(root,p);if(!fs.existsSync(f)){must(allowed.get(p)===h,'unexpected omission '+p);omitted.push({path:p,sha256:h,actual_bytes_verified:false});continue;}must(lstatSync(f).isFile()&&!lstatSync(f).isSymbolicLink()&&sha(readFileSync(f))===h,'original hash '+p);hashes++;}
const a=json(join(root,'assertions.json'));must(m.status==='PASS'&&m.source.dirty===false&&a.length===24&&a.every(x=>x.status==='PASS'),'clean P12 twenty-four');
const all=walk(root),native=all.filter(p=>p.endsWith('/route.request.json')&&p.includes('/nodes/'));
const errors=[];
for(const [id,code,reason] of [['no-suitable-road',171,'NO_SUITABLE_ROAD'],['no-path',442,'NO_PATH']]){
  const api=json(join(root,'requests',id+'.json'));must(api.status===422&&api.body.reason===reason,'public domain');
  must(Object.keys(api.body).sort().join(',')==='code,message_en,message_ko,reason','private field leak');
  const attemptFiles=all.filter(p=>p.endsWith('/attempts.json')&&p.includes('/'+id+'-'));
  must(attemptFiles.length===1,'unique gateway evidence');const attempts=json(attemptFiles[0]);must(attempts.length===1,'domain retried');
  const peer=attempts[0].body;const observedCode=id==='no-path'?peer.native_code:code;must(id!=='no-path'||[170,442].includes(observedCode),'unsupported no-path code');must(peer.code==='ROUTE_REJECTED'&&peer.native_code===observedCode&&peer.reason===reason,'private domain tuple');
  must(sha(canonical(attempts[0].request))===peer.request_sha256,'internal request binding');
  const req=api.request,expected={locations:[{lon:req.origin.longitude,lat:req.origin.latitude,search_cutoff:100,minimum_reachability:0},{lon:req.destination.longitude,lat:req.destination.latitude,search_cutoff:100,minimum_reachability:0}],costing:'auto',units:'kilometers',language:'en-US',date_time:{type:0}};
  must(sha(canonical(expected))===peer.native_request_sha256,'native expectation binding');
  const candidates=native.filter(p=>sha(canonical(json(p)))===peer.native_request_sha256).filter(p=>{
    const b=json(p.replace('route.request.json','route.response.json')),headers=readFileSync(p.replace('route.request.json','route.headers.txt'),'utf8');
    const identity=json(p.replace('route.request.json','identity.json'));
    return b.error_code===observedCode&&b.status_code===400&&/^HTTP\/1\.1 400/m.test(headers)&&identity.before.pid===peer.provenance.native_daemon.pid&&identity.before.start_ticks===peer.provenance.native_daemon.start_ticks&&canonical(identity.before).equals(canonical(identity.after));
  });
  must(candidates.length>0,'no matching original native400');errors.push({id,code:observedCode,original_native_candidates:candidates.map(p=>relative(root,p)),unique_native_request_claim:false});
}
const roots=json(join(root,'public/trust-roots.json'));let signatures=0;
for(const f of all.filter(p=>p.includes('/public/sequence-')&&p.endsWith('.jws.txt'))){const compact=readFileSync(f,'utf8'),[h,b,s]=compact.split('.'),header=JSON.parse(Buffer.from(h,'base64url')),body=JSON.parse(Buffer.from(b,'base64url'));const key=roots.find(r=>r.kid===header.kid);must(key&&header.alg==='EdDSA','signature header');must(verify(null,Buffer.from(h+'.'+b),createPublicKey({key:key.public_jwk,format:'jwk'}),Buffer.from(s,'base64url')),'signature');const artifact=readFileSync(f.replace('.jws.txt','.artifact.json'));must(sha(artifact)===body.traffic_snapshot_id&&artifact.length===body.byte_length,'artifact binding');signatures++;}
const cleanup=json(join(root,'cleanup.json'));must(cleanup.cleanup_verified&&cleanup.sockets_remaining===0,'owned cleanup');
const reset=json(join(root,'readbacks/tcp-reset.json')),held=json(join(root,'readbacks/tcp-blackhole.json'));
must(reset.event.forwarded===false&&reset.event.closed_ms>=reset.event.reset_ms&&reset.attempts.length===2,'actual reset');
must(held.event.forwarded===false&&held.event.held_without_headers&&held.event.closed_ms>held.event.accepted_ms&&held.attempts.length===2&&held.attempts[0].deadline_ms<=4000&&held.stalled.elapsed_ms<12000,'actual stall deadline');
const before=json(join(root,'readbacks/car-before.json')),after=json(join(root,'readbacks/car-after.json'));must(canonical(before).equals(canonical(after.after))&&after.carRetry.body.code==='DUPLICATE','car contamination');
must(m.source.commit===process.argv[4]&&m.implementation_sha256==='ba9395ec5ba3ac6dc5d1e296a9334b0bbebd72053b46674692f1c58a84556bfa','source/runtime binding');const result={status:'PASS',omitted_map_bytes:omitted,live_resource_queries_performed:false,source:m.source,implementation_sha256:m.implementation_sha256,graph_id:m.graph_id,original_hashes_checked:hashes,p12_cases:a.length,standard_signatures_verified:signatures,native_domain_originals:errors,reset_elapsed_ms:reset.reset.elapsed_ms,stall_elapsed_ms:held.stalled.elapsed_ms,stall_peer_elapsed_ms:held.attempts[0].elapsed_end_ms-held.attempts[0].elapsed_start_ms,cleanup_verified:true,scope_en:'P12 domain originals, signature, controlled transport timings and CAR isolation; whole matrix/supervisor proof is inspected separately.',scope_ko:'P12 업무 원문·서명·통제 전송 시간·자동차 분리를 확인하고 전체 행렬·감독은 별도 검사합니다.'};writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
