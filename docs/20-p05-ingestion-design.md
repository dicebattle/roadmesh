# P05 next design / P05 후속 설계

Status: planned, not implemented. P04 and the verified actual-Seoul simulation must complete protected integration before P05 coding. Main owns this design; Sol will implement after the executable contract is fixed.

상태: 계획이며 미구현입니다. P04와 실제 서울 시뮬레이션의 검증·보호된 병합 후 P05 코딩을 시작합니다. 메인이 설계하고 실행 계약 확정 후 Sol이 구현합니다.

## Chosen responsibility / 선택한 책임

Reuse PostgreSQL for durable storage and transactions, matching the original independently installable architecture. RouteLens owns a small ingestion API, validation, job state and worker orchestration. Avoid a second queue service until measured requirements justify it. Pin and verify the official local container and TypeScript database driver before implementation; no managed cloud provisioning is needed.

기존 독립 설치 아키텍처에 맞춰 영속 저장·트랜잭션은 PostgreSQL을 재사용합니다. RouteLens는 작은 수집 API·입력 검사·작업 상태·처리 실행을 담당합니다. 실측 필요가 생기기 전에는 별도 큐 서비스를 추가하지 않습니다. 구현 전에 공식 로컬 이미지·TypeScript 드라이버를 고정·검증하며 관리형 클라우드를 만들 필요는 없습니다.

## Invariants to make executable / 실행 계약으로 고정할 불변조건

- Acknowledgement follows committed storage. A repeated batch ID with the same content is idempotent; different content conflicts. A sample overlap never becomes a second traversal contribution.
  응답은 저장 커밋 이후에만 합니다. 같은 배치 ID·내용의 재시도는 한 번만 반영하고 내용이 다르면 충돌입니다. 중첩 표본은 추가 통과 기여로 계산하지 않습니다.
- Persist trip/batch order and finalization, so a replacement process can reconstruct the same bounded P04 input. A final batch does not finalize while an earlier batch is missing. Record graph and matching policy; no latest-version substitution.
  여행·배치 순서·종료를 저장해 대체 프로세스가 동일한 P04 입력을 재구성합니다. 앞 배치가 없으면 마지막 배치가 와도 확정하지 않습니다. 그래프·매칭 정책을 기록하고 최신 버전으로 바꾸지 않습니다.
- Lease ownership has a monotonically increasing fencing value. Expired workers cannot complete newer work. Commit deduplicated traversal outputs and terminal job status atomically; a crash between calculation and commit can repeat computation, not contributions.
  작업 임대에는 증가하는 소유 세대 번호를 둡니다. 만료된 처리자가 새 작업을 완료 처리할 수 없습니다. 중복 제거 통과 출력과 완료 상태를 같은 트랜잭션에 저장합니다. 계산과 저장 사이 중단은 계산을 반복할 수 있어도 기여를 중복 반영하지 않습니다.
- Enforce bounded request size, contributor identity from trusted local fixtures, event-time limits, consent version, source class, retry expiry and raw-observation deletion. Keep public output free of raw locations and contributor identifiers. Local fixtures do not establish production authentication.
  요청 크기·신뢰한 로컬 시험 신원·관측시각 범위·동의 버전·출처·재시도 만료·원시 관측 삭제를 제한합니다. 공개 출력에는 원시 위치·기여자 식별자를 넣지 않습니다. 로컬 시험 신원은 운영 인증을 증명하지 않습니다.

## Direct proof / 직접 증명

Start actual local HTTP, PostgreSQL and separate worker processes alongside the fresh existing pipeline. Kill only owned workers after acceptance, after lease and after result calculation, restart them, and inspect database rows plus final outputs. Race two workers, retry the same batch, send a conflicting batch, leave a sequence gap, expire a lease, and verify deletion by read-back. Reuse P04 full-trip semantic hashes as the recovery oracle. Distinguish repeated computation from exactly-once stored effects. Publish a new report and recording only after these direct checks pass.

새 기존 처리 흐름과 함께 실제 로컬 HTTP·PostgreSQL·별도 처리 프로세스를 띄웁니다. 접수 후·임대 후·계산 후에 소유한 처리자만 종료·재시작하고 DB 행과 최종 출력을 확인합니다. 두 처리자 경쟁·동일 배치 재시도·다른 내용 충돌·순서 누락·임대 만료·삭제 후 재조회를 검사합니다. P04 전체 여행의 의미 해시를 복구 기준으로 씁니다. 계산 반복과 저장 효과의 한 번 반영을 구분하며 직접 검증 후 보고서·녹화를 갱신합니다.

## Source and open details / 출처·남은 상세 결정

[PostgreSQL 18 SELECT locking documentation](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE), inspected 2026-10-24, documents row locking and `SKIP LOCKED` for queue-like consumers. It is a possible claim primitive, not proof of recovery correctness. Exact schema, lease duration, transactional claim/finish SQL and failpoint IPC must be written before delegation. See [the draft product contract](04-protocol.md) for retention/time policies; document any deliberate pilot-specific difference.

공식 PostgreSQL18 문서의 행 잠금·SKIP LOCKED를2026-10-24에 확인했습니다. 이는 작업 확보 수단이며 복구 정확성의 증명이 아닙니다. 위임 전에 정확한 스키마·임대 기간·확보/완료 SQL·중단 지점 통신을 정합니다. 보관/시각 정책은 제품 계약 초안을 따르고 파일럿에서 달라지는 부분은 명시합니다.

## Executable detail / 실행 상세

The decided schema, interfaces, time/retention boundaries, process failpoints and direct acceptance matrix are now fixed in [the P05 executable contract](22-p05-executable-contract.md). Implementation is in progress; no completion claim yet.

확정한 스키마·인터페이스·시간/보관 경계·실제 중단 지점·수용 행렬을 실행 계약에 기록했습니다. 구현을 진행하며 완료로 표시하지 않습니다.
