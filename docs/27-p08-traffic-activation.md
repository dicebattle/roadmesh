# P08 accepted traffic to real routing / 수용한 교통정보의 실제 경로 반영

Main design fixed2026-10-25 after protected P07 PR#8 merged as `a70ee70435f4f72567052d9a5b0ed5bcc96a2c3c`. Main owns this contract and final execution; Sol owns implementation. P08 is unimplemented at this entry. It connects actual P05/P06/P07 acceptance to a graph-specific traffic file and real Valhalla routing, including expiry. Long-running two-node activation/draining belongs to P09; no production latency or availability claim follows from this bounded adapter.

P07을 보호된 PR#8로 병합한 뒤2026-10-25 메인이 이 설계를 고정했습니다. 메인은 계약·최종 실행, Sol은 구현을 담당합니다. 이 기록 시점 P08은 미구현입니다. 실제 수집/집계/서명수용을 그래프별 속도 파일과 Valhalla 경로 계산·만료에 연결합니다. 장기 실행 두 노드의 교체/요청 마무리는 P09이며 제한된 연결기로 운영 지연·가용성을 주장하지 않습니다.

## Existing evidence and reuse / 기존 근거·재사용

[Three bounded experiments](../research/pilot/2026-10-25-p08-preparation/README.md) established actual file consumption and a legal alternative around a contiguous Seoul140m corridor. A single75m slowdown did not cause a detour because its weighted cost remained lower than the alternative; do not substitute ETA for routing cost. Applying2km/h to the24/41/75m corridor changed the path and manual restoration recovered baseline. These direct-byte probes do not prove fresh accepted observations or automatic expiry.

기존 세 실험에서 실제 파일 소비와 서울 연속140m구간의 합법 대안을 확인했습니다.75m한구간만느리게하면가중비용이대안보다낮아우회하지않았으므로시간을경로비용으로대체하지않습니다.24/41/75m세구간의2km/h적용은경로를바꾸고수동복구는기본값과같았습니다. 직접바이트실험을새관측수용·자동만료증거로세지않습니다.

Reuse pinned Valhalla's installed `valhalla_build_extract --with-traffic`, the verified graph loader, existing simulator/geodesy, P05/P06/P07 stores/workers and standard jose verification. RouteLens orchestration, encoding, validation and tests remain TypeScript. Invoking an unchanged upstream tool that internally uses Python is not a new RouteLens Python implementation. Do not install a compiler or fork the engine to implement this module.

고정 엔진의 설치된 교통파일 생성 도구·검증 그래프 로더·기존 차량/지형 계산·P05/P06/P07·표준서명을 재사용합니다. RouteLens의 조정·인코딩·검사·테스트는 TypeScript로 작성합니다. 내부적으로Python을쓰는상위도구호출은프로젝트Python구현추가가아닙니다. 컴파일러설치·엔진포크는하지않습니다.

## Exact local file contract / 정확한 로컬 파일 계약

Prepare a blank traffic archive once per verified fresh graph with the actual manifest image, graph mounted read-only, network none and existing2CPU/4GiB limits. Write only inside a new owned output. Record graph ID, graph manifest hash, actual image ID, upstream command, skeleton SHA256/length and validated member layout. The graph extract may be omitted from public archives only with explicit hash/omission records.

새로 검증한 그래프마다 실제명세의이미지로 빈 교통파일을 한 번 준비합니다. 그래프읽기전용·네트워크차단·2CPU/4GiB·새소유출력을 유지하고 지도/명세/이미지/상위명령/뼈대해시/크기/검증한배치를 기록합니다. 공개압축에서그래프파일을빼면해시와제외를명시합니다.

The upstream archive starts with `index.bin`; its little-endian16-byte records are(uint64 member-data offset,uint32 tile-base GraphId,uint32 member size). Each traffic member has a32-byte header and8 bytes per directed edge. Validate the regular index header/checksum/size, unique complete tile membership against the verified graph, nonoverlapping bounded offsets, matching tile-base IDs, version3, `size=32+8*directed_edge_count`, archive/file limits and every catalog index. Use BigInt for packed GraphIds: low25 bits select the tile base; the edge index is `id >> 25`. Reject missing, duplicate, malformed, unsupported or out-of-range layout before writing. Cap an archive at512MiB; this pilot's observed skeleton is8.3MiB. No filesystem extraction of archive-supplied paths.

상위파일의첫index.bin은16바이트LE기록이며멤버내용위치64비트·타일기본ID32비트·크기32비트입니다. 헤더32바이트뒤방향구간마다8바이트를둡니다. 일반인덱스헤더/검사합/크기·검증그래프와전체타일일치/고유성·겹치지않는범위·기본ID·버전3·크기공식·파일상한·모든구간위치를검사합니다. GraphId는BigInt로다루고하위25비트와오른쪽25비트이동으로타일/구간을구합니다. 누락·중복·손상·미지원·범위밖은쓰기전에거부하며상한은512MiB입니다. 파일안의경로로실제파일을추출하지않습니다.

Patch only the8-byte record for an eligible LIVE catalog entry. Unknown/INSUFFICIENT/STALE entries retain zero records (breakpoint0 means no usable live speed, not a closure). For finite positive speed<=70m/s, use `raw=max(1,round(speed_mps*3.6/2))`, max126; overall and segment1 receive raw and breakpoint1=255, all remaining fields zero. Reject unrepresentable larger speeds, nonfinite values and malformed status/speed pairs. Never encode a positive speed as closure0 or unknown127. Record decoded speed and quantization error; very slow positive speeds round up to the minimum2km/h. The upstream header/index bytes, including its zero timestamp, remain unchanged; freshness is enforced by the verified P07 event clock and generation metadata, not an assumed native engine TTL.

유효LIVE항목의8바이트속도만바꿉니다. 나머지상태는경계0인빈기록을유지하며폐쇄를뜻하지않습니다. 양수·유한·70m/s이하속도를위공식으로1~126에변환해전체/첫구간속도와경계255를쓰고나머지는0입니다. 상한초과·비유한수·잘못된상태/속도조합을거부하며양수를폐쇄0·미확인127로만들지않습니다. 복원속도·양자화오차를기록하고아주느린양수는최소2km/h로올립니다. 상위헤더/인덱스/시각0은그대로두며신선도는P07영속시계와세대정보로검사합니다.

## Immutable generation and accepted state / 불변 파일 세대·수용 상태

Only a fresh, durable P07 consumer state can authorize live compilation/selection. Do not accept caller-supplied unsigned candidates as successful input. Check exact artifact hash/JWS, graph/catalog identity, simulation namespace and configured trust through P07. A pure codec may receive already verified data internally, but public workers/controllers must obtain it from the actual consumer store.

실제P07수신저장소의현재검증상태만실시간파일생성/선택을승인합니다. 호출자가준서명전후보를성공입력으로쓰지않습니다. P07을통해정확한내용/서명·지도/목록·시험영역·설정신뢰를확인합니다. 내부순수변환기는검증자료를받을수있지만외부처리자/조정자는실제저장소에서얻어야합니다.

Generation identity binds graph ID, skeleton hash, exact traffic snapshot ID and compiler policy `valhalla-current-v1`. Write deterministic bytes and a manifest in a unique staging directory; validate completed bytes, then atomically rename the ready directory. Never overwrite a ready generation. A concurrent identical winner may be reused only after checking all content hashes; conflicting or corrupt cache content is an explicit error. A killed pre-publication writer cannot expose a ready partial file; post-publication retry must reuse identical bytes. Do not persist a global active-file pointer in P08: each route selects an immutable generation after a fresh accepted-state check. P09 will add persistent process activation/draining.

파일세대는지도·뼈대해시·정확한교통파일ID·변환정책으로구분합니다. 고유임시폴더에결정적바이트/명세를쓰고완성내용을검사한뒤폴더를원자적으로이름바꿉니다. 준비된세대는덮어쓰지않고동시동일승자도해시검사후재사용하며충돌/손상은명시실패입니다. 쓰기중종료로부분준비파일을노출하지않고완료후재시도는동일바이트입니다. P08은전역활성파일참조를저장하지않고요청별현재수용상태로불변세대를선택합니다. 영속엔진교체는P09입니다.

Add a narrow P07 consumer inspection method returning accepted status plus the effective event time from the same transaction; keep existing `status()` output unchanged. Avoid a separate timestamp query masquerading as atomic state. Do not move a clock backwards or extend snapshot TTL. Config/private-key/DSN files remain0600 and are excluded from evidence.

같은트랜잭션의수용상태·유효관측시각을함께반환하는좁은조회메서드를추가하되기존status출력은그대로둡니다. 별도시각조회를원자적상태처럼표현하지않습니다. 시계를되돌리거나TTL을늘리지않으며비공개설정/키/접속정보는0600·증거제외를유지합니다.

## Routing boundary / 경로 계산 경계

The P08 CLI/worker invokes a real Valhalla process against the verified graph and selected generation. Requests contain exactly two finite Seoul locations, pinned graph ID, car costing, current departure (`date_time.type=0`) and fixed ordinary options. Successful traffic requests never add exclude locations, waypoints or artificial cost weights. The engine's current-time speed blending is preserved; a trace speed need not equal the encoded raw2km/h. Event-clock expiry and the engine's wall-clock current-time algorithm are separately labeled.

P08CLI/처리자는검증그래프·선택세대로실제Valhalla프로세스를호출합니다. 요청은유한서울좌표두개·고정지도·자동차·현재출발·일반고정옵션입니다. 교통적용성공요청에제외좌표·경유·인위비용가중을추가하지않습니다. 엔진의현재시각혼합을유지하므로trace속도가원시2km/h와꼭같지는않습니다. 관측시계만료와엔진현실시각알고리즘을구분합니다.

Check accepted state before compilation, again before engine execution and at the response decision. If the selected snapshot expired or was replaced during preparation/execution, discard the live result and return an explicit unavailable/stale outcome; never relabel it baseline. A later request uses the new valid version or baseline. No usable accepted snapshot selects the blank baseline file. A valid all-non-LIVE snapshot is labeled NO_LIVE_COVERAGE and retains its snapshot ID even though costs use defaults. Database unavailability, corrupt cache/bundle or engine failure returns explicit unavailable rather than an unverified cached route. A publisher outage may retain a valid accepted snapshot until its exact TTL.

생성전·엔진호출전·응답판정때수용상태를확인합니다. 준비/계산중만료되거나교체되면실시간결과를버리고명시적인사용불가/만료결과를반환하며기본경로로이름만바꾸지않습니다. 다음요청은새버전또는기본값을씁니다. 수용자료가없으면빈기본파일을선택합니다. 유효하지만LIVE가없는자료는NO_LIVE_COVERAGE로표시하고기본비용이라도원래파일ID를남깁니다. DB불가·파일손상·엔진실패는검증하지않은캐시경로대신명시실패입니다. 게시자장애만으로유효수용자료를즉시버리지는않되정확한TTL을지킵니다.

Every result records graph ID, accepted sequence/high-water, selected snapshot ID or null, compiler policy, generation/file hash, effective checked event time, valid_until, explicit traffic mode, actual engine identity and bilingual reason. Retain the original engine response separately. Raw inputs, contributors and keys are not public response metadata. No in-place mutation of a file being read by an engine.

결과에는지도·수용/최고순번·선택교통ID또는null·정책·세대/파일해시·검사관측시각·기한·교통상태·실제엔진식별·한영사유를기록합니다. 원엔진응답은별도보존하고원관측/기여자/키는공개응답정보에넣지않습니다. 엔진이읽는파일을제자리수정하지않습니다.

## Fresh Seoul congestion source / 새 서울 정체 자료

Resolve three eastbound consecutive catalog edges on OSM way919983793 by these exact endpoint pairs (not hardcoded transient graph edge IDs):

| Label / 이름 | Start lon,lat / 시작 | End lon,lat / 끝 |
| --- | --- | --- |
| west / 서쪽 |127.036993,37.500712|127.037245,37.500790|
| middle / 중간 |127.037245,37.500790|127.037680,37.500924|
| east / 동쪽 |127.037680,37.500924|127.038474,37.501170|

Require unique matching geometry/orientation, car access and ordered membership in the fresh Teheran route. Preserve original curved geometry; fail unsupported source drift rather than silently selecting another road. Each target has five distinct authored contributors with speeds0.4/0.45/0.5/0.55/0.6m/s, total15 trips. Set departures to put target exits near210s in the same[180s,240s) window. Use the existing simulator with one full predecessor and successor as context at5m/s, then clip only the authored observation stream to at most8m of partial context on each side. Preserve full independent simulator truth and record clipping explicitly. Never send truth/edge IDs to the matcher. Partial neighboring edges must not become eligible full contributions or contaminate other target medians.

새테헤란경로에서고유지형/방향·자동차접근·연결순서를확인하고원곡선을유지합니다. 원본변경이면다른도로를몰래고르지말고실패합니다. 구간마다서로다른5명의정한속도를사용해총15여행을만들고목표진출을210초부근의같은180~240초창에맞춥니다. 기존생성기에서앞뒤구간을5m/s문맥으로만든뒤관측흐름만양쪽최대8m부분문맥으로자릅니다. 독립정답전체·잘라낸범위를명시하고매칭에정답/구간ID를보내지않습니다. 부분이웃구간이완전통과로수용돼다른중앙값을오염시키면안됩니다.

Write expected times/counts/median and all authored inputs before matching. Use500ms GPS, zero noise, explicit TRAVEL and a240s scenario. Actual HTTP batches→P05 worker matching at persisted240s→P06 window finalization at270s→P07 signing/HTTP/consumer acceptance must produce exactly three LIVE targets, five contributors each, and no other LIVE entries. Maximum accepted target timing error150ms and median speed error2%; all encoded target speeds must be2km/h. Baseline and traffic use the same original two-point Teheran request. Require a different live route, the three target IDs absent from its actual trace, at least50m additional distance and5s additional ETA, with no copied exact expected engine answer. Exact expiry at420s restores baseline shape and ETA within1e-6s. Geometry and independent authored timing establish inputs; these tolerances are fixed before implementation.

매칭전에기대시각/개수/중앙값과입력을저장합니다.500ms·잡음0·TRAVEL·240초시나리오에서실제HTTP→P05매칭완료시각240초→P06마감270초→P07서명/HTTP/수용으로구간당5명·LIVE3개·다른LIVE없음을확인합니다. 시간오차150ms·중앙값속도오차2%이내이고세속도는2km/h로변환돼야합니다. 기본/교통요청은같은원래두좌표입니다. 교통경로가달라지고실제trace에세대상이없으며거리50m·ETA5초이상늘어야합니다. 엔진의정확한답을기대값으로복제하지않고420초만료복구는기본shape·ETA1e-6초이내와같아야합니다.

## Evidence order and gates / 증거 순서·기준

### Source-profile correction after the first actual run / 첫 실제 실행 뒤 관측 속도 계획 정정

The initial constant slow-speed profile is superseded by this explicit source design. In development01, all 15 trips completed real matching but every target was excluded as `AMBIGUOUS_BOUNDARY`: slow progress within the endpoint uncertainty radius looked like sustained boundary dwell. The existing P04 policy deliberately cannot assign that dwell to one neighboring edge. Preserve that policy and the failed evidence; do not treat the absence of a traversal as engine failure or inject a successful aggregate.

최초의 일정한 저속 이동 계획을 아래 설계로 정정합니다. development01에서 15여행 모두 실제 매칭을 마쳤지만, 끝점의 불확실성 반경 안에서 느리게 이동한 관측이 지속된 경계 정지처럼 보여 모든 대상이 `AMBIGUOUS_BOUNDARY`로 제외됐습니다. 기존 P04 정책은 이 정지를 어느 이웃 구간에 배정할지 단정하지 않습니다. 정책과 실패 원문을 보존하고, 통과 기록이 없다는 사실을 엔진 실패로 바꾸거나 성공 집계를 주입하지 않습니다.

Keep the same three real edges, five contributors each, 500ms samples, zero noise, clipping, window, expiry and acceptance limits. The authored 0.4/0.45/0.5/0.55/0.6m/s values now mean target-edge **average** speeds. Traverse the first and last 3m of each target at 5m/s and slow only its interior. Compute the interior speed and millisecond duration from the original geometry so total target time equals `length / authored_average` within 1ms. Keep the predecessor/successor at 5m/s and target exits at 210s. Record the speed phases and independent expected boundary times before matching. This models interior congestion with observable boundary crossings; sustained endpoint dwell remains excluded and is not claimed as supported.

실제 세 구간·각 5명·500ms 관측·잡음 없음·관측 자르기·집계창·만료·판정 한계는 유지합니다. 정한 다섯 속도는 이제 대상 구간의 **평균** 속도입니다. 각 대상의 처음과 마지막 3m는 5m/s로 지나고 내부에서만 느리게 이동합니다. 원래 길이에서 내부 속도와 밀리초 단위 시간을 계산해 전체 통과 시간이 `길이 / 정한 평균 속도`와 1ms 이내로 일치하게 합니다. 앞뒤 구간은 5m/s, 대상 진출은 210초로 유지하고 실제 매칭 전에 속도 단계·독립 기대 경계 시각을 기록합니다. 이는 내부 혼잡과 확인 가능한 경계 통과를 시험하며, 경계의 지속 정지는 계속 제외하고 지원된다고 주장하지 않습니다.

Keep the existing206 whole checks unchanged. P08 declares required case IDs once and the parent derives the new total, rejects missing/duplicate/failed cases and verifies child source/graph/runtime identities. Focused tests cover strict layout, quantization and malformed inputs. Real integration must cover the following named groups with original evidence links:

1. Fresh15-trip source, independent target timing/median, exact consumer-to-compiled bytes, full catalog and blank skeleton.
2. Strict graph/layout/index/bounds/quantization validation; corrupted and truncated cache/bundle fail before an engine can use them.
3. Identical retry, concurrent identical generation, actual SIGKILL before/after ready publication with no partial activation.
4. Actual baseline, positive-speed detour and unmodified request; controller restart validates reusable cache.
5. Still-valid cached use during real publisher outage; before-expiry419.999s and exact-expiry420.000s; clock-only baseline recovery.
6. Pause a live route after the actual engine result and a fresh compilation before response/selection, then advance the shared clock to expiry. Both must refuse stale results. Next request returns baseline.
7. Pause an old compile, accept a higher-sequence correction, then resume: refuse stale selection. A signed empty newer window replaces previous speeds rather than inheriting them.
8. Actual P05 HTTP revocation of one contributor per target, P06 recomputation and P07 higher-sequence INSUFFICIENT acceptance remove live coverage. Offline already-accepted snapshots retain P07's TTL semantics until their consumer receives the correction.
9. Accepted-key revocation, actual database outage/restart, and exact owned engine unavailability return the documented bounded outcomes without trusting cache alone.
10. Public-field/privacy checks and cleanup of only owned workers, engines, servers, private files, volumes and ports.

기존206개는유지하고P08필수사례ID를한곳에서선언해상위가총수를계산하며누락/중복/실패·소스/지도/지문불일치를거부합니다. 집중검사는형식/양자화/잘못된입력을다루고실제통합은15여행·정확바이트·파일손상·반복/경쟁/실제종료·기본/우회·게시장애·정확만료·계산중만료·낡은생성/새정정·빈창·실제철회/재집계/수용·키철회·DB/엔진불가·비공개정보·소유정리를이름과원문링크로증명합니다.

Use separate consumer identities to retain a valid older snapshot for outage/expiry while the main consumer receives corrections; all share a monotonic event clock. Schedule corrections before the newer empty window and final expiry. Never rewind time, seed a successful signed aggregate directly or repeat a healthy whole run. Controlled pauses must observe actual phases/locks, not rely on sleep races.

장애/만료용수신자는아직유효한옛자료를유지하고주수신자는정정본을받도록ID를분리하되시계는단조증가시킵니다. 정정·새빈창·마지막만료순서로설계하고시계역행·성공집계직접주입·정상전체중복실행·시간대기만으로경쟁만들기를금지합니다.

## Ownership and presentation / 구현 책임·표시

Core Sol owns compiler/layout/generation/controller/worker, the narrow P07 atomic inspection method, package scripts and core tests. Integration Sol owns the15-trip scenario, actual checks, whole-runner integration, report data/viewer and their tests. They must agree exported interfaces before parallel writes, preserve each other's files and coordinate compilation. Main owns docs, review, direct development and final clean whole execution, independent bytes/SQL/route checks, IAB verification, actual recording and protected delivery.

코어Sol은변환/세대/조정자/처리자·P07좁은원자조회·명령·코어검사를,통합Sol은15여행·실제검사·전체연결·보고서/화면·해당검사를맡습니다. 병렬쓰기전에인터페이스를맞추고서로파일을보존하며빌드를조율합니다. 메인은문서·검토·직접개발/깨끗한전체실행·독립바이트/SQL/경로검사·내장화면·실제녹화·보호반영을담당합니다.

The report must visibly replay recorded baseline/live/expired routes and their ETA, generation/snapshot ID and status, while distinguishing the15-trip congestion input from the original nine-vehicle and P06 scenes. Keep it labeled evidence playback, not a finished navigation client. Update both READMEs and current media only after the new entire pipeline passes. P09–P14 remain part of the active full goal.

보고서는기록된기본/실시간/만료경로·ETA·세대/교통ID·상태를보여주고15여행정체자료를기존9대/P06장면과구분합니다. 완성내비게이션이아닌증거재생임을표시하고새전체실행통과뒤README두언어·최신녹화를갱신합니다. P09~P14는전체목표에계속남습니다.

## Shared implementation interface / 공유 구현 인터페이스

Core defines these exported boundaries before integration code depends on them. Internal descriptor fields may be added with main review; keep the selected names and result meaning stable.

통합 코드가 의존하기 전에 코어가 아래 경계를 정의합니다. 내부 설명 필드는 메인 검토로 추가할 수 있지만 이름·결과 의미를 유지합니다.

- `PublicationConsumer.inspectAccepted()` returns `{high_water, active, checked_at_event_time}` atomically; `status()` preserves its old two-field result.
- `prepareTrafficBundle(graphDirectory, outputDirectory)` returns a validated `TrafficBundle` descriptor and writes its deterministic layout/hash manifest.
- `compileTrafficGeneration(bundle, verifiedPublicationOrNull, generationRoot, hooks?)` returns an immutable `TrafficGeneration`; only the worker/controller may authorize its live input from `inspectAccepted()`.
- `runTrafficWorker(config)` executes `operation: "compile" | "route"`, emitting private IPC READY/PHASE/RESULT and a documented exit code. `tools/traffic_worker.ts` is its CLI.
- `TrafficWorkerConfig` contains `consumer`, `graph_directory`, `bundle_directory`, `generation_root`, `expected_graph_id`, `operation`, optional `request` and optional `pause_at`. Requests contain `graph_id` and exactly two `{lon,lat}` locations; no caller-controlled native engine options.
- `TrafficGeneration` binds `compiler_policy`, `graph_id`, `skeleton_sha256`, nullable `traffic_snapshot_id`, nullable `sequence/valid_until`, `traffic_sha256`, `traffic_byte_length`, `live_edges` and internal paths. Public route metadata excludes internal paths.
- Route results use `code:"ROUTE"` with `traffic_mode:"LIVE"|"NO_USABLE_SNAPSHOT"|"NO_LIVE_COVERAGE"`, original engine result and provenance, or `code:"UNAVAILABLE"` with a bounded bilingual reason and no successful route. Compilation uses `code:"READY"` or `code:"REJECTED"`.
- Private phase names: `AFTER_TRAFFIC_WRITE` (before ready rename), `AFTER_TRAFFIC_COMMIT` (ready generation durable), `AFTER_TRAFFIC_SELECTION` (before final selection check), `AFTER_ENGINE_READY` (owned engine container exists), `AFTER_ROUTE_RESULT` (actual response before final state check). These hooks require parent IPC and do not become public endpoints.

원자조회는시각을포함하되기존상태출력은유지합니다. 뼈대준비·순수세대생성·실제처리자경계를분리하고처리자만현재수용상태로LIVE입력을승인합니다. 설정은소유경로·소비자·지도·작업·요청·비공개중단지점이며요청자가임의엔진옵션을지정하지못합니다. 경로성공은실시간/사용가능자료없음/LIVE범위없음을구분하고실패에는성공경로를담지않습니다. 쓰기/준비완료/선택/엔진준비/실제응답뒤의중단지점은부모통신전용입니다.
