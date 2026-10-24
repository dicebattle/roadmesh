# Durable ingestion and recovery / 영속 수집과 복구

P05 is implemented for bounded SYNTHETIC local trips and verified through actual HTTP, PostgreSQL and separate worker processes. [Final report](../../research/pilot/2026-10-24-p05/report.md) records111 full-pipeline assertions, including34 P05 checks. Main owns [the executable contract](../../docs/22-p05-executable-contract.md); Sol implemented the code and tests. Hosted verification is tracked in the report.

P05는 제한된 합성 로컬 여행을 구현했고 실제 HTTP·PostgreSQL·별도 처리자 실행으로 검증했습니다. 최종 보고서에 P0534개를 포함한 전체111개 검사를 기록합니다. 메인은 실행 계약, Sol은 코드·테스트를 맡았으며 원격 검증은 보고서에서 관리합니다.

## Ownership / 책임

| Component / 구성 | Responsibility / 책임 |
| --- | --- |
| `tools/ingestion_validation.ts` | Bounded schema, graph/policy, event time and payload checks / 제한 스키마·그래프/정책·관측시각·본문 검사 |
| `tools/ingestion_store.ts` | Transactions, shared clock, sequence/finalization, fenced leases, atomic completion and deletion / 트랜잭션·공유 시계·순서/종료·임대 세대·원자적 완료·삭제 |
| `tools/ingestion_service.ts` | Local HTTP acceptance after commit, fixture authentication and scoped status/revoke / 커밋 후 로컬 HTTP 접수·시험 인증·범위별 상태/철회 |
| `tools/ingestion_worker.ts` | One claimed trip, existing real P04 matcher, owned attempts and completion / 여행 하나 확보·기존 실제 P04 매칭·시도 소유·완료 |
| `tools/ingestion_runtime.ts` | Pinned real DB/volume, private credentials, restart discovery and cleanup / 고정 실제 DB/볼륨·비공개 인증·재시작 조회·정리 |
| `tools/ingestion_checks.ts` | Real process/fault orchestration and read-back assertions / 실제 프로세스·장애 실행·재조회 검사 |
| `tools/pilot_integration.ts` | Fresh tiny regression → actual Seoul → P05 → combined report / 새 작은 회귀→실제 서울→P05→합친 보고서 |

PostgreSQL supplies durability, row locking and uniqueness. RouteLens defines accepted batch identity, final sequence, persisted event clock, worker fencing, retention and consent behavior. Receipt means committed storage; matching completion is a later state. Retries may repeat computation but do not duplicate committed traversal effects. Exact API fields, limits and retention live in the contract rather than being duplicated here.

PostgreSQL은 영속성·행 잠금·고유 제약을 제공하고 RouteLens는 배치 동일성·종료 순서·영속 관측시계·처리자 세대·보관·동의 동작을 정합니다. 접수는 저장 커밋이고 매칭 완료는 이후 상태입니다. 재시도가 계산을 반복해도 저장된 통과 효과를 중복하지 않습니다. 정확한 API·한도·보관은 계약을 참조합니다.

## Run and inspect / 실행과 검사

```sh
npm ci
npm run build
npm run simulation:check -- --output data/new-pilot-run
npm run report:serve -- data/new-pilot-run
```

Use Node22/24 and Docker. The command owns its API, DB volume, worker children and engine containers and checks their cleanup. `ingestion:serve` and `ingestion:worker` are internal building blocks requiring private fixture configuration; the integrated command generates that configuration without publishing it. Do not invent a real-person credential or supply live traces.

Node22/24·Docker를 사용합니다. 실행기는 API·DB 볼륨·처리자·엔진 컨테이너를 소유하고 정리를 확인합니다. 개별 serve/worker 명령은 비공개 시험 설정이 필요한 내부 구성요소이고 통합 명령이 이를 생성·삭제하며 게시하지 않습니다. 실제 개인 인증·이동기록을 넣지 않습니다.

Inspect `ingestion/readbacks/baseline-succeeded.json`, `attempt-links.json`, `runtime/database-restart.json`, expiry/revocation read-backs, `engine-abort-*.json` and cleanup. Do not rely only on green assertions. Raw retained location-shaped data in these reports is synthetic and subject to its map-data license.

성공 DB·복구 시도·DB 재시작·만료/철회 재조회·엔진 중단·정리를 검사하며 통과 표시만 믿지 않습니다. 보고서의 위치 형태 자료는 합성이며 지도 자료의 라이선스를 유지합니다.

Next: P06 event-time aggregation over accepted stored traversals, with distinct-contributor limits, late events and expiry on actual Seoul corridors. Production authentication, continuous GPS, WAL/backup erasure and P06–P14 remain outside this module.

다음은 저장된 채택 통과를 실제 서울 구간에서 기여자 제한·늦은 입력·만료와 함께 집계하는 P06입니다. 운영 인증·연속 GPS·WAL/백업 삭제·P06~P14는 이 모듈 범위 밖입니다.
