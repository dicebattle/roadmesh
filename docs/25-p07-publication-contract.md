# P07 signed publication and trust / 서명 게시·신뢰 계약

Status: main design fixed before implementation,2026-10-25. P06 is merged through protected PR#7 (`d9b08e9`), with local/hosted151 and Node22/24 each183 verified. Sol implements this contract; main reviews and executes the fresh whole system. P07 means actual publication and durable consumer verification, not routing-engine activation (P08).

상태:2026-10-25 구현 전에 메인이 설계를 고정합니다. P06은 보호된 PR#7로 병합됐고 로컬·원격151개와 Node각183개를 검증했습니다. Sol이 구현하고 메인이 검토·새 전체 실행을 맡습니다. P07은 실제 게시·영속 수신 검증이며 경로 엔진 활성화는 P08입니다.

## Reuse and ownership / 재사용·책임

Pin `jose@6.2.13` for standard compact JWS signing/verification and Ed25519 keys (`alg=EdDSA`). Reuse Node WebCrypto, existing strict JSON parsing, SHA256, PostgreSQL18.6/pg transactions and owned process/DB cleanup. No handwritten cryptography, remote key discovery, TUF substitute or engine fork. TUF for graph/program deployment stays separate. RouteLens owns schema, permissions, ordering, freshness, atomic publication and durable acceptance. Publisher serialization may be stable for idempotency; verifier signs/verifies exact standard JWS payload bytes and hashes exact artifact bytes, never reserializes incoming JSON as signature input.

표준 JWS·Ed25519는 고정한 jose를 사용하고, Node WebCrypto와 기존의 엄격한 JSON 파서·SHA256·PostgreSQL 트랜잭션·소유 자원 정리를 재사용합니다. 암호를 직접 구현하거나 원격 키를 자동 조회하거나 엔진을 수정하지 않습니다. 지도·프로그램 배포용 TUF는 별도입니다. RouteLens는 스키마·권한·순서·신선도·원자적 게시·영속 수용을 담당합니다. 게시 측은 반복 실행의 동일성을 위해 안정적인 직렬화를 사용할 수 있지만, 검증 측은 수신 JSON을 다시 직렬화하지 않고 정확한 JWS 페이로드와 파일 바이트를 검증합니다.

## Wire contract / 통신 계약

`TrafficSnapshot` extends the exact P06 public draft with `simulation_namespace`, `publisher_id`, positive safe-integer `sequence`, and `published_at`. Retain `forward` in entries. All entries in this executable pilot are SYNTHETIC; retain every verified catalog edge, exactly once and sorted. No raw coordinates, contributor/trip/sample IDs or private inputs are public. `traffic_snapshot_id` is SHA256 of exact UTF-8 artifact bytes and is not inside the artifact itself.

TrafficSnapshot은 정확한 P06 공개 후보에 simulation_namespace·publisher_id·양의 안전 정수 sequence·published_at을 추가합니다. 항목의 forward를 유지하며 모든 항목은 SYNTHETIC이고 검증된 전체 구간 목록을 중복 없이 정렬해 포함합니다. 원시 좌표·기여자/여행/표본 식별자·비공개 입력은 공개하지 않습니다. traffic_snapshot_id는 정확한 UTF-8 파일 바이트의 SHA256이며 파일 자체에는 포함하지 않습니다.

Compact JWS protected header is exactly `{alg:"EdDSA",kid,typ:"routelens-traffic-manifest+jws"}`. No jku/jwk/x5u/crit/b64 or unprotected metadata. Its JSON payload is exactly:

```typescript
type TrafficManifest = {
  schema_version: "0.1";
  simulation_namespace: string;
  publisher_id: string;
  graph_id: string;
  region_id: "seoul-pilot-corridors-v1";
  sequence: number;
  window_start: string;
  window_end: string;
  published_at: string;
  valid_until: string;
  aggregation_policy: "seoul-window-median-v1";
  traffic_snapshot_id: string; // SHA256 / 내용 해시
  byte_length: number;
  media_type: "application/json";
};
```

The artifact and manifest must agree on every duplicated field. Exact fields/enums, finite numbers, strict UTC millisecond timestamps, safe integers, duplicate JSON keys, duplicate edges, full catalog identity, positive LIVE speeds with allowed buckets and null non-LIVE speed/bucket are checked. Reject unknown fields for this pilot version. Maximum manifest64KiB, artifact2MiB,10,000 entries. Invalid UTF-8 fails. Unknown algorithms, unknown/duplicate kid and asymmetric key types other than public OKP/Ed25519 fail. Limits are checked before parsing or unbounded response accumulation.

파일과 서명 목록에 중복되는 모든 필드는 일치해야 합니다. 정확한 필드·열거값·유한수·엄격한 UTC 밀리초 시각·안전 정수·JSON 키/구간 중복·전체 구간 목록·LIVE의 양수 속도와 허용 표본 구간·비LIVE의 null 속도/표본 구간을 검사합니다. 이 버전은 알 수 없는 필드를 거부합니다. 상한은 서명 목록 64KiB·파일 2MiB·항목 10,000개입니다. 잘못된 UTF-8·알 수 없는 알고리즘·알 수 없거나 중복된 kid·공개 OKP/Ed25519 이외의 비대칭 키를 거부합니다. 파싱과 제한 없는 응답 누적 전에 상한을 적용합니다.

## Trusted scope and time / 신뢰 범위·시각

Trust roots are explicit local configuration: public JWK, kid, publisher, simulation namespace, region, exact allowed graph IDs, SYNTHETIC source, valid_from/valid_until and revoked flag. Keys never authorize themselves through signed data or URL metadata. Require key validity at published_at and current effective time, and not revoked. Allow preconfigured key rotation for the same publisher without resetting sequence. Generation is per run; private keys remain only in owned0600 private files and process memory. Archive public roots and signed bytes, never private JWK `d` or DSNs/tokens.

신뢰 기준은 명시적인 로컬 설정입니다. 공개 JWK·kid·게시자·시뮬레이션 영역·지역·허용할 정확한 그래프 식별자·SYNTHETIC 출처·유효 기간·철회 여부를 지정합니다. 서명 데이터나 URL 메타데이터가 자기 키를 신뢰하도록 승인할 수 없습니다. 키는 게시 시각과 현재 유효 시각 모두에서 유효하고 미철회 상태여야 합니다. 같은 게시자의 사전 설정 키 교체에서도 순번을 유지합니다. 비밀 키는 매 실행 새로 생성하고 소유한 권한0600 파일·프로세스 메모리에만 둡니다. 공개 키와 서명 바이트만 보존하며 비밀 JWK의 d·DB 연결 문자열·토큰은 보존하지 않습니다.

Use the existing persisted monotonic namespace event clock for simulated time, never a stale caller's timestamp. Windows remain60s; published_at must be >=window_end+30s and <=effective now; valid_until must equal window_end+180s; now>=valid_until is expired. A delayed publication cannot extend TTL. Read current publication/consumer state against the current clock on every call. Advancing only the clock must remove usable traffic without a publisher or sweep. Keep the highest observed sequence after expiry/restart. Database/process real time still controls operation timeouts.

합성 시간에는 기존의 영속적이고 단조 증가하는 영역별 이벤트 시계를 사용하며 오래된 호출자 시각으로 되돌리지 않습니다. 창은60초이고 게시 시각은 창 종료+30초 이상·현재 이하이며 유효 기한은 정확히 창 종료+180초입니다. 현재가 기한 이상이면 만료됩니다. 늦은 게시로 기한을 늘리지 않습니다. 게시·수신 상태를 읽을 때마다 현재 시계를 확인해 게시자나 정리 작업 없이 시계만 진행해도 교통정보를 사용할 수 없게 합니다. 만료·재시작 후에도 최고 순번을 유지합니다. DB·프로세스 작업 제한 시간은 실제 시간을 사용합니다.

## Durable publisher / 영속 게시자

A publisher worker reads a **current authoritative P06 candidate row**, not an arbitrary caller-supplied draft. Verify its canonical hash/catalog/graph/source/window and freshness. In a single PostgreSQL transaction, lock clock SHARE, candidate SHARE, then the stream row UPDATE; sign and insert immutable artifact bytes+JWS and advance current pointer/sequence together. Stream identity is(namespace,publisher,region), across graph/key changes. Initial row insertion must be concurrency-safe. Statement15s/lock5s bounds apply. A sequence never exceeds Number.MAX_SAFE_INTEGER.

게시 처리자는 임의로 전달받은 초안이 아닌 현재의 권위 있는 P06 후보 행을 읽습니다. 정규 내용 해시·목록·그래프·출처·창·신선도를 검증합니다. 하나의 PostgreSQL 트랜잭션에서 시계 SHARE→후보 SHARE→게시 계열 행 UPDATE 순서로 잠그고, 서명·불변 파일 바이트/JWS 삽입·현재 참조/순번 갱신을 함께 처리합니다. 계열은 영역·게시자·지역으로 식별하며 그래프·키가 바뀌어도 유지합니다. 첫 행 삽입은 동시 실행에 안전해야 하고 명령15초·잠금5초 제한과 Number.MAX_SAFE_INTEGER 상한을 지킵니다.

An unchanged latest candidate hash/window/kid returns exactly the same committed sequence/artifact/JWS. Changed candidate or signing kid produces the next sequence; older windows never become current. After pre-commit SIGKILL, no partial artifact/pointer/sequence is visible. After committed-but-unacknowledged SIGKILL, retry returns identical bytes with no increment. Two workers racing the same candidate converge to one version. Retain old artifacts immutable for the bounded run; no public-artifact garbage collection or backup erasure claim.

최신 후보 해시·창·kid가 그대로면 저장된 순번·파일·JWS를 정확히 그대로 반환합니다. 후보나 서명 키가 바뀌면 다음 순번을 발행하고 오래된 창을 현재 값으로 삼지 않습니다. 커밋 전 강제 종료는 부분 파일·참조·순번을 노출하지 않아야 합니다. 커밋 후 응답 전 강제 종료에서도 재시도는 순번 증가 없이 동일한 바이트를 반환합니다. 같은 후보를 처리하는 두 작업자는 한 버전으로 수렴합니다. 제한된 실행 동안 과거 파일은 불변으로 보존하며 공개 파일 정리나 백업 삭제는 보장하지 않습니다.

A P07 AFTER DELETE or changed-canonical-hash UPDATE trigger on P06 candidates clears a matching current pointer in the same transaction. This extends P05 revoke→P06 invalidation to the publication lookup. Keep immutable historical bytes and the stream high-water counter. Recompute P06 and publish a higher-sequence correction for future pulls; previously downloaded files remain cryptographically valid until TTL unless the consumer receives a newer version or key revocation. Do not promise immediate recall from offline clients. Publisher locks must not invert the existing revoke/aggregation lock order.

P06 후보의 DELETE 또는 정규 내용 해시가 바뀐 UPDATE 뒤에 실행되는 P07 트리거는 같은 트랜잭션에서 해당 현재 참조를 비웁니다. P05 철회→P06 무효화를 공개 조회까지 연결하되 불변 이력·최고 순번은 유지합니다. P06 재집계 후 더 높은 순번의 정정본을 게시합니다. 이미 내려받은 파일은 새 버전이나 키 철회를 수신하지 않는 한 기한 내 암호학적 유효성이 유지되므로 오프라인 이용자에게서 즉시 회수한다고 약속하지 않습니다. 게시 잠금 순서가 기존 철회·집계 순서를 뒤집으면 안 됩니다.

## HTTP and consumer / HTTP·수신자

A separate real loopback service exposes GET `/v1/simulations/{namespace}/regions/{region}/current` (compact JWS, application/jose, no-store) and GET `/v1/simulations/{namespace}/artifacts/{sha256}` (exact immutable JSON bytes, length/hash metadata). Missing/invalidated current is404; expired current410; unsupported method405; errors are bounded bilingual structured messages. Only a configured owned127.0.0.1 origin is used by the pilot fetcher. It constructs artifact paths from verified hash, follows no redirects, uses5s timeouts and streaming byte bounds. Manifest-supplied origins/paths are not accepted. This is local transport proof, not production HTTPS/authentication.

별도의 실제 로컬 HTTP 서비스가 현재 JWS와 불변 파일을 제공합니다. 현재 참조는 캐시하지 않으며 미생성/무효화404·만료410·미지원 메서드405와 크기가 제한된 한영 구조화 오류를 반환합니다. 수신자는 설정된 소유127.0.0.1 접속처만 사용하며 검증한 해시로 파일 경로를 구성합니다. 리다이렉트는 따라가지 않고5초 제한과 스트림 바이트 상한을 적용합니다. 서명 목록이 지정하는 임의 출처·경로는 허용하지 않습니다. 로컬 전송 검증이며 운영 HTTPS·인증 검증은 아닙니다.

A separate consumer worker verifies JWS/trust, bounded artifact bytes/hash/length, strict snapshot contents and expected scope, then atomically persists accepted bytes, snapshot ID, sequence and window under consumer identity+stream. Verification alone is not acceptance. Concurrent consumers lock one state row; sequence<high-water is replay, same sequence with different ID is conflict, same sequence/ID is an idempotent retry, and a newer sequence cannot move window backward. Recheck current clock inside the acceptance transaction after network/crypto work. Invalid candidates preserve a still-valid accepted version and never advance high-water. Consumer restart/SIGKILL after commit cannot roll back durable state. Current status rechecks expiry and configured trust, clears unusable active state and retains high-water. P08 will consume this verified state; P07 must not label it engine-activated.

별도 수신 처리자는 JWS·신뢰·파일 크기/해시·엄격한 내용·기대 범위를 검증한 뒤 수신자/계열별로 수용한 바이트·파일 식별자·순번·창을 원자적으로 저장합니다. 서명 확인만으로 수용 완료라 하지 않습니다. 동시 수신자는 같은 상태 행을 잠급니다. 최고 순번보다 낮으면 재전송 공격, 같은 순번의 다른 식별자는 충돌이며 같은 순번·식별자는 반복해도 같은 결과입니다. 높은 순번도 창을 과거로 되돌릴 수 없습니다. 통신·암호 검증 후 수용 트랜잭션 안에서 현재 시각을 다시 확인합니다. 부적합 후보는 아직 유효한 기존 버전과 최고 순번을 바꾸지 않습니다. 커밋 후 재시작·강제 종료도 저장 상태를 되돌리지 않습니다. 상태 조회는 만료·설정된 신뢰를 재검사하고 사용할 수 없는 내용만 제거하며 최고 순번을 유지합니다. P08이 이 검증 상태를 사용하므로 P07을 엔진에 반영됐다고 표시하지 않습니다.

## Direct acceptance evidence / 직접 수용 검증

Before any final whole run, focused tests cover parser/crypto/scope/time/order boundaries. Integration starts real PostgreSQL, actual short Seoul GPS→HTTP→P05 worker→P06 aggregation, publisher worker/service and separate consumer processes. Do not seed a successful public draft directly into the P07 store or substitute previous PASS files. A controlled real HTTP fault server may serve deliberately invalid signed/unsigned bytes only for negative cases. Keep authored expected values before engine execution.

최종 전체 실행 전에 파서·암호·범위·시각·순서 경계의 집중 검사를 수행합니다. 통합 실행은 실제 PostgreSQL, 짧은 서울 GPS→HTTP→P05 처리자→P06 집계, 게시 처리자/서비스, 별도 수신 프로세스를 시작합니다. 성공 후보를 P07 저장소에 직접 넣거나 과거 PASS 파일로 대체하지 않습니다. 통제된 실제 HTTP 장애 서버는 부정 사례에서만 의도적으로 잘못된 서명/미서명 바이트를 제공할 수 있습니다. 기대값은 엔진 실행 전에 작성합니다.

Required evidence groups (individual cases must be named, asserted and linked):

1. Actual P06→signed publication→HTTP bytes→durable acceptance, all79 entries and source hashes preserved; immutable same-hash retrieval and repeated publication identity.
2. Real publisher SIGKILL before commit and after commit/before response, retry bytes and sequence, concurrent publication and process restart.
3. Invalid signature, changed artifact/hash, wrong length, truncation, oversize, duplicate JSON keys, unsupported fields/algorithm and disallowed key fail before state mutation.
4. Validly signed wrong graph/namespace/region/publisher and revoked/expired/not-yet-valid key scopes rejected; preconfigured new-key rotation accepted without sequence reset.
5. Old sequence after consumer process restart, same-sequence different content, and newer-sequence older window rejected; two consumers racing newer/older valid versions never lower high-water.
6. Real consumer SIGKILL after committed acceptance but before acknowledgement; retry idempotent. Pause after crypto verification, advance clock to exact expiry, then ensure acceptance refuses expired data.
7. Published-at future, expiry239.999/240.000, stale callers, actual HTTP publisher outage retaining a still-valid accepted version then removing it on clock-only expiry; highest sequence survives.
8. P05 HTTP revoke while publication is paused: actual DB lock evidence, acknowledged deletion already removes current; fresh P06 recompute/publish gives higher-sequence INSUFFICIENT; a newer empty window replaces rather than inherits speed.
9. Original signed bytes/public roots, DB read-backs and process records contain no private key material/DSNs/tokens; only owned services/processes/DB/volumes/ports are cleaned.

필수 근거는 실제 연결·불변성·발행 전후강제종료/경쟁·변조/크기/형식·권한·순번/재시작/경쟁·수신 후강제종료·검증중만료·정확한시각/장애·철회잠금/현재참조삭제/상위순번정정·새빈창·비밀미노출·소유자원정리입니다. 각 사례에 이름·판정·원문 링크가 있어야 합니다.

The whole runner retains all151 existing checks and appends P07 groups; no weaker denominator or skip-success path. It displays original/P06 playback plus recorded publication/acceptance/rejection/expiry evidence, clearly separate from routing activation. Main independently verifies standard JWS signatures from public keys and exact downloaded bytes, accepted state, process failures and cleanup; then captures bilingual desktop/mobile/screenshots/actual video, updates READMEs and report, pushes, inspects hosted Node22/24/full Docker results and merges only through protected checks.

전체 실행은 기존151개를 유지하고 P07을 추가하며 분모나 생략 성공을 바꾸지 않습니다. 기존/P06재생에 실제게시/수용/거부/만료근거를 연결하되 경로 반영과 구분합니다. 메인은 공개키로 표준JWS·다운로드바이트·저장상태·장애·정리를 독립 검사하고 한영화면/모바일/실제녹화/README/보고서를 갱신해 푸시·원격검사·보호병합합니다.

Implementation evidence / 구현 근거: [Local206-check report](../research/pilot/2026-10-25-p07/report.md). Main independently inspected the actual signed bytes and durable states; hosted206 and Node22/24 each200 also passed. / 메인이 실제 서명 바이트·영속 상태를 독립 검사했고 로컬206개를 통과했으며 원격206개·Node각200개도 통과했습니다.
