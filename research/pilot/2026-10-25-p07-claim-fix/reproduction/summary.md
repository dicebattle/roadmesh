# P05 deterministic claim race / P05 결정적 작업 확보 경쟁 재현

Date / 날짜: 2026-10-25 Asia/Seoul.
Run command / 실행 명령: `node data/p05-claim-race-probe/probe.mjs > data/p05-claim-race-probe/stdout.log 2>&1`.

## English

**Confirmed mechanism:** on actual PostgreSQL 18.6 using READ COMMITTED, the contributor query can return contributor `a` from its older statement snapshot after another production claimant has committed `a`'s trip to LEASED. The immediately following, unchanged trip query returns no rows while contributor `b` still has a READY trip. The current `if (!trip) return null` therefore reports idle prematurely. A subsequent unmodified production claim consumes `b` successfully.

This was one controlled run, without retrying the simulation or using sleep-based race attempts. `probe.mjs` creates an owned PostgreSQL runtime with the production schema and directly seeds two minimal initial READY fixtures. Empty observation arrays are intentionally sufficient because this experiment concerns claim selection, not ingestion validation or map matching. There are no direct trip updates after seeding: the competing transition and final availability check use the actual `IngestionStore.claim()` from `dist/tools/ingestion_store.js`. The contributor SQL extracted from current source is byte-for-byte present in that compiled module; relevant source hashes are recorded in `source-hashes.json`.

For claimant A only, the production contributor SELECT gets one added projection: `probe_gate(c.contributor_id)`. It is a VOLATILE PL/pgSQL function waiting on a test advisory transaction lock. Its return value does not change eligibility or ordering. EXPLAIN records the exact placement: `Limit → LockRows → Result(probe_gate) → Sort → contributor scan with EXISTS`. Thus the gate runs after eligibility evaluation and before contributor row locking. Direct evidence reinforces the plan: while A is blocked on the advisory lock, an independent third connection successfully executes `SELECT ... contributor_id='a' FOR UPDATE NOWAIT` and rolls back. A has not locked that contributor yet.

The schedule recorded in `results.json` is:

1. Initial read-back: `a=READY/fence0/attempt0`, `b=READY/fence0/attempt0`.
2. A begins a separate transaction and takes the same namespace clock SHARE lock used by production; then reaches the projection gate. `pg_locks` shows the ungranted advisory lock.
3. Independent NOWAIT contributor lock succeeds and rolls back.
4. The unmodified production claimant B claims `a`; it commits `a=LEASED/fence1/attempt1`. Read-back confirms `b=READY`.
5. Release the advisory gate. A's first statement returns contributor `a` despite the committed trip change. Its next production trip SELECT returns `[]`.
6. A commits. Read-back still shows `b=READY`; the unmodified production next claim gets `b`.

A's query sequence is executed explicitly over a dedicated pg connection, rather than invoking the complete `store.claim()` method with an injection hook. It reproduces the production transaction SHARE lock, exact contributor/trip SQL, and the exact branch input that yields null; it does not claim to be a second full worker process. B is a real production store claim. No same-transaction self-update or forbidden claimant state update is used to manufacture the race.

The original failed CI evidence is consistent with this mechanism: `after-stale-resume.json` contains four SUCCEEDED and five READY trips; process evidence shows worker-10 IDLE and worker-11 SUCCEEDED; `p05-two-workers` fails. Historical CI does not record statement snapshots/locks, so this local proof establishes a real code defect and a matching failure mechanism, but cannot prove the exact historical interleaving independently.

All writes are inside ignored `data/p05-claim-race-probe/`. No production source, test, documentation, commit, push or external service was changed. `runtime/database.json` identifies PostgreSQL image/settings; `runtime/ownership.json` records the exact owned resources; `runtime/cleanup.json` reports cleanup_verified=true, no failures, private files removed and processes exited. No runtime remains owned by this experiment.

## 한국어

**실제 경쟁을 재현했습니다.** PostgreSQL 18.6의 READ COMMITTED에서 처리자 A의 첫 조회는 이전 스냅샷으로 기여자 `a`를 골랐습니다. 그 조회가 기여자 행을 잠그기 직전에 멈춘 사이, 실제 생산 `IngestionStore.claim()`을 사용한 별도 처리자 B가 `a`의 여행을 LEASED로 바꾸고 커밋했습니다. A를 재개하자 첫 조회는 그대로 `a`를 반환했지만 다음 여행 조회는 빈 배열을 반환했습니다. 같은 순간 `b`는 READY였고, 다음 생산 claim은 `b`를 정상 확보했습니다. 현재 `if (!trip) return null`이 남은 작업이 있는데도 대기로 보고할 수 있습니다.

한 번의 제어된 실행으로 확인했습니다. 전체 시뮬레이션 반복이나 sleep 기반 경쟁 시도는 하지 않았습니다. 초기 최소 자료 두 건만 SQL로 만들었고, 이후 여행 상태 변경은 실제 생산 claim을 사용했습니다. 관측 배열이 비어 있는 시험자료이므로 이 결과를 수집 입력 검증이나 지도 매칭 검증으로 표현하지 않습니다.

A의 contributor SELECT에만 시험용 advisory-lock 함수 호출을 projection으로 하나 추가했습니다. EXPLAIN에서 함수는 EXISTS 평가 뒤·LockRows 앞에 있습니다. 함수 대기 중 별도 연결의 `FOR UPDATE NOWAIT`가 기여자 `a`를 실제로 확보하고 롤백하는 것도 확인하여, 단순히 실행계획만 추정하지 않고 행잠금 전이라는 것을 직접 확인했습니다. 경쟁 상대 B는 수정하지 않은 생산 claim입니다. A는 전체 메서드 대신 동일한 트랜잭션 시계 공유잠금·첫/다음 SQL을 별도 연결에서 명시적으로 실행했습니다. 이를 실제 worker 프로세스 두 개의 통합 실행으로 주장하지 않습니다.

원래 실패 자료에서도 오래된 처리자 재개 후 READY 여행이 다섯 개 남았고 worker-10은 IDLE, worker-11은 SUCCEEDED였습니다. 현재 코드의 실제 결함과 일치하는 경쟁은 증명했지만, 과거 CI에 문장별 스냅샷·잠금 기록은 없으므로 그 실행의 정확한 순서까지 확정하지는 않습니다.

결과·SQL·스크립트·실행계획·읽기 결과는 이 폴더에 보존했습니다. 생산 파일은 변경하지 않았습니다. 소유 런타임의 정리는 성공했고 컨테이너·볼륨·비공개 파일·프로세스가 남지 않았습니다.
