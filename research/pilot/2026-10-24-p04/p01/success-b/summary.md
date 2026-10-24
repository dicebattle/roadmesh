# Pilot evidence / 파일럿 증거

Result / 결과: PASS

Scenario / 시나리오: `synthetic-scheduler`

Events / 이벤트: 7; SHA-256: `ed8ebc875052b4a7365d079d35265fa7867334c40d84b6626f402263f7fe7eb6`

Synthetic scheduler only: no routing engine, loaded graph, GPS, traffic speed, image or aggregation policy.
합성 일정 생성만 수행했습니다. 경로 엔진·그래프 로딩·GPS·교통속도·이미지·집계 정책은 실행하거나 적용하지 않았습니다.

Required assertions / 필수 검사:

- `seven-events`: PASS — Expectation matched. / 기대값과 일치합니다.
- `three-edge-events`: PASS — Expectation matched. / 기대값과 일치합니다.
- `last-marker-at-500`: PASS — Expectation matched. / 기대값과 일치합니다.

Evidence / 증거: [manifest.json](manifest.json), [events.json](events.json), [assertions.json](assertions.json).
