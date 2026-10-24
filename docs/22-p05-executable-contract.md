# P05 executable contract / P05 실행 계약

Status: design fixed before implementation, 2026-10-24. Main owns this contract and review; Sol implements. This extends [P05 design](20-p05-ingestion-design.md), [protocol](04-protocol.md) and [privacy](07-privacy-and-trust.md). Seoul PR #5 merged as `d385c5d`; the prior goal turn made verified implementation progress, not merely a plan. P06–P14 remain unfinished.

상태: 2026-10-24 구현 전에 실행 계약을 정했습니다. 메인이 계약·검토를 맡고 Sol이 구현합니다. 서울 PR #5가 `d385c5d`로 병합됐으며 직전 차례는 실제 구현·검증을 완료한 진전입니다. P06~P14 전체는 미완료입니다.

## Reuse and process boundary / 재사용과 프로세스 경계

Use official PostgreSQL 18.6-bookworm, OCI index `sha256:bbf83594798e144bff365a9c191c5d779f181fb3135902064ab8ff11918020fc`, and exactly `pg@8.23.1`, `@types/pg@8.23.1`. Main verified registry metadata and the official image index on 2026-10-24. Reuse database transactions, row locks and uniqueness; do not implement a second queue or an ORM. Pin package lock integrity. Node HTTP and distinct Node worker processes run on loopback; PostgreSQL uses a separately owned persistent volume and a random loopback port. Keep PostgreSQL durability defaults (`fsync`, `synchronous_commit`, `full_page_writes`) enabled and record them. No managed service is provisioned.

공식 PostgreSQL 이미지·드라이버를 위 버전과 해시로 고정합니다. 메인이 공식 이미지·패키지 정보를 확인했으며 DB 트랜잭션·행 잠금·고유 제약을 재사용하고 별도 큐·ORM은 추가하지 않습니다. HTTP 서버와 별도 Node 처리자는 로컬 인터페이스를 사용하고 PostgreSQL에는 소유한 영속 볼륨·임의 로컬 포트를 둡니다. 내구성 기본 설정을 켠 채 기록하며 관리형 서비스를 만들지 않습니다.

## Private local-pilot input / 비공개 로컬 파일럿 입력

`POST /v1/observations/batches` requires a run-scoped bearer credential mapped by the server to one contributor and one vehicle. The client cannot choose contributor identity. Credentials/DSNs live in ignored private files with mode 0600 or process environment, never artifacts/logs. Supported source is only `SYNTHETIC` in a configured simulation namespace. This is a local fixture authentication adapter, not production authentication.

배치 API는 서버가 한 기여자·한 차량으로 연결한 실행 전용 인증값을 요구합니다. 클라이언트는 기여자를 지정하지 못합니다. 인증·DB 접속정보는 비공개 파일/환경에만 두고 증거·로그에 넣지 않습니다. 설정한 시험 영역의 합성 입력만 지원하며 운영 인증 구현으로 주장하지 않습니다.

```typescript
type IngestBatch = {
  schema_version: "0.1";
  batch_id: string;                 // stable within contributor / 기여자 안에서 고정
  trip_id: string;                  // stable private trip / 고정 비공개 여행
  batch_seq: number;                // 0..127, gaps may arrive later / 누락 순서 후속 접수
  is_final: boolean;
  graph_id: string;
  matching_policy: "seoul-observed-v2";
  consent_version: "pilot-consent-v1";
  source_class: "SYNTHETIC";
  trip_start_utc: string;
  samples: Observation[];           // existing P03 Observation / 기존 P03 관측 타입
};
type TripState = "WAITING" | "READY" | "LEASED" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "REVOKED";
```

This pilot intentionally reuses P03's named coordinates, `sample_id`, `vehicle_id`, `offset_ms` and `event_time_utc`; speed/heading are not used. It adds bounded trip/order/finalization fields to the earlier draft. Maximum request 65,536 bytes, 60 samples per batch, 3,001 distinct samples and 300 seconds per trip, 128 batches, 20 active trips per contributor. Identifiers have explicit ASCII lengths; dates must be UTC and exactly agree with start+offset; all numbers finite, coordinates valid, accuracy positive. Reject duplicate JSON keys and unknown fields. Batch samples are strictly ordered and unique. Samples in another batch with the same ID must have the same canonical content; no silent overwrite. Server-authenticated vehicle must match every sample.

파일럿은 기존 P03 관측 필드를 재사용하고 여행·순서·완료 정보를 추가합니다. 요청 65,536바이트·배치60개·여행의 서로 다른 표본3,001개/300초·128배치·기여자별 활성여행20개로 제한합니다. 식별자 길이·UTC 시각/오프셋 일치·유한 수·좌표·양수 정확도를 검사합니다. 중복 JSON키·미지원 필드·배치 내부 중복/역순을 거부하며 배치 간 같은 표본의 내용 변경도 충돌입니다. 모든 표본의 차량은 서버 인증과 일치해야 합니다.

Responses: `202 ACCEPTED|DUPLICATE` only after commit (with trip state, never a matching-complete claim); `400 INVALID_JSON`, `401 UNAUTHORIZED`, `403 CONSENT_REVOKED|SOURCE_NOT_ALLOWED`, `409 BATCH_CONFLICT|TRIP_CONFLICT|VERSION_MISMATCH`, `410 TRIP_EXPIRED`, `413 PAYLOAD_TOO_LARGE`, `422 INVALID_INPUT|OBSERVATION_TIME_INVALID`, `429 CAPACITY_EXCEEDED`, `503 STORE_UNAVAILABLE`. Include stable code, `message_en`, `message_ko`; do not echo coordinates, tokens, SQL or DSNs. Status/health APIs expose only state/counts and require authentication where trip-specific. Revocation is an authenticated owner action; no public raw-observation endpoint.

응답은 저장 커밋 후에만 접수/중복 상태를 반환하며 매칭 완료와 구분합니다. 위 오류를 고정 코드·한영 설명으로 구분하고 좌표·인증·SQL·접속정보를 되돌려주지 않습니다. 상태 조회는 상태·수만 제공하며 여행별 조회는 인증이 필요합니다. 동의 철회는 인증한 소유자 작업이고 원시 관측 공개 API는 없습니다.

## Storage and transactions / 저장 구조와 트랜잭션

Use schema `routelens_p05` with six tables:

- `contributors`: server identity, vehicle, current consent, active/revoked state; credentials are never stored here.
- `trips`: PK contributor+trip, immutable namespace/graph/policy/start/source/vehicle; final sequence nullable; state; receipt/activity/expiry times; owner, increasing bigint fence, lease deadline, attempt count; matching summary digest/counts only.
- `batches`: PK contributor+batch; UNIQUE contributor+trip+sequence; canonical request hash, final flag and bounded receipt/expiry metadata, no retained request body.
- `samples`: PK contributor+trip+sample; UNIQUE contributor+trip+offset; canonical hash and nullable private observation JSON. Delete/null observation payload after success; retain only bounded dedupe hashes until expiry.
- `traversals`: PK deterministic observation ID, contributor/trip/graph/policy/directed edge, UTC entry/exit, distance/duration, source; no GPS or candidate/point geometry. Keep contributor data private for P06. IDs bind namespace+contributor+trip+P04 traversal ID; retries cannot add another row.
- `events`: bounded diagnostic state/fence/attempt/error-code records, no credentials or raw locations. The runner may separately retain synthetic engine evidence under an explicitly synthetic output root.

스키마는 기여자·여행·배치 해시·관측·수용 통과·최소 상태 이벤트의 여섯 테이블로 구성합니다. 여행의 지도/정책/시작/차량은 불변이고 임대 소유 세대 번호는 증가합니다. 배치 본문은 보존하지 않습니다. 성공 후 원시 관측은 삭제하고 제한된 중복 해시만 남깁니다. 통과에는 방향 구간·시각·거리·시간을 저장하되 GPS 지형을 넣지 않으며 기여자 정보는 P06용 비공개입니다. 이벤트에는 위치·인증값을 넣지 않습니다. 실행기는 합성임을 명시한 폴더에만 별도 엔진 증거를 보존할 수 있습니다.

Every acceptance transaction locks the contributor first, then the trip. Create missing rows with conflict-safe SQL before locking. Check current consent under the same lock. Exact batch replay within its original 24h window returns DUPLICATE without extending expiry or reviving payloads. Different content or sequence reuse conflicts. Immutable trip metadata conflicts even across retries. New samples older than 120s or at least30s in the future relative to trusted server event-time are rejected atomically; an already accepted identical overlap may be reused without making it new. Check all limits before commit; a rejected batch leaves no partial mutation. A final sequence is immutable, forbids later sequence numbers, and must not truncate already accepted batches. READY requires every sequence0..final, a valid complete merged observation envelope and no conflicts. Last batch arrival alone is not completion. Post-finalization only exact batch replay is accepted.

接수는 기여자→여행 순서로 잠그고 같은 트랜잭션에서 동의를 확인합니다. 원래24시간 안의 동일 배치 재시도는 만료 연장·원문 복원 없이 중복으로 응답합니다. 내용/순서/불변 메타데이터 충돌은 거부합니다. 신규 표본이 서버 관측시간 기준120초보다 오래되거나30초 이상 미래면 배치 전체를 거부합니다. 기존 동일 중첩 표본은 신규로 세지 않습니다. 거부 후 일부 저장이 남지 않아야 하며 마지막 순서는 불변이고 이미 받은 배치를 잘라낼 수 없습니다. 0부터 마지막까지 모든 배치와 합쳐진 입력의 유효성이 확인돼야 READY입니다. 종료한 여행에는 정확한 기존 배치 재시도만 허용합니다.

Claim is one short transaction using `FOR UPDATE SKIP LOCKED` over READY or expired LEASED jobs, with a monotonically incremented fence/attempt and database `clock_timestamp()` lease deadline. The worker loads a coherent bounded envelope at claim. No transaction remains open during matching. Pin the exact graph and policy; call actual `runSeoulMatching`, never supply truth or read baseline outputs as work. A worker may recompute after a crash, but completion locks contributor then trip, rechecks active consent, state, owner, fence, unexpired database lease and event expiry, then inserts all accepted traversals, marks SUCCEEDED and purges raw observations in **one transaction**. Verify row contents on unique conflicts rather than treating unrelated collisions as success. A stale owner returns LEASE_LOST and performs no writes. Failure release uses the same fence predicate; max3 attempts then FAILED and purge raw data.

작업 확보는 짧은 행 잠금 트랜잭션으로 READY 또는 만료된 LEASED를 선택하고 소유 세대·시도 수를 증가시킵니다. 임대는 DB 실제 시계를 사용하고 매칭 중 트랜잭션을 열어두지 않습니다. 검증된 지도·정책으로 실제 매칭을 실행하며 정답·기준 결과를 작업 입력으로 읽지 않습니다. 완료는 다시 기여자→여행을 잠그고 동의·상태·소유자·세대·임대/입력 만료를 확인한 뒤 모든 통과 저장·성공 상태·원문 삭제를 한 트랜잭션으로 처리합니다. 오래된 소유자는 쓰기 없이 거부하며 실패 재시도도 같은 세대 조건을 사용합니다. 최대3회 후 실패·원문 삭제입니다.

Default lease120s; bounded pilot workers have no lease heartbeat. Slow work can lose its lease and must fail closed; this is not a throughput guarantee. Test fixtures may use a shorter explicit lease and must measure actual elapsed wait, never change database timestamps to pretend expiry occurred. Matching outputs have unique attempt directories. Kill tests pause over parent-child IPC at `AFTER_LEASE`, `AFTER_MATCH` (engine container already cleaned), and `AFTER_INSERT` (transaction uncommitted). Server has an IPC `AFTER_ACCEPT_COMMIT` pause before response. Resume messages come only from the owning parent. Failpoint activation cannot come from an HTTP request.

기본 임대는120초이며 제한된 파일럿 처리자는 임대를 자동 연장하지 않습니다. 오래 걸리면 임대를 잃고 안전하게 거부해야 하며 처리량 보장은 아닙니다. 시험은 명시한 짧은 임대를 사용할 수 있지만 실제 경과시간을 측정하고 DB 시간을 고쳐 만료를 꾸미지 않습니다. 시도마다 별도 엔진 출력 폴더를 씁니다. 부모/자식 통신으로 임대 후·매칭 후·통과 INSERT 후 커밋 전에 일시정지해 실제 종료를 검사합니다. 서버도 접수 커밋 후 응답 전 지점을 제공하며 HTTP 요청으로 중단 지점을 켤 수 없습니다.

## Clocks, retention and revocation / 시계·보관·철회

Separate trusted event-time from database lease time and monotonic timeout measurement. The runner advances event-time over private IPC/config, never a client header, and sends batches in a global event order with controlled reorder/duplicate cases. Default raw context expires at min(last accepted activity+10min, trip start+1h, first receipt+24h). Success purges raw payload immediately. Sweeping expired context fences the trip, removes raw payload and disallows later finalization. Retain coordinate-free dedupe metadata and internal traversal contribution at most24h from first receipt; then delete. Revocation locks contributor then trips, marks contributor inactive, increments fences, marks REVOKED and removes raw payload and traversal rows atomically. Repeat revocation/sweep is idempotent. Check actual payload fields/rows after sweep, not only a reported counter. These are logical primary-store deletion claims, not forensic erasure of database WAL/backups.

서버의 신뢰한 관측시간·DB 임대 실제시각·통신의 단조 경과시간을 분리합니다. 실행기만 비공개 통신으로 관측시간을 움직이며 클라이언트 헤더는 사용하지 않습니다. 원문은 마지막 접수10분·여행 시작1시간·최초접수24시간 중 가장 빠른 시점에 만료하고 성공 즉시 삭제합니다. 만료 여행은 세대를 바꿔 뒤늦은 완료를 막습니다. 좌표 없는 중복 정보·비공개 통과도 최초접수24시간까지만 유지합니다. 철회는 기여자/여행 잠금·비활성화·세대 증가·원문/통과 삭제를 한 번에 처리합니다. 반복 실행과 실제 재조회를 검사하며 WAL·백업의 물리적 완전 삭제를 주장하지 않습니다.

## Decided implementation interfaces / 구현 연결 인터페이스

Core owner provides `tools/ingestion_types.ts`, `ingestion_store.ts`, `ingestion_service.ts`, `ingestion_worker.ts` and any narrowly necessary companion files, plus its tests. Harness owner provides `tools/ingestion_checks.ts`, `tools/pilot_integration.ts`, report additions, owned PostgreSQL lifecycle and its tests. Package files are core-owned; workflow/report/whole runner are harness-owned. Core exports `IngestionStore` with `initialize`, `accept`, `claim`, `complete`, `fail`, `sweep`, `revoke`, `inspect` and `close`; constructor takes database URL, namespace and pinned graph/policy. Methods accept trusted event-time explicitly. `complete` accepts a private async before-commit hook for the AFTER_INSERT barrier. Core also exports `IngestBatch`, `StoreConfig`, `Principal`, `Claim` and shared service/worker config types. Both service and worker have a `--config PRIVATE_JSON` CLI and optional fork IPC: READY, phase barriers, resume, and server-only event-time updates. Worker processes perform one claim then exit (IDLE is explicit); the runner controls repeated invocations. Harness may import these types/store methods but may not supply baseline results to the worker. Exact parameter shapes must be coordinated before editing consumers without weakening this contract; each owner must notify the other before interface edits. Neither changes P03/P04 numerical policies.

코어는 타입·DB·HTTP·처리자·해당 검사를, 통합 담당은 실제 장애 실행기·PostgreSQL 수명주기·전체 실행·보고서·해당 검사를 소유합니다. 패키지는 코어, 워크플로·화면·전체 실행은 통합 담당입니다. 이름 조정은 서로 알리되 계약을 약화하지 않으며 기존 P03/P04 수치 정책은 바꾸지 않습니다.

## Direct acceptance matrix / 직접 수용 검사

1. Stream all nine Seoul vehicles through real HTTP in ≤60-sample batches with bounded overlap; final stored accepted traversals equal the fresh P04 reference in edge, direction, occurrence order and boundary times. Stable storage IDs must be identical across retry/recovery; unrelated P04 matching-session IDs may be normalized only explicitly. No truth reaches the worker.
2. Duplicate same batch and concurrent duplicate requests do not add samples/jobs/traversals. Conflicting body, sequence, sample, graph/policy/start/vehicle and final-sequence changes leave rows unchanged.
3. Send final before an earlier batch; no claim succeeds until the missing sequence arrives. Reject post-final extension. Exercise exact event-age/future boundaries, payload/count/capacity limits and authorization/source/consent failures through HTTP.
4. Kill API after accepted storage but before response; restart API and PostgreSQL container using the same named volume; replay same batch and read back durable state. Check durability settings and distinguish container restart from volume recreation.
5. Kill distinct owned worker processes at AFTER_LEASE, AFTER_MATCH and AFTER_INSERT; verify their process exits, wait actual lease expiry where needed, restart and inspect exactly one stored contribution set. AFTER_INSERT must leave zero partial committed output before recovery.
6. Race two actual workers. Pause an old owner, let its short lease expire, let another owner commit, resume the old owner and prove LEASE_LOST without mutation. No in-memory simulation substitutes for these process/fence tests.
7. Actual engine failure retries and max-attempt terminal failure; no successful completion from baseline/mock output. Record attempts, codes, actual DB rows and child exit evidence.
8. Sweep raw-context and24h deadlines, revoke before finalization and while an old worker is paused, repeat sweep/revoke and inspect rows/payloads. API responses and process diagnostics contain no fixture credentials, coordinate fields or DSNs. Public report contains only explicitly synthetic evidence.
9. Every success/failure/interrupt cleans only owned processes/containers/volumes/ports. Record ownership before creation/spawn; if killed during engine work, cleanup must also resolve exact owned engine containers from the attempt output mount/labels. Preserve evidence; never delete unrelated resources. Missing cleanup fails completion.
10. One primary `simulation:check` runs fresh tiny→Seoul→P05, with hashes/source/fingerprint, stage links and a bilingual recovery evidence section in the real-road replay. Final clean integration, direct review, screenshots, actual recording, README EN/KO, hosted CI inspection and feature-branch push are all required.

1. 서울9대의 실제 HTTP 배치·중첩 입력에서 저장 통과를 새 P04 기준의 방향·순서·시간과 대조합니다. 복구 전후 저장ID도 같아야 하며 정답은 처리자에게 주지 않습니다.
2. 동일/동시중복은 표본·작업·통과를 늘리지 않고 내용·순서·표본·버전·메타데이터 충돌은 저장을 바꾸지 않아야 합니다.
3. 마지막 배치가 먼저 와도 중간 누락이 채워지기 전 작업을 확보하지 못합니다. 완료 후 확장·정확한 시간 경계·크기/개수/용량·인증/동의를 HTTP로 검사합니다.
4. 접수 커밋 뒤 응답 전 API를 종료하고 같은 영속 볼륨의 DB·API를 재시작해 재전송·재조회합니다.
5. 임대·매칭·INSERT 후에 실제 처리자를 종료하고 실제 임대 만료 뒤 복구합니다. 미커밋 INSERT는 일부 저장을 남기지 않아야 합니다.
6. 두 실제 처리자의 경쟁과 만료한 옛 처리자의 뒤늦은 완료 거부를 검사합니다.
7. 실제 엔진 실패의 재시도·시도 한도 후 실패를 기록합니다.
8. 원문·24시간 만료·완료 전/처리 중 철회·반복 삭제를 실제 재조회하고 응답/진단의 원문·인증 누출을 검사합니다.
9. 성공·실패·중단 모두 자신이 만든 자원만 정리하고 증거는 보존합니다. 엔진 실행 중 종료에도 정확한 소유 컨테이너를 처리합니다. 정리 실패는 전체 미완료입니다.
10. 새 tiny→서울→P05를 한 명령으로 실행하고 한영 복구 보고서·화면·영상·README·원격 검사·작업브랜치 푸시까지 완료합니다.

## Primary sources / 공식 출처

Inspected2026-10-24: [PostgreSQL locking](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE), [transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [node-postgres transaction client rule](https://node-postgres.com/features/transactions), [official PostgreSQL image](https://hub.docker.com/_/postgres). Row locking/uniqueness are implementation primitives; the process tests above establish RouteLens-specific recovery evidence.

2026-10-24 공식 자료를 확인했습니다. 행 잠금·고유 제약은 구현 수단이며 RouteLens 복구 동작은 위 실제 프로세스 검사로 증명합니다.
