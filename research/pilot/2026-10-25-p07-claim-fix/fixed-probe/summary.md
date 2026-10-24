# P05 stale selection fix / P05 오래된 선택 수정

## English

The minimal production change returns the internal `RETRY` sentinel when a contributor was selected but its next-statement eligible trip disappeared. `timedTx` commits and releases locks before the existing outer loop starts a new transaction. Genuine empty contributor selection still returns null. The separate `CLEANED` sentinel remains unchanged. Lock order, lease/fence updates, expiry and attempt limits are unchanged.

`p05-two-workers` keeps the existing requirement that both result codes are SUCCEEDED. Its actual evidence now includes each worker PID, exit code, signal and result code instead of only the result-array length.

Node 22.23.2 strict build passed once. The new focused suite passed 2/2 once: stale first contributor retries after COMMIT/BEGIN and returns the second contributor with fence1/attempt1; genuine empty selection returns null after one candidate query.

Commands:

```
PATH=/Users/dice/.local/share/mise/installs/node/22.23.2/bin:$PATH npm run build
PATH=/Users/dice/.local/share/mise/installs/node/22.23.2/bin:$PATH node --test dist/tests/ingestion_claim.test.js
PATH=/Users/dice/.local/share/mise/installs/node/22.23.2/bin:$PATH node data/p05-claim-race-fixed/probe.mjs
```

The actual fixed PostgreSQL probe invokes real `storeA.claim()` and `storeB.claim()`. Only A's first contributor SELECT receives a test-only projection gate via a private-pool facade. EXPLAIN plus independent NOWAIT acquisition establish that A pauses before row locking. B then claims a and commits; A resumes, retries and returns b with fence1/attempt1. Final direct read-back shows both a and b LEASED, fence1/attempt1. No trip updates occur outside production claim after initial fixture seeding. The original unfixed proof remains untouched in `../p05-claim-race-probe/`.

There were two fixed-probe starts: the first failed in the test harness before reaching the gate because replacing pg.Pool.connect also intercepted its callback-based internal query acquisition. Its results/script/runtime evidence are preserved under `failed-wrapper-*`. The exact owned process was terminated; exact label inventories verified its container and volume absent, and its private directory was removed. The corrected facade delegates regular query/end to the original pool and wraps only explicit transaction connect. The one justified retry passed and its runtime cleanup_verified=true. No further repeat, full simulation or screenshot was performed here.

Source files are frozen for main-agent review. No commit/push was made. All other worktree changes are preserved.

## 한국어

기여자는 골랐지만 다음 조회에서 확보 가능한 여행이 사라졌을 때만 내부 `RETRY`를 반환하도록 최소 수정했습니다. 기존 트랜잭션이 커밋·잠금 해제된 다음 바깥 반복문이 새 트랜잭션으로 재선택합니다. 실제로 기여자가 없으면 기존처럼 null을 반환합니다. 만료 자료 정리를 나타내는 `CLEANED`는 별도 값으로 유지했습니다. 잠금 순서·임대·fence·만료·시도 횟수 제한은 변경하지 않았습니다.

두 처리자 검사는 두 결과 모두 SUCCEEDED여야 한다는 조건을 유지하며, actual에 처리자별 PID·종료 코드·시그널·결과 코드를 담습니다.

Node22 엄격 빌드를 한 번 통과했고, 새 집중 검사 두 개도 한 번에 통과했습니다. 실제 고정 검사에서는 storeA와 storeB 모두 생산 claim을 호출합니다. 시험용 pool facade가 A의 첫 조회에만 잠금 지점을 넣었습니다. B가 a를 먼저 확보한 뒤 A가 재시도하여 b를 fence1·attempt1로 확보했고 최종 DB 읽기에서도 두 여행 모두 LEASED·fence1·attempt1임을 확인했습니다.

최초 시험장치 실행은 pg.Pool의 내부 callback 연결까지 덮어써 gate 도달 전에 실패했습니다. 해당 실패 스크립트·결과·런타임은 보존했습니다. 정확한 소유 프로세스를 종료했고 컨테이너·볼륨 부재와 비공개 디렉터리 삭제를 확인했습니다. 별도 facade로 시험장치를 수정한 뒤 근거 있는 재실행 한 번이 통과했으며 정상 정리도 확인했습니다. 전체 시뮬레이션·화면 촬영·추가 반복은 하지 않았습니다.

메인 검토를 위해 소스를 동결했습니다. 커밋·푸시는 하지 않았으며 다른 변경은 보존했습니다.
