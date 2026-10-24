# P01 and P14a implementation contract / P01·P14a 구현 계약

Design owner: main agent. Coding owner: Sol implementation subagent. This is the bounded implementation specification for the first local pilot increment; it does not implement P02 road building, P03 GPS simulation, or P12 process orchestration.

설계 담당은 메인 에이전트, 코딩 담당은 Sol 구현 하위 에이전트입니다. 이번 로컬 파일럿 첫 구현의 범위를 정하며 P02 도로 생성·P03 GPS 생성·P12 프로세스 운영은 구현하지 않습니다.

Language update: [TypeScript migration](14-typescript-migration.md) supersedes the original Python implementation choice. The behavioral contract below remains; runtime provenance now records Node.js.

언어 변경: [TypeScript 전환](14-typescript-migration.md)이 최초 Python 구현 선택을 대체합니다. 아래 행동 계약은 유지하고 런타임 출처는 Node.js로 기록합니다.

## P01 input / P01 입력

Use TypeScript with Node.js 22/24. Implement `tools/pilot_runner.ts`, `fixtures/pilot/`, and focused tests. Do not add a service, cloud dependency, or a broad plugin system.

TypeScript와 Node.js 22/24를 사용합니다. `tools/pilot_runner.ts`, `fixtures/pilot/`, 집중 테스트를 추가하며 서비스·클라우드 의존성·범용 플러그인 체계를 만들지 않습니다.

`ScenarioSpec 0.1` requires:

- `schema_version`: `0.1`; `scenario_id` and `fixture_graph_id`: lowercase identifiers.
- `seed`: integer 0..2^32-1; `start_time_utc`: UTC RFC3339 with `Z`, whole seconds; `duration_s`: integer 1..3600.
- `vehicles`: 1..100 records with `vehicle_id`, `departure_ms`, `step_ms`, `start_jitter_ms`, and `route_labels` (1..100 fixture labels). Time fields are integers; step is positive, others nonnegative. Maximum departure jitter plus the last edge time must fit within the scenario duration for every seed.
- `faults`: zero or more `{fault_id, at_ms, target_vehicle_id, kind}` records. P01 supports only `kind=marker`. Targets must exist and times must fit. These are scheduled markers, not actual injected failures.
- `assertions`: at least one `{assertion_id, kind, expected}` record. `event_kind_count` also requires `event_kind`. IDs are unique in each collection. Unknown object fields and malformed values are errors.

필수 필드는 위와 같습니다. 식별자는 소문자이고 시드·시간 값은 bool이 아닌 정수입니다. 차량별 출발 지연의 최댓값을 포함해 모든 이벤트가 시나리오 시간 안에 들어와야 합니다. 장애 항목은 이번 단계에서 실제 장애가 아닌 `marker` 일정만 지원합니다. 검사 항목은 하나 이상이며, 중복 ID·없는 차량 참조·잘못된 값·알 수 없는 필드는 거부합니다.

Reject duplicate JSON keys, NaN/Infinity, unsupported scenario versions and oversized input. Bound scenario bytes to 1 MiB and event count to 20,000. Never execute commands or load URLs from scenario data. A fixture graph identifier is a reference for future integration; P01 does not claim to load that graph.

JSON 키 중복·NaN/Infinity·미지원 버전·1MiB 초과 입력·20,000개 초과 이벤트를 거부합니다. 입력의 명령이나 URL을 실행하지 않습니다. 시험 그래프 ID는 후속 연결용 참조이며 P01이 그 그래프를 실제로 읽었다고 표시하지 않습니다.

## Deterministic scheduling / 결정적 일정 생성

For vehicles sorted by ID, a local Python-compatible MT19937 adapter draws integer departure jitter in `[0, start_jitter_ms]`. Emit one `vehicle_departure`, then one `fixture_edge_enter` for each route label at departure plus `index * step_ms`. Emit each `fault_marker` at its declared time. Sort by `(offset_ms, kind priority, entity ID, ordinal)`, where priority is departure, edge enter, then fault marker; assign stable sequence IDs after sorting. Use an injected integer-millisecond event clock that refuses backward movement.

차량 ID 순서로 로컬 난수 생성기가 설정 범위의 정수 출발 지연을 뽑습니다. 출발 이벤트 하나와 각 도로 이름표 진입 이벤트를 설정 간격으로 만들고, 장애 표식은 지정 시각에 만듭니다. 시각·종류 우선순위·대상 ID·순번으로 정렬하며 종류는 출발→도로 진입→장애 표식 순서입니다. 이후 고정 이벤트 ID를 붙입니다. 정수 밀리초 단위 가상 관측시계는 역행을 거부합니다.

Events include type, entity, offset, UTC event time, sequence, and optional fixture label/fault ID. Canonical compact sorted-key JSON of the events is hashed with SHA-256. Run UUIDs, wall-clock start time, output path and host identity never enter this event digest. Reordering vehicle/fault declarations must not change the stream. No geographic coordinates or estimated traffic speed are produced.

이벤트에는 종류·대상·경과시간·UTC 관측시각·순번과 필요한 도로 이름표/장애 ID를 넣습니다. 키 정렬한 압축 JSON을 SHA-256으로 해시하며 실행 UUID·현실 시작시각·출력 경로·호스트 정보는 해시에 넣지 않습니다. 차량·장애 선언 순서를 바꿔도 이벤트는 같아야 합니다. GPS 좌표나 교통속도는 만들지 않습니다.

Concrete event fields are `kind`, `entity_id`, `offset_ms`, `event_time_utc`, `sequence` (one-based), with `fixture_label` or `fault_id` where relevant. Fault tie order derives from sorted fault IDs. Canonical event bytes use UTF-8 of JSON with `ensure_ascii=True`, `sort_keys=True`, and separators `(',', ':')`.

실제 이벤트 필드는 위와 같으며 순번은 1부터 시작합니다. 장애 표식의 동률 순서는 정렬한 장애 ID로 정합니다. 해시 입력은 위 JSON 직렬화 옵션을 적용한 UTF-8 바이트로 고정합니다.

## Assertions and reports / 판정과 보고서

Supported assertions are `event_count`, `event_kind_count`, `last_event_ms`, and `event_digest`. Expected counts/times are nonnegative integers; a digest is 64 lowercase hex characters. Unknown assertion kinds are recorded as `SKIPPED`, never silently passed. Every assertion in P01 is required. Empty assertions are invalid. A false expectation is `FAIL`.

지원 검사는 전체 이벤트 수·종류별 이벤트 수·마지막 이벤트 시각·이벤트 해시입니다. 수·시간의 기대값은 음수가 아닌 정수이고 해시는 소문자 16진수 64자리입니다. 모르는 검사 종류는 통과로 숨기지 않고 `SKIPPED`로 기록합니다. P01의 검사는 모두 필수이며 빈 검사는 입력 오류, 틀린 기대값은 실패입니다.

CLI: `npm run --silent pilot -- SCENARIO --output NEW_DIRECTORY` after `npm ci && npm run build`. Exit `0`: all required assertions pass. Exit `1`: any assertion fails or is skipped. Exit `2`: invalid input, arguments or output write error. Validate and compute before writing; refuse any existing output directory, including symlinks. Partial output after an I/O error is incomplete evidence, never a success. Do not overwrite earlier runs.

CLI 형식은 위와 같으며 모든 검사 통과는 0, 실패·생략은 1, 입력·인자·출력 오류는 2입니다. 쓰기 전에 입력과 계산을 확인하고 심볼릭 링크를 포함한 기존 출력 경로는 거부합니다. 입출력 오류 후 일부 파일만 남으면 미완료 증거이며 성공으로 취급하지 않습니다. 이전 실행 결과는 덮어쓰지 않습니다.

Each output contains `manifest.json`, `events.json`, `assertions.json`, and English/Korean `summary.md`. Write the final manifest last, only after all other evidence files are written, so an interrupted write cannot leave a completed PASS manifest. Record full source commit, dirty state, Node.js/platform, scenario file SHA, event SHA, unique run ID and timestamps. If source identity is unavailable, record it as unknown rather than clean. Identify `engine_executed=false`, unresolved graph, no image digests and no applied aggregation policy. Evidence references are relative to the run directory. Human guidance is bilingual; machine keys stay English.

결과에는 실행 목록·이벤트·검사 JSON과 영어/한국어 요약을 담습니다. 완성 실행 목록은 다른 모든 증거 저장 후 마지막에 기록하여 저장 중단 때 완료된 성공 목록만 남지 않게 합니다. 전체 소스 커밋·미커밋 상태·Node.js/플랫폼·입력/이벤트 해시·고유 실행 ID·시각을 기록합니다. 소스를 확인하지 못하면 깨끗한 상태라고 가정하지 않고 미확인으로 둡니다. 엔진 미실행·그래프 미연결·이미지/집계 정책 없음도 명시합니다. 증거 참조는 실행 폴더 기준 상대경로로 적고, 사람용 안내만 이중 언어로 제공하며 키는 영어로 유지합니다.

## P14a continuous checks / P14a 지속 검사

GitHub Actions triggers on branch pushes and pull requests without path filters that could leave a required check pending. Run Node.js 22 and 24, with a stable aggregate check named `Required checks`. It must fail when a prerequisite job fails, is cancelled, or is skipped. Permissions are `contents: read`; no deployment secrets, `pull_request_target`, automatic comments or repository writes.

GitHub Actions는 작업 브랜치 푸시와 PR에서 실행하며 필수 검사를 대기 상태로 남길 경로 필터를 두지 않습니다. Node.js 22·24를 검사하고 고정 종합 검사 이름은 `Required checks`입니다. 선행 검사 실패·취소·생략 때 종합 검사도 실패해야 합니다. 저장소 읽기 권한만 사용하며 배포 비밀정보·특권 PR 이벤트·자동 댓글·저장소 쓰기는 사용하지 않습니다.

Pin reviewed action revisions: checkout v4 `11d5960a326750d5838078e36cf38b85af677262`; setup-node v4 `49933ea5288caeca8642d1e84afbd3f7d6820020`; upload-artifact v4 `ea165f8d65b6e75b540449e92b4886f43607fa02`. These revisions were resolved through official repository refs on 2026-10-24. Upload small synthetic evidence even after test failure, retain seven days, fail if expected evidence is missing, and time-limit jobs.

2026-10-24 공식 저장소 참조에서 확인한 위 Actions 커밋으로 고정합니다. 검사 실패 시에도 작은 합성 증거를 보존하고 보관은 7일로 제한합니다. 필요한 증거가 없으면 오류로 처리하고 작업 시간도 제한합니다.

CI runs the existing corpus tests and P01 tests, then direct CLI scenarios: two identical seeded successes with equal event digests; a deliberate failed assertion (expected exit 1); an unsupported assertion (expected exit 1/SKIPPED); invalid input (expected exit 2). A verification wrapper must itself return nonzero if any expected behavior is violated, rather than swallowing failures with `|| true`. Keep successful fixture expectation independently authored.

CI는 기존 자료 검사와 P01 테스트 후 CLI를 직접 검사합니다. 같은 시드의 성공 두 번과 동일 해시, 의도적 실패의 종료코드 1, 미지원 검사의 생략·종료코드 1, 잘못된 입력의 종료코드 2를 확인합니다. 검증 도구는 기대한 동작이 깨지면 실패해야 하며 무조건 오류를 무시하지 않습니다. 정상 예제의 기대값은 실행 결과를 그대로 복사해 만들지 않습니다.

After the workflow succeeds on the pushed implementation SHA, inspect its check names/app identity and artifacts. Then add the actual `Required checks` context to existing main protection without removing its other restrictions. This does not merge the branch or make P02/P14b complete.

푸시한 구현 SHA에서 워크플로가 성공한 뒤 실제 검사 이름·앱 식별·결과물을 확인하고, 기존 보호를 유지하며 실제 `Required checks`를 main 필수 검사에 추가합니다. 브랜치 병합이나 P02/P14b 완료를 의미하지 않습니다.

## Acceptance / 통과 기준

Focused tests cover deterministic replay, different seeds, declaration reordering, clock reversal, malformed values, unknown references, limits, output preservation, correct exit codes, source provenance and bilingual reports. Main-agent direct verification uses a clean committed source and inspects report content, not only process exit. Hosted CI and downloaded artifacts must agree with the tested commit. Record actual limits and next work in the wiki.

집중 테스트는 동일/다른 시드·선언 순서·시계 역행·잘못된 값·없는 참조·한도·출력 보존·종료코드·소스 식별·이중 언어 보고서를 다룹니다. 메인 에이전트는 커밋된 깨끗한 소스에서 직접 실행하고 종료코드뿐 아니라 보고서를 읽습니다. 원격 CI와 내려받은 결과물도 해당 커밋에 대응해야 합니다. 실제 한계와 다음 작업을 위키에 기록합니다.
