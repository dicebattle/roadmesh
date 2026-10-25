# P12 whole-system faults and scenario evidence / P12 전체 장애·시나리오 근거

Status: main Sol design, before implementation. P11's original334 cases remain required. Add a separate24-case P12 stage, for358 total, after the existing actual Seoul stages. This is a local synthetic pilot contract; actual road geometry is retained and negative inputs come from measured upstream behavior. Do not lower existing deadlines, privacy rules, graph checks or case counts.

상태: 구현 전 메인 Sol 설계입니다. 기존 P11까지334개를 유지하고 별도 P12 단계24개를 추가해 총358개로 검사합니다. 실제 서울 도로를 유지하는 로컬 합성 계약이며 부정 입력은 실제 관측한 상위 엔진 동작을 사용합니다. 기존 기한·개인정보·그래프 검사·판정 수를 낮추지 않습니다.

## Request and failure contract / 요청·실패 계약

Add optional `snap_policy:"nearest_road_100m"` to the public gateway request and internal node/traffic request. Omission preserves existing native request bytes. The explicit policy sets `search_cutoff:100` and `minimum_reachability:0` on both native locations: consider eligible nearby roads without excluding small components by their reachability count. The request hash includes the policy; forwarding, native expectation and evidence must all agree. Do not silently enable this on old client requests. Document it as an API option first; the existing form remains unchanged. Successful results still use the existing public response allowlist.

공개 중계와 내부 노드·교통 요청에 위 선택 필드를 추가합니다. 생략하면 기존 엔진 요청 바이트를 유지합니다. 명시하면 두 위치의 탐색을100m로 제한하고 연결 규모 때문에 작은 도로망을 제외하지 않습니다. 요청 해시·전달·엔진 기대값·근거가 모두 이 선택을 포함해야 합니다. 기존 화면 요청에 조용히 적용하지 않고 먼저 API 옵션으로 문서화하며 기존 입력 화면은 유지합니다. 성공 응답의 공개 필드는 그대로입니다.

Use the fixed source-lock extraction rectangle as the service coverage boundary, carried from verified graph loading rather than caller claims. A globally valid coordinate outside it returns422 `OUT_OF_COVERAGE` before native dispatch. Invalid numbers/ranges remain422 `INVALID_INPUT`. An original HTTP400 route response with exact bounded native error code171 becomes422 `NO_SUITABLE_ROAD`;170 or442 becomes422 `NO_PATH`. Other native errors stay service/engine failures. Do not apply matrix code441 to routing. Parse only regular bounded error files; reject malformed, duplicate-key, oversized, wrong-status or unsupported-code payloads. Preserve original HTTP headers/body in private evidence.

검증한 그래프의 고정 원본 추출 사각형을 서비스 범위로 사용하며 호출자가 주장한 범위를 믿지 않습니다. 지구상 유효 좌표라도 범위 밖이면 엔진 전422 범위 밖 오류, 숫자·좌표 자체가 잘못되면 기존 입력 오류입니다. 실제 엔진 HTTP400의171은 적합한 도로 없음,170·442는 경로 없음으로 구분하고 그 밖의 오류는 엔진/서비스 실패로 유지합니다. 행렬용441을 경로 오류로 쓰지 않습니다. 정상 파일·크기·JSON·HTTP 상태·코드를 제한하고 원래 헤더와 본문을 비공개 근거로 보존합니다.

A native domain failure must pass the same leased generation, native identity, final accepted-state and expiry checks as a success. Extend the internal reply with a discriminated `ROUTE_REJECTED` body containing request ID/hash, node/instance, normalized reason, native code and existing provenance. The gateway validates the exact allowlist and selected request/version/instance, rechecks its own accepted authority and bytes, then returns its existing four-field public error body. A valid domain failure is not retried on the same graph; a malformed or mismatched peer reply retains the existing one-peer retry. A changed version/expired authority wins over a completed domain result. No private native identities or raw upstream error strings become public.

업무상 경로 실패도 성공과 같은 고정 세대·엔진 식별·최종 수용 상태·만료 검사를 거칩니다. 내부 응답에는 요청 ID/해시·노드/실행·정규화 사유·엔진 코드·기존 출처를 연결합니다. 중계는 정확한 필드와 선택한 요청/버전/실행을 확인하고 자신의 승인·바이트를 다시 검사한 뒤 기존 네 필드 공개 오류로 반환합니다. 유효한 업무 실패는 같은 그래프에서 재시도하지 않고, 손상되거나 불일치한 노드 응답은 기존 한 번 재시도를 유지합니다. 결과 계산 중 버전이 바뀌거나 만료되면 그 상태가 우선합니다. 내부 식별자·상위 원문 오류는 공개하지 않습니다.

The measured Seoul origin is `(127.029,37.4984)`. Under the explicit policy, target `(127.080961,37.549272)` returns171 and `(127.070395,37.507408)` returns442. Legacy defaults return routes for both. Preserve this distinction and raw [probe evidence](../research/pilot/2026-10-25-p12-planning/README.md). These are graph/policy outcomes, not certified real-world road closures.

측정한 출발·도착 좌표와 선택 정책에서는 위 오류가 재현되고 기존 기본값은 모두 경로를 반환합니다. 두 결과를 구분해 보존하며 실제 도로 폐쇄를 인증한 것으로 표현하지 않습니다.

## Trusted controls and actual transport faults / 신뢰 설정·실제 통신 장애

Add optional `excluded_node_ids` to private gateway configuration, default empty. Require unique known configured IDs. Apply it before status selection and dispatch; immutable configuration changes take effect through a supervised restart that retains the same durable consumer. Keep both independently healthy nodes running while proving a revoked/excludedA is never selected. Excluding both returns explicit no-service with zero node attempts. This is local administrative configuration, not public enrollment or Byzantine revocation consensus.

중계 비공개 설정에 중복 없는 기존 노드 ID 제외 목록을 추가하고 기본값은 빈 목록으로 둡니다. 상태 조회·전달 전에 배제하고 같은 영속 수신자를 유지한 감독 재시작으로 설정을 반영합니다. A가 실제로 살아 있고 정상 응답하는 동안에도 선택되지 않는지 검사하고 둘 다 제외하면 노드 시도 없이 사용 불가로 반환합니다. 로컬 관리 설정이며 공개 등록·악성 노드 합의가 아닙니다.

Reuse owned Node HTTP/TCP proxies. A reset case destroys the actual request socket without forwarding it; a blackhole accepts and retains the connection without headers/body until client abort or owned cleanup. Status probes still reach the real node so the failure occurs on actual route transport. Record accepted/reset/closed events and exact monotonic timing; preserve4s per-node and12s shared limits. Publisher transport interruption retains only a still-valid accepted snapshot; advancing the authoritative clock to expiry removes it even while disconnected. Call these controlled TCP interruption/stall tests, not statistical Internet packet-loss measurements.

소유 Node HTTP/TCP 대리 서버를 재사용합니다. 연결 끊기는 실제 요청 소켓을 전달 전에 닫고, 무응답은 연결을 수락하되 헤더/본문 없이 취소나 정리까지 유지합니다. 상태 조회는 실제 노드로 보내 경로 전송 단계에서 장애를 일으킵니다. 수락·중단·종료와 단조 시간을 기록하고4초/12초 기준을 유지합니다. 게시 연결 장애에서도 유효한 수용 자료만 남기며 승인 시각이 만료에 도달하면 연결이 끊겨 있어도 제거합니다. 통제한 TCP 중단·무응답이며 인터넷 패킷 손실률 측정은 아닙니다.

Add optional trusted principal `vehicle_class:"CAR"|"BUS"|"OTHER"`; omitted legacy principals mean CAR. Configuration validates the enum; observation admission rejects BUS/OTHER with403 `VEHICLE_NOT_ALLOWED` before persistence. Request bodies cannot override the authenticated class. Keep legacy CAR canonical request hashes and retry semantics unchanged. Compare actual CAR rows, aggregates and counts before/after rejected requests. Synthetic source/namespace rejection continues to use existing guards and same-run evidence.

신뢰 인증 주체에 차량 종류를 추가하고 기존 생략값은 자동차로 해석합니다. 설정의 종류를 검사하되 관측 접수에서는 버스·기타를 저장 전에403으로 거부합니다. 요청 본문이 인증된 종류를 바꾸지 못하게 하며 기존 자동차 해시·재시도 의미를 유지합니다. 거부 전후 실제 자동차 행·집계·개수를 대조하고 합성 출처·영역 분리는 기존 보호와 같은 실행 근거를 사용합니다.

## Scenario assembly and owned shutdown / 시나리오 구성·소유 종료

A typed S01–S15 matrix references exact assertion IDs and original evidence hashes from this same source/graph run. The tiny-only parallel-road regression stays explicitly labeled; the primary pipeline remains actual Seoul. Check missing/duplicate/skipped IDs, source/runtime/graph mismatch, absent or changed bytes and unsuccessful cleanup. Never create success by joining unrelated historical manifests. Negative matrix fixtures are derived copies and marked as rejection tests; no real original is overwritten.

S01~S15 행렬은 같은 소스·그래프 실행의 정확한 판정 ID와 원문 해시를 참조합니다. 작은 평행도로 회귀는 따로 표시하고 주요 흐름은 실제 서울을 유지합니다. 누락·중복·생략·출처/실행/지도 불일치·원문 누락/변경·정리 실패를 거부합니다. 서로 다른 과거 성공을 이어 붙이지 않고, 행렬 부정 입력은 별도 복사본으로 만들어 원본을 덮어쓰지 않습니다.

For S15, one actual outer supervisor owns a nested live client stack and its browser using the same OwnedIngestionRuntime cleanup path. After a recorded browser/native baseline response, exercise SIGTERM and a deliberately thrown parent failure in separate fresh fixtures. Verify expected nonzero exit, retained diagnostics, exact original PID/start identities, containers/volume and closed ports. Reuse the verified Seoul graph to avoid duplicating graph construction; normal full358 still rebuilds it. This proves that observed live phase, not every possible interruption instruction. Add only a narrow reusable supervisor seam if needed; never stop unrelated processes.

S15에서는 같은 소유 실행기 정리 경로를 쓰는 실제 상위 감독자가 살아 있는 클라이언트 전체와 브라우저를 소유합니다. 브라우저/엔진 기본 응답을 기록한 뒤 별도 새 실행에서 종료 신호와 의도적인 부모 실패를 각각 적용하고 비정상 종료·보존 진단·정확한 PID/시작 식별자·컨테이너/볼륨·포트 정리를 검사합니다. 검증된 서울 그래프를 재사용해 중복 생성을 피하되 일반 전체358개는 새 그래프를 생성합니다. 관측한 그 실행 단계를 증명하며 모든 명령 위치의 중단을 보장하지 않습니다. 필요한 감독 연결만 좁게 재사용하고 다른 프로세스는 종료하지 않습니다.

## Fixed additional cases / 추가 고정 사례

The24 P12 IDs are: fresh-source, bounded-native-success, no-suitable-road, no-path, outside-coverage, domain-version-change, malformed-domain-response, excluded-node-healthy, excluded-node-not-selected, both-excluded, transport-reset, transport-blackhole, publisher-reset, partition-expiry, non-car-http, non-car-body-spoof, car-retry-preserved, namespace-isolation, same-run-matrix, matrix-missing-rejected, matrix-forged-success-rejected, supervisor-abort, supervisor-failure, owned-cleanup. Public privacy is checked within every new public outcome and the matrix, preserving existing privacy cases. Do not count exploratory probes as these cases.

위24개를 고정하며 새 공개 결과 전체와 행렬에서 비공개 값 유출을 검사하고 기존 개인정보 사례도 유지합니다. 탐색 조사를 이 사례의 통과로 세지 않습니다.

Main Sol owns design, implementation and direct verification in this increment. Scope is the optional route policy/error adapter, trusted exclusion/class guards, dedicated scenario runtime/checks/matrix, narrow existing integration/report extension and focused tests. Existing334 cases remain; implementation is followed by fresh358, independent originals, updated actual recording/README, bilingual report, push, hosted inspection and protected delivery. P13/P14b remain separate work.

이번 단계는 메인 Sol이 설계·구현·직접 검증을 맡습니다. 선택형 경로 정책/오류 연결·신뢰 제외/차량 보호·시나리오 실행/검사/행렬·기존 전체 실행/보고의 좁은 확장과 집중 검사가 범위입니다. 기존334개를 유지하고 구현 뒤 새358개·독립 원문·최신 녹화/README·한영 보고·푸시·원격 검사·보호 반영을 수행합니다. P13/P14b는 별도 작업입니다.

## Implementation progress before final acceptance / 최종 판정 전 구현 경과

The main Sol implementation now exists. Actual development19 and two live outer-supervisor fault fixtures passed; original failures, exact source/runtime scope and main inspection are in the [development record](../research/pilot/2026-10-25-p12/development/README.md). The runtime-only command deliberately reports DEVELOPMENT_ONLY and cannot substitute for the334-prior plus24 same-run gate. The original fixed design above is historical; full clean358, refreshed actual demo, hosted originals and protected merge remain pending.

메인 Sol 구현이 추가됐고 실제 개발19개와 살아 있는 상위 감독 장애 두 경우를 통과했습니다. 실패·소스/실행 범위·메인 검사는 개발 기록에 보존합니다. 개별 명령은 개발 전용 상태를 반환하고 기존334개와 추가24개를 같은 실행에서 통과한 것으로 대신하지 않습니다. 위 고정 설계는 당시 기록이며 깨끗한 전체358개·최신 실제 데모·원격 원문·보호 병합은 남아 있습니다.

### Persisted matrix boundary correction / 저장된 행렬 경계 보정

The first clean358 run at8821c4d completed its internal gates, but main's independent audit could not reproduce the matrix assertion hash from the saved JSON. The confirmed cause is three raw pg timestamp Date objects in P06 late-completion assertions: in-memory canonicalization treated them as empty objects, while JSON.stringify wrote ISO strings. Reviving precisely those three dates reproduces the exact original hash. No serialized Buffer values were found; an initial Buffer attribution was an unconfirmed inference and is corrected. The first run is therefore not accepted as final proof. Preserve its originals and failed audit. Before hashing matrix inputs or individual assertion references, materialize the strict JSON representation actually written to disk, and use that same representation during verification. Add an explicit Date/Buffer/typed-array JSON round-trip regression, then require a new clean whole358 run and independent read-back. Never alter old hash fields to conceal the failure.

첫 깨끗한358개 실행은 내부 판정을 마쳤지만 메인의 독립 검사가 저장 JSON에서 행렬 판정 해시를 재현하지 못했습니다. 확인한 원인은 P06 지연 완료 판정의 pg 시각 Date 객체 세 개입니다. 메모리 정규화는 이를 빈 객체로, JSON 저장은 ISO 문자열로 표현했습니다. 정확히 그 세 날짜를 복원하면 처음 해시가 재현됩니다. 직렬화된 Buffer 값은 없었으며 처음의 Buffer 원인 설명은 미확인 추정으로 정정합니다. 첫 실행을 최종 근거로 수용하지 않고 원문·감사 실패를 보존합니다. 행렬 전체와 개별 판정 참조를 해시하기 전에 실제 저장되는 엄격한 JSON 표현을 확정하고 검증에도 같은 표현을 사용합니다. Date/Buffer/타입 배열의 JSON 왕복 회귀를 추가한 뒤 새 깨끗한 전체358개·독립 재조회를 요구하며, 과거 해시를 바꾸어 실패를 숨기지 않습니다.
