# From local pilot to usable navigation / 로컬 파일럿에서 실사용 내비게이션까지

Current2026-10-25: NAV-01 and NAV-02 are locally accepted; the current branch is `feat/navigation-progress`. NAV-06 destination search/confirmation is next. The latest request includes protected merge after exact-head CI; earlier branch-only finish lines below are historical. [Current evidence](../research/pilot/2026-10-25-nav02/report.md). / 현재 NAV-01·NAV-02 로컬 수용을 마쳤고 다음은 NAV-06입니다. 이번 요청은 원격 검사 뒤 보호 병합까지이며 아래 이전 브랜치 전달 조건은 과거 기록입니다.


Baseline: protected main 9b88a46, P01–P14 local pilot accepted. This proves a synthetic workflow on real Seoul OSM, not a navigation service ready for driving. New work starts on `feat/navigation-guidance`. Design, implementation and direct evidence review remain with the main Sol agent.

기준은 P01~P14 로컬 파일럿을 보호 병합한 main 9b88a46입니다. 실제 서울 지도 위 합성 처리 흐름을 검증했으며 실주행 서비스가 완성됐다는 뜻은 아닙니다. 이번 작업 브랜치는 `feat/navigation-guidance`이며 메인 Sol이 설계·구현·직접 검증을 맡습니다.

## Priorities and dependencies / 우선순위와 의존성

| Priority / 우선순위 | Work / 작업 | User outcome / 사용자가 얻는 것 | Release evidence / 실사용 전 근거 |
| --- | --- | --- | --- |
| P0 quality gate / 품질 조건 | Reviewed Seoul route/matching corpus; one-way, turn restriction, ramps, parallel roads, tunnels and uncertain cases / 서울 경로·매칭 검토 자료와 일방통행·회전금지·연결로·평행도로·터널·불확실 사례 | A defensible route rather than an attractive line / 선만 그리는 것을 넘어 경로의 근거 확보 | Preserve RM-001's 100/100 reviewed quota, exclusions and source rights; independent expectations, not same-engine answers / 기존 100/100 기준·제외·사용권·독립 기대 결과 유지 |
| P0 implementation foundation / 구현 기반 | NAV-01 validated turn instructions / 검증한 회전별 길안내 | Read where to turn along the calculated route / 계산 경로에서 어디로 가야 하는지 확인 | Native English/Korean instructions bound to the exact returned geometry and version; malformed guidance rejected / 실제 한영 엔진 안내·지형·버전 연결·잘못된 안내 거부 |
| P1 | NAV-02 route progress and replay / 경로 진행·재생 | Current position, next maneuver and remaining distance / 현재 위치·다음 회전·남은 거리 | Authored noisy GPS replay, parallel-road ambiguity, stale/reordered points and arrival tests / 자체 GPS 오차·평행도로·오래된/역순 표본·도착 검사 |
| P1 | NAV-06 destination search and selection / 목적지 검색·선택 | Enter an address/place, inspect candidates and confirm the car-access destination / 주소·장소를 검색하고 후보와 자동차 접근 지점을 확인 | Search ambiguity, coordinate precision, provider/source rights, failure recovery and explicit final destination; no automatic choice among ambiguous places / 동명이장소·좌표 정밀도·이용 조건·오류 복구·최종 목적지 확인 |
| P1 | NAV-03 Android location lifecycle / Android 위치 수명주기 | Continue guidance with permissions, screen lock and temporary network loss / 권한·화면 잠금·일시 통신 단절 대응 | Device tests, explicit consent, local retention/deletion and battery/data measurements / 실제 기기·동의·보관/삭제·배터리/데이터 실측 |
| P1 | NAV-04 rerouting and spoken guidance / 재탐색·음성 안내 | Recover after leaving the route and hear timely instructions / 이탈 후 복구·시점에 맞는 음성 | Off-route hysteresis, bounded requests, changed-route cancellation and voice deduplication / 이탈 누적 판정·요청 제한·이전 경로 취소·중복 발화 방지 |
| P1 | NAV-05 deployable private preview / 배포 가능한 제한 미리보기 | Use a stable HTTPS service without a development machine / 개발 PC 없이 안정된 HTTPS로 사용 | Real-clock traffic mode, authentication, regional map updates, owned service restart and metrics; deployment separately authorized / 실제 시계·인증·지도 갱신·재시작·지표·배포 별도 승인 |
| P2 | Real observations and ETA evaluation / 실제 관측·도착시간 평가 | Know when traffic meaningfully improves a route / 교통정보가 경로에 도움이 되는지 확인 | Separate training/evaluation trips, coverage, uncertainty and measured error / 학습·평가 분리·적용률·불확실성·오차 실측 |
| P2 | Independent operators and distribution / 독립 운영자·분산 운영 | Survive an operator or network outage / 운영자·네트워크 장애에도 서비스 유지 | Three independently operated nodes, identity/revocation, secure updates and recovery drills / 독립 운영 노드 3개·신원/폐기·안전한 갱신·복구 훈련 |

The quality gate is a release condition throughout this work. It does not prevent implementing and synthetically validating navigation interfaces locally. Do not raise the geographic count with generated GPS, generated expectations or an engine's own answer. No real location traces are committed. Synthetic traffic remains labeled; real clock and real observations require their own later contracts.

도로 품질 검증은 개발 내내 유지하는 실사용 전 조건입니다. 로컬에서 안내 인터페이스를 구현하고 합성 입력으로 검증하는 작업은 진행합니다. 생성한 GPS·기대 결과·엔진 답을 실제 지역 검토 수에 넣지 않으며 실제 위치 기록은 커밋하지 않습니다. 합성 교통 표시는 유지하고 실제 시계·실제 관측은 별도 계약으로 연결합니다.

## First increment / 이번 구현

Implement [NAV-01](36-nav01-turn-guidance.md) first: request a supported narrative locale, preserve it through the actual native engine, validate the maneuver list against the already validated route, and render a readable ordered list. Existing requests without guidance retain their exact wire behavior. This produces the input that later position tracking, rerouting and voice use; it does not pretend those later features already exist.

이번에는 NAV-01부터 구현합니다. 지원 언어를 실제 엔진까지 전달하고, 이미 검증한 경로와 회전 목록을 대조한 뒤 순서대로 표시합니다. 안내를 요청하지 않은 기존 전송 동작은 유지합니다. 이후 위치 추적·재탐색·음성이 사용할 자료를 만들며 해당 후속 기능을 구현한 것으로 표현하지 않습니다.

Acceptance: focused tests; fresh full simulation of all implemented modules plus NAV-01; inspected original native/browser outputs; actual IAB review and refreshed user recordings/media fingerprint; dated bilingual report and a descriptive branch commit/push. This request ends at a verified branch push. Protected merge or deployment is not included in this increment's finish line.

통과 기준은 집중 검사·기존 전체 모듈과 NAV-01의 새 통합 실행·실제 엔진/브라우저 원본 검사·내장 브라우저 직접 확인·새 녹화와 미디어 지문·한영 보고서·이유가 드러나는 커밋과 작업 브랜치 푸시입니다. 이번 요청은 검증한 브랜치 푸시까지이며 병합·배포는 포함하지 않습니다.

## NAV-01 local acceptance / NAV-01 로컬 수용

Implemented and directly verified: fresh406, Node22 tests310, exact native EN/KO binding,390px manual review and refreshed actual28.5s recording. [Dated report](../research/pilot/2026-10-25-nav01/report.md). This is feature-branch delivery, not protected merge or deployment. NAV-02 route progress/replay is the next implementation; the independent quality gate remains open.

새 전체406개·Node22 검사310개·한영 엔진 원문·390픽셀 직접 화면·새 실제28.5초 녹화를 검증했습니다. 작업 브랜치 전달이며 보호 병합·배포는 수행하지 않습니다. 다음은 NAV-02 경로 진행·재생이고 독립 품질 조건은 남아 있습니다.

## User entry, reuse and disconnection / 사용자 입력·재사용·통신 단절

The current coordinate/preset form is a developer pilot. After NAV-02 progress/replay, NAV-06 should add address/place search and a map-confirmed car-access destination before claiming ordinary user usability. NAV IDs are identifiers, not a numeric execution order: the intended sequence is NAV-01 → NAV-02 → NAV-06 → NAV-03/NAV-04 → NAV-05, while the P0 quality gate remains open. An arrival maneuver is a route endpoint, not proof that the user reached an accessible entrance or parking area.

현재 좌표·미리 정한 경로 입력은 개발 파일럿입니다. NAV-02 다음에는 주소·장소 검색과 지도에서 자동차 접근 지점을 확인하는 NAV-06이 필요합니다. NAV 번호는 식별자이며 실제 순서는 위와 같습니다. 도착 안내는 경로 끝점이지 실제 출입구·주차장에 도달했다는 증거가 아닙니다. P0 도로 품질 조건도 계속 유지합니다.

Reuse Valhalla for routing, native narrative and matching; use the device platform's location and speech facilities. Choose a maintained search implementation/provider after evaluating source rights, hosting cost and limits; no provider is selected or provisioned here. RouteLens should own the narrow adapters, route-bound progress, off-route/reroute rules, cancellation, authority/expiry handling and consent/deletion controls.

경로·원 안내·매칭은 Valhalla, 위치·음성은 단말 기능을 재사용합니다. 검색은 출처 이용 조건·운영 비용·한도를 검토한 뒤 기존 구현/제공자를 고르며 이번에 선택·구축하지 않습니다. RouteLens는 연결기·경로에 연결한 진행·이탈/재탐색 규칙·취소·승인/만료·동의/삭제를 직접 구현합니다.

During temporary disconnection, NAV-03 must distinguish continuing along already received geometry/instructions from computing a new route. Keep cached geometry and map data usable where supported, mark stale traffic and explicitly report when a new route cannot be calculated. Full offline regional map/search/routing downloads are a later optional module with storage, update, attribution and device-capacity acceptance; ordinary server availability does not prove offline navigation.

일시 통신 단절에서는 받은 경로·안내를 계속 쓰는 동작과 새 경로 계산을 구분해야 합니다. 지원하는 지도·지형 캐시를 유지하고 오래된 교통정보와 재탐색 불가를 명확히 표시합니다. 지역 지도·검색·경로를 모두 내려받는 완전 오프라인 기능은 저장공간·갱신·출처·단말 용량을 검증할 후속 선택 모듈이며 서버 정상 동작으로 대신하지 않습니다.


## NAV-02 local acceptance2026-10-25 / NAV-02 로컬 수용

Main Sol directly implemented contract37. Clean7078d6f/runtime6d853cf2 passed fresh438/438 and Node22 full320; independent progress190states/168positions/max authored error2.23m, actual IAB EN/KO390px and full42.7s recording passed. Existing406 checks remain. [Dated report](../research/pilot/2026-10-25-nav02/report.md). The user authorized branch push and normal protected PR merge; exact-head hosted results are recorded separately. No deployment. Next NAV-06 destination search/confirmation; independent100/100 road review and device GPS accuracy remain open.

메인 Sol이 계약37을 구현하고 깨끗한 소스의 새438개·전체320개·독립 진행190상태/168위치/자체 거리 최대2.23m·실제 한영390픽셀·42.7초 녹화를 직접 확인했습니다. 기존406개를 유지하며 사용자 승인에 따라 작업 브랜치 푸시·정상 보호 PR 병합까지 진행합니다. 원격 결과는 별도 기록하고 배포하지 않습니다. 다음은 NAV-06 목적지 검색/확인이며 독립100/100·단말 정확도는 남습니다.


Corrected NAV-02 acceptance / 수정 NAV-02 수용: clean fe49b55/runtime70af32dc passed fresh438/438, focused10/full320 and new43.5s actual recording on graph a859e9ad. Strengthened future-sample expiry is included; first local evidence remains historical. Independent progress191 states/168 positions and IAB EN/KO390px passed. [Final dated report](../research/pilot/2026-10-25-nav02-clock/report.md). The user-authorized protected merge follows exact-head CI; no deployment. / 미래 표본 때 옛 안내 만료를 보강한 깨끗한 소스의 새438개·집중10개/전체320개·새43.5초·독립191상태/168위치·내장 한영390픽셀을 확인했습니다. 첫 결과는 과거 근거로 보존하고 정확한 원격 검사 뒤 보호 병합하며 배포하지 않습니다.
