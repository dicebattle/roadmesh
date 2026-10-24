# P04 matching design notes / P04 매칭 설계 기록

Status: contract fixed after the main agent's pinned-engine probe; implemented with48/48 local integrated checks passed; hosted verification pending. Main owns design and direct verification; Sol owns runtime and tests. P03 evidence remains the baseline.

상태: 메인의 고정 엔진 조사 후 계약을 확정했으며 구현·로컬 통합48/48검사를 마쳤고 원격 검증 전입니다. 메인이 설계·직접 검증을, Sol이 실행 코드·검사를 담당합니다. P03 증거를 기준으로 유지합니다.

## Decided boundaries / 확정한 경계

- Matcher input is P03 observations and verified graph identity only. Truth is available to the evaluator after matching, never used to select a route or repair an engine response.
  매칭 입력은 관측·검증된 그래프 식별뿐입니다. 정답은 매칭 뒤 평가기에만 제공하고 경로 선택·엔진 응답 보정에 쓰지 않습니다.
- Use real Valhalla `trace_attributes` with explicit `shape_match=map_snap`. P02's `edge_walk` test is for exact engine-generated route geometry and does not prove noisy GPS matching. Preserve the raw matched points, edge sequence, request settings and source identity.
  실제 Valhalla의 명시적 map_snap을 사용합니다. P02의 edge_walk는 엔진이 만든 정확한 지형 검사이며 잡음 GPS 매칭을 증명하지 않습니다. 원본 대응점·구간 순서·요청 설정·출처를 보존합니다.
- Reverify P02 tile hashes and use a read-only graph mount. Bind each returned string edge ID to that graph's verified map. Record runtime path/config separately from the graph build identity. No implicit current/latest graph substitution.
  P02 타일을 다시 검사하고 읽기 전용으로 연결합니다. 반환 구간 ID를 해당 그래프의 검증된 대응에 묶고 실행 경로/설정과 그래프 생성 식별을 구분합니다. 임의 최신 그래프로 바꾸지 않습니다.
- Traversal times must come from original observation timestamps and justified boundary interpolation, not Valhalla's estimated driving cost. Partial edges, gaps, discontinuities and insufficient boundary observations must remain incomplete/excluded rather than fabricated complete traversals.
  통과 시각은 원래 관측 시각과 근거 있는 경계 보간에서 얻고 엔진 예상 주행비용으로 대신하지 않습니다. 일부 구간·누락·단절·경계 표본 부족을 완전 통과로 꾸미지 않습니다.
- Ordered batch boundaries require preserved context and stable traversal identities. Compare split-batch and unsplit results on the same observations; never count overlap context twice. Persistent queue retry semantics remain P05, but matcher context cannot be omitted from P04 completion.
  순서 있는 배치 경계에서 문맥·고정 통과 ID를 유지하고 분할/비분할 결과를 비교하며 중첩 문맥을 중복 집계하지 않습니다. 영속 큐 재시도는 P05이지만 P04 문맥 처리는 완료 조건에 포함합니다.
- Ambiguous parallel-road and large-gap cases need explicit exclusion with bilingual reason codes. A successful engine response is not a confidence guarantee. Publish accepted/excluded counts and evaluation coverage, not accuracy on only the easy subset.
  평행도로 모호성·긴 누락은 이중 언어 사유로 명시적 제외합니다. 엔진 성공 응답이 확신의 보증은 아닙니다. 쉬운 사례만의 정확도 대신 수용/제외·평가 범위를 함께 공개합니다.

## Required direct proof / 필요한 직접 증거

1. Clean and bounded-noise trajectories match the independent expected directed ways with observed-time traversal tolerances declared before the final run.
2. The existing 15–25 second gap cannot create a complete traversal across an unobserved junction without sufficient evidence.
3. Authored midpoint observations between AB and its close parallel road are either correctly disambiguated with explicit evidence or excluded; never silently attributed from truth.
4. The upper route's initial stop is retained in timing. Reordered input and duplicate sample IDs follow an explicit contract, not accidental engine behavior.
5. Splitting a continuous trace across batches preserves accepted results and IDs without double counting context.
6. Tampered/wrong-graph inputs, engine errors and cleanup failures prevent successful completion. The full corpus/P01/P02/P03/P04 integration runs locally and on hosted Docker; capture the new behavior and refresh media metadata.

1. 깨끗한/제한 잡음 궤적을 독립 방향 정답과 비교하고 관측시간 허용오차를 최종 실행 전에 정합니다.
2. 기존15~25초 누락이 관측되지 않은 교차점의 완전 통과를 근거 없이 만들지 않아야 합니다.
3. AB·평행도로 중간 관측은 근거 있게 구분하거나 제외하고 정답에서 몰래 가져오지 않습니다.
4. 초기 정지를 시간에 유지하며 입력 순서·중복 ID 규칙을 명시합니다.
5. 연속 궤적 분할이 문맥 중복 없이 결과·ID를 유지해야 합니다.
6. 변조·다른 그래프·엔진/정리 오류는 완료를 막고 전체 통합·원격 Docker·새 캡처까지 확인합니다.

## Probe questions, resolved below / 아래 계약으로 해결한 조사 항목

Probe the pinned executable's exact matched-point fields and timestamp precision; choose a small policy for gap length, positional uncertainty and boundary interpolation. Set fixed tolerances from independent authored fixtures, not from whichever outputs happen to pass. Record how endpoint partial traversals and interpolated/unmatched points affect eligibility. The initial policy may be specific to the synthetic fixture, but must be labeled as such instead of being presented as production matching quality.

고정 실행 파일의 대응점 필드·시각 정밀도를 조사하고 누락 길이·위치 불확실성·경계 보간 정책을 정합니다. 우연히 통과한 출력 대신 독립 자료에서 허용오차를 정하고 끝점 일부 통과·보간/미매칭 점의 수용 여부를 기록합니다. 초기 합성 전용 정책은 그 범위를 명시하며 운영 품질로 표현하지 않습니다.

## Primary source / 공식 출처

The [Valhalla map-matching API](https://valhalla.github.io/valhalla/api/map-matching/) distinguishes exact-geometry edge walking from map snapping and documents per-input matched points, their edge indices, along-edge position and discontinuity fields. Its timestamp options must be checked against the pinned executable before deriving observed travel times. Accessed 2026-10-24; current web documentation is not assumed identical to release 3.9.1.

공식 문서는 정확한 지형의 구간 걷기와 지도 매칭을 구분하고 입력별 대응점·구간 인덱스·구간 내 위치·단절 정보를 설명합니다. 관측 통과시간을 만들기 전에 고정 실행 파일의 시각 옵션을 확인합니다. 확인일은2026-10-24이며 현재 웹 문서를3.9.1과 같다고 가정하지 않습니다.

## Executable contract v1 / 실행 계약 v1

This is a bounded, synthetic-only batch adapter, not a real-time matcher. The input envelope is `{schema_version:"0.1", matching_id, graph_id, observations}`. Observations have the P03 shape, are SYNTHETIC, contain no truth edge IDs, and bind the UTC epoch consistently to offset milliseconds. At most 20 vehicles, 60,020 samples and 300,000 milliseconds are accepted. Reject duplicate sample IDs, duplicate vehicle timestamps, decreasing per-vehicle timestamps, invalid coordinates/accuracy, unknown graph identity and unknown fields. Interleaved vehicles are allowed; deterministic outputs sort vehicles by ID. Output directories are new-only; 0 means completed adapter execution, 1 execution/evidence failure, 2 invalid input. Exclusion is a valid result, not proof of an accepted traversal.

실시간 매칭이 아닌 제한된 합성 배치 연결기입니다. 입력은 위 봉투와 P03 관측 형식이며 정답 구간 ID를 받지 않습니다. UTC와 상대 밀리초의 기준이 같아야 합니다. 최대20대·60,020표본·300,000밀리초를 받습니다. 중복 표본·차량별 중복/역순 시각·잘못된 좌표/정확도·다른 그래프·알 수 없는 필드를 거부합니다. 차량은 교차 입력할 수 있고 출력은 ID순입니다. 새 폴더에만 기록하고 종료0은 실행 완료,1은 실행/증거 실패,2는 입력 오류입니다. 제외는 정상 결과일 수 있으나 통과 기록 수용을 뜻하지 않습니다.

- Policy ID `tiny-city-matching-v1`: consecutive points separated by **more than 3,000 ms** belong to separate continuous runs. An ambiguous or unmatched point also breaks timing continuity. Never interpolate a boundary across those breaks. Single-point runs are excluded explicitly.
  정책 식별은 위와 같습니다. 연속 관측의 간격이 **3,000밀리초 초과**면 별도 연속 구간으로 나눕니다. 모호/미대응 관측도 시간 연속성을 끊습니다. 이 경계를 넘어 보간하지 않고 한 점짜리 구간은 제외합니다.
- Before matching, compare distinct physical, car-accessible parallel ways using verified fixture geometry. If a point is within `accuracy_m + 1 m` of two ways whose axes differ by at most 15 degrees and which do not share an endpoint, exclude it as `AMBIGUOUS_PARALLEL`. Opposite directed IDs on one physical way are not different candidates. This is a conservative synthetic-fixture rule, not calibrated probability or a general map matcher. Other points still require actual engine matching.
  매칭 전에 검증된 지형에서 서로 다른 차량용 평행도로를 비교합니다. 방향축 차이가15도 이하이고 끝점을 공유하지 않는 두 도로에서 관측이 각각 `accuracy_m + 1m` 이내면 `AMBIGUOUS_PARALLEL`로 제외합니다. 같은 물리 도로의 역방향 ID는 다른 후보가 아닙니다. 합성 시험용 보수 규칙이며 일반 매칭기·보정 확률로 주장하지 않습니다. 나머지 관측도 실제 엔진 매칭을 거쳐야 합니다.
- Each continuous run calls pinned Valhalla `trace_attributes`, `shape_match=map_snap`, `costing=auto`, `trace_options={gps_accuracy:5,search_radius:30,interpolation_distance:0}`. Preserve requests, raw responses, commands and settings. Bind safe integer/string engine IDs to verified directed edges; validate matched count, indices, fractions, geometry and car access. Match distance must be at most `accuracy_m + 1 m`. Interpolated points are eligible only with valid edge/fraction and distance; observed stationary repeated points retain their original times. Engine cost/ETA is never a traversal duration.
  각 연속 구간은 위 설정으로 실제 고정 엔진을 실행하고 요청·원문 응답·명령을 보존합니다. 안전한 정수/문자열 ID를 검증된 방향 구간에 연결하고 개수·인덱스·비율·지형·차량 통행을 검사합니다. 대응 거리는 정확도+1m 이하입니다. 보간점도 구간·비율·거리 검사를 통과해야 하며 정지 반복점의 원래 시각을 유지합니다. 엔진 비용·예상 시간은 통과시간이 아닙니다.
- Edge entry/exit requires evidence on both sides of a contiguous edge boundary, or a run endpoint whose fraction is within `0.00001` of the corresponding endpoint. Boundary time is the distance-weighted interpolation between original millisecond timestamps using verified directed geometry lengths. Fractions within an edge must not regress beyond a 1 m quantization allowance; larger reversal/discontinuity excludes affected traversal timing. Never use partial returned engine edge length as full graph length. Intermediate edges without observed points are excluded. An edge is accepted only if both entry and exit are known, ordered and duration positive; otherwise retain an excluded candidate with reasons (`PARTIAL_ENTRY`, `PARTIAL_EXIT`, `OBSERVATION_GAP`, `DISCONTINUITY`, `UNMATCHED`, `DISTANCE_EXCEEDED`, `INSUFFICIENT_POINTS`, as applicable). Keep source sample IDs and boundary brackets with each result.
  진입·진출은 연속 경계 양쪽 관측 또는 해당 끝점 비율의0.00001 이내인 구간 시작/끝 관측으로만 인정합니다. 검증 지형 길이와 원래 밀리초 시각으로 거리 비례 보간합니다. 같은 구간에서1m 양자화 여유보다 큰 역행/단절은 관련 통과시간을 제외합니다. 일부만 반환된 엔진 구간 길이를 전체 길이로 쓰지 않습니다. 중간 구간에 관측이 없으면 제외합니다. 양쪽 시각이 확인되고 양수 시간일 때만 수용하며 나머지는 위 사유와 표본·경계 근거를 보존합니다.
- Batch context uses a bounded in-memory session. `append(batch)` validates and retains observations, including exact duplicate overlap samples once; conflicting duplicates and novel out-of-order samples fail. `finalize()` executes the complete bounded trip once and seals the session. No early traversal emission, no persistence and no live latency claim. Full-trip and split/overlap batch results must have identical semantic hashes and traversal IDs. IDs bind policy, graph, matching ID, vehicle, edge occurrence and boundary sample IDs. P05 will add durable queue/retry behavior without replacing this invariant.
  배치 문맥은 크기가 제한된 메모리 세션입니다. append는 관측을 검증·보관하고 완전히 같은 중첩 표본은 한 번만 보관합니다. 다른 내용의 중복·새 역순 관측은 실패합니다. finalize가 전체 제한 여행을 한 번 실행하고 세션을 닫습니다. 조기 통과 출력·영속성·실시간 지연 주장은 없습니다. 전체/분할/중첩 결과의 의미 해시와 통과 ID는 같아야 합니다. ID에는 정책·그래프·매칭·차량·구간 순번·경계 표본을 묶습니다. 영속 큐·재시도는 P05입니다.

### Acceptance fixed before implementation / 구현 전 고정한 통과 기준

Keep every P03 count/assertion. Clean baseline has AB→BC; waiting route AD→DE→EF→FC. Their six complete traversals must have entry/exit errors **≤5 ms** against independently authored truth; the first waiting traversal includes its initial 5 seconds. Noisy gap trace may have matching points, but **zero complete traversals**: its junction is inside the 14–25 s observation gap and its ending is partial. Include a separate bounded-noise continuous upper-route case to verify internal complete edges with **≤750 ms** boundary error. Compare all input coverage, accepted/excluded samples and candidates, and truth-relative false/missed traversals; never calculate precision only on accepted cases without the denominator. Explicit midpoint fixture uses latitude0.00005, longitude0.0001…0.0019, accuracy6m: every point must be excluded as parallel ambiguity. Test reversed order, duplicate IDs/conflicting overlap, malformed engine response, wrong graph, tile tampering, cleanup failure and batch parity. Actual engine failures must remain failures, not pass via exclusion.

P03의 기존 개수·검사를 모두 유지합니다. 깨끗한 기본 경로와 정지 경로는 위 여섯 완전 통과의 진입/진출 오차가 독립 정답 대비 **5밀리초 이하**여야 합니다. 첫 정지 구간은 초기5초를 포함합니다. 잡음 누락 경로는 대응점이 있어도 교차점이14~25초 관측 간격 안이고 종점도 일부이므로 **완전 통과0개**여야 합니다. 별도의 연속 잡음 상단 경로는 내부 완전 구간의 경계 오차 **750밀리초 이하**를 확인합니다. 입력 전체·수용/제외 표본과 후보·정답 대비 잘못/놓친 통과를 함께 공개합니다. 위 중간 평행도로 자료는 정확도6m로 모두 모호 제외해야 합니다. 역순·중복/충돌 중첩·잘못된 응답·다른 그래프·타일 변조·정리 실패·배치 동등성을 검사합니다. 엔진 실패를 제외 처리로 성공시켜서는 안 됩니다.

## Main probe evidence / 메인 조사 근거

Pinned 3.9.1 on the verified P03 graph returned AB/BC and AD/DE/EF/FC, dimensionless full-edge fractions, metre match distances, and interpolated stationary duplicate-coordinate points. The midpoint trace also returned successful AB matching, proving why success alone is insufficient. Probe raw files are under ignored `data/p04-probe-20261024` until selected compact evidence is published. The temporary container was removed; the probe's initial case-sensitive absence check rejected Docker's lowercase `no such object`, then the saved removal output and empty named-container listing independently confirmed cleanup. This is probe-harness behavior, not an engine failure.

고정3.9.1은 P03 검증 그래프에서 위 도로 순서·전체 구간의 무차원 비율·미터 대응거리·정지 반복좌표의 보간점을 반환했습니다. 중간점도 AB로 성공했으므로 성공만으로 충분하지 않습니다. 원문은 위 로컬 무시 경로에 있고 선택한 작은 증거를 공개할 예정입니다. 임시 컨테이너는 제거됐습니다. 조사 도구의 첫 부재 검사는 Docker의 소문자 오류를 대소문자 구분 때문에 거부했고, 저장된 제거 출력·빈 컨테이너 목록으로 독립 확인했습니다. 엔진 실패가 아닌 조사 도구 문제입니다.

Pinned source: [3.9.1 API contract](https://github.com/valhalla/valhalla/blob/3.9.1/docs/docs/api/map-matching.md), inspected 2026-10-24. / 고정 버전 공식 계약을2026-10-24에 확인했습니다.

Boundary interpolation is rounded to the nearest integer millisecond after calculation. The 3-second gap rule is specific to the P03 1-second synthetic sampling; it does not silently replace the future 5-second production sampling draft in docs/04-protocol.md. Generalizing the matcher requires an explicitly versioned sampling policy and new evidence. Input JSON is limited to32 MiB before parsing.

경계 보간 후 가장 가까운 정수 밀리초로 반올림합니다. 3초 규칙은 P03의1초 합성 표본 전용이며 docs/04-protocol.md의 향후5초 운영 표본 초안을 몰래 바꾸지 않습니다. 일반화하려면 표본 정책 버전과 새 증거를 명시해야 합니다. 입력 JSON은 해석 전에32MiB로 제한합니다.

Each vehicle is limited to3,001 samples (P03's maximum300,000ms at its minimum100ms interval, plus endpoint); the60,020 total is20 vehicles. The pinned engine config allows16,000 trace points, so every supported run stays below it. Pass the saved request file path to the engine rather than embedding large JSON in a command argument. The [pinned executable source](https://github.com/valhalla/valhalla/blob/3.9.1/src/valhalla_service.cc#L95-L104) explicitly supports reading a request file; the full integration will exercise this path.

차량당 최대3,001표본입니다(P03의최대300,000ms·최소100ms간격에끝점포함). 총60,020은20대분입니다. 고정 엔진 설정의16,000점 제한 안에 모든 지원 구간이 들어갑니다. 긴JSON을 명령 인자로 넣지 않고 저장한 요청 파일 경로를 넘깁니다. 고정 실행 파일 소스가 파일 읽기를 지원하며 전체 통합에서 이 경로를 실행합니다.
