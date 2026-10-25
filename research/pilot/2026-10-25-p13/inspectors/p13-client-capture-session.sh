#!/bin/zsh
# Record the actual client and completed scenario evidence only; do not alter titles, labels or evidence.
# 실제 화면과 완료된 시나리오 근거만 녹화하며 제목·표시 문구·근거는 변경하지 않습니다.
set -euo pipefail
[[ $# -eq 1 && -n "$1" ]] || { print -u2 'Usage / 사용법: data/p13-client-capture-session.sh CLIENT_URL'; exit 2; }
command -v npx >/dev/null 2>&1 || { print -u2 'npx is required / npx가 필요합니다.'; exit 1; }
pw=/Users/dice/.codex/skills/playwright/scripts/playwright_cli.sh
session="routelens-p13-client-capture-$(date +%Y%m%d%H%M%S)-$$"
open_log="data/${session}-open.txt"
process_log="data/${session}-processes.json"
cleanup_log="data/${session}-cleanup.json"
metadata_log="data/${session}-source-checked-metadata.txt"
video_path=output/playwright/p13-client-capture.webm
mkdir -p output/playwright
[[ ! -e "$video_path" ]] || { print -u2 'Existing recording is preserved; move it before a new capture. / 기존 녹화는 보존합니다. 새 녹화 전에 파일을 옮겨 주세요.'; exit 1; }

record_processes() {
  node --input-type=module - "$open_log" "$process_log" "$session" <<'JS'
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const [openFile, outputFile, session] = process.argv.slice(2);
const rootPid = Number(fs.readFileSync(openFile, 'utf8').match(/opened with pid (\d+)/)?.[1]);
if (!rootPid) throw Error('Owned capture PID absent / 소유 녹화 PID 누락');
const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,lstart=,comm='], {encoding:'utf8',env:{...process.env,LC_ALL:'C'}})
 .trim().split('\n').map(line => {
  const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/);
  if(!m)throw Error('Cannot parse process identity / 프로세스 식별 파싱 실패: '+line);
  return {pid:Number(m[1]),parent:Number(m[2]),started_at:m[3],command:m[4]};
 });
const prior=fs.existsSync(outputFile)?JSON.parse(fs.readFileSync(outputFile,'utf8')):{root_pid:rootPid,session,processes:[]};
const rootBefore=prior.processes.find(p=>p.pid===rootPid);
const rootNow=rows.find(p=>p.pid===rootPid);
if(!rootBefore&&!rootNow)throw Error('Opened capture process is absent / 열린 녹화 프로세스가 없습니다');
if(rootBefore&&rootNow&&rootBefore.started_at!==rootNow.started_at)throw Error('Capture PID reused / 녹화 PID 재사용 감지');
const owned=new Set([rootPid]);
for(let size=-1;size!==owned.size;){size=owned.size;for(const row of rows)if(owned.has(row.parent))owned.add(row.pid);}
const all=new Map(prior.processes.map(p=>[p.pid+':'+p.started_at,p]));
for(const row of rows.filter(p=>owned.has(p.pid)))all.set(row.pid+':'+row.started_at,row);
fs.writeFileSync(outputFile,JSON.stringify({...prior,processes:[...all.values()],captured_at_utc:new Date().toISOString()},null,2)+'\n');
JS
}

cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  if [[ -s "$open_log" ]]; then
    record_processes || exit_status=1
  fi
  "$pw" -s="$session" video-stop >/dev/null 2>&1 || true
  "$pw" -s="$session" close >/dev/null 2>&1 || true
  if [[ -f "$process_log" ]]; then
    node --input-type=module - "$process_log" "$cleanup_log" <<'JS' || exit_status=1
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const [processFile,outputFile]=process.argv.slice(2),owned=JSON.parse(fs.readFileSync(processFile,'utf8'));
const identify=pid=>{const r=spawnSync('ps',['-p',String(pid),'-o','lstart=,comm='],{encoding:'utf8',env:{...process.env,LC_ALL:'C'}});if(r.status===1)return null;if(r.status!==0)throw Error('Process inspection failed / 프로세스 검사 실패');return r.stdout.trim().replace(/\s+/g,' ');};
const same=p=>{const now=identify(p.pid);return now!==null&&now===`${p.started_at} ${p.command}`.replace(/\s+/g,' ');};
let remaining=[];
for(let attempt=0;attempt<50;attempt++){remaining=owned.processes.filter(same);if(!remaining.length)break;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}
const result={session:owned.session,root_pid:owned.root_pid,owned_processes_checked:owned.processes.length,cleanup_verified:remaining.length===0,remaining_owned_processes:remaining,checked_at_utc:new Date().toISOString(),message_en:'Only the named recording session was closed; original process identities were checked after close.',message_ko:'이름을 지정한 녹화 세션만 닫고 닫힌 뒤 원래 프로세스 식별자의 종료를 확인했습니다.'};
fs.writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n');
if(!result.cleanup_verified)throw Error('Owned capture processes remain / 소유 녹화 프로세스가 남았습니다');
JS
  else
    print -u2 'No owned-process record; cleanup cannot be verified. / 소유 프로세스 기록이 없어 정리를 확인할 수 없습니다.'
    exit_status=1
  fi
  exit "$exit_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$pw" -s="$session" open "$1" --browser=chrome --idle-timeout=900000 | tee "$open_log"
record_processes
"$pw" -s="$session" run-code 'async (page) => { await page.setViewportSize({width:1280,height:720}); await page.locator("#request-route").waitFor({state:"visible"}); await page.waitForFunction(()=>document.getElementById("map")?.dataset.ready==="true",undefined,{timeout:15000}); console.log(JSON.stringify({url:page.url(),title:await page.title()})); }' | tee "$metadata_log"
printf '%s' "$session" > data/p13-capture-session-name.txt
"$pw" -s="$session" video-start "$video_path" --size=1280x720 --fps=20
print 'RECORDING: send done on stdin to finish / 녹화 중: 입력에 done을 보내 종료하세요'
read -r -t 600 capture_done
[[ "$capture_done" == done ]]
record_processes
"$pw" -s="$session" video-stop
