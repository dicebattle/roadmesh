# P13 local Cloudflare parity / P13 로컬 Cloudflare 비교

Current acceptance / 현재 수용 (2026-10-25): P01–P14 local-pilot runtime acceptance is complete locally and on GitHub Actions: whole 390, Node.js 22/24 each 303. Main independently checked 16,236 hosted original hashes, 11 complete PostgreSQL/Worker pairs and 21 SQLite copies across 14 actors. The runtime fingerprint matches the accepted local run and actual recordings. Protected integration and the latest checked head are tracked by [PR #14](https://github.com/dicebattle/routelens/pull/14). Geographic 100/100, real driving, live traffic and production deployment remain separate.

P01~P14 로컬 파일럿의 실행 검증을 로컬과 GitHub Actions에서 마쳤습니다. 전체 390개와 Node.js 22·24 각각 303개를 통과했고, 메인이 원격 원문 해시 16,236개·집계 전체 11쌍·객체 14개의 SQLite 복사본 21개를 독립 확인했습니다. 실행 지문은 수용한 로컬 실행·실제 녹화와 같습니다. 보호 병합과 최신 검사 커밋은 [PR #14](https://github.com/dicebattle/routelens/pull/14)에서 확인합니다. 실제 지역 100/100·실주행·실시간 교통·운영 배포는 별도입니다.

Earlier checkpoint / 이전 중간 기록:

Status: main Sol design, implementation and local acceptance completed; hosted/protected delivery remains. See the [actual report](../research/pilot/2026-10-25-p13/report.md). Preserve every P01–P12 gate. Add32 P13 assertions, for390 total. Run Workers, SQLite Durable Objects and Queues through pinned local Wrangler/workerd; no account, remote binding, provisioning or deployment is needed. This is supported **post-matching aggregation parity**, not a claim that raw GPS ingestion, publication, gateway or Valhalla already run on Cloudflare.

상태: 메인 Sol 설계·구현·로컬 수용을 마쳤으며 원격·보호 반영은 남습니다. P01~P12를 유지하고 P13의32개를 더해390개로 검사합니다. 고정 로컬 Wrangler/workerd의 Worker·SQLite Durable Object·Queues를 사용하며 계정·원격 바인딩·자원 생성·배포가 필요하지 않습니다. 지원 범위는 **매칭 후 집계의 동등성**이며 원시 GPS 수집·서명 게시·중계·Valhalla의 Cloudflare 운영 완료가 아닙니다.

## Shared core and baseline / 공유 규칙·비교 기준

Extract unchanged JSON validation/canonical bytes/hash primitives from filesystem/CLI helpers, and UTC validation from matching imports. Keep existing exports and exact bytes/errors through re-exports. Both PostgreSQL and Worker import the same `aggregateWindow`; do not copy or rewrite median, timing, deduplication or privacy rules. Enable documented `nodejs_compat` for existing Buffer/SHA-256 semantics rather than inventing another canonical format.

JSON 검사·표준 바이트·해시를 파일/CLI에서, UTC 검사를 매칭 의존성에서 의미 변경 없이 분리하고 기존 내보내기와 바이트/오류는 재노출로 유지합니다. PostgreSQL과 Worker 모두 같은 집계 함수를 사용하며 중앙값·시간·중복·공개 규칙을 복제하지 않습니다. 기존 Buffer/SHA-256 의미에 문서화된 호환 기능을 쓰며 별도 표준 형식을 만들지 않습니다.

The same fresh full run's P06 stage exports a bounded read-only aggregation input immediately beside its actual PostgreSQL finalization result. Export uses the exact same SQL selection and authoritative event clock as finalization. Include0/1/4/5 contributor, strict availability before/exactly/after deadline, revocation and expiry cases. Preserve original matching/availability evidence. P13 verifies source/graph/input/result hashes, sends these matched synthetic contributions through actual local Worker→Queue→DO storage, then compares canonical public draft bytes and SHA-256 to the PostgreSQL originals. Generated trajectory truth is never aggregation input.

같은 새 전체 실행의 P06에서 실제 PostgreSQL 확정 결과와 함께 제한된 읽기 전용 집계 입력을 보존합니다. 확정과 같은 SQL 선택·승인 시각을 사용하고 기여자0/1/4/5명·엄격한 마감 직전/정확/이후·철회·만료를 포함합니다. 원래 매칭·사용 가능 시각 근거를 유지합니다. P13은 출처·지도·입력·결과 해시를 확인한 뒤 실제 로컬 Worker→큐→DO 저장으로 합성 매칭 결과를 보내 공개 후보의 표준 바이트·SHA-256을 PostgreSQL 원문과 비교합니다. 생성 정답 궤적은 집계 입력으로 쓰지 않습니다.

## Coordination and durable effects / 조정·영속 효과

One SQLite DO owns one configured namespace+graph+shard-v1 catalog, not a global Seoul singleton. The local pilot uses bounded preconfigured catalogs; no distributed resharding claim. Trusted configuration fixes namespace, graph, catalog, SYNTHETIC source and initial event time. Initialization rejects a changed existing identity. A private bounded HTTP adapter selects only configured scopes; authenticated internal matching results cannot alter the trusted scope. This is a local matcher handoff, not public contributor authentication.

SQLite DO 하나가 설정된 영역·지도·분할 버전별 목록을 맡고 서울 전체를 전역 객체에 모으지 않습니다. 로컬 파일럿은 크기가 제한된 사전 설정 목록을 쓰며 분산 재분할 완료를 주장하지 않습니다. 신뢰 설정이 영역·지도·목록·합성 출처·초기 시각을 고정하며 기존 식별 변경은 거부합니다. 비공개 크기 제한 HTTP 연결기는 설정 범위만 선택하고 인증된 내부 매칭 결과가 이를 바꾸지 못합니다. 로컬 매칭 전달이며 공개 기여자 인증이 아닙니다.

Atomically persist an immutable batch receipt and outbox before queue send. Queue notices contain only scope/batch/hash; matching data remains private in the DO. Applying a notice validates that exact receipt and atomically records deduplication plus contributions. Duplicate batches/notices produce one committed effect; same ID/different bytes is conflict. Send/ack are outside SQL transactions. A retained pending outbox can be resent after restart; never assume exactly-once delivery or a transaction spanning the queue and DO. A controlled post-commit acknowledgement loss must produce an actual queue retry and preserve one effect.

큐 전송 전 불변 배치 접수와 발신 대기 기록을 원자 저장합니다. 큐에는 범위·배치·해시만 보내고 매칭 자료는 DO 비공개 저장에 둡니다. 정확한 접수를 검증한 뒤 중복 기록·통과 자료를 같은 트랜잭션으로 반영합니다. 중복 배치/통지는 한 번만 저장 효과를 만들고 같은 ID의 다른 바이트는 충돌입니다. 전송·확인은 SQL 트랜잭션 밖이며 재시작 후 발신 대기를 다시 보낼 수 있어야 합니다. 큐와 DO를 가로지르는 트랜잭션·정확히 한 번 전달을 가정하지 않습니다. 통제한 저장 후 확인 유실은 실제 큐 재전달과 한 번 효과를 증명합니다.

A durable monotonic simulation clock governs finalization/expiry; public request timestamps are not authority. Contributor revocation and candidate invalidation occur in the same DO transaction; retained receipt/tombstone rules prevent delayed queue messages from reviving removed contributions. Retention removes bounded contributions/candidates and refuses old pending effects. Only finalized public draft fields leave the candidate endpoint; no contributor IDs, raw payloads, secrets or internal diagnostics appear there.

영속 단조 모의 시각을 확정·만료 기준으로 쓰며 공개 요청 시각을 믿지 않습니다. 기여자 철회와 후보 무효화는 같은 DO 트랜잭션에서 처리하고 접수/삭제 표식으로 지연 큐가 삭제 통과를 되살리지 못하게 합니다. 보관 기한 후 통과/후보를 지우고 과거 미처리 효과를 거부합니다. 공개 후보 경로는 정해진 필드만 반환하고 기여자 ID·원문·비밀값·내부 진단은 내보내지 않습니다.

## Verification and limits / 검증·한계

Fixed32 IDs: fresh-source, shared-core, actual-queue, count-0, count-1, count-4, count-5, batch-duplicate, repeated-contributor, parked, window-open, late-before, late-exact, late-after, exact-expiry, revoke-invalidates, retention-no-revival, batch-conflict, wrong-graph, wrong-source, namespace-isolation, unknown-fields, concurrent-duplicate, queue-ack-retry, queue-hash-rejected, durable-outbox, restart-persistence, recovered-dispatch, immutable-catalog, public-privacy, canonical-parity, owned-cleanup.

위32개를 고정합니다. 기존358개는 그대로 유지하고 같은 새 실행의 실제 근거를 연결합니다.

The runner starts loopback-only Wrangler with remote bindings disabled and a new retained local state directory. Record locked Wrangler/workerd versions, source/runtime/graph, original HTTP/queue/SQL snapshots, exact hashes and process identities before owned shutdown. Exercise normal cleanup and an actual process restart with the same storage. Close only owned processes/ports; remove private generated configuration/secrets while retaining nonsecret evidence and local SQLite state. Include all32 in the fresh whole command/report/required hosted CI. Unit tests cover preserved codec behavior and invalid contracts, while actual workerd/queue execution proves runtime behavior. Refresh actual demo/README only after the new clean390 run is accepted.

로컬 전용 Wrangler·원격 바인딩 차단·새 보존 상태 폴더로 실행하고 고정 버전·출처/실행/지도·원 HTTP/큐/SQL·해시·프로세스 식별을 종료 전에 기록합니다. 정상 종료와 같은 저장소를 쓰는 실제 프로세스 재시작을 검사하고 자신이 만든 프로세스/포트만 닫습니다. 비공개 설정·비밀은 지우되 비밀 없는 근거와 로컬 SQLite는 보존합니다. 새 전체 명령·보고서·필수 원격 검사에32개를 포함합니다. 단위 검사는 기존 바이트·잘못된 계약을, 실제 실행은 workerd/큐 동작을 증명합니다. 새 깨끗한390개를 수용한 뒤 실제 데모·README를 갱신합니다.

Local Queues does not reproduce hosted consumer concurrency. Cloudflare placement, uptime, regional distribution, production identity, external matcher authentication, account limits and costs remain unmeasured. P07 signing/publication and P08–P12 engine/client proof continue on the existing local stack. P14b completes CI/report coverage after parity; production migration remains separate.

로컬 큐는 원격 소비자 동시성을 재현하지 않습니다. 배치 위치·가용성·지역 분산·운영 신원·외부 매칭 인증·계정 한도·비용은 측정하지 않습니다. P07 서명 게시와 P08~P12 엔진/화면은 기존 로컬 구성을 유지하고 P14b가 비교 뒤 CI/보고서 범위를 완성하며 운영 전환은 별도입니다.

[Upstream source notes](../wiki/sources/cloudflare-local-parity.md). Main Sol owns design, implementation and evidence review.

[상위 출처 기록](../wiki/sources/cloudflare-local-parity.md). 메인 Sol이 설계·구현·근거 검토를 맡습니다.
