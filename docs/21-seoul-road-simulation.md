# Seoul road-network simulation / 서울 도로망 시뮬레이션

Status: designed; real map extraction/build/route probes passed, implementation and full simulation pending. User changed the main simulation requirement on2026-10-24:use actual Seoul roads. This work precedes P05. Keep tiny-city as a fast regression fixture; it is no longer sufficient as the primary integration/demo evidence.

상태: 설계했으며 실제 지도 추출·생성·경로 조사는 통과했고 구현·전체 시뮬레이션은 아직 전입니다. 사용자가2026-10-24에 주요 시뮬레이션을 실제 서울 도로로 변경했습니다. P05보다 먼저 수행합니다. tiny-city는 빠른 회귀 자료로 유지하고 주요 통합·데모 증거로는 충분하지 않습니다.

## Source and ownership / 자료·책임

Use Geofabrik's public OpenStreetMap extract `https://download.geofabrik.de/asia/south-korea-261023.osm.pbf`,289,916,859 bytes, SHA256 `282d012b7629c643695f286d4424d7f6d88548d99edb5577ca5b678906f13c17`; the downloaded MD5 `a80fd58c46e050f34644071d0360646c` matches its upstream sidecar. Pin bytes, not the mutable latest URL. Cache locally; allow an explicitly supplied source file only with the same SHA. Missing/changed input is failure, never a skipped success. The dated upstream URL is not promised permanent; document the cache/local-file recovery path.

Geofabrik 공개 OSM의 위 날짜별 파일·크기·SHA를 고정합니다. 내려받은 MD5도 공식 비교 파일과 같았습니다. 바뀌는 latest 주소에 의존하지 않습니다. 로컬 캐시를 사용하며 직접 지정한 파일도 같은SHA일 때만 받습니다. 누락·변경은 실패이며 생략 성공으로 만들지 않습니다. 날짜별 주소의 영구 보관을 보장하지 않고 캐시·파일 지정 복구 경로를 문서화합니다.

Extract bounding envelope `[126.7,37.4,127.25,37.75]` with Osmium1.16.0 `extract -s smart -S types=restriction`. This covers the Seoul pilot and adjacent boundary roads, not an exact administrative polygon. Complete referenced ways/restrictions may extend beyond the envelope; preserve them. Main measured39,784,193-byte extract,4,050,074 nodes,625,257 ways and16,543 relations. These are all OSM objects, not counts of car-road edges. Extraction7.811s and graph build11.160s in a network-disabled2CPU/4GiB container are probe measurements, not final benchmarks.

위 사각 범위는 서울 파일럿·인접 경계 도로이며 정확한 행정구역 폴리곤이 아닙니다. 연결 도로·제한 관계가 범위 밖까지 이어질 수 있으며 이를 보존합니다. 메인 조사에서 추출본39,784,193바이트·노드4,050,074개·도로 객체625,257개·관계16,543개였습니다. 전체 OSM 객체 개수이며 자동차 그래프 구간 개수가 아닙니다. 통신 차단·2CPU/4GiB에서 추출7.811초·그래프생성11.160초는 설계 조사 측정이며 최종 성능평가가 아닙니다.

Map data/derived geometries remain ODbL with visible `© OpenStreetMap contributors` attribution and license/source links in every map/report. Project code remains Apache-2.0. Vehicle trajectories, speeds, stops and GPS noise are authored SYNTHETIC, not real driver traces or live traffic. Same-engine route generation and matching is an engineering round-trip test, not independent real-road accuracy or the reviewed100/100 corpus.

지도·파생 지형은 ODbL이며 모든 지도·보고서에 출처·라이선스 링크를 표시합니다. 프로젝트 코드는 Apache-2.0입니다. 차량·속도·정지·GPS잡음은 합성이며 실주행 기록·실시간 교통이 아닙니다. 같은 엔진의 경로 생성과 매칭은 처리 흐름 검사이며 독립 실도로 정확도·검토한100/100자료로 세지 않습니다.

Main owns design/review/direct proof. Sol graph implementer owns regional graph/types/loader; Sol runtime implementer owns explicit geometry support, simulation and matching; Sol report implementer owns orchestration/report/CI after the shared contracts below. Preserve old behavior and others' files.

메인이 설계·검토·직접 증명을 맡습니다. Sol은 그래프/형식/로더, 명시적 지형 계산·생성/매칭, 전체 실행·화면·CI로 파일 책임을 나눕니다. 기존 동작·다른 변경을 보존합니다.

## Shared contracts / 공유 계약

`tools/seoul_types.ts` exports `SeoulGraphBundle` with:
- `directory:string`, `graphId:string`, `manifest:Record<string,unknown>`, `manifestSha256:string`;
- `fixture:{fixture_id:"seoul-osm-20261023-v1"}`, `geometry_policy:"geodesic-sphere-v1"`;
- `edges:EdgeMapping[]` containing full, actually located directed geometry for selected scene routes. Labels are `edge-<edge_id>`, engine IDs remain strings, `forward` follows `engine_forward` for this regional profile. Mark the direction basis explicitly. This is a scene-edge inventory, NOT the full graph or a matcher candidate whitelist;
- `routes:Array<{route_id:string,name_en:string,name_ko:string,edge_ids:string[],bounds:[number,number,number,number]}>`;
- `context_roads:Array<{name:string,coordinates:number[][]}>` for a faithful display subset around the three route corridors, and manifest counts for full export/selected display geometry.

위 형식을 공유합니다. 구간 목록은 실제 locate로 읽은 전체 방향 지형이며 장면 경로용 목록입니다. 전체 그래프나 매칭 후보 허용목록으로 오인하지 않습니다. 지역형의 forward는 저장된 엔진 지형 기준임을 명시합니다. 화면 자료는 실제 전체 그래프에서 내보낸 세 경로 주변 도로 부분집합이며 전체·선택 개수를 공개합니다.

`tools/seoul_graph.ts` exports `runSeoulGraph(output:string, sourcePath?:string):SeoulGraphBundle`. `tools/seoul_bundle.ts` exports `loadSeoulGraph(directory:string):SeoulGraphBundle` and `mapRegionalLocatedEdges(response:unknown,evidencePath:string):EdgeMapping[]`. Loader verifies source lock, graph/config/PBF/tile inventories, all manifest hashes, original route/trace/locate responses and reconstructed edge inventory. Graph ID binds actual source/extract/config/image/engine/tile bytes. Final manifest follows cleanup. Keep PBF/tiles/cache ignored; preserve compact raw metadata and route evidence.

그래프 생성·로더·실제 locate변환은 위 인터페이스를 사용합니다. 로더는 고정 원본·설정·PBF·타일·증거 해시·실제 응답에서 재구성한 구간 목록을 검사합니다. 그래프 식별에는 실제 생성 바이트를 묶고 정리 후 완료 목록을 씁니다. 큰 지도·타일·캐시는Git제외, 작은 원문·메타데이터를 보존합니다.

`tools/seoul_simulation.ts` exports `runSeoulWorkload(bundle:SeoulGraphBundle,output:string)` returning `{spec:SimulationSpec,truth:SimulationTruth,observations:Observation[],omissions:Omission[],matching:MatchingResult,assertions:SimulationAssertion[]}`. Persist raw simulator/matcher inputs/results, source/graph identity, per-vehicle evaluations and engine requests/responses/commands. Use a read-only graph mount. No truth edge IDs or selected-route whitelist may influence matching. Independently collect engine `locate` candidates from observations; resolve any returned unknown edge with another actual locate of its geometry, not the truth list. Validate ID/way/car access/full shape and preserve evidence.

전체 지형 생성·매칭은 위 결과를 반환하고 원문·출처·평가를 저장합니다. 읽기 전용 그래프를 사용하며 정답 구간이나 선택 경로 허용목록으로 매칭을 유도하지 않습니다. 관측에서 실제 locate후보를 독립 수집하고, 반환된 미등록 구간도 실제 조회로 해결합니다. 정답 목록에서 몰래 가져오지 않습니다. ID·도로·차량통행·전체지형과 증거를 검사합니다.

## Geometry and reuse / 지형 계산·재사용

Preserve tiny-city's exact default numerics and policy. Add an explicit `geodesic-sphere-v1` strategy for geographic distance, polyline cumulative distance/interpolation, metre noise offsets and nearest-segment projection. Earth radius6371008.8m; use latitude-aware spherical calculations. A road is a full polyline, never a chord between endpoints. Validate against independent known-distance/curved-line cases. Generalize P03's structural graph input and P04 interpretation with narrow optional geometry/policy hooks; do not fabricate a tiny-city fixture for Seoul or duplicate the entire stack. Tiny paths retain20-edge limit; this reviewed regional profile permits128 edges. Existing300s/20vehicles/3001samples-per-vehicle/32MiB bounds remain.

tiny-city의 기본 수치·정책은 그대로 유지합니다. 지역형에는 위도 보정 구면 거리·꺾인 선의 누적거리/보간·미터 잡음·가까운 선분 투영을 명시적으로 추가합니다. 지구반경은 위 값입니다. 도로는 전체꺾은선이며 양 끝을 이은 직선으로 바꾸지 않습니다. 독립 거리·곡선 사례로 검증합니다. P03입력과P04해석에 작은 정책/지형 주입 지점을 추가하고 서울을 가짜tiny-city형식으로 꾸미거나 전체코드를 복제하지 않습니다. 기존경로20구간은 유지하고 검토한지역형만128구간을 허용합니다. 나머지 범위는 유지합니다.

Matching policy `seoul-observed-v1` keeps3s continuity and original observed-time interpolation. Use full located edge geometry, not clipped trace length. Compare engine fractions/points against the full polyline. The parallel ambiguity guard examines observed candidates with geometric tangent and distinct physical OSM ways; graph hierarchy/opposing representations of the same physical way must not create fake ambiguity. Explicitly exclude unmatched, large gaps, discontinuities, unobserved intermediate edges and incomplete endpoints. No match confidence number is invented. Full/split/overlap results must remain byte/semantically identical within one graph.

서울 정책도3초연속성과 원관측시간을 사용합니다. 잘린 응답 길이 대신 실제 전체구간 지형을 쓰고 비율·점도 전체꺾은선으로 확인합니다. 평행 모호성은 관측 후보의 접선·다른 물리 OSM도로로 판단하며 같은도로의 계층/역방향 중복을 가짜모호성으로 만들지 않습니다. 미대응·긴누락·단절·표본없는중간구간·끝점부족은 제외합니다. 임의확신수치를 만들지 않고 배치 동등성을 유지합니다.

## Scenes and fixed acceptance / 장면·고정 통과 기준

Use the probed routing requests:
- `teheran`:127.029,37.4984 →127.049,37.5045; actual route names include 테헤란로/선릉로.
- `downtown`:126.977,37.5658 →126.977,37.5754; 세종대로/소공로/사직로.
- `mapo-bridge`:126.9331,37.5277 →126.9441,37.5393; 여의동로/여의대로/마포대로/토정로.

실제 조사한 위 경로 요청·도로명을 사용합니다. 방향·회전·교차로는 원본그래프가 계산하며 선을 임의로 단순화하지 않습니다.

Use actual route then `edge_walk` only to read its directed edge sequence. Resolve complete geometry with locate; discard the initial/final partial edges before generating each vehicle's truth and record the actual simulated start/end. Initial probes found37/24/18 interior edges respectively; these are observations, not a reason to hard-code IDs across builds. Generate three modes on each route:clean,3m bounded noise,3m noise plus missing samples `[30000,40000)`. Nine vehicles, seed7,500ms sampling,300s bound, initial5s wait then10m/s. The simulator integrates geometry and speed independently of matcher outputs.

실제경로 후edge_walk는 방향구간 순서를 읽는 용도로만 씁니다. locate전체지형을 확보하고 처음/마지막 일부 구간을 제거한 뒤 실제 시뮬레이션 시작·끝을 기록합니다. 조사상 내부구간37/24/18개였지만 생성마다ID를고정하는 근거는아닙니다. 경로마다 깨끗한·3m잡음·3m잡음+30~40초누락의 세모드,총9대·시드7·500ms표본·300초범위·초기5초정지후10m/s를 사용합니다. 생성기는 매칭출력과 독립적으로 지형·속도를 적분합니다.

Fixed before matching implementation: preserve all existing96 tests and48 tiny integration assertions. For each clean Seoul route, correctly identify at least98% of accepted point assignments and retain at least90% point coverage; report boundary-point equivalence explicitly when an observation lies within1m of a shared adjacent edge endpoint. At least70% of all truth traversals per clean route must be accepted; every accepted clean traversal must match the directed truth occurrence with boundary error≤100ms. For noisy routes, accepted traversal precision must be100%, boundary error≤1000ms, and report all missed/excluded coverage instead of claiming full recovery. Noisy cases must produce nonzero accepted traversals per route. Gaps cannot produce accepted traversals bridging the gap. Different seeds change observations while truth is fixed; same seeds and full/split/overlap replay must match. Wrong source/graph/tampered tiles and engine failure cannot pass. Investigate failures; do not silently relax thresholds to suit outputs.

매칭 구현 전에 위 기준을 고정합니다. 기존96검사·48tiny통합을 보존합니다. 서울 깨끗한경로별 수용 표본의 방향대응98%이상·표본범위90%이상, 공유끝점1m내의 인접구간동등성은 별도공개합니다. 정답통과의70%이상을 수용하고 수용한 모든 깨끗한 통과는 방향·순번이 맞고 경계오차100ms이하여야 합니다. 잡음경로도 수용통과의오수용0·경계1000ms이하이며 모든미회수/제외를공개합니다. 경로별수용통과가0이면안됩니다. 누락을 건넌 통과를 수용하지 않습니다. 다른시드는관측만바꾸고 같은시드·전체/분할/중첩은같아야합니다. 원본/그래프불일치·타일변조·엔진실패를 통과시키지 않습니다. 실패를 조사하고 출력에 맞춰 기준을 몰래 낮추지 않습니다.

`npm run simulation:check` becomes the fresh whole-system entrypoint:run existing tiny regression first, then fetch/verify source, build Seoul graph, simulate/match/evaluate and render Seoul as the main report. Preserve tiny report under a nested path. CI caches downloaded source by SHA but rebuilds the graph and reruns all modules. Increase job timeout only to a documented bound if measured necessary. Publish new bilingual source/license notes, report, screenshots and actual demo after main direct local and hosted inspection.

전체통합명령은 기존tiny회귀후 원본확보/검사·서울그래프생성·차량/매칭/평가를 수행하고 서울을주보고서로 표시합니다. tiny보고서는하위경로보존합니다. CI는원본SHA기준캐시만사용하며그래프·모듈은새로실행합니다. 필요시측정에근거한제한시간만조정합니다. 메인의로컬·원격직접검사후한영출처/라이선스·보고서·캡처·실제데모를갱신합니다.

### Review clarifications / 검토 보정

The builder verifies the pinned country source before extraction and again before completion. Its portable manifest records filename/URL/hash and source_verified_at_build, not a producer-specific absolute cache path. The loader verifies the pinned source reference and all local bundle bytes; it does not require the producer’s original country file. A fresh builder rerun proves source-to-extract processing. Raw commands retain their actual mount arguments rather than pretending redacted bytes are originals.

생성기는 추출 전·완료 전에 국가 원본을 검사합니다. 이동 가능한 목록에는 파일명·URL·해시·생성시검증을 기록하며 생산자의 절대 캐시 경로를 요구하지 않습니다. 로더는 고정출처 참조·묶음바이트를 검사하고 국가 원본 파일을 요구하지 않습니다. 원본→추출 처리는 새 생성 실행으로 확인합니다. 원문 명령은 실제 연결 인자를 유지하고 편집한 바이트를 원문처럼 주장하지 않습니다.

Route↔edge_walk coordinate comparison permits at most one microdegree per axis for engine re-encoding, matching the previous graph policy; full internal located shapes remain checked separately. Virtual scene time is2026-10-24T00:00:00Z, after the pinned map snapshot. Adjacent-edge point equivalence is checked against actual shared geometry endpoints, never the nearest sampled point. Full, split-only and overlap batches are separate actual engine runs.

경로↔edge_walk재인코딩은 기존정책처럼 축별1마이크로도까지만 허용하고 내부전체지형은별도검사합니다. 가상시각은 지도스냅샷뒤인2026-10-24로고정합니다. 인접구간동등성은 가장가까운표본이아닌 실제공유지형끝점으로검사합니다. 전체·분할만·중첩은 각각 실제엔진을실행합니다.

### Boundary-stop correction:seoul-observed-v2 / 경계 정지 보정

The first clean whole run exposed a5000ms entry error in the downtown noise+gap case. `seoul-observed-v1` could assign a stationary cluster to the preceding edge endpoint and then accept entry to the next edge only when movement resumed, silently discarding ambiguous waiting time. `seoul-observed-v2` adds an observations-only gate:when original observations remain continuously within each sample's `accuracy_m+1m` of the actual shared endpoint for at least1000ms before a directed edge transition, exclude both adjacent traversal candidates with `AMBIGUOUS_BOUNDARY`. Preserve the cluster/bracket evidence. Do not use truth to choose which edge receives the wait. Road-point matches may remain valid; their complete traversal timing is withheld. Ordinary movement and stops inside an edge are unaffected. All original timing/coverage acceptance thresholds remain fixed.

첫 전체 실행에서 도심 잡음·누락 차량의 진입오차5000ms를 발견했습니다. v1은 정지군집을 이전구간끝에 붙이고 이동재개 때 다음구간진입을 수용해 불명확한 대기시간을 빠뜨릴 수 있었습니다. v2는 방향구간전환 전 원관측이 실제공유끝점의 각표본 정확도+1m 안에1000ms이상 연속머물면 두인접통과후보를 AMBIGUOUS_BOUNDARY로 제외하고 군집·경계 근거를 보존합니다. 정답으로 정지를 배분하지 않습니다. 도로표본대응은 유지할 수 있지만 완전통과시간은 보류합니다. 일반이동·구간내부정지는 영향받지 않으며 처음 허용시간·범위기준을 그대로 유지합니다.
