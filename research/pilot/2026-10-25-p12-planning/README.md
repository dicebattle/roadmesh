# P12 planning probe / P12 설계 조사

This is exploratory evidence, not an implemented P12 acceptance test. Main Sol analyzed actual exported Seoul edge shapes to select possible disconnected components, then used one owned Valhalla engine with the unchanged P11 runtime on graph4df7433f…. All20 in-envelope candidates produced actual routes; the outside candidate was refused by RouteLens's existing coordinate guard before native dispatch. No native NO_PATH or NO_SUITABLE_ROAD was observed. Shape endpoint components do not prove legal car connectivity, especially across hierarchy transitions and location snapping. Do not label these candidates disconnected roads in the product or report.

구현된 P12 수용 검사가 아닌 탐색 근거입니다. 메인 Sol이 실제 서울 구간 지형에서 연결이 끊겨 보이는 후보를 뽑고, P11 실행 코드 그대로 소유 Valhalla 엔진 하나로 요청했습니다. 범위 안 후보20개 모두 실제 경로가 반환됐고, 범위 밖1개는 기존 좌표 검사에서 엔진 호출 전에 거부됐습니다. 엔진의 경로 없음·주변 도로 없음은 관측하지 못했습니다. 지형 끝점 연결은 계층 이동·좌표 대응을 고려한 자동차 통행 연결의 증거가 아니므로 이를 제품의 단절 도로로 표시하지 않습니다.

[Selected inputs](selected-inputs.json) were written before requests; [results](results.json) retain every outcome. The owned engine was stopped in finally. [Pinned upstream findings](../../../wiki/sources/valhalla391-route-errors.md) and [gap draft](../../../docs/31-p12-scenario-gap-review.md) guide the next design. The P12 contract remains a draft; native no-path, administrative exclusion, vehicle-class isolation and whole-run abort coverage are not complete.

선택 입력은 요청 전에 기록했고 모든 결과를 보존합니다. 엔진은 finally에서 정리했습니다. 고정 상위 소스와 공백 초안을 바탕으로 다음 설계를 확정하며, 네이티브 경로 없음·관리상 노드 배제·차량 종류 분리·전체 중단 검증은 아직 완료하지 않았습니다.

## Follow-up: actual bounded-snap failures / 후속: 제한 거리 대응의 실제 실패

Pinned export_edges merges consecutive same-name geometry, so endpoint-only components were insufficient. A second candidate pass joined all original geometry vertices. This remains candidate discovery, not independent road-legality certification. With explicit upstream `search_cutoff:100` and `minimum_reachability:0`, actual Seoul target `(127.080961,37.549272)` returned HTTP400/code171 and `(127.070395,37.507408)` returned HTTP400/code442. Both returned routes with unchanged legacy defaults. [Raw errors and comparison](bounded-snap/main-verification.json). All three follow-up owned engines are absent; original first-pass successes remain preserved.

고정 내보내기 도구가 같은 이름의 연속 구간을 합치므로 끝점만 연결한 후보는 불충분했습니다. 모든 원래 지형 점을 연결해 다시 후보를 골랐으며, 이는 탐색이지 독립 통행 합법성 인증은 아닙니다. 상위 엔진의100m 제한·연결 규모 제외 없는 옵션에서 위 두 실제 서울 좌표가 각각171·442 오류를 반환했습니다. 같은 입력도 기존 기본 옵션에서는 경로가 나왔습니다. 세 후속 엔진의 부재를 확인하고 첫 조사 성공 결과도 보존했습니다.

This supports an **explicit opt-in** local snapping policy, not a silent change to old requests. P12 must forward and validate the exact policy in native requests and bind domain failures to the selected version. A no-path outcome refers to this mapped graph and policy, not a verified physical-world impassable road.

기존 요청을 조용히 바꾸지 않고 **명시적으로 선택하는** 로컬 좌표 대응 정책을 설계할 근거입니다. P12는 정확한 정책을 엔진 요청에 전달·검증하고 실패도 선택 버전에 연결해야 합니다. 경로 없음은 이 지도와 정책의 결과이며 현실에서 통행 불가능하다고 검증한 뜻은 아닙니다.
