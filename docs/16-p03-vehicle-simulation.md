# P03 vehicle/GPS design / P03 차량·GPS 설계

Status: design only, to implement after P02 evidence passes. Main owns this design; Sol will implement. This adds geographic samples and independent traversal truth without changing P01 schema 0.1 or claiming noisy map matching has passed.

상태: 설계이며 P02 증거 통과 후 구현합니다. 메인이 설계하고 Sol이 구현합니다. P01 규격 0.1을 변경하지 않고 좌표 표본·독립 통과 정답을 추가하며 잡음 도로 매칭 성공을 주장하지 않습니다.

## Inputs / 입력

A separate versioned simulation spec references a completed P02 graph bundle and its graph identity. Validate manifest completion, input hashes and directed edge mapping before using geometry. Vehicles reference ordered fixture labels plus direction; reject unknown labels, disallowed car direction, discontinuous paths and explicit prohibited turns. Do not use an engine-selected path as independent truth.

별도 버전의 생성 규격이 완료된 P02 그래프 묶음·식별을 참조합니다. 지형 사용 전에 완료 목록·입력 해시·방향 대응을 검사합니다. 차량은 순서별 이름표·방향을 참조하며 미등록 도로·자동차 금지 방향·끊어진 경로·회전 금지를 거부합니다. 엔진이 고른 경로를 독립 정답으로 사용하지 않습니다.

The spec declares `simulation_id`, `graph_id`, `seed`, UTC start, bounded duration, sample interval, vehicle ID, departure offset, path, per-segment speed schedule, noise radius and half-open drop intervals `[start_ms,end_ms)`. All time/speed units are explicit. One sample identity is `(simulation_id, vehicle_id, scheduled_offset_ms)`; omitted observations retain an omission record rather than renumbering surviving samples. Fixture geometry, speed schedule and true positions remain distinct from observed coordinates.

규격에는 실행/그래프 ID·시드·UTC 시작·제한 기간·관측 간격·차량 ID·출발 시점·경로·구간별 속도 일정·잡음 반경·반열린 누락 구간을 둡니다. 시간·속도 단위를 명시합니다. 표본 ID는 실행·차량·예정 시각의 조합이고 누락 후 남은 표본을 다시 번호 매기지 않습니다. 도로 지형·속도 일정·참 위치와 관측 좌표를 구분합니다.

## Behavior and outputs / 동작과 출력

Interpolate distance along authored geometry with an explicit small-fixture distance model; document its error boundary. Generate clean truth first, then deterministic bounded coordinate perturbations and scheduled omissions. Seed each vehicle's perturbation stream independently using a versioned derivation so adding an unrelated vehicle does not alter existing samples. Reuse the existing seeded generator through a narrow wrapper; do not introduce hidden global randomness.

자체 지형을 따라 이동거리를 보간하며 작은 시험망용 거리 모델과 오차 범위를 명시합니다. 참 궤적을 먼저 생성한 다음 결정적 범위 잡음·예정 누락을 적용합니다. 버전을 가진 시드 파생으로 차량별 난수 흐름을 분리해 차량 추가가 기존 차량 표본을 바꾸지 않게 합니다. 기존 시드 생성기를 좁게 재사용하고 전역 난수에 의존하지 않습니다.

Outputs: `truth.json` (true positions and directed traversal entry/exit times), `observations.json` (stable IDs, UTC time, coordinates, declared accuracy, `source_class=SYNTHETIC`), `omissions.json`, assertions, bilingual summary and completion manifest. Bind to source commit, graph, spec, generator policy and output hashes. No real location history, authentication credentials, traffic publication or live classification is emitted. New-directory-only output and manifest-last rules continue.

출력은 참 좌표·방향별 진입/진출 시각, 관측 표본, 누락 목록, 검사, 이중 언어 요약, 완료 목록입니다. 커밋·그래프·규격·생성 정책·출력 해시에 연결합니다. 실제 위치 이력·인증정보·교통 게시·실시간 판정은 만들지 않습니다. 새 폴더·최종 목록 마지막 기록 규칙을 유지합니다.

## Acceptance before P04 / P04 전 통과 조건

- Independent simple-distance cases prove speed, entry/exit times, endpoint inclusion and zero-speed waiting. Define the exit-before-enter convention at shared segment boundaries.
  단순 거리의 독립 기대값으로 속도·진입/진출·끝점 포함·속도 0 대기를 검사하고 경계에서 이전 구간 종료 후 다음 구간 진입 규칙을 정합니다.
- Reordering vehicles leaves output unchanged; same spec/seed gives equal hashes; another seed changes only noise. Truth and traversal times remain unchanged by noise/drop faults.
  차량 순서를 바꿔도 출력은 같고 같은 시드의 해시는 같으며 다른 시드는 잡음만 바꿉니다. 잡음·누락이 참 궤적·통과 시각을 바꾸지 않아야 합니다.
- Scheduled omissions follow exact half-open boundaries; IDs of surviving observations remain stable. Noise remains within the declared bound; invalid paths/times fail before completed output.
  누락 경계를 정확히 지키고 남은 표본 ID는 유지합니다. 잡음 범위·잘못된 경로/시각 거부를 검사합니다.
- Main directly inspects a clean-commit generated bundle against hand-calculated fixtures before completion. P04 separately proves actual Valhalla map matching and ambiguous-observation exclusion.
  완료 전에 메인이 깨끗한 커밋의 생성 묶음을 직접 계산한 기대값과 대조합니다. 실제 Valhalla 매칭·모호한 관측 제외는 이후 P04에서 별도로 증명합니다.

Limits: controlled kinematic simulation, not driver behavior, sensor calibration, mobile battery/background execution or road accuracy. P02 graph integration must stay independently reproducible.

한계: 통제된 운동학적 모의실험이며 운전자 행동·센서 보정·모바일 배터리/백그라운드·도로 정확도 검증이 아닙니다. P02 그래프 연결은 별도로 재현 가능해야 합니다.
