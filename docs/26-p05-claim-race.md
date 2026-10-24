# P05 claim selection race / P05 작업 선택 경쟁

Main design fixed2026-10-25 after final P07 PR validation exposed a previously unobserved P05 interleaving. This corrects queue liveness without changing lease, fencing, privacy or the P07 wire contract. Implementation and new verification follow this contract; the original failed run is retained.

P07 최종 PR 검증에서 이전에 관측하지 못한 P05 경쟁이 드러나2026-10-25 메인이 수정 계약을 정했습니다. 임대·소유 세대·개인정보·P07 통신 계약은 유지하고 대기 작업을 계속 확보할 수 있게 고칩니다. 구현·새 검증은 아래 계약을 따르며 원래 실패를 보존합니다.

## Evidence and scope / 근거와 범위

[PR run40111577451](https://github.com/dicebattle/routelens/actions/runs/40111577451) on source `ce75b77d055878d1471d45d017adcac650c7c853` failed `p05-two-workers`: worker10 returned IDLE and worker11 SUCCEEDED, both exit0. The preceding read-back contained five READY trips. The same-head push run40111572522 passed. Neither result erases the other. Original CI records do not identify the exact database statement interleaving.

같은 소스의 PR 실행에서 처리자10은 IDLE·처리자11은 SUCCEEDED로 종료했고 직전 DB조회에는 READY5건이 남아 있었습니다. 같은 커밋의 push 실행은 통과했습니다. 어느 결과도 다른 결과를 지우지 않으며, 원래 CI 기록만으로 정확한 DB 명령 실행 순서를 단정하지 않습니다.

A single controlled PostgreSQL18.6 reproduction confirms a compatible defect in the production query sequence. Worker A's contributor SELECT evaluates EXISTS against its READ COMMITTED statement snapshot. A test-only advisory projection pauses before LockRows; EXPLAIN and a separate FOR UPDATE NOWAIT prove the pause is before contributor locking. Unmodified production claim B leases contributor a's trip and commits. A then locks unchanged contributor a from the older snapshot, but its next statement finds no eligible trip. Contributor b remains READY. Returning null here incorrectly ends the claim search. A subsequent production claim acquires b.

실제 PostgreSQL의 단 한 번의 통제된 재현에서 해당 실패와 일치하는 코드 결함을 확인했습니다. A의 첫 조회는 명령 시작 시점 자료로 대기 여행을 판단합니다. 시험용 잠금으로 행 잠금 직전 멈춘 위치를 실행계획·별도 NOWAIT 조회로 확인했습니다. 그동안 수정하지 않은 생산 claim B가 a의 여행을 확보·커밋합니다. A는 이전 자료에서 본 a를 잠그지만 다음 명령에서는 적격 여행이 없고 b는 여전히 READY입니다. 여기서 null을 반환하면 다른 대기 작업 탐색을 잘못 종료합니다. 다음 생산 claim은 b를 확보했습니다.

[Failure and reproduction archive](../research/pilot/2026-10-25-p07-claim-fix/README.md). Initial fixture rows are directly authored only for this isolated database race; this is not GPS ingestion or matching proof. The whole Seoul pipeline must still pass after the fix.

독립 DB 경쟁용 최초 자료만 직접 작성했으며 GPS 수집·매칭 증거로 사용하지 않습니다. 수정 후 실제 서울 전체 처리 흐름을 별도로 통과해야 합니다.

## Minimal change / 최소 수정

Keep clock→contributor→trip lock order and SKIP LOCKED. If no contributor is selected, keep the existing null/IDLE result. If a selected contributor no longer has an eligible trip, return an internal RETRY marker, finish that transaction, then start another selection with a fresh snapshot. Keep the existing CLEANED marker separate. Do not sleep, extend leases, bypass fencing, silently retry failed matching, serialize all workers or accept IDLE as success in the two-worker gate.

시계→기여자→여행 잠금 순서와 SKIP LOCKED를 유지합니다. 기여자가 없으면 기존 null/IDLE을 유지합니다. 선택한 기여자의 적격 여행이 사라진 경우에만 내부 RETRY를 반환해 트랜잭션을 끝내고 새 시점으로 다시 선택합니다. 기존 CLEANED와 구분하며 대기시간 추가·임대 연장·소유권 우회·매칭 실패의 암묵 재시도·모든 처리자 직렬화·검사의 IDLE 허용은 하지 않습니다.

The two-worker assertion remains both SUCCEEDED. Its actual evidence becomes PID, exit code/signal and result code per worker, replacing the unhelpful count2 versus expected2 on failure.

두 처리자 모두 SUCCEEDED라는 통과 조건은 유지합니다. 실패 때 기대2·실제2처럼 보이지 않도록 실제 근거에 처리자별 PID·종료 코드/신호·결과 코드를 기록합니다.

## Verification / 검증

Focused tests must distinguish a stale selected contributor with another READY trip from a genuinely empty queue. A real PostgreSQL follow-up calls the actual corrected A.claim and uses only a test-owned pool-query wrapper for the first advisory projection. After B claims a, A must claim b with fence1/attempt1; both leases must remain distinct. No arbitrary SQL injection or test callback is added to the production API. Preserve pre-fix outputs, run focused checks once, then have main review the actual results and run the fresh complete Seoul pipeline and capture new media before delivery.

집중 검사는 오래된 선택 뒤 다른 READY 작업이 있는 경우와 실제 빈 큐를 구분해야 합니다. 실제 DB 후속 실행은 수정한 A.claim을 직접 부르고 시험 소유 연결에서 첫 조회의 대기 지점만 감쌉니다. B가 a를 가져간 뒤 A는 b를 fence1·attempt1로 확보하고 두 임대는 서로 달라야 합니다. 생산 API에는 임의 SQL·시험 콜백을 추가하지 않습니다. 수정 전 결과를 보존하고 집중 검사1회 후 메인이 실제 결과·새 서울 전체 실행·최신 녹화를 검토한 뒤 반영합니다.
