# P06 traffic aggregation / 교통 집계

Implementation is on the P06 branch; final clean whole-system verification and delivery remain pending. The [executable contract](../../docs/23-p06-aggregation-contract.md) is canonical. The [projection policy](../../docs/24-observed-projection-policy.md) explains the prerequisite matching correction and preserved failures.

P06 브랜치에 구현되어 있으며 최종 깨끗한 전체 검증·전달은 남아 있습니다. 실행 계약을 기준으로 하며 투영 정책 문서에 선행 매칭 보정과 실패 기록을 설명합니다.

## Data flow / 처리 흐름

`traffic_aggregation.ts` applies the pure selection and median rules. `aggregation_store.ts` reads committed P05 traversals and their persisted successful-completion time, enforces the database clock, and transactionally stores one canonical unsigned candidate per window. `aggregation_worker.ts` provides the separate process used by the fault tests. `aggregation_scenario.ts` authors actual-Seoul short trips before matching; `aggregation_checks.ts` runs the real database/process tests. The whole-pilot runner invokes these after fresh graph, simulation, matching and ingestion stages.

순수 규칙 모듈이 기여 선택·중앙값을 계산합니다. 저장 모듈은 P05가 저장한 통과·성공 시각을 읽고 DB 시계를 적용해 창별 표준 후보 하나를 트랜잭션으로 저장합니다. 별도 처리 프로세스로 중단 검사를 수행합니다. 시나리오는 실제 서울의 짧은 여행을 매칭 전에 작성하며 검사 모듈은 실제 DB·프로세스를 실행합니다. 전체 실행기는 새 그래프·시뮬레이션·매칭·수집 다음에 집계를 호출합니다.

## Selection and visibility / 선택과 표시

An exit belongs to a60s UTC window. A traversal is eligible only if its successful matching became available strictly before window end+30s. Finalization waits for that deadline; later callers cannot backdate the stored clock. Each contributor supplies only the earliest eligible traversal for a directed edge/source/window. Five distinct contributors are required for LIVE. The speed is verified full-edge length divided by median complete duration, including signal waits. PARKED trips are excluded; omitted activity remains TRAVEL without changing legacy request hashes.

진출 시각에 따라60초 UTC 창을 정합니다. 매칭 성공 자료가 창 종료+30초보다 엄격히 일찍 사용 가능해야 하며 확정은 그 마감 뒤에 합니다. 늦은 호출로 저장 시계를 되돌릴 수 없습니다. 같은 기여자는 방향 구간·출처·창마다 가장 이른 통과 하나만 기여합니다. 서로 다른5명이 있어야 LIVE이며 검증된 전체 길이를 신호 대기 포함 전체 통과 시간 중앙값으로 나눕니다. PARKED 여행은 제외하고 활동 생략은 기존 요청 해시를 유지한 TRAVEL입니다.

All79 pilot edges are explicit: no samples → UNKNOWN;1–4 contributors → INSUFFICIENT;5+ → LIVE. Qualified entries become STALE with null speed at window end+180s. A newer empty window does not inherit an old speed. Source classes stay isolated; the executed fixture is SYNTHETIC. Public candidates contain only the contract's whitelist and coarse sample buckets, never contributor/trip/observation identifiers.

파일럿79구간을 모두 표시합니다. 표본0은 UNKNOWN,1~4명은 INSUFFICIENT,5명 이상은 LIVE입니다. 창 종료+180초에 자격 있는 값도 STALE·속도 없음으로 바뀝니다. 새 빈 창에 이전 속도를 물려주지 않습니다. 출처 종류는 분리하며 실행 자료는 SYNTHETIC입니다. 공개 후보에는 계약에서 허용한 필드·대략적 표본 구간만 포함하고 기여자·여행·관측 식별자는 넣지 않습니다.

## Storage and deletion / 저장과 삭제

PostgreSQL supplies transactions, row locks and uniqueness. RouteLens defines lock order, deadlines, canonical bytes, catalog identity and eligibility. The candidate does not copy private contributor IDs. A P05 traversal deletion invalidates its derived candidate in the same transaction; recomputation reflects revocation. Candidate retention ends at window end+24h, and repeated sweep is idempotent. Exported files are outside the deletion guarantee.

PostgreSQL의 트랜잭션·행 잠금·유일성 기능을 활용하고 RouteLens가 잠금 순서·마감·표준 바이트·목록 식별·자격을 정합니다. 후보에 비공개 기여자 식별자를 복사하지 않습니다. P05 통과 삭제와 파생 후보 무효화를 같은 트랜잭션에서 처리하고 재계산에 철회를 반영합니다. 창 종료+24시간 후 후보를 삭제하며 반복 삭제는 결과를 바꾸지 않습니다. 이미 내보낸 파일의 회수는 보장하지 않습니다.

## Boundaries / 범위

This is an **unsigned candidate**, not a published or activated TrafficSnapshot. P07 signing/publication and P08 routing-engine traffic consumption remain unimplemented. A declared moving PARKED fixture proves activity filtering, not automatic parking detection. Synthetic timing checks do not establish real-driving accuracy, live traffic or privacy guarantees beyond the tested fields and deletion paths. Failed and development runs remain separately labeled under the [P06 evidence folder](../../research/pilot/2026-10-24-p06/).

이는 **서명 전 후보**이며 게시·활성화된 TrafficSnapshot이 아닙니다. P07 서명·게시와 P08 경로 엔진의 교통 반영은 미구현입니다. 움직이지만 PARKED로 선언한 자료는 활동 필터 검사이며 자동 주차 감지가 아닙니다. 합성 시간 검사는 실제 주행 정확도·실시간 교통이나 검사 범위를 넘는 개인정보 보장을 입증하지 않습니다. 실패·개발 실행은 P06 증거 폴더에서 구분합니다.
