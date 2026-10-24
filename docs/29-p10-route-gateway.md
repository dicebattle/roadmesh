# P10 version-aware route gateway / 버전을 확인하는 경로 중계

Status: main design, not implementation proof. Implementation may proceed in an isolated worktree from the verified P09 head while hosted checks run. Incorporate P09 protected main ancestry before P10 final delivery. / 상태: 메인 설계이며 구현 근거가 아닙니다. 원격 검사 중 검증한 P09 커밋의 별도 작업 폴더에서 구현할 수 있으며 P10 최종 반영 전 P09 보호 병합 이력을 포함합니다.

## Scope / 범위

One authenticated loopback gateway selects from exactly two privately configured, approved P09 nodes. It owns a separate P07 durable consumer and reuses the verified graph/bundle/compiler. Neither node health nor the highest version advertised by a node is an authority for traffic selection. P07 accepted state supplies the target; the gateway never silently substitutes another snapshot during retry. This is a local pilot refinement of draft04, not public node enrollment, production authentication or malicious-node consensus.

인증된 로컬 중계 서버 하나가 비공개 설정으로 승인한 P09 노드 두 개를 선택합니다. 별도 P07 영속 수신자와 검증된 지도/묶음/변환기를 재사용합니다. 노드 건강 상태나 노드가 주장하는 최신 버전이 교통 선택의 기준이 되지 않으며, P07 수용 상태가 정한 버전으로만 재시도합니다. 공개 노드 등록·운영 인증·악성 노드 합의를 구현한 것으로 표현하지 않습니다.

## API / 인터페이스

`POST /v1/routes`, Bearer token, JSON <=64KiB including chunked input. Exact fields: `schema_version:"0.1"`, `request_id`, `origin:{latitude,longitude}`, `destination:{latitude,longitude}`, `profile:"car"`, `traffic_policy:"prefer_live"`. Reject unknown fields and all nonfinite/out-of-range coordinates. Explicit `base_only` is not supported by the current node contract and returns422 `UNSUPPORTED_POLICY`; do not secretly use live traffic. Supporting that optional product policy requires separate baseline capacity design.

위 필드만 받으며 청크 전송을 포함해64KiB를 제한하고 유한한 좌표 범위를 검사합니다. 현재 노드는 명시 기본값 강제 계산을 지원하지 않으므로 `base_only`는422로 명확히 거부하며 몰래 실시간 자료를 적용하지 않습니다. 기본값 강제 정책은 별도 용량 설계 후 지원합니다.

A200 response uses an exact allowlist: request_id/request_sha256, graph_id, snapshot_id/sequence, generation_id, traffic_sha256, engine_version/image_id, costing_config_id, node_id, calculated_at, traffic_mode, distance_m, duration_s, GeoJSON LineString, live_coverage_ratio, warnings with code/message_en/message_ko. LIVE_MIXED means a positive fraction of actual route length uses accepted live edge records; BASE_ONLY means zero coverage or no usable snapshot, even if another edge elsewhere is live. Never expose native daemon/container identities, raw traces, tokens, database paths or contributor identity in public responses. Local evidence retains native originals separately. Do not claim response signatures or hostile-node integrity; approved local nodes remain a trust boundary.

200응답은 요청·지도·교통·세대·엔진·비용 식별자와 실제 경로/거리/시간·실시간 적용률·한영 경고만 허용합니다. 실제 지나간 거리 중 유효 교통정보 적용 길이가 양수일 때만 LIVE_MIXED로 표시하고, 경로 적용률0 또는 자료 없음은 BASE_ONLY로 표시합니다. 공개 응답에 엔진/컨테이너 내부 식별자·원시추적·토큰·DB경로·기여자를 넣지 않습니다. 응답서명·악성 노드 무결성 보장은 이 범위에서 주장하지 않습니다.

Errors carry code/reason plus EN/KO text:401 AUTH_REQUIRED;422 INVALID_INPUT/UNSUPPORTED_POLICY;429 RATE_LIMITED;409 VERSION_MISMATCH/TRAFFIC_CHANGED;503 NO_HEALTHY_NODE/STORE_UNAVAILABLE;504 DEADLINE_EXCEEDED. No successful-route body is attached to failures.

실패는 위 코드·사유·한영 설명을 가지며 성공 경로를 함께 반환하지 않습니다.

## Selection and deadline / 선택과 시간 제한

The gateway has at most8 admitted requests and no public request queue. Overall monotonic12s budget includes body read, durable reads, status requests, route attempts, validation and final accepted-state inspection. Per-node status budget1000ms, at most two status probes in parallel; at most two sequential route attempts with4s maximum each and one remaining shared budget. No hedged requests, automatic transport retries or redirects. Native request deadline header contains remaining integer milliseconds1..30000; P09 clamps it to its own30s limit and rejects invalid values. Missing header retains existing P09 behavior. Client disconnect aborts gateway HTTP work; P09 honors the propagated deadline even if cancellation cannot stop native compute immediately. Demonstrate leases released within the bound.

중계 서버는동시8개만접수하고공개대기열을두지않습니다. 본문수신·DB조회·상태조회·계산시도·응답검사·최종DB재검사를 모두 단조시계12초에 포함합니다. 노드상태는각1000ms로두개까지동시에조회하고,계산은각최대4초·총최대두번의순차시도만허용합니다. 자동중복요청·리다이렉트는금지합니다. P09에남은밀리초를전달하여자체30초상한보다짧게제한하고,헤더가없으면기존동작을유지합니다. 연결취소뒤엔진이즉시멈춘다고가정하지않고전달한기한과요청정리를검증합니다.

Select durable acceptance, compile/verify its immutable generation through P08, then re-read acceptance before dispatch. Match node ready/graph/image/costing policy/generation/snapshot/sequence/traffic bytes. Node high-water need not match gateway high-water for baseline after different histories; active snapshot identity and generated content must match. Save gateway high-water and recheck it against gateway state at return. Choose configured stable node order for reproducible tests; capacity/unavailable/invalid response may consume one retry on the other matching node. Retry only the original pinned target.409/expiry or gateway state change terminates this request explicitly; a later client request may choose the new version. No ready node for a currently accepted generation means503, not an older live or baseline response.

영속수용상태→P08불변세대검증→수용재검사뒤노드준비·지도·엔진·비용·세대·교통바이트를대조합니다. 만료후기본값에서노드별과거최고순번은다를수있지만실제선택세대는같아야합니다.중계자신의최고순번은반환직전다시대조합니다.설정순서로선택하며첫노드의용량/불가/잘못된응답에대해서만같은원래세대의다른노드에한번재시도합니다.409·만료·중계수용변경은현재요청을명시실패시키고새요청에서새버전을고릅니다.현재세대의준비노드가없으면503이며과거교통이나기본값으로몰래바꾸지않습니다.

Use a bounded serial consumer store gate (one active, max16 queued, <=2s per operation within request budget); an unresolved timed-out PG promise blocks new work until settled and its late value is discarded. Poll500ms with no overlapping/coalesced infinite loop; a failed pull may keep an unexpired previously accepted snapshot, but DB unavailability cannot use cached authorization. Cleanup must await or bound exact owned store/process resources. Reuse P09 behavior through a small shared helper only if necessary; do not refactor unrelated modules.

DB작업은하나씩·대기최대16개·각2초이내로제한하고미해결타임아웃이남으면새작업을막습니다.늦은값을재사용하지않습니다.500ms수신은중첩하지않고HTTP수신장애때도기존자료의만료를지킵니다.DB불가시캐시승인을사용하지않습니다.필요한최소공유도구만추출하며관련없는모듈은재작성하지않습니다.

## Trust, validation and proof / 신뢰·검사·증거

Private endpoints must be exact http://127.0.0.1:port origins without userinfo/path/query/fragment, unique IDs/origins and nonempty tokens; no client-provided destination URLs. Fetch uses redirect:error, bounded streamed response <=2MiB, content-type and strict structures. Check request ID, native request exact coordinates/auto/current-time costing, all target provenance, finite nonnegative distance/time and valid decoded geometry. Derive live coverage from original ordered route trace lengths intersecting compiled live edge IDs, including repeated edges, never from a node's supplied fraction. Check trace continuity/shape consistency and ratio0..1; failure rejects the response. This verifies consistency, not a malicious peer's honesty.

비공개노드주소는사용자정보·경로·쿼리·조각없는정확한127.0.0.1주소만허용하고ID/주소중복을거부합니다.클라이언트주소입력·리다이렉트를받지않으며응답2MiB·형식을검사합니다.요청ID·원좌표/자동차/현재시각비용·세대출처·유한한거리/시간·지형을대조합니다.적용률은원경로추적거리와변환한실시간구간의교집합으로반복구간을포함해계산합니다.노드가보낸비율을그대로믿지않고연결·지형일관성·0~1범위를검사합니다.이것은일관성검사이며악성노드정직성증명은아닙니다.

Required actual cases (32): fresh-source; authenticated-api; invalid-input; body-limit; unsupported-policy; configured-origins; independent-consumer; baseline; live-primary; route-local-coverage; primary-kill-failover; primary-unavailable-retry; wrong-generation-rejected; wrong-request-rejected; malformed-route-rejected; oversized-response-rejected; redirect-rejected; stale-node-excluded; no-matching-node; both-down; retry-once; shared-deadline; propagated-node-deadline; client-disconnect; admission-eight; result-version-change; exact-expiry; non-live-correction; publisher-outage; store-outage; public-privacy; owned-cleanup. Ordinary successful cases must use actual two P09 processes and persistent native daemons; adversarial HTTP peers must be explicitly labeled test proxies, never counted as successful native route proof. Preserve all previous270 checks, then add32 =>302. Record individual original requests/responses, attempts and reasons, elapsed times, gateway/node status, SQL readbacks, resource ownership and cleanup. Preserve actual SIGKILL/HTTP failures rather than mock-only proof. Fresh whole run, independent inspection, new capture, README refresh and protected delivery remain required.

필수실제32사례는위고정ID를사용합니다.정상성공은실제P09두프로세스·지속엔진을사용하고적대응답은시험대리서버로명시합니다.기존270개를유지하고32개를추가해302개로검증합니다.요청/응답원문·시도/사유·실시간·상태·SQL·소유/정리를기록하고실제종료/통신장애를사용합니다.새전체실행·독립검사·재촬영·README·보호반영이필수입니다.

## Confirmed implementation details / 확정 구현 세부

Use `x-routelens-deadline-ms` for the authenticated node remaining deadline. Public errors are `{code:"ERROR",reason,message_en,message_ko}`, with stable reason and HTTP mapping above. Controller route accepts `{deadline,signal}` options. Private IPC phases `AFTER_GATEWAY_SELECTION` and `AFTER_GATEWAY_NODE_RESULT` include request ID; controls use control_id acknowledgements. [Pinned upstream coverage semantics](../wiki/sources/valhalla-route-coverage.md) establish that trace lengths already represent matched partial edges. The integration keeps the existing long-route zero-coverage detour and adds source-authored interior35%→65% coordinates for positive coverage; no response-driven input adjustment.

인증 노드의 남은 기한은 위 헤더로 전달합니다. 공개 오류는 고정ERROR코드·안정된사유·한영설명이며 HTTP대응을유지합니다. 제어기요청은기한/취소신호를받고비공개두단계·요청ID·제어응답ID를고정합니다. 고정상위소스에서 trace길이가이미부분길이임을확인했습니다. 기존장거리우회의적용률0검사와원그래프내부35%~65%요청의양수검사를함께사용하며응답에맞춰입력을바꾸지않습니다.

Observed transport timing may include up to500ms beyond the configured monotonic timer, stated separately from the12s budget. The actual whole HTTP deadline case must observe12,000–12,500ms and zero remaining admission. A propagated node lease must end within its actual transmitted deadline (at most4,000ms) plus500ms; the broader12.5s ceiling cannot substitute for that per-attempt proof. Client-disconnect proof records gateway admission release separately from native lease release and does not claim immediate native computation cancellation.

외부전송시간관측은설정한단조시계타이머밖에최대500ms의관측/스케줄링여유를별도로둡니다. 전체HTTP기한사례는12000~12500ms와접수잔량0을검사합니다. 전달된노드요청은실제헤더기한(최대4000ms)+500ms안에임대를반납해야하며전체12.5초기준으로대체하지않습니다. 연결해제는중계접수반납과엔진요청반납을분리하며즉시네이티브계산취소를주장하지않습니다.

## Hosted concurrency correction / 원격 동시 요청 수정

Final PR run40135410268 at5a6d7d7 failed admission-eight: the gateway recorded eight admissions and refused the ninth with429, but six requests reached their12s deadline with no native attempt; two completed. Their target generation was identical. Source review found synchronous full-bundle loading and generation compilation on every route's HTTP event loop. Preserve the original failure and the existing eight-success assertion; do not turn timeout into an accepted success or extend the12s/4s limits.

최종 PR 실행에서8개 접수·아홉째429는 정상이었지만6개가 엔진 시도 전에12초 기한을 소진했고2개만 완료했습니다. 선택한 세대는 같았습니다. 소스에는 요청마다 HTTP 이벤트 루프에서 전체 지도 묶음 검증·세대 생성을 동기 실행하는 경로가 있습니다. 원래 실패와8개 성공 기준을 보존하며 시간 초과를 통과로 바꾸거나12초/4초 한도를 늘리지 않습니다.

Move production bundle loading, generation compilation and generation-byte verification into one owned Node worker thread per gateway. Keep the existing P08 byte/signature/layout checks unchanged. Concurrent preparation for the exact same accepted input may share only an in-flight promise; remove it on settlement and never cache a previously verified success for later requests. Every pre-dispatch and final generation check remains an awaited byte verification. Key shared preparation by the full accepted manifest/snapshot/artifact identity, not only an untrusted ID. Convert structured-cloned artifact bytes back to Buffer inside the worker.

중계자마다 소유 Node 작업 스레드 하나에서 지도 묶음 검증·세대 생성·세대 바이트 검사를 실행합니다. 기존 P08 바이트·서명·배치 검사는 그대로 유지합니다. 정확히 같은 수용 입력의 동시 준비는 진행 중인 약속만 공유하고 끝나면 제거하며 과거 검증 성공을 이후 요청에 재사용하지 않습니다. 전달 전·최종 세대 검사는 계속 바이트 검사를 기다립니다. 공유 키에는 식별자만이 아닌 전체 수용 문서·스냅샷·원문 식별을 포함하고 복제된 바이트는 작업 스레드에서 Buffer로 복원합니다.

The parent remains responsive to HTTP admission, abort and deadline timers. Bound outstanding distinct worker jobs at16 and each job at12s; worker error/exit/deadline rejects its pending jobs and fails closed until gateway restart. One caller abort does not cancel shared work needed by another caller; the caller still stops waiting immediately, and late values cannot authorize its result. Own the worker from creation, close it on startup failure and normal/error shutdown, await termination, and include its termination status in cleanup evidence. Tests must cover in-flight sharing, revalidation after settlement, changed/corrupt input separation, event-loop responsiveness, worker failure/timeout and cleanup. Fresh whole302, independent originals and a new recording remain required before delivery.

부모는 HTTP 접수·취소·기한 타이머에 응답할 수 있어야 합니다. 서로 다른 미완료 작업은16개, 작업별 기한은12초로 제한합니다. 작업 스레드 오류·종료·기한 초과는 대기 작업을 모두 실패시키고 중계 재시작 전까지 안전하게 실패합니다. 한 요청 취소가 다른 요청의 공유 작업을 취소하지는 않지만 취소한 요청은 즉시 기다림을 끝내고 늦은 결과를 승인에 사용하지 않습니다. 생성 즉시 소유하고 시작 실패·정상/오류 종료 때 스레드 종료를 기다려 근거에 기록합니다. 진행 중 공유·이후 재검증·변경/손상 입력 구분·이벤트 루프 응답·실패/기한·정리를 검사하고 새 전체302개·독립 원문·녹화를 다시 확인합니다.
