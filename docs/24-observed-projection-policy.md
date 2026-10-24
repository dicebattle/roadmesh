# Observed boundary projection v3 / 관측 경계 투영 v3

Status: decided after inspecting the failed P06 design probe; implementation and direct verification are pending. Main designs; Sol implements the narrowly scoped matcher adapter. Valhalla stays pinned and unmodified. This is a prerequisite to P06's original five-contributor acceptance criteria, not a reduced criterion or a replacement vehicle population.

상태: P06 설계조사의 실패 원문을 검사한 뒤 결정했으며, 구현·직접 검증은 아직 남아 있습니다. 메인이 설계하고 Sol이 매칭 연결기만 수정합니다. Valhalla의 고정 버전은 바꾸지 않습니다. 원래 정한 5명 집계 기준을 충족하기 위한 선행 수정이며 기준을 낮추거나 차량군을 바꾸는 작업이 아닙니다.

## Observed failure / 확인한 실패

The authored actual-Seoul probe used the first three contiguous Teheran edges, five vehicles at3/4/5/6/7m/s,500ms sampling, zero noise and an8s wait halfway through the middle edge. Its expectation file was written before engine execution. Only4/5 target traversals were accepted; the3m/s duration error227.535ms exceeded150ms. Original inputs, engine responses and independent analysis are preserved in the P06 research record.

실제 테헤란로의 연속 세 구간에서 속도 3/4/5/6/7m/s인 차량 5대, 500ms 표본, 잡음 없는 GPS, 가운데 구간 중간의 8초 대기를 시험했습니다. 기대값은 엔진 실행 전에 저장했습니다. 대상 통과 5개 중 4개만 채택됐고, 3m/s 차량의 시간 오차 227.535ms가 기준 150ms를 넘었습니다. 입력·엔진 응답·독립 분석은 P06 조사 기록에 보존합니다.

- At4m/s, the10,500ms observation was0.920m before the first edge end. Valhalla associated it with that correct edge but snapped its fraction to1. The reported trace distance0.914845m passed the1.01m limit; distance to its returned rounded coordinate was1.045123m and failed our second check. The original observation projected0.000047m from the independently located full geometry. Our rejected point then removed the next edge's entry bracket and created DISCONTINUITY/PARTIAL_ENTRY; the engine emitted no discontinuity flag.
  4m/s의 해당 관측은 첫 구간 끝보다 0.920m 앞이었습니다. 엔진은 올바른 구간을 선택했지만 비율을 끝점 1로 붙였습니다. 엔진 거리 0.914845m는 기준 안이지만 반올림된 반환 좌표까지의 거리 1.045123m가 자체 두 번째 검사에서 탈락했습니다. 원관측과 전체 지형의 거리는 0.000047m였습니다. 이 표본 제외로 다음 구간의 진입 근거가 사라졌고 자체 단절 판정이 생겼으며, 엔진 자체의 단절 표시는 없었습니다.
- At3m/s, endpoint fractions made entry140.024ms early and exit87.512ms late. The interpolation formula was consistent with those snapped fractions; using them as precise observation progress caused the227.535ms duration error. An independent diagnostic projection on the already chosen continuous path yields errors below0.02ms, showing the source observations contain enough information. This diagnostic is not verification of a modified matcher.
  3m/s에서는 끝점 비율 때문에 진입이 140.024ms 빨라지고 진출이 87.512ms 늦어졌습니다. 보간식 자체가 틀린 것이 아니라 엔진이 붙인 끝점 비율을 원관측의 정확한 진행 위치로 사용한 것이 문제였습니다. 이미 선택된 연속 경로에 원관측을 독립 투영한 진단 계산은 0.02ms 미만의 오차를 보여 원관측에 정보가 충분함을 확인했습니다. 아직 수정된 매칭기의 검증은 아닙니다.

The probe included an initial5s wait, which is not required by P06's scenario. It shifts sample times by an integer number of intervals; any impact of repeated starting samples on upstream sequence selection remains unmeasured. The failures above are directly explained from the actual returned evidence without relying on that conjecture.

조사에는 P06 필수 조건이 아닌 초기 5초 대기가 포함됐습니다. 표본 간격의 정수배만큼 시각이 이동하며, 반복 시작 표본이 엔진 경로 선택에 주는 영향은 별도로 측정하지 않았습니다. 위 실패는 그 추정 없이도 실제 반환 자료로 설명됩니다.

## New policy / 새 정책

Use `seoul-observed-v3` for new Seoul workloads and P06. Preserve explicitly requested v2 interpretation for existing pinned batches/trips; never process a v2 job with v3 and label it unchanged. `runSeoulMatching` accepts an explicit final policy argument, defaults to v3, and records the selected policy consistently in output identity/manifests. P05 config/batch/worker supports exact v2 or v3 pinning; P06 accepts only v3. Existing P04 traversal IDs already include policy, so retain the existing matching-session ID formula. Legacy TRAVEL batch hashes remain unchanged.

새 서울 실행과 P06에는 v3를 사용하고, 기존 배치·여행이 명시한 v2 해석은 보존합니다. v2 작업을 v3로 처리하면서 같은 정책이라고 표시하지 않습니다. 함수 인자·작업·출력 명세에 정책을 정확히 기록합니다. P05는 두 정책의 명시 고정을 지원하고 P06은 v3만 사용합니다. 통과 ID에는 이미 정책이 포함되므로 세션 ID를 불필요하게 바꾸지 않으며 기존 TRAVEL 배치 해시도 유지합니다.

For each v3 matched observation, inspect the engine-selected directed path occurrence and its immediately adjacent **connected** occurrences. Project the original observation onto their independently located full geometries. Choose a unique nearest projection and use its path occurrence/fraction for the existing observed-time boundary interpolation. Shared endpoints at the same cumulative path position are equivalent; if projections within0.01m of the best distance imply positions differing by more than0.01m, exclude as AMBIGUOUS_PROJECTION rather than selecting arbitrarily. No scene catalog, authored speed, trajectory truth or expected boundary is supplied to this calculation. No shortcut to nonadjacent or disconnected edges is allowed.

v3는 엔진이 선택한 방향 경로의 현재 구간과 바로 앞뒤의 **연결된** 구간만 살펴봅니다. 원관측을 독립 조회한 전체 지형에 투영하고 유일한 최단 위치의 구간·비율로 기존 관측시간 보간을 수행합니다. 같은 누적 경로 위치의 공유 끝점은 동등합니다. 최단 거리와 0.01m 이내인 후보들이 서로 0.01m보다 다른 진행 위치를 뜻하면 임의로 선택하지 않고 투영 모호성으로 제외합니다. 장면 목록·속도 정답·궤적 정답·기대 경계를 입력하지 않으며 비연속·멀리 떨어진 구간으로 건너뛰지 않습니다.

Retain engine response validation, fraction/returned-geometry coherence, upstream unmatched and discontinuity flags, reported distance≤accuracy+1m, independent car access/direction/graph checks, observation-gap/reversal guards, independent parallel ambiguity and the1s sustained endpoint uncertainty rule. The second v3 observation-distance check uses distance to the selected full-geometry projection instead of the rounded snapped coordinate; its limit is unchanged. Record projection method and original engine association as v3-only diagnostics, preserving raw engine bytes. v2 results must not acquire new optional fields.

엔진 응답·비율/지형 정합·엔진의 미대응/단절·보고 거리 제한·자동차 통행/방향/그래프·누락/역행·평행 모호성·끝점 1초 지속 불확실성 검사를 유지합니다. 두 번째 거리 검사의 대상만 반올림된 엔진 좌표에서 선택한 전체 지형 투영으로 바꾸고 허용치는 늘리지 않습니다. v3에만 투영 방식·원엔진 대응 근거를 추가하고 원문과 v2 바이트는 보존합니다.

## Verification / 검증

### Full-run review refinement / 전체 실행 검토 보완

The first clean full execution at `5a173c8` passed145 assertions, but main's denominator audit found193/237 baseline traversals accepted versus the prior v2 result215/237. Clean traversals improved to79/79; noisy traces suffered extra exclusions. A passing gate did not end the review. Of14 AMBIGUOUS_PROJECTION points,13 had an extra clamped vertex candidate which was **not a local minimum of distance on the continuous path**: an adjacent segment sharing exactly the same vertex had a strictly closer interior projection. The remaining downtown-gap4500ms point had two distinct interior minima and remains ambiguous.

첫 깨끗한 전체 실행은145개를 통과했지만, 메인의 분모 검토에서 기본 통과 채택이 이전 v2의215/237에서193/237로 줄었음을 확인했습니다. 정상 관측은79/79로 좋아졌지만 잡음 자료의 제외가 늘었습니다. 통과 표시로 검토를 끝내지 않았습니다. 투영 모호성 표본14개 중13개는 같은 꼭짓점을 공유한 인접 선분 안쪽에 더 가까운 투영이 있는데도 끝점을 별도 후보로 셌습니다. 그 끝점은 **연속 경로 전체에서 거리가 국소적으로 가장 작은 점이 아닙니다.** 나머지 도심 표본은 서로 다른 내부 최단 위치가 두 개이므로 모호성을 유지합니다.

Refine the unreleased v3 candidate enumeration, not its0.01m distance/progress thresholds. Discard a clamped endpoint candidate only when the immediately adjacent segment shares the exact longitude/latitude vertex and has a strictly smaller-distance **interior** projection. Do not use a sampled1mm step as the decision rule. Keep genuine corner minima, outer path endpoints, distinct interior minima, loops and self-crossings. The broader1m edge-connection tolerance cannot make two different coordinates a shared vertex. Preserve original failed/refinement evidence and add the actual13 cases plus the retained ambiguous case as focused regression input before a new clean whole run.

미공개 v3의 후보 구성만 보완하고0.01m의 거리·진행 동률 기준은 바꾸지 않습니다. 바로 옆 선분이 정확히 같은 경도·위도의 꼭짓점을 공유하고, 그 선분 **내부**에 엄밀히 더 가까운 투영이 있을 때만 끝점 후보를 제거합니다. 1mm 이동 시험으로 실제 판정하지 않습니다. 유효한 꺾임의 최단점·경로 양끝·서로 다른 내부 최단점·루프·자기 교차는 유지합니다. 1m 연결 허용 범위만으로 다른 좌표를 같은 꼭짓점으로 취급하지 않습니다. 실제13개와 남겨야 할1개를 회귀 자료로 보존한 뒤 새 전체 실행을 검증합니다.

Strengthen the whole-run gate before rerunning: apply the existing clean-input70% complete-traversal coverage floor to each of the six noisy/gapped vehicles too. Prior v2's fixed scenarios all met this floor, whereas the first v3 Mapo-gap result8/18 did not. Preserve all existing false-traversal, timing and gap checks and the237 truth denominator. This adds six checks (Seoul35, total151 including P05/P06); do not lower the floor to fit later outputs.

재실행 전에 전체 판정도 강화합니다. 정상 입력에 이미 쓰던 완전 통과 보존율70%를 잡음·누락6대에도 각각 적용합니다. 고정된 이전 v2 시나리오는 모두 이 기준을 만족했지만 첫 v3 마포 누락8/18은 그렇지 않았습니다. 기존 허구통과·시간·누락 검사와 정답237개는 유지합니다. 6개가 추가돼 서울35개·전체151개이며, 이후 결과에 맞춰 기준을 내리지 않습니다.

Add focused regressions for the observed endpoint rounding, late edge association, connected-neighbor projection, loops/parallel ambiguity, forbidden jumps, gap/discontinuity and endpoint waiting. Keep original5 target traversals,150ms duration error and2% aggregate-speed tolerance. Only after focused checks pass, run one preserved-input development probe, then the complete fresh tiny→Seoul(v3)→P05→P06 pipeline and inspect raw results. If it fails, retain the failure and diagnose before another run. Historical v2 evidence remains scoped to its original implementation.

끝점 반올림·늦은 구간 전환·연결 이웃 투영·루프/평행 모호성·금지 건너뛰기·누락/단절·끝점 대기의 집중 검사를 추가합니다. 원래의 대상 5개·150ms·집계 속도 2% 기준을 유지합니다. 집중 검사 후 보존 입력 개발조사를 한 번 실행하고, 새 전체 처리 흐름을 돌려 원문을 확인합니다. 실패하면 기록·진단을 먼저 하며, 과거 v2 증거의 범위도 유지합니다.

Reference: the [official Valhalla map-matching API](https://valhalla.github.io/valhalla/api/map-matching/api-reference/) describes matched-point correspondence, edge association, fraction and trace distance; it does not promise that a snapped endpoint is the exact original observation boundary. Accessed2026-10-24. The narrow correction above is RouteLens's inference from inspected raw evidence, not a claim about an uninspected upstream internal snapping algorithm.

공식 API의 대응 점·구간·비율·거리 설명을 확인했습니다. 붙인 끝점이 원관측의 정확한 통과 경계라는 보증으로 해석하지 않습니다. 위 수정은 원문을 검사한 RouteLens 설계 판단이며, 확인하지 않은 엔진 내부의 끝점 선택 알고리즘을 단정하지 않습니다.
