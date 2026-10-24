# P08 fixed detour exploration / P08 고정 우회 탐색

## English

**Result: insufficient for the traffic-detour criterion.** A valid alternative avoiding the target exists in the engine's exclusion exploration. Setting only the selected directed edge to 2 km/h increased time/cost but retained the baseline shape and target edge. No target substitution, search extension or additional engine invocation was performed.

The target was chosen before engine execution by the fixed rule: catalog79 member, entire edge within cumulative baseline distance20–80%, length60–120m, edge midpoint closest to50%, deterministic ID tie-break. `candidates.json` preserves all candidates and exclusions; `expected.json` preserves the pre-run choice/expectations. Selected edge `1338754750864` is75m, cumulative1028–1103m and midpoint50.354442344% of the trace's2116m sum (rounded per-edge trace lengths; route summary distance2.119km). Baseline shape indices35–36 correspond exactly to catalog directed geometry and graph source trace coordinates. `expected.json` includes the source geometry, measured spherical geometry length and distance-interpolated midpoint used for exclusion.

The existing graph trace and probe1 baseline have the same ordered edge IDs and shape-point count, but their final endpoint differs slightly. An initial preflight whole-shape equality assertion detected this before any engine invocation. Selection therefore verifies exact equality of the selected interior shape segment across the probe1 baseline, stored source trace and catalog directed geometry; it does not claim full-shape equality with that older trace. The selection target was not changed.

The same actual image `sha256:34fcb41045d960a181f44583484b7a4372355d4b276f6f78c603e884e706d5c2` and graph `7f4fd63e63aae5e5b961fc26d36ecae0fe30128c5508d4e184109ef16d59a4be` were used. The graph and prior extracts were mounted read-only. Original skeleton bytes were reused; only the target's eight-byte record was changed (overall=s1=1, breakpoint1=255, remaining fields zero). `patch.json` records the absolute offset, raw bytes and original/derived SHA256. No fake C++ ABI claim is made.

| Request | Time seconds | Distance km | Cost | Baseline shape | Target in actual trace |
| --- | ---: | ---: | ---: | --- | --- |
| Empty skeleton baseline | 147.404 | 2.119 | 289.959 | same | previously confirmed |
| Empty skeleton + midpoint exclusion | 184.731 | 2.412 | 416.986 | different | no |
| Original request + target2km/h | 232.667 | 2.119 | 393.156 | same | yes, trace speed3km/h |
| Empty skeleton restored | 147.404 | 2.119 | 289.959 | same | same shape |

All four routes returned trip.status=0. The alternative's target absence and traffic route's target presence were confirmed by exactly one trace_attributes call each. Only the alternative request contains exclude_locations. Traffic has the original OD/options/date_time.type0 and no exclusion, waypoint or artificial cost weighting. Traffic encoded2km/h but the engine reported speed3km/h; the encoding/observed speed distinction is preserved without attributing it to an unverified mechanism. The observed alternative cost416.986 exceeds the observed traffic-route cost393.156; these are engine outputs, not independent optimality proof. Restoration matched baseline shape and time exactly, within1e-6 seconds.

`execute.mjs` made exactly four route and two trace calls in one owned container with network none,2CPUs and4GiB. `commands.json` records all exact commands. Raw stdout/stderr, requests, responses and parsed comparisons are preserved. `container-inspect.json` records mounts/resources; `cleanup.json` confirms the final label-filtered container inventory is empty. Source code, documentation, tests and Git were not changed. This remains development exploration, not P07 acceptance, automatic expiry proof or P08 completion.

## 한국어

**교통정보에 따른 우회 조건은 충족하지 못했습니다.** 제외위치 요청에서 대상을 피하는 유효 대안은 찾았지만, 선택 구간만2km/h로 설정한 실제 교통정보 요청은 기본 경로와 같았고 해당 구간을 계속 사용했습니다. 시간·비용 증가는 확인했습니다. 추가 대상 변경이나 반복 탐색은 하지 않았습니다.

대상은 실행 전에 고정 규칙으로 선택했습니다. 검증 목록79개에 포함되고 누적거리20~80% 내부에 있는60~120m 구간 중 중간점이50%에 가장 가까운 하나입니다. 선택된1338754750864는75m, 누적1028~1103m, 중간점50.3544%입니다. baseline shape index35~36을 그래프 원본 trace·목록의 실제 방향 지형과 직접 대조했습니다. 실제 지형의 구간거리 중간좌표와 후보 목록·선택 근거·사전 기대를 파일에 보존했습니다.

이전 그래프 trace와 probe1 기본 경로의 마지막 도착점이 미세하게 달라, 첫 준비 검사의 전체 지형 일치 조건이 실행 전에 실패했습니다. 동일한 구간 ID 순서·점 개수와 선택된 내부 구간 좌표의 정확한 일치를 확인하여 대상 중간좌표를 계산했습니다. 대상을 바꾸지 않았으며 경로 엔진 재실행도 아니었습니다.

기본은147.404초, 제외위치 대안은184.731초, 교통정보 적용은232.667초, 복구는147.404초였습니다. 대안은2.412km이며 trace에서 대상이 없었습니다. 교통정보 경로는2.119km로 기본 지형과 같았고 trace에서 대상75m를 사용했습니다. 인코딩은2km/h지만 엔진 trace는3km/h를 보고해 두 값을 구분해 기록했습니다. 대안 비용416.986이 교통정보 경로 비용393.156보다 높다는 관찰도 남겼으며, 이를 독립적인 최적 경로 증명으로 확대하지 않습니다.

복구는 기본 지형·시간과 정확히 일치했습니다. 실제 교통정보 요청에는 제외위치·경유지·인위적 비용 가중치를 넣지 않았습니다. 네 경로와 두 trace만 실행했습니다. 읽기 전용 그래프·기존 extract, 네트워크 차단·CPU2개·메모리4GiB를 유지했고 자신이 만든 컨테이너만 정리했습니다. 생산 파일·문서·검사·Git은 변경하지 않았습니다. P07 수용·자동 만료·P08 완료 증거는 아닙니다.
