# P09 persistent routing nodes / 지속 실행 경로 노드

Status: design fixed by main before coding; not implemented. Sol implements, main reviews and executes. The primary integration uses a freshly built actual Seoul OSM graph. The [bounded native-service probe](../research/pilot/2026-10-25-p09-preparation/retry/README.md) proves two original route requests on one daemon; it proves no lifecycle guarantee.

상태: 메인이 구현 전에 고정한 설계이며 아직 미구현입니다. Sol이 구현하고 메인이 검토·직접 실행합니다. 주요 통합에는 새로 만든 실제 서울 OSM 그래프를 사용합니다. 사전 실험은 한 데몬의 원래 경로 요청 두 번만 입증하며 수명주기 보장은 별도로 검증합니다.

## Scope and reuse / 범위·재사용

Run two independent local Node.js node agents, each with its own P07 consumer identity, loopback HTTP listener, private simulation token, generation directory and owned persistent Valhalla processes. Reuse P07 HTTP download, standard signatures, durable sequence/expiry, P08 bundle/compiler/generation checks and request validation. Do not fork Valhalla, add a second implementation language, replace the fresh Seoul scenario, or rebuild the graph for each traffic version. P10 owns gateway selection/failover; P11 owns the complete client. P09 supports traffic-generation changes on one verified graph; a different graph is rejected, not hot-switched.

독립 Node.js 노드 두 개를 실행하며 각각 P07 소비자·로컬 HTTP·비공개 시험 토큰·세대 폴더·지속 Valhalla 프로세스를 가집니다. 기존 다운로드·서명·영속 순번/만료·속도파일 생성/검사·요청 검증을 재사용합니다. 엔진 포크·추가 언어·서울 시나리오 대체·교통 버전마다 지도 재생성은 하지 않습니다. 중계/장애 전환은 P10, 완성 화면은 P11입니다. 한 검증 지도 안의 교통 세대 교체만 지원하고 다른 지도는 거부합니다.

## Runtime and ownership / 실행·소유권

Each engine generation runs installed `valhalla_service CONFIG_JSON 1` once, using the exact graph manifest image. Network none, read-only graph, no published container ports,2CPU/4GiB limits; native HTTP listens only on127.0.0.1:8002. Use installed curl through asynchronous `docker exec` to issue bounded requests within the container. This is actual persistent native HTTP; the host transport is a pilot adapter, not a production networking or latency claim. Retain original request/body/status and PID/start ticks. Ready requires the exact live daemon, tcp/tcp6 loopback LISTEN and one valid original two-point route. A listening socket alone is insufficient.

세대마다 실제 명세 이미지의 설치된 서비스를 한 번 실행합니다. 네트워크차단·지도읽기전용·호스트포트없음·자원제한을 유지하고 컨테이너 안의 로컬HTTP에 비동기 docker exec와 설치된 curl로 요청합니다. 실제 지속 HTTP지만 전송 연결기는 파일럿용이며 운영 네트워크/지연 주장에 쓰지 않습니다. 원요청·응답·상태·PID/시작눈금을 보존하고 준비 판정에는 정확한 생존 프로세스·tcp/tcp6 리스너·유효한 실제 경로 응답을 모두 요구합니다.

Maximum two engine slots per node, covering ACTIVE plus PREPARING or DRAINING. Never launch a third; coalesce desired updates and retry once a slot is released. Generation directories remain immutable; engine work copies are verified before startup. Record exact container ID/name/owner label/mount and process identity before use. Normal shutdown stops admission, drains bounded work then terminates owned engines. The existing parent test supervisor must reap exact recorded owned resources after an actual node SIGKILL. Never kill by broad name patterns. Restart reconstructs selection from durable P07 state and verified bytes; disk status/old PID files do not authorize serving.

노드당 최대 두 엔진만 유지하며 활성 세대와 준비 또는 마무리 세대에 사용합니다. 세 번째를 띄우지 않고 최신 교체 요청을 합쳐 자리가 비면 다시 처리합니다. 파일은 불변이며 시작 전 복사본도 검증합니다. 정확한 소유 라벨·마운트·프로세스를 기록하고 정상 종료 시 접수를 막은 뒤 제한된 마무리·종료를 수행합니다. 강제 종료 후에는 시험 부모가 기록된 소유 자원만 회수합니다. 재시작은 DB 수용상태와 검증 바이트로 복구하고 이전 상태파일/PID를 서비스 권한으로 삼지 않습니다.

## Selection, leases and expiry / 선택·요청별 고정·만료

A serialized reconcile loop reads current accepted state, optionally pulls the publisher through P07 using that same monotonic event time, then inspects again. Transport failure may preserve an already accepted unexpired snapshot; store failure never authorizes cached serving. Prepare the desired immutable generation and candidate engine away from the active pointer. Re-read accepted state after actual readiness and immediately before swapping the in-memory pointer. A changed high-water/snapshot/expiry discards the candidate. Failed preparation never changes the prior pointer, but the prior pointer is servable only while it still matches current durable acceptance.

순차 조정 루프에서 현재 수용상태를 읽고 같은 관측시각으로 P07 게시자를 조회한 뒤 다시 확인합니다. 전송 실패 때 이미 수용한 미만료 자료는 유지할 수 있지만 DB 실패를 캐시 서비스 권한으로 해석하지 않습니다. 활성 참조와 별도로 후보를 준비하고 실제 준비 완료 뒤·교체 직전에 영속 상태를 다시 검사합니다. 순번·자료·만료가 달라지면 후보를 버립니다. 준비 실패는 기존 참조를 바꾸지 않지만 기존 세대도 현재 수용상태와 일치해야 서비스합니다.

A route obtains one active-generation lease after request validation and current acceptance check. The lease pins node instance, graph, snapshot, high-water, generation/file hash and native daemon identity for the entire real HTTP calculation and trace. Recheck current accepted state and daemon identity before returning. No successful result may combine old geometry with new metadata. A newer accepted version, key revocation, expiry or state-store failure during work discards the completed result with an explicit failure. This preserves P08's conservative freshness rule. Draining means the old daemon survives until its last admitted request settles; it does not mean an obsolete result is accepted. New requests only enter the active ready generation. Retire the old daemon after its last lease, with a30s wall-clock ceiling and explicit failed requests if forced termination is needed.

각 요청은 검증 후 활성 세대 하나를 고정하며 계산·통과 확인 전체에서 노드실행·지도·자료·순번·파일해시·엔진 식별을 유지합니다. 응답 직전에 DB 수용상태와 엔진 식별을 다시 검사합니다. 새 메타데이터와 옛 경로를 섞지 않으며 도중의 새 버전·키철회·만료·DB실패는 계산결과를 폐기하고 명시적으로 실패합니다. P08의 보수적 신선도 규칙을 유지합니다. 기존 요청 마무리는 프로세스를 요청 종료까지 살려두는 뜻이며 낡은 성공을 허용한다는 뜻이 아닙니다. 새 요청은 활성 준비 세대만 사용하고 마지막 요청이 끝나면 옛 엔진을 종료합니다. 실제30초 상한을 넘기면 명시적인 실패로 종료합니다.

At exact event-time expiry, no request may use expired live speeds. A verified blank baseline generation is prepared/selected automatically by periodic reconciliation; if it is not ready, return unavailable until ready. Baseline provenance retains durable high-water, nullable snapshot and explicit NO_USABLE_SNAPSHOT. Polling time is a real monotonic interval (500ms default, no overlap); TTL/window time remains persisted simulation event time. No public endpoint can move the event clock. Two nodes can legitimately hold different accepted versions while one is offline; each response must identify its own actual version. P10 will choose compatible nodes.

정확한 관측시간 만료 뒤에는 오래된 실시간 속도를 쓰지 않습니다. 주기적인 조정으로 검증된 기본 세대를 자동 선택하며 준비 전에는 명시적으로 사용할 수 없다고 응답합니다. 기본 응답에도 최고순번과 자료없음 상태를 보존합니다. 폴링은 실제 시간500ms·중첩없음, 만료는 영속 시험 관측시각으로 구분합니다. 공개 요청은 시계를 바꾸지 못합니다. 한 노드가 단절되면 두 노드의 수용 버전이 다를 수 있으며 각 응답은 실제 버전을 명시합니다. 호환 노드 선택은 P10입니다.

## Local interface / 로컬 인터페이스

Private config: node_id, consumer, verified graph/bundle paths, generation_root, owned runtime_root, token, port(default0), poll_interval_ms(default500). Require a new owned runtime directory, simulation namespace and private0600 configuration. Do not expose token, database URL, local paths, contributor IDs or raw movement in responses.

비공개 설정은 노드 식별·소비자·검증 경로·세대/실행폴더·토큰·포트·폴링 간격입니다. 새 소유폴더·시험영역·0600 설정을 요구하고 응답에 토큰·DB주소·로컬경로·기여자·원시이동을 노출하지 않습니다.

- `GET /internal/v1/status`: authenticated, no-store. Returns node_id, instance_id, readiness, actual active provenance or null, in-flight count, slot states and bounded bilingual reason. Readiness requires current durable acceptance and live engine, not just HTTP-listener health.
- `POST /internal/v1/route`: authenticated JSON,64KiB cap. Request `{request_id, graph_id, locations:[{lon,lat},{lon,lat}], expected_generation_id?:string}`. Reuse exact P08 coordinate and ordinary auto/current-departure constraints. Optional expected generation makes mismatches409 before native work. Unknown fields and invalid IDs/coordinates are422. Max8 admitted requests per node; excess429. Actual request deadline30s, native call bounded by remaining time. No automatic request retry inside the node.
- Success200: `{code:"ROUTE",request_id,node_id,instance_id,engine_result,provenance}`. Provenance includes P08 exact fields plus node activation epoch and native daemon identity (PID/start ticks) but no filesystem paths. Failure contains only stable reason and EN/KO messages:401 auth,409 version mismatch or changed selection,422 input,429 capacity,503 not-ready/store/engine/deadline/drain failure. No route object on failure.
- Mutating reconciliation controls and phase barriers use private parent IPC only. Phases must allow pausing after real engine response/before final acceptance check and after candidate readiness/before pointer swap. Do not implement public test hooks.

상태 조회는 현재 DB수용·실제엔진을 확인하고 실제 활성 버전 또는 null을 반환합니다. 경로는 두 좌표·고정 일반옵션·선택적인 정확세대를 받고 요청별30초·동시8개·본문64KiB를 제한합니다. 실패에는 성공경로를 넣지 않으며 위 상태코드와 한영사유를 사용합니다. 시험 중단·조정 명령은 부모 전용 통신으로만 제공합니다.

## Direct acceptance checks / 직접 통과 기준

Fresh actual P05→P06→P07 input drives two independent nodes. Reuse the authored three-edge Seoul congestion population, not hand-written successful aggregates. Preserve all238 existing cases. Add a fixed required P09 case list covering: independent two-node ownership/consumer state; same-daemon repeated baseline routes; real HTTP signed pull; three-edge live detour on both; version-pinned rejection; invalid input/auth/limit; actual held old-engine request plus candidate activation/new-route success/old-result rejection/last-lease cleanup; expired candidate refusal; exact TTL automatic baseline; offline-node expiry; publisher outage with still-valid accepted state; actual store outage refusal; corrupt generation refusal; actual engine kill; actual node-agent SIGKILL with exact parent reaping and durable restart; bounded slot coalescing; explicit non-LIVE correction; privacy; exact owned cleanup. Implement timing/concurrency tests with deterministic private barriers, but each success/failure must retain actual native requests, PID identity and state evidence. No fake engine may stand in for integrated lifecycle proof.

새 실제 수집→집계→서명 게시로 독립 두 노드를 구동하고 기존238개를 보존합니다. 위에 정한 두 노드·같은데몬반복·서명HTTP·실제우회·버전/입력/권한/용량거부·요청도중교체/마지막요청정리·만료후보거부·자동만료·단절만료·게시자/DB장애·손상·실제엔진/노드강제종료·부모정리/재시작·세대상한·비실시간정정·개인정보/정리를 고정 사례로 추가합니다. 결정적 비공개 중단지점을 사용하되 실제 요청·PID·상태원문을 보존합니다. 모형 엔진을 통합 수명주기 증거로 쓰지 않습니다.

Final delivery: clean whole-module execution, main's raw-byte/state/route inspection, fresh bilingual report, real recorded two-node switching/expiry playback, both READMEs, hosted artifacts, protected PR. Display observed facts and incomplete scope without claiming production availability or real-driving accuracy.

최종 결과는 깨끗한 전체 실행·메인의 원문/상태/경로검사·새 한영보고서·두노드교체/만료 실제재생녹화·두README·원격원문·보호PR입니다. 실제 확인과 미완료 범위를 구분하고 운영가용성·실주행정확도를 주장하지 않습니다.
