# Route progress and replay / 경로 진행·재생

Implemented NAV-02: pure TypeScript projection/state machine plus local authored replay and existing MapLibre markers. Current guidance is bound to the exact route request/version. Low accuracy, time/order faults, jumps and road ambiguity withhold current metrics; departure/rejoin/arrival use consecutive usable samples. No device GPS or automatic rerouting. [Contract](../../docs/37-nav02-route-progress.md) · [actual438-case report](../../research/pilot/2026-10-25-nav02/report.md).

순수 TypeScript 투영·상태 모듈과 자체 합성 재생·기존 지도 표시를 구현했습니다. 안내를 정확한 요청/버전에 연결하고 오차·시간/순서·도약·도로 모호함에서는 현재 수치를 보류합니다. 이탈·복귀·도착은 연속 유효 표본으로 판단하며 단말 GPS·자동 재탐색은 후속입니다. Node22 전체320개·새 통합438개와 원문/내장 브라우저를 직접 확인했습니다.
