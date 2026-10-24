# Integrated simulation and evidence delivery / 통합 시뮬레이션·증거 전달

Status: active implementation plan, 2026-10-24. The continuing goal is the complete P01–P14 local pilot, periodic whole-implemented-system simulations, captured test reports, and an English/Korean README with current demo recordings. P03 plus an evidence viewer is the next increment, not a redefinition of the complete goal. Main designs/reviews; Sol implements. No deployed production navigation is claimed.

상태: 2026-10-24 진행 중인 구현 계획입니다. 지속 목표는 P01~P14 전체 로컬 파일럿, 구현된 전체 시스템의 주기적 통합 시뮬레이션, 캡처한 검사 보고서, 최신 데모 영상이 있는 영문·국문 README입니다. 이번 다음 단계는 P03·증거 화면이며 전체 목표를 축소하지 않습니다. 메인이 설계·검토하고 Sol이 구현합니다. 운영 내비게이션 배포를 주장하지 않습니다.

## P03 executable contract / P03 실행 계약

`SimulationSpec 0.1` fields: `schema_version`, `simulation_id`, `fixture_id`, `graph_id`, `seed` (uint32), `start_time_utc` (whole-second UTC Z), `duration_ms` (1..300000), `sample_interval_ms` (100..5000), `vehicles` (1..20). Each vehicle has `vehicle_id`, `departure_ms`, `path` (1..20 `{label, forward}`), `speed_profile` (1..20 `{duration_ms, speed_mps}`), `noise_radius_m` (0..20), `drop_intervals` (`{start_ms,end_ms}` relative to simulation time). Speed is 0..30 m/s, durations are positive integers. Profiles begin at departure, are piecewise constant, include waiting at speed zero and must complete the path within the scenario. IDs are unique; unknown fields, malformed numbers, illegal direction/turns, disconnected paths, overlapping drops and incomplete travel fail before completion evidence.

규격은 위 필드와 한도를 사용합니다. 차량별 경로는 이름표·방향, 속도 일정은 출발 시점부터 적용하는 구간별 일정입니다. 속도 0은 대기이며 전체 경로가 기간 안에 완료돼야 합니다. ID 중복·미지원 필드·숫자 오류·역주행/금지 회전·경로 단절·겹친 누락·미완료 이동은 완료 증거 전에 거부합니다.

The supplied P02 bundle must be PASS with verified cleanup. Recompute fixture/XML/config/PBF/tile hashes and whole graph identity; verify every used edge mapping against original fixture geometry, direction, OSM way and car access. Trust no arbitrary filesystem path from JSON; resolve tile/evidence paths within the supplied bundle, reject escapes/symlinks. Edge IDs are strings. No engine-generated path is used to choose the simulator's independent truth.

P02 묶음은 통과·정리 확인 상태여야 합니다. 시험자료·XML·설정·PBF·타일 해시와 전체 그래프 식별을 다시 계산하고 사용하는 구간 대응을 원본 지형·방향·도로·자동차 접근과 대조합니다. JSON 경로는 묶음 안으로 한정하고 경로 탈출·심볼릭 링크를 거부합니다. 구간 ID는 문자열이며 정답 경로를 엔진의 선택 결과에서 가져오지 않습니다.

Distance model: local equatorial equirectangular coordinates, radius 6371008.8 m, x=longitude_radians*R and y=latitude_radians*R. Only the authored tiny-city equatorial fixture is supported by this first policy; reject other fixture IDs/geometry beyond the documented local bounds. This is a controlled simulator, not a general geodesic library. Reference 0.001 degrees at the equator = 111.1950802335329 m. Continuous integration of the speed profile determines segment crossings; serialize times as integer milliseconds by rounding up once at each event. Exit precedes next entry at the same boundary. Sample on `departure + k*interval` while moving/waiting, and add arrival once if off-grid. No post-arrival duplicates.

거리 모델은 반지름 6371008.8m의 적도 국소 등거리 좌표이며 위 식을 적용합니다. 첫 정책은 자체 tiny-city 적도 시험망에 한정하고 다른 ID·국소 범위 밖 지형을 거부합니다. 범용 측지 라이브러리가 아닙니다. 속도 일정을 연속 적분해 통과 시각을 구하고 직렬화 때 밀리초 단위 올림을 적용합니다. 경계에서는 진출 후 다음 진입이며, 출발 기준 일정 간격 표본과 필요 시 도착 표본 하나를 추가합니다. 도착 후 중복 표본은 없습니다.

Generate truth before noise/drop. Each vehicle RNG seed is the first uint32 big-endian of SHA-256 of canonical `{policy:"gps-noise-v1",seed,vehicle_id}`; reuse the existing MT19937 adapter. Uniform disk noise uses two integer draws 0..1000000, radius=sqrt(u)*noise_radius_m, angle=2*pi*v. Round coordinates to 9 decimal degrees; declared accuracy is at least 0.01 m. Use a 0.001 m numeric tolerance when checking the noise bound. Consume draws for every scheduled sample, including dropped ones, so drop changes cannot alter surviving observations. Vehicle declaration order or an unrelated vehicle must not change existing streams. Sample ID is `simulation_id:vehicle_id:offset_ms`. Drop intervals are half-open; record omissions with the same IDs. Truth hashes exclude noise/drop policy so those faults cannot change truth.

잡음·누락 전에 정답을 생성합니다. 위 버전 시드 파생과 기존 난수 어댑터를 사용하고 균일 원판 잡음을 적용합니다. 좌표는 소수 9자리로 반올림하며 정확도 표시는 최소 0.01m, 잡음 경계 검사 허용 오차는 0.001m입니다. 누락 표본도 난수 추출을 소비해 남은 관측이 바뀌지 않게 합니다. 차량 순서·다른 차량 추가도 기존 흐름을 바꾸지 않아야 합니다. 표본 ID·반열린 누락 구간·누락 기록을 유지하며 잡음/누락 정책은 정답 해시에 포함하지 않습니다.

CLI: `npm run simulate -- SPEC --graph P02_BUNDLE --output NEW_DIRECTORY`. Output `truth.json` = `{samples, traversals}`; sample fields `{sample_id,vehicle_id,offset_ms,event_time_utc,longitude,latitude,edge_id}`, traversal fields `{vehicle_id,edge_id,label,forward,entered_at_ms,exited_at_ms,distance_m}`. `observations.json` contains sample identity/time/coordinates plus `accuracy_m,source_class:"SYNTHETIC"`; `omissions.json` contains sample identity/time plus `reason:"SCHEDULED_DROP"`. Do not leak truth edge IDs into observations. Add bilingual summary/assertions and manifest last with source, graph, spec/output hashes and policy version. Exit 0/1/2 follows existing evidence conventions. Existing paths are refused.

실행 형식·출력 필드는 위와 같습니다. 관측에는 정답 구간 ID를 넣지 않고 합성 표시를 명시합니다. 소스·그래프·규격/출력 해시·정책과 이중 언어 요약·검사를 남기고 완료 목록은 마지막에 기록합니다. 종료코드 0/1/2와 기존 출력 거부 규칙은 유지합니다.

## Whole implemented-system command / 구현된 전체 시스템 명령

`npm run simulation:check -- --output NEW_DIRECTORY` performs a fresh integrated run, not a link to earlier passing tests: corpus CLI with synthetic quota refusal; P01 direct replay/failure/skip checks; fresh P02 Docker graph build and real routing/access checks; P03 seeded simulation on that exact graph; replay plus fault-invariance comparisons. Preserve stage outputs under `corpus/`, `p01/`, `graph/`, `simulation/`, `replay/`. P01 markers remain schedule checks, not geographic data. P02 and P03 share the actual graph identity. Ensure parent output and children exist only in new paths. Any missing/failed stage prevents overall PASS/completion manifest. Cleanup checks include owned engine containers. Record actual stage duration and source identity. This is an incremental P12 harness, not P12's complete fault matrix.

이 명령은 과거 성공 결과를 연결하는 대신 매번 실제 자료 검사·P01 실행·P02 Docker 그래프 생성과 경로 검사·동일 그래프의 P03 생성·재생/장애 불변성 비교를 수행합니다. 하위 폴더에 단계별 원본 결과를 보존합니다. P01 표식은 일정 검사로 유지하고 지리 자료로 꾸미지 않습니다. P02·P03은 실제 그래프 ID를 공유하며 누락/실패 단계가 있으면 전체 완료를 금지합니다. 소유 컨테이너 정리·단계별 실제 시간·소스 식별을 기록합니다. P12 실행 기반의 일부이며 전체 장애 행렬 완료는 아닙니다.

Authored demonstration: one clean baseline vehicle on AB→BC; another baseline vehicle with 3 m noise and drop interval [15000,25000); one vehicle on AD→DE→EF→FC with initial 5000 ms zero-speed wait, then 10 m/s. Scenario duration 120000 ms, sample interval 1000 ms, seed 7, start 2026-01-01T00:00:00Z. A clean/noisy paired comparison must prove identical truth. Add invalid path and tampered bundle checks without relabeling them as successful simulations. Future P04–P14 stages must extend this command rather than replace prior coverage.

시연은 AB→BC의 깨끗한 차량, 같은 경로의 3m 잡음·15~25초 누락 차량, 상단 경로의 5초 대기 후 10m/s 차량입니다. 기간 120초·간격 1초·시드7·고정 시작시각을 사용합니다. 깨끗한/잡음 비교에서 정답 불변을 증명하고 잘못된 경로·변조 묶음은 거부로 기록합니다. 이후 모듈은 기존 범위를 유지하며 통합 명령을 확장합니다.

## Report data contract / 보고 화면 자료 계약

The integration command writes `report-data.json` with:

- `schema_version:"0.1"`, `source:{commit,dirty}`, `graph_id`, `generated_at_utc`, `implementation_sha256`.
- `summary:{status,assertions_passed,assertions_total,vehicle_count,observation_count,omission_count,duration_ms}`.
- `stages:[{id,name_en,name_ko,status,evidence_path,duration_ms}]`.
- `roads:[{label,edge_id,forward,car_access,coordinates:[[longitude,latitude],...]}]` (one forward geometry per authored road for display).
- `vehicles:[{vehicle_id,truth:[{offset_ms,longitude,latitude,edge_id}],observations:[{offset_ms,longitude,latitude,accuracy_m}],omissions:[{offset_ms,reason}],traversals:[{label,edge_id,forward,entered_at_ms,exited_at_ms,distance_m}]}]`.
- `assertions:[{assertion_id,status,message_en,message_ko,expected,actual,evidence_path}]` and `limitations:[{message_en,message_ko}]`.

위 필드를 고정해 실행기와 화면 구현이 병렬 작업할 수 있게 합니다. 화면은 실제 입력만 표시하고 누락·실패를 성공이나 임의 숫자로 채우지 않습니다. `duration_ms`는 시뮬레이션 시간이며 단계별 현실 실행시간과 구분합니다.

A pure `renderSimulationReport(data): string` in `tools/simulation_report.ts` returns a self-contained offline HTML with CSS/JS and escaped embedded JSON. It must not read current Git state or rewrite provenance. The backend calls it after computing report data. Missing data produces a clear error, never demo placeholders. A separate `report:serve -- DIRECTORY` loopback server has a 15-minute default timeout and explicit close behavior, bounded to the supplied directory. No external maps/fonts/analytics/API keys.

위 순수 렌더 함수는 외부 연결 없는 HTML을 반환하고 입력 JSON을 안전하게 넣습니다. 현재 Git 상태로 과거 출처를 다시 쓰지 않습니다. 자료 누락 때 명확한 오류를 표시하고 가짜 시연 자료로 채우지 않습니다. 별도 로컬 서버는 지정 폴더 안에서만 제공하고 기본15분 제한·종료 책임을 가집니다. 외부 지도·서체·분석·키는 사용하지 않습니다.

## Visual and media plan / 화면·미디어 계획

Audience: contributors checking what actually ran. Signature: a large fictional-road replay with true trajectories, observed GPS scatter and visible missing intervals; an adjacent evidence ledger names each completed stage. Palette: paper #F5F8FC, ink #172D46, road #9BAEC2, truth #1264B8, observed #D96B28, success #23775D. Type: Avenir Next/Trebuchet MS for restrained display, system sans for body/Korean, ui-monospace for time and identifiers. Map dominates; avoid decorative metric-card grids. Controls: play/pause, time scrubber, playback speed, vehicle selection, truth/observed toggles and EN/한국어. Keyboard focus/reduced motion/mobile layout required. Do not label these observations as matched traffic. This viewer is test evidence, not the complete P11 navigation client.

대상은 실제 실행을 확인하는 기여자입니다. 큰 가상 도로 재생에 정답·관측 GPS·누락 구간을 표시하고 옆에 실행 단계 증거 목록을 둡니다. 위 색·서체를 사용하며 지도 중심으로 구성합니다. 재생/일시정지·시간·속도·차량·정답/관측 표시·언어를 조작할 수 있게 하고 키보드·동작 줄이기·모바일을 지원합니다. 관측을 매칭된 교통정보로 표시하지 않습니다. 완전한 P11 내비게이션 화면이 아닌 검사 증거 화면입니다.

Inspect the actual generated report in the in-app browser. Capture screenshots and record playback as video; video capture may use a single owned Playwright session if unavailable in-app, then close/verify it. Produce a compact GIF preview linked to MP4, with the same recording in both READMEs. Save media/report metadata including source commit, implementation fingerprint, report hash, capture method and asset hashes. Refresh after implementation changes; a `media:check` gate detects stale fingerprints or changed/missing assets. The fingerprint covers tracked runtime tools, fixtures, infra, package manifests and viewer sources; documentation-only changes do not invalidate a recording. Never replace a recording with a fabricated animation labeled as a recorded run.

실제 생성 보고서를 내장 브라우저로 확인하고 화면과 재생 영상을 캡처합니다. 내장 영상 녹화가 없을 때만 소유 Playwright 세션 하나로 녹화하고 종료를 검증합니다. 작은 GIF 미리보기와 MP4를 두 README에 연결하고 커밋·구현 지문·보고서 해시·캡처 방식·파일 해시를 남깁니다. 구현 변경 후 갱신하며 검사 명령이 오래된 지문·자료 누락/변경을 감지하도록 합니다. 문서만 바뀐 경우 영상은 그대로 유효합니다. 조작한 애니메이션을 실제 실행 녹화로 표시하지 않습니다.

## Independent integrated expectations / 통합 실행의 독립 기대값

The main-authored fixture calculation gives 222.3901604670658 m per 0.002-degree segment. At 10 m/s, the two baseline cars exit AB at 22240 ms and arrive at 44479 ms. With the upper car's initial five-second wait, its four exits are 27240, 49479, 71718 and 93957 ms. The demo produces 187 truth samples, 177 observations, ten omissions and eight traversals. The noisy car omits offsets 15000..24000 in 1000 ms steps and observes 25000. These are independent acceptance values from the declared fixture/model, not copied from simulator output. Check them in the actual integrated report.

메인이 지형·모델로 독립 계산한 0.002도 구간 거리는 222.3901604670658m입니다. 기본 차량은 위 진출·도착 시각, 상단 대기 차량은 위 네 시각에 진출합니다. 전체 정답187·관측177·누락10·통과8이며 누락은15~24초이고25초는 관측합니다. 생성기 출력을 복사한 값이 아니며 실제 통합 보고서에서 검사합니다.

Call the existing P02 `runGraph` implementation in the integration process, preserving its real Docker commands, timeouts and `finally` cleanup. Killing a separately timed-out Node wrapper could skip that cleanup. Corpus, P01 and P03 still execute actual CLIs; standalone P02 remains available. Check each child manifest's source identity against the parent and recompute P03 output hashes before consuming reports. This is composition of real modules, not replacement with mocks.

통합 프로세스에서 기존 P02 실행 함수를 호출해 실제 Docker 명령·제한시간·정리를 유지합니다. 별도 Node 포장 프로세스를 제한시간으로 종료하면 정리를 건너뛸 수 있기 때문입니다. 자료·P01·P03은 실제 CLI를 실행하고 개별 P02도 유지합니다. 하위 목록의 소스가 부모와 같은지, P03 출력 해시가 실제 파일과 같은지 확인합니다. 모듈을 실제 조합하며 모의 응답으로 대체하지 않습니다.
