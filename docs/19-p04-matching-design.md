# P04 matching design notes / P04 매칭 설계 기록

Status: next module, not implemented. Main owns design; Sol will implement after the request/response contract and exclusion thresholds are confirmed against the pinned 3.9.1 executable. P03 evidence remains the baseline, and the integrated command/README/recording must be extended after this module changes behavior.

상태: 다음 모듈이며 미구현입니다. 메인이 설계하고 고정3.9.1 실행 파일로 입출력·제외 기준을 확인한 뒤 Sol이 구현합니다. P03 증거를 기준으로 유지하고 동작이 추가되면 통합 명령·README·녹화도 갱신합니다.

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

## Still to resolve before coding / 코딩 전 확정할 것

Probe the pinned executable's exact matched-point fields and timestamp precision; choose a small policy for gap length, positional uncertainty and boundary interpolation. Set fixed tolerances from independent authored fixtures, not from whichever outputs happen to pass. Record how endpoint partial traversals and interpolated/unmatched points affect eligibility. The initial policy may be specific to the synthetic fixture, but must be labeled as such instead of being presented as production matching quality.

고정 실행 파일의 대응점 필드·시각 정밀도를 조사하고 누락 길이·위치 불확실성·경계 보간 정책을 정합니다. 우연히 통과한 출력 대신 독립 자료에서 허용오차를 정하고 끝점 일부 통과·보간/미매칭 점의 수용 여부를 기록합니다. 초기 합성 전용 정책은 그 범위를 명시하며 운영 품질로 표현하지 않습니다.

## Primary source / 공식 출처

The [Valhalla map-matching API](https://valhalla.github.io/valhalla/api/map-matching/) distinguishes exact-geometry edge walking from map snapping and documents per-input matched points, their edge indices, along-edge position and discontinuity fields. Its timestamp options must be checked against the pinned executable before deriving observed travel times. Accessed 2026-10-24; current web documentation is not assumed identical to release 3.9.1.

공식 문서는 정확한 지형의 구간 걷기와 지도 매칭을 구분하고 입력별 대응점·구간 인덱스·구간 내 위치·단절 정보를 설명합니다. 관측 통과시간을 만들기 전에 고정 실행 파일의 시각 옵션을 확인합니다. 확인일은2026-10-24이며 현재 웹 문서를3.9.1과 같다고 가정하지 않습니다.
