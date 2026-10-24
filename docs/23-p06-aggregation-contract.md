# P06 event-time aggregation contract / P06 관측시간 집계 계약

Status: design fixed before implementation,2026-10-24. Main designs and reviews; Sol implements. P05 merged through protected PR#6 as `920d48d`. This increment implements P06, retaining the fresh tiny→Seoul→P05 run and adding actual Seoul GPS→HTTP→PostgreSQL→matching→aggregation execution. P07 signing/publication and P08 route-cost changes remain separate.

상태: 구현 전에 메인이 설계를 고정했고 Sol이 구현합니다. P05는 보호된 PR#6으로 병합됐습니다. 기존 전체 실행을 유지하고 실제 서울 GPS→HTTP→PostgreSQL→매칭→집계를 추가합니다. 서명 게시·경로 비용 변경은 P07·P08로 남깁니다.

## Responsibility and reusable parts / 책임과 재사용

Reuse PostgreSQL18.6 transactions/locks and the pinned pg driver; no new framework, queue, ORM or statistics dependency. Add a deterministic TypeScript aggregation function, a PostgreSQL adapter and a one-shot child worker. The database adapter reads actual committed P05 traversals and SUCCEEDED event times; it must not accept a prebuilt PASS report or fabricated traversal rows as the integration input.

기존 PostgreSQL 트랜잭션·잠금·드라이버를 재사용하고 결정적 TypeScript 집계 함수·DB 연결기·일회 처리자를 추가합니다. 실제 저장된 P05 통과와 SUCCEEDED 이벤트 시각을 읽으며 기존 성공 보고서·직접 꾸민 통과 행을 통합 입력으로 쓰지 않습니다.

P05 whole-trip processing can complete after an early observation window has closed. That is a real limitation, not permission to backdate processing. This module adds bounded short trips and separately proves that late matching results cannot become live traffic for an already closed window.

P05 전체 여행 처리는 초기 관측 창이 마감된 뒤 끝날 수 있습니다. 이를 처리시각을 과거로 돌릴 근거로 삼지 않습니다. 짧은 여행을 추가하고 늦게 끝난 매칭이 마감된 창의 실시간 교통으로 바뀌지 않음을 별도 증명합니다.

## Fixed time and contribution policy / 고정 시간·기여 정책

- Policy ID: `seoul-window-median-v1`. UTC60-second tumbling windows aligned to Unix epoch. Assign a completed traversal by **exit time**, `window_start <= exit < window_end`; never split its duration or count it in two windows.
  정책은 위 식별자이며 UTC60초 창입니다. **진출시각**으로 반열린 구간에 배정하며 통과시간을 나누거나 두 창에 중복 반영하지 않습니다.
- Availability is P05's persisted SUCCEEDED `at_event_utc`, under its namespace clock lock. It must be at least the exit time and **strictly before** `window_end +30s`. Exactly at the deadline is late. Finalization is allowed only when the current persisted namespace clock is at least that deadline. No caller's stale clock may override it. This makes the earlier draft's “30seconds” boundary precise.
  사용 가능 시각은 DB 공유 시계 아래 기록한 성공 이벤트 시각이며 진출 이후·창끝30초 **미만**이어야 합니다. 정확히 마감시각이면 지연입니다. 현재 DB시계가 마감 이상일 때만 확정하고 옛 호출자 시각으로 되돌리지 않습니다. 기존 초안의 경계를 명확히 합니다.
- One contribution per trusted contributor, directed edge, source class and window. Select the earliest eligible exit, then entry, then observation ID as deterministic tie-breakers. Exact observation duplicates collapse; conflicting content for one observation ID is rejected. Do not count trip IDs, batches, samples or credentials as distinct people.
  신뢰한 기여자·방향 구간·출처·창마다 한 번만 반영합니다. 적격 진출·진입·관측ID 순으로 가장 이른 하나를 선택하고 같은 ID의 다른 내용은 거부합니다. 여행·배치·표본·토큰 수를 사람 수로 세지 않습니다.
- Use the median complete traversal duration across those contributors; for an even number, average the middle two. Speed is verified directed-edge geometry length divided by that median, rounded to6 decimal places. Never average GPS instantaneous speeds. Positive finite distance/duration and timestamp-duration agreement are mandatory; no zero-speed closure inference.
  고유 기여자의 완전 통과시간 중앙값을 사용하며 짝수면 가운데 둘의 평균입니다. 검증된 방향 지형 길이/중앙값을 소수6자리 속도로 내고 GPS 순간속도 평균·0속도 폐쇄 추론은 하지 않습니다.
- Public eligibility threshold5; buckets `5-9`, `10-19`, `20+`. No exact low count, contributor/vehicle/trip/sample/observation IDs, coordinates, credentials or per-person times in the candidate. Private synthetic evaluation may retain exact counts and reasons separately.
  공개 최소5명·구간별 표본수만 표시합니다. 후보에는 작은 정확한 수·개인/차량/여행/관측 식별·좌표·인증·개인별 시각을 넣지 않고 합성 평가 근거를 별도로 둡니다.
- Key every operation by namespace, graph, policy, source class and window. Pure logic supports CAR/BUS/SYNTHETIC as distinct sources; the current actual ingestion adapter still accepts SYNTHETIC only. Wrong graph/policy, malformed metadata and inconsistent directed-edge lengths fail closed. No synthetic value enters a production namespace.
  모든 작업을 시험영역·그래프·정책·출처·창으로 구분합니다. 순수 계산은 자동차/버스/합성을 분리하되 실제 수집은 계속 합성만 허용합니다. 다른 지도·정책·잘못된 메타데이터·길이 불일치는 거부합니다.

## Output contract / 출력 계약

```typescript
type TrafficStatus = "LIVE" | "INSUFFICIENT" | "UNKNOWN" | "STALE";
type AggregationDraft = {
  schema_version: "0.1";
  graph_id: string;
  region_id: "seoul-pilot-corridors-v1";
  aggregation_policy: "seoul-window-median-v1";
  window_start: string;
  window_end: string;
  valid_until: string; // window_end +180s, never extended / 창끝180초, 연장 금지
  entries: Array<{
    edge_id: string;
    forward: boolean;
    source_class: "CAR" | "BUS" | "SYNTHETIC";
    status: TrafficStatus;
    speed_mps: number | null;
    sample_bucket: "5-9" | "10-19" | "20+" | null;
  }>;
};
```

This unsigned, non-publication draft is not yet TrafficSnapshot: no publisher identity, sequence, signature or activation. Include every directed edge of the explicit verified pilot corridor catalog, sorted by string ID/direction/source; record its digest in private metadata. This catalog defines P06's pilot output scope, never the matcher's candidate whitelist. Unlisted roads have no inferred traffic. Reuse current79 located scene edges and independently measured geometry; verify referenced stored edges against this catalog, failing on mismatch rather than silently dropping them.

서명·게시 전 후보이며 아직 발급자·순번·서명·활성화가 있는 TrafficSnapshot이 아닙니다. 검증한 시험 구간 목록 전체를 정렬하고 목록 해시는 비공개 메타데이터에 기록합니다. 현재79개 조회 지형을 재사용하되 매칭 후보 제한으로 쓰지 않으며 목록 밖 교통을 추정하지 않습니다. 저장 구간이 목록과 다르면 조용히 제외하지 않고 실패합니다.

Before the window deadline, return `WINDOW_OPEN` and persist no draft. In a closed unexpired window, zero eligible contributors is UNKNOWN,1–4 is INSUFFICIENT and5+ is LIVE. At `now >= valid_until`, a formerly eligible LIVE value becomes STALE with null speed/bucket; insufficient/unknown observations never acquire a speed. A newer empty window is UNKNOWN and never inherits an older LIVE value. Canonical draft bytes contain no wall-clock generation timestamp, so identical eligible inputs give identical bytes under retries/reordering. Finalization time and input digest are private metadata. Consumer read/finalize paths always consult the current persisted clock before returning data; no cached bytes bypass expiry.

마감 전에는 WINDOW_OPEN이며 저장하지 않습니다. 마감 후 유효기간 안에서 적격0명은UNKNOWN·1~4명은INSUFFICIENT·5명이상은LIVE입니다. 만료시각 이상이면 기존 LIVE는STALE·속도/표본구간null이고 부족/미관측 자료에 속도를 만들지 않습니다. 새 빈 창은 예전 속도를 상속하지 않습니다. 후보 바이트에는 생성벽시계가 없어 재시도·순서 변경에 결정적이며 읽기/확정은 항상 현재DB시계로 만료를 확인합니다.

## Explicit activity and privacy invalidation / 명시 활동·철회 무효화

Add optional `trip_activity: "TRAVEL" | "PARKED"` to the bounded P05 batch, default TRAVEL for existing callers. Normalize before hashing, persist it on the trip and require every later batch to agree. Additive schema initialization must work on a pre-P06 P05 database. PARKED trips can be matched in this authored synthetic test but are excluded from aggregation. A stationary interval alone never means PARKED; signal waiting in a TRAVEL trip remains in complete traversal duration. This is explicit fixture/user collection state, not inferred parking detection and not hidden trajectory ground truth. Mid-trip state changes conflict; a changed activity starts a new bounded trip. Real mobile collection UX remains P11.

P05 배치에 선택 활동값을 추가하고 기존 호출은TRAVEL로 정규화합니다. 여행에 저장해 후속 배치와 일치시킵니다. 기존P05 DB에도 추가 초기화가 가능해야 합니다. 합성PARKED 여행은 매칭해도 집계에서 제외하고 정지값만으로 주차를 추론하지 않아 TRAVEL 신호대기를 시간에 남깁니다. 명시 수집상태이며 숨겨진 정답·자동주차판정이 아닙니다. 여행 중 변경은 충돌이고 새 여행으로 시작하며 실제 단말UX는P11입니다.

Persist canonical candidate bytes in a single P06 window row, unique(namespace,graph,policy,source,window_start), with input/catalog digest and finalization event time. Never persist a second private copy of contributor IDs or raw points. A narrowly scoped PostgreSQL AFTER DELETE trigger on P05 traversals invalidates the corresponding stored window draft in the **same deletion transaction**, including consent revocation and retention cascade. This prevents an old candidate surviving a successful revoke response. Recompute from remaining authoritative rows on the next read/finalize. A5→4 revocation yields INSUFFICIENT; do not promise recall of immutable files already exported to third parties. All published test material is synthetic.

候보 바이트를 창별 단일행에 저장하고 입력/목록해시·확정시각만 함께 기록하며 개인식별·원시점을 다시 복사하지 않습니다. P05 통과삭제의 좁은 AFTER DELETE트리거가 동의철회·보관기한 연쇄삭제와 **같은 트랜잭션**에서 해당 후보를 무효화합니다. 철회성공 뒤 옛 후보가 남지 않으며 다음 읽기/확정에 남은 원본으로 다시 계산해5→4명은INSUFFICIENT입니다. 외부에 이미 보낸 파일의 회수는 주장하지 않고 공개시험은합성입니다.

Lock order: namespace clock FOR SHARE → contributors in sorted ID order FOR SHARE → candidate write. P05 already locks clock before contributor/trip updates. Preserve this order, with bounded database statement/lock timeouts and rollback on failure. Competing finalizers use the unique key/transaction and return the same body. A child-worker failpoint after candidate write but before COMMIT proves rollback; an after-COMMIT pause proves lost-response retry without duplicate rows. Stop only owned child process groups. Delete P06 rows at window_end+24h via an explicit idempotent sweep and inspect zero remaining candidates; a past-retention request must not recreate them.

잠금은 시계→정렬기여자→후보쓰기 순서로 기존P05와 일치시킵니다. 제한시간·오류롤백을 두고 동시확정은고유키로같은본문을 반환합니다. 후보쓰기후커밋전·커밋후응답전실제처리자중단으로롤백/중복없는복구를 확인합니다. 창끝24시간에후보를삭제하고재실행·0개재조회·기한지난요청재생성거부를확인합니다.

## Interfaces and file ownership / 인터페이스·파일 책임

Core Sol owns `aggregation_types.ts`, `traffic_aggregation.ts`, `aggregation_store.ts`, `aggregation_worker.ts`, related core tests and the minimal ingestion types/validation/store changes. Expose `aggregateWindow(input)` (pure, includes private selection/reason diagnostics), `AggregationStore.initialize()`, `.finalize(windowStartUtc,eventTimeUtc,beforeCommit?)`, `.inspect()`, `.sweep(eventTimeUtc)`, `.close()`. Store config contains existing StoreConfig plus verified edge catalog and one source class. Worker takes `--config PRIVATE_JSON`, reports READY/PHASE/RESULT over IPC, and supports AFTER_AGGREGATE_WRITE/AFTER_AGGREGATE_COMMIT pauses with explicit RESUME. Expose exact TypeScript types promptly so integration can compile against them. Do not modify the shared runtime merely to rename P05 ownership prefixes.

코어Sol은집계타입·순수계산·DB·처리자·코어테스트와필요한P05타입/검사/저장변경을맡습니다. 위함수를제공하고설정에기존DB설정·검증구간목록·출처를둡니다. 처리자는비공개설정과IPC중단/재개를지원하며정확한타입을빠르게공유합니다. 자원접두어이름만바꾸려고공유runtime을수정하지않습니다.

Integration Sol owns `aggregation_scenario.ts`, `aggregation_checks.ts`, integration tests, `pilot_integration.ts`, `simulation_report.ts`, minimal package scripts/CI artifact additions if needed. Keep core ownership disjoint. Use OwnedIngestionRuntime for real DB/API/P05/P06 workers and cleanup. Main owns canonical docs, review, final fresh execution, publication and merge.

통합Sol은합성시나리오·직접검사·통합테스트·전체실행·보고서와필요한스크립트/CI를맡고코어영역과겹치지않습니다. 기존자원소유실행기로실제DB/API/처리자를띄웁니다. 메인은문서·검토·최종새전체실행·게시·병합을맡습니다.

## Actual Seoul acceptance matrix / 실제 서울 수용 검사

Use the fresh Teheran route's first three contiguous real directed edges (approximately23m,47m,28m in the inspected source; derive actual lengths from the current graph). Target the middle edge, with GPS before/after both boundaries. Generate five distinct authenticated synthetic contributors at3/4/5/6/7m/s,500ms sampling, zero noise, plus an8s signal wait inside the middle edge. Choose pause time from the authored distance schedule; do not pass truth into matching/aggregation. A50–60s short-trip bound leaves enough time before the first90s deadline. Fix expected target travel times from geometry/schedule before reading matcher outputs. All five target traversals must be supported; do not lower the threshold or adjust expected values after seeing outputs.

새테헤란경로의연속3개실제구간을쓰고가운데구간앞뒤GPS를확보합니다. 5명의합성신원·각3/4/5/6/7m/s·500ms·잡음0·구간안8초신호대기를생성합니다. 지형/주행일정으로예상통과시간을먼저정하고매칭/집계에정답을전달하지않습니다. 50~60초여행으로90초마감전에처리하며5명모두적격이어야하고출력을본뒤기준을낮추지않습니다.

1. Separate real namespaces with0,1,4 and5 contributors; one contributor's repeated completed trips still counts once. Five contributes LIVE; independently recomputed median duration/speed agrees (target duration error≤150ms, speed difference≤2% against schedule truth). Signal wait remains; an explicit PARKED sixth trip cannot affect count/speed.
2. Actual HTTP duplicate and reordered batches leave the same finalized draft. Late P05 completion at exactly90s and90.001s cannot change the first window; just-before deadline is eligible. Test pure boundaries for exit60s, invalid duration/nonfinite values, conflicting IDs, even median, source/graph/window isolation and10/20 bucket boundaries.
3. Deadline-minus1ms returns WINDOW_OPEN/no DB draft; at deadline finalizes. A new empty window does not inherit LIVE. At240s (window_end60+180), no usable LIVE speed remains; a stale caller cannot revive it. No speed0/closure inference.
4. Two actual aggregate worker processes converge to one identical DB candidate. SIGKILL after write/before commit leaves no partial row; after commit/before response preserves one row and retry bytes. Preserve PIDs, exit signals, SQL read-backs and canonical hashes.
5. Revoke after a LIVE draft through actual P05 HTTP; immediately inspect candidate absence before recomputation, then4-contributor INSUFFICIENT. Exercise aggregation/revoke ordering with a paused worker and bounded waits; the final acknowledged revoke cannot leave a usable old draft. Expiry/retention sweeps are idempotent and old requests cannot recreate purged state.
6. Strict public-field whitelist and absence of fixture credentials/private identifiers/coordinates in draft bytes. The SYNTHETIC runtime refuses non-synthetic ingestion; pure BUS/CAR partitions cannot contaminate each other. Inspect all actual candidate rows and output files, not only response status.
7. The whole runner keeps prior111 assertions and appends these checks. Record workload specs/truth/observations, HTTP receipts, actual P05 worker attempts, P06 selections/reasons, DB rows, source/graph identities, hashes and cleanup. Public map data attribution remains intact.

위행렬은별도시험영역의0/1/4/5명·같은기여자반복·신호/주차·실제중복/역순/지연·시간경계·두처리자·실제중단/복구·철회경쟁·삭제재조회·공개필드검사·기존전체111개보존을요구합니다. 상태코드만이아닌실제원문·DB·시각·바이트·정리를검사합니다.

## Demonstration and completion / 시연·완료

Keep the existing nine-vehicle replay and add a clearly labeled P06 population replay on the same actual map; selectable datasets must not show the original vehicles as the source of a different aggregate. Show target edge, unsigned candidate state, window/deadline/expiry, count bucket and speed, plus the tested0/1/4/5, revoked and expired states from real recorded evidence. Labels distinguish synthetic aggregation from live road traffic and P07/P08 behavior. Bilingual controls, mobile overflow check, actual recording, README refresh and media fingerprint are required. Main independently calculates expected results from raw DB traversals and generator truth. Only after local whole execution, hosted Node22/24/full Docker evidence and protected PR delivery is P06 considered complete.

기존9대재생과P06차량군을같은실제지도에서명확히구분해선택하고다른집계의출처처럼표시하지않습니다. 대상구간·서명전상태·창/마감/만료·표본구간·속도와실제검사한0/1/4/5명·철회·만료를보여줍니다. 한영·모바일·실제녹화·README·지문을갱신하고메인이DB/생성정답으로독립계산합니다. 로컬전체·원격검사·보호PR반영까지완료해야P06완료입니다.
