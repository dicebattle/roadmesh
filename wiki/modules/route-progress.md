# Route progress and replay / 경로 진행·재생

Implemented NAV-02: pure TypeScript projection/state machine plus local authored replay and existing MapLibre markers. Current guidance is bound to the exact route request/version. Low accuracy, time/order faults, jumps and road ambiguity withhold current metrics; departure/rejoin/arrival use consecutive usable samples. No device GPS or automatic rerouting. [Contract](../../docs/37-nav02-route-progress.md) · [actual438-case report](../../research/pilot/2026-10-25-nav02/report.md).

순수 TypeScript 투영·상태 모듈과 자체 합성 재생·기존 지도 표시를 구현했습니다. 안내를 정확한 요청/버전에 연결하고 오차·시간/순서·도약·도로 모호함에서는 현재 수치를 보류합니다. 이탈·복귀·도착은 연속 유효 표본으로 판단하며 단말 GPS·자동 재탐색은 후속입니다. Node22 전체320개·새 통합438개와 원문/내장 브라우저를 직접 확인했습니다.


Corrected NAV-02 acceptance / 수정 NAV-02 수용: clean fe49b55/runtime70af32dc passed fresh438/438, focused10/full320 and new43.5s actual recording on graph a859e9ad. Strengthened future-sample expiry is included; first local evidence remains historical. Independent progress191 states/168 positions and IAB EN/KO390px passed. [Final dated report](../../research/pilot/2026-10-25-nav02-clock/report.md). The user-authorized protected merge follows exact-head CI; no deployment. / 미래 표본 때 옛 안내 만료를 보강한 깨끗한 소스의 새438개·집중10개/전체320개·새43.5초·독립191상태/168위치·내장 한영390픽셀을 확인했습니다. 첫 결과는 과거 근거로 보존하고 정확한 원격 검사 뒤 보호 병합하며 배포하지 않습니다.
