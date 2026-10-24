# Local pilot design / 로컬 파일럿 설계

Status: P01's bounded event runner and P14a's workflow are implemented; verification is recorded in the [module page](../wiki/modules/pilot-runner.md) and work log. [P02](../wiki/modules/test-graph.md) is also implemented and verified; [P03](../wiki/modules/vehicle-simulation.md) and current-module replay are locally verified; P04 is locally and on hosted Docker verified ([report](../research/pilot/2026-10-24-p04/report.md)); P05–P10, full P11/P12, P13 and the complete P14b matrix remain unfinished. No production deployment, real driving trial, or cloud reliability claim is implied.

상태: P01 범위의 이벤트 실행기와 P14a 워크플로를 구현했고 검증은 [모듈 문서](../wiki/modules/pilot-runner.md)와 작업 기록에 남깁니다. [P02](../wiki/modules/test-graph.md)도 구현·검증됐으며 [P03](../wiki/modules/vehicle-simulation.md)·현재 모듈 재생도 로컬 검증됐으며 P04도 로컬·원격Docker 검증됐으며([보고서](../research/pilot/2026-10-24-p04/report.md)) P05~P10·P11/P12 전체·P13·P14b 전체 행렬은 미완료입니다. 운영 배포·실주행 시험·클라우드 안정성 검증을 뜻하지 않습니다.

## 1. What completion means / 완료의 의미

A local pilot is complete when a reproducible test drives synthetic vehicles through a known road network, matches their GPS, publishes verified traffic, changes a route on two real routing-engine processes, expires the traffic, recovers from injected failures, and produces a report tied to the tested commit and inputs.

알려진 도로망에서 모의 차량을 움직여 GPS를 매칭하고, 검증한 교통정보를 배포하고, 실제 경로 엔진 프로세스 두 대의 경로를 바꾸고, 교통정보 만료·장애 복구까지 확인한 뒤 검사한 커밋·입력과 연결된 보고서를 만들면 로컬 파일럿 완료입니다.

Use three evidence classes; passing one never counts as passing another.

증거를 세 종류로 구분하며, 한 종류의 성공을 다른 종류의 성공으로 세지 않습니다.

| Class / 종류 | Proves / 증명하는 것 | Does not prove / 증명하지 않는 것 |
| --- | --- | --- |
| Synthetic pipeline / 합성 처리 흐름 | Deterministic behavior on controlled inputs / 통제한 입력에서의 결정적 동작 | Korean road quality or human driving behavior / 한국 도로 품질·실제 운전 행동 |
| Real engine integration / 실제 엔진 연결 | Valhalla consumes the graph and speed files and changes costs/routes / Valhalla가 그래프·속도 파일을 읽고 비용·경로를 바꿈 | Accuracy of crowd observations / 참여자 관측의 사실성 |
| Geographic evaluation / 실제 지역 평가 | Behavior on reviewed public-map cases / 검토된 공개 지도 사례에서의 동작 | National coverage, mobile battery, cloud performance / 전국 품질·모바일 배터리·클라우드 성능 |

The existing 100-route/100-match requirement remains a **geographic evaluation** gate. It no longer blocks work on a synthetic local pilot. Synthetic inputs stay excluded from the validator's real-road quota. No fake review labels or lowered quotas are needed.

기존 경로 100개·매칭 100개 조건은 **실제 지역 평가**의 통과 기준으로 유지합니다. 합성 로컬 파일럿 구현의 선행 조건에서는 분리합니다. 합성 입력은 계속 실제 도로 사례 수에서 제외하므로 검토 상태를 꾸미거나 기준 수를 낮추지 않습니다.

## 2. Module inventory / 필요한 모듈

These are code and test boundaries, not fourteen separate network services. Reuse one local gateway, one worker process, PostgreSQL, an artifact HTTP server, and two routing nodes where possible. Introduce additional processes only when a fault-isolation test needs them.

아래는 코드·검사 책임의 구분이며 서버를 각각 따로 만들겠다는 뜻이 아닙니다. 가능한 한 수집·경로 중계 서버 하나, 작업 처리 프로세스 하나, PostgreSQL, 자료 배포 HTTP 서버, 경로 노드 두 개를 재사용합니다. 장애 분리 검증에 필요할 때만 프로세스를 추가합니다.

| ID | Module / 모듈 | Owned behavior / 책임 | First direct proof / 첫 직접 검증 |
| --- | --- | --- | --- |
| P01 | Scenario and evidence contract / 시나리오·증거 계약 | Validate scenarios, fixed seed, event-time clock, run identity, result states / 시나리오 검사·난수 시드·관측 시각·실행 ID·결과 상태 | Same input gives same event digest; malformed input fails / 동일 입력의 이벤트 해시 일치·잘못된 입력 거부 |
| P02 | Test road graph builder / 시험 도로 그래프 생성 | Tiny OSM fixture, pinned Valhalla build, graph manifest and edge mapping / 작은 OSM 시험자료·고정 Valhalla·그래프 목록·도로 구간 대응 | Real engine finds legal paths and refuses forbidden turns / 실제 엔진의 정상 경로·금지 회전 거부 |
| P03 | Vehicle and GPS simulator / 차량·GPS 생성 | Known trajectories, vehicle identities, congestion, noise and gaps / 정답 궤적·차량 식별·정체·GPS 오차·누락 | Known ground truth survives replay; faults occur exactly as scheduled / 정답 보존·설정한 시각의 장애 발생 |
| P04 | Map-matching adapter / 도로 매칭 연결 | Valhalla matching, cross-batch context, directed traversals / Valhalla 매칭·배치 간 문맥·방향별 통과 기록 | Match known edges; ambiguous observations are excluded / 정답 구간 대응·불확실 관측 제외 |
| P05 | Ingestion and durable work queue / 수집·영속 작업 대기열 | Validation, acceptance, leases, retries, deduplication / 입력 검사·접수·작업 임대·재시도·중복 제거 | Crash after persistence and replay without lost or double-counted work / 저장 후 중단·재시도에도 유실·중복 반영 없음 |
| P06 | Traffic aggregation / 교통정보 집계 | Event-time windows, contribution limits, travel times, expiry / 관측시간 창·기여 제한·통과시간·만료 | Five distinct contributors qualify; repeated points from one do not / 서로 다른 기여자 5명과 1명의 반복 관측 구분 |
| P07 | Snapshot publication and trust / 교통정보 게시·신뢰 | Signed manifests, immutable files, freshness, publisher permissions / 서명 목록·불변 파일·신선도·게시자 권한 | Altered, expired, wrong-graph and replayed snapshots rejected / 변조·만료·다른 지도·오래된 순번 거부 |
| P08 | Valhalla traffic compiler / Valhalla 속도 파일 생성 | Convert eligible traffic into graph-specific binary records / 유효 교통정보를 그래프별 바이너리 형식으로 변환 | Real route cost/path changes; expiry restores baseline / 실제 경로 비용·경로 변화 및 만료 후 기본값 복구 |
| P09 | Routing node lifecycle / 경로 노드 수명주기 | Download, verify, prepare, activate, drain old requests / 다운로드·검증·준비·활성화·기존 요청 종료 | Version switch during requests produces no mixed-version response / 요청 중 버전 교체에도 버전 혼합 없음 |
| P10 | Route gateway and node selection / 경로 중계·노드 선택 | Version-aware dispatch, deadlines, one retry, fallback labels / 버전별 선택·시간 제한·한 번 재시도·대체 계산 표시 | Kill node A; node B serves the correct version or explicit failure / A 중단 시 B가 동일 버전 응답 또는 명시적 실패 |
| P11 | Pilot viewer and route client / 파일럿 화면·경로 클라이언트 | Synthetic vehicle replay, routes, traffic age, bilingual warnings / 모의 차량 재생·경로·정보 나이·이중 언어 경고 | Browser shows route change, stale data and unavailable routing correctly / 브라우저에서 경로 변경·만료·서버 없음 확인 |
| P12 | Whole-system scenario runner / 전체 시나리오 실행기 | Compose lifecycle, process/network faults, assertions, report assembly / 실행 환경 수명주기·프로세스/통신 장애·판정·보고서 | One command runs the scenarios and leaves no owned services behind / 한 명령으로 검증 후 자신이 띄운 서비스 정리 |
| P13 | Cloudflare local adapter parity / Cloudflare 로컬 구현 비교 | Run the same core cases through the local Worker/DO/queue environment / 같은 핵심 사례를 로컬 Worker·DO·큐 환경으로 실행 | Equal canonical outputs for supported cases; differences explicit / 지원 사례의 표준 결과 일치·차이 명시 |
| P14 | Continuous checks and evidence publication / 지속 검사·증거 보존 | Fast checks, engine integration jobs, retained reports, stable check names / 빠른 검사·엔진 통합 검사·보고서 보존·고정 검사 이름 | A deliberately failing assertion fails the job; no skipped check reported as passed / 실패 조건이 검사 실패로 이어지고 생략은 통과로 표시하지 않음 |

Existing module: `tools/evaluation_corpus.ts` is **P01's geographic-input companion**, not the scenario runner. Reuse its source/review separation; add a separate scenario contract rather than making a synthetic run satisfy its real-road quota.

기존 `tools/evaluation_corpus.ts`는 **P01과 함께 사용하는 실제 지역 입력 검사기**이며 시나리오 실행기는 아닙니다. 출처·검토 상태 구분을 재사용하되 합성 시나리오 계약은 별도로 만들어 실제 도로 기준을 우회하지 않습니다.

## 3. Contracts before implementation / 구현 전 계약

### Scenario and run / 시나리오와 실행

`ScenarioSpec`: `schema_version`, `scenario_id`, `seed`, `fixture_graph_id`, `start_time_utc`, `duration_s`, `vehicles`, `faults`, `assertions`. Vehicles refer to **fixture road labels**, not invented Valhalla edge IDs. A graph-specific mapping resolves those labels after P02 builds the graph. No production addresses, live credentials, or real driver traces belong in this contract.

`ScenarioSpec`은 위 필드를 가지며, 차량 경로는 임의로 만든 Valhalla 내부 번호 대신 **시험 도로의 이름표**를 참조합니다. P02가 그래프를 생성한 뒤 이름표와 실제 구간 ID를 대응시킵니다. 운영 주소·실제 인증정보·실주행 궤적은 포함하지 않습니다.

`RunManifest`: `run_id`, `scenario_sha256`, `source_commit`, `dirty_tree`, `dependency_versions`, `image_digests`, `graph_id`, `aggregation_policy`, `host_architecture`, `resource_limits`, `started_at`. A report from a dirty checkout may help local debugging but cannot be the final pushed-commit proof. Final verification records the exact committed source; documentation-only result recording may follow in a separate commit.

`RunManifest`는 실행 식별자·시나리오 해시·소스 커밋·미커밋 여부·의존성과 이미지·그래프·정책·장비·자원 한도를 기록합니다. 미커밋 코드의 결과는 로컬 진단용으로 표시하며 최종 푸시 커밋의 증거로 바꿔 적지 않습니다. 최종 검증은 커밋된 소스를 기록하고, 문서만 추가하는 결과 기록은 별도 커밋으로 남길 수 있습니다.

Use an injected **event-time clock** for windows and expiry. Use the real monotonic clock for network deadlines and performance. A simulated 180-second expiry can advance instantly in a pure test; actual process recovery latency must be measured in real elapsed time. Never compare simulation time with a wall-clock latency target.

집계 창과 만료는 주입 가능한 **관측시간 시계**로 검사하고, 통신 시간 제한과 성능은 실제 단조 증가 시계로 측정합니다. 순수 로직 검사는 가상 시간을 즉시 180초 진행할 수 있지만 실제 프로세스 복구 시간은 현실 경과시간으로 재야 합니다. 가상 시간을 실제 지연 목표와 비교하지 않습니다.

### Events and boundaries / 이벤트와 경계

| Boundary / 경계 | Required content / 필수 내용 |
| --- | --- |
| Simulator → ingest / 생성기 → 수집 | Stable batch/sample IDs, event time, coordinates, accuracy, `source_class=SYNTHETIC`, simulation-only credentials / 고정 배치·점 ID, 관측시각·좌표·오차, 합성 표시·시험 전용 인증 |
| Matcher → aggregate / 매칭 → 집계 | Graph and directed edge, traversal identity, entry/exit time, contributor-window identity, quality / 그래프·방향성 구간·통과 ID·진입/진출 시각·시간창별 기여자·품질 |
| Aggregate → publisher / 집계 → 게시 | Complete regional window, status, nullable speed, policy ID, public sample buckets / 완전한 지역별 시간창·상태·nullable 속도·정책 ID·공개 표본 구간 |
| Publisher → node / 게시 → 노드 | Graph/version, artifact hashes/lengths, signature, sequence, expiry, simulation namespace / 그래프·파일 해시/크기·서명·순번·만료·시험 네임스페이스 |
| Gateway → node / 중계 → 노드 | Request hash, exact graph/snapshot/cost configuration, remaining deadline / 요청 해시·정확한 그래프/교통정보/비용 설정·남은 시간 |
| Node → client / 노드 → 클라이언트 | Actual versions, geometry, distance/time, live coverage, status/warning codes with EN/KO text / 실제 사용 버전·경로·거리/시간·실측 적용률·영어/한국어 상태 설명 |

Keep the product contract in [04-protocol.md](04-protocol.md). Simulation data is allowed to exercise `LIVE` decisions **only inside an isolated simulation namespace** and is never published as real observed traffic. Signing keys and trust roots must also identify that namespace.

제품 계약의 기준은 [04-protocol.md](04-protocol.md)입니다. 합성 자료는 **분리된 시험 네임스페이스 안에서만** `LIVE` 판정 로직을 실행하며 실제 관측 교통정보로 게시하지 않습니다. 서명 키와 신뢰 루트도 시험 환경을 구분해야 합니다.

### Evidence / 검증 증거

`AssertionResult`: stable `assertion_id`, `PASS|FAIL|SKIPPED`, expected/actual values, evidence path, `message_en`, `message_ko`. The runner returns nonzero if a required assertion fails or is skipped. An empty set of tests is not success. Reports must list scenario count, assertion count, omissions, and cleanup outcome.

`AssertionResult`는 고정 검사 ID, 통과/실패/생략, 예상·실제 값, 증거 경로, 영어·한국어 설명을 가집니다. 필수 검사가 실패하거나 생략되면 실행기는 0이 아닌 종료코드를 반환합니다. 검사 0개는 성공이 아닙니다. 보고서에는 시나리오·검사 수, 제외 항목, 실행 환경 정리 결과를 적습니다.

Report bundle: `manifest.json`, `assertions.json`, `summary.md` (EN then KO), compact stage counts, selected redacted event traces, and screenshots for browser assertions. Keep large generated graphs and raw replay output in ignored `data/` or an explicitly approved artifact store; commit small reproducible inputs, summaries, and hashes.

보고서 묶음에는 실행 목록·검사 결과 JSON, 영어 우선/한국어 병기 요약, 단계별 처리 수, 필요한 최소 이벤트 기록, 화면 검사의 스크린샷을 포함합니다. 큰 그래프·재생 원본은 Git 제외 경로나 승인된 자료 저장소에 두고, 작은 재현 입력·요약·해시를 커밋합니다.

## 4. The test world / 시험 도로망

Build a small original OSM XML fixture with two legal alternatives between origin and destination, a one-way street, an explicit turn restriction, a disconnected segment, and two close parallel roads. Keep known geometry and legal paths as independent expected data, not values copied from Valhalla's output. Use mature OSM/Valhalla tooling for parsing and graph construction.

출발지·목적지 사이 합법적 대안 경로 두 개, 일방통행, 명시적 회전 금지, 끊어진 도로, 가까운 평행도로를 포함한 작은 자체 OSM XML 시험자료를 만듭니다. 정답 지형과 합법 경로는 Valhalla 출력에서 복사하지 않고 독립된 기대값으로 둡니다. 파싱·그래프 생성에는 기존 OSM/Valhalla 도구를 사용합니다.

The first integration demo slows enough edges on the initially preferred route that the second route is unambiguously better. Avoid ties. Predict the expected direction of change and use a documented numeric tolerance for travel-time comparison; do not require equal JSON or exact floating-point equality across engine versions.

첫 통합 시연에서는 처음 선택되는 경로의 충분한 구간을 느리게 만들어 두 번째 경로가 명확히 유리해지게 합니다. 동률을 피하고, 비용 변화 방향과 문서화한 시간 허용 오차를 검사합니다. 엔진 버전 간 JSON 전체 일치나 부동소수점 완전 일치를 요구하지 않습니다.

Map display tiles and routing graphs are separate artifacts. P11 may draw a GeoJSON fixture directly on MapLibre with a plain background; it does not need external map tiles, an API key, or a new map-file pipeline to visualize the first synthetic test.

화면 지도 타일과 경로 계산 그래프는 별개입니다. P11의 첫 합성 시험에서는 MapLibre의 단순 배경 위에 시험 GeoJSON을 직접 그려 외부 지도 타일·API 키·추가 지도 생성 작업 없이 확인할 수 있습니다.

## 5. Required scenarios / 필수 시나리오

| ID | Trigger / 조건 | Required observation / 반드시 확인할 결과 |
| --- | --- | --- |
| S01 | Baseline, no traffic / 교통자료 없는 기본 상태 | Legal baseline route; no claim of live coverage / 합법 기본 경로·실측 적용 주장 없음 |
| S02 | Five contributors traverse a congested route / 5명이 정체 경로 통과 | Both nodes use the same snapshot and choose the expected alternative / 두 노드의 동일 교통정보 적용·예상 우회 경로 선택 |
| S03 | 0, 1, 4 contributors, or repeated samples / 기여자 부족·반복 관측 | UNKNOWN/INSUFFICIENT; no inflated contributor count / 표본 부족·미관측 표시, 기여자 수 부풀림 없음 |
| S04 | Signal stop versus parking / 신호대기와 주차 | Signal delay retained; parking excluded by explicit rule / 신호대기 시간 유지·명시 규칙에 따른 주차 제외 |
| S05 | GPS jitter, parallel road, tunnel gap / GPS 흔들림·평행도로·터널 누락 | Correct directed match or explicit exclusion; no invented traversal / 정확한 매칭 또는 제외·허구 통과 기록 없음 |
| S06 | Duplicate/reordered/delayed batches / 중복·순서 역전·지연 배치 | Same finalized aggregates; late arrivals excluded by policy / 마감 결과 동일·지연 자료 정책대로 제외 |
| S07 | Crash after accept or partial aggregate success / 접수 후·일부 집계 후 중단 | Accepted work recovered; committed traversals not counted twice / 접수 작업 복구·기반영 통과 중복 없음 |
| S08 | Snapshot expiry or publisher outage / 자료 만료·게시 서버 장애 | Live speeds removed, baseline used and labeled / 실시간 속도 제거·기본값 사용과 표시 |
| S09 | Tampered signature, stale sequence, wrong graph / 서명 변조·이전 순번·다른 지도 | Rejection before activation; prior valid version remains available / 활성화 전 거부·이전 유효 버전 유지 |
| S10 | Concurrent graph/snapshot replacement / 요청 중 지도·교통정보 교체 | Each request uses one compatible version tuple / 요청마다 호환되는 한 버전 조합 사용 |
| S11 | One slow/dead node; then both dead / 한 노드 지연·중단 후 모두 중단 | One bounded retry, then explicit no-service status / 제한된 한 번 재시도 후 명시적 서비스 불가 |
| S12 | Out-of-coverage, no path, revoked node / 범위 밖·경로 없음·폐기 노드 | Correct distinct errors; revoked node never selected / 상황별 오류 구분·폐기 노드 배제 |
| S13 | Non-car data and synthetic isolation / 버스 자료·합성 환경 분리 | No BUS contamination in CAR speeds; no simulation artifact in production namespace / 자동차 속도에 버스 혼입 없음·운영 영역에 합성 자료 없음 |
| S14 | Consent revocation and retention deadline / 동의 철회·보관 기한 도달 | Ingest refusal and verified removal from owned stores/log outputs / 수집 거부·관리 저장소와 로그의 삭제 확인 |
| S15 | Abort, failure, or normal completion / 중단·실패·정상 완료 | Owned processes, volumes and ports handled according to run policy / 자신이 만든 프로세스·볼륨·포트를 실행 정책대로 처리 |

Use actual process termination for crash claims and actual request timeout/drop for transport claims. A mock exception alone proves only the pure handler behavior. Privacy deletion must be checked by read-back, not by a successful deletion response alone.

프로세스 중단을 검증할 때는 실제 프로세스를 종료하고, 통신 장애는 실제 요청 시간 초과·차단으로 만듭니다. 모의 예외만으로는 순수 함수 처리만 증명됩니다. 개인정보 삭제는 성공 응답뿐 아니라 저장소 재조회로 확인합니다.

## 6. Implementation order and proof gates / 구현 순서와 증명 기준

1. **P01 + P14a:** scenario/result contracts and a small local runner; CI for the existing validator and new contract tests. Deterministic output and deliberate failure reporting are verified; see the module evidence. P02 is also verified; P03 is locally verified; P04 is locally verified; P05 is next.
2. **P02:** build the tiny real Valhalla graph and prove baseline legal routing. Pin source/image identity after inspecting actual release artifacts.
3. **P03 → P04:** generate trajectories, run real map matching, compare with known ground truth.
4. **P05 → P06:** reliable collection and pure aggregation, with crash/retry and event-time boundary evidence.
5. **P07 → P08:** signed publication and actual Valhalla traffic consumption; prove S02 and S08 without a UI.
6. **P09 → P10:** independent routing nodes and gateway; prove version consistency and failover.
7. **P11 → P12:** inspect the user flow in the in-app browser, then execute the complete fault matrix through one runner.
8. **P13 + P14b:** local Cloudflare adapter parity and required integration checks; geographic and hosted tests remain separately labeled.

1. **P01 + P14a:** 시나리오·결과 계약과 작은 로컬 실행기, 기존 검사 도구와 새 계약 검사의 CI. 결정적 결과와 의도적 실패 판정을 검증했으며 모듈 증거에 기록했습니다. P02도 검증했으며 P03도 로컬 검증했으며 다음은 P05입니다.
2. **P02:** 작은 실제 Valhalla 그래프 생성과 합법 기본 경로 확인. 실제 릴리스 자료를 확인한 뒤 소스·이미지를 고정합니다.
3. **P03 → P04:** 궤적 생성, 실제 도로 매칭, 독립 정답과 비교.
4. **P05 → P06:** 중단·재시도·관측시간 경계를 검사하는 수집·집계.
5. **P07 → P08:** 서명된 게시와 Valhalla의 실제 속도 반영. 화면 없이 정체 우회·만료 복구를 먼저 증명.
6. **P09 → P10:** 독립 경로 노드와 중계. 버전 일치와 장애 전환 확인.
7. **P11 → P12:** 내장 브라우저에서 사용자 흐름 확인 후 전체 장애 시나리오를 한 실행기로 검증.
8. **P13 + P14b:** 로컬 Cloudflare 구현 비교와 필수 통합 검사. 실제 지역·호스팅 검증은 계속 별도 표시.

Each module handoff requires: design and input/output contract recorded → implementation by the assigned model → focused test run → inspection of actual outputs/state → evidence and limitations recorded → descriptive bilingual commit → feature-branch push and remote-SHA verification. The main agent reviews the evidence; it does not merely repeat the implementer's “passed” claim.

모듈별 완료 조건은 설계·입출력 계약 기록 → 지정 모델 구현 → 집중 테스트 → 실제 출력·상태 확인 → 증거·한계 기록 → 설명이 있는 이중 언어 커밋 → 작업 브랜치 푸시와 원격 해시 확인입니다. 메인 에이전트는 구현자의 통과 보고만 반복하지 않고 증거를 검토합니다.

Run focused tests once by default. Retry only on confirmed failure/interruption, at most once before diagnosis. Broaden to integration testing when the new boundary is implemented. Do not rerun already passing suites for cosmetic documentation changes.

집중 테스트는 기본 한 번 실행합니다. 실패·중단이 확인됐을 때만 최대 한 번 재실행하고 이후 원인을 진단합니다. 새 연결 경계가 구현됐을 때 통합 검증으로 확대하며, 문구만 바꿨다고 통과한 검사를 다시 실행하지 않습니다.

## 7. Local operation and limits / 로컬 운영과 한계

Use a unique Compose project/run ID and loopback-only ports. No fixed shared database or cloud account is required. Keep resource limits and host architecture in the report; container architecture differences and cold/warm runs must be explicit. A 4-vCPU/8-GiB target from the roadmap is a measurement reference, not a guarantee that all concurrent pilot services fit.

실행마다 고유 Compose 프로젝트·실행 ID를 사용하고 포트는 로컬 인터페이스에만 엽니다. 공유 데이터베이스·클라우드 계정 없이 실행합니다. 자원 한도·호스트 아키텍처·컨테이너 차이·최초/준비 후 실행을 보고서에 적습니다. 기존 4 vCPU·8GiB 기준은 측정 기준일 뿐 전체 서비스를 동시에 수용한다는 보장이 아닙니다.

P12 registers ownership immediately, uses cleanup on success/failure/interruption, and verifies that its processes have actually stopped. Preserve artifacts and user-owned services. If cleanup fails, mark the run incomplete and report exact owned resources still running.

P12는 시작 즉시 자원 소유권을 기록하고 성공·실패·중단 때 정리한 뒤 실제 프로세스 종료를 확인합니다. 증거와 사용자 소유 서비스는 보존합니다. 정리에 실패하면 실행 미완료와 아직 남아 있는 자신의 자원을 보고합니다.

No local run proves public-node honesty, Sybil resistance, smartphone background GPS reliability, cloud quotas, regional network performance, or legal compliance for real data. Real-world evaluation and deployment stay in the original roadmap as separate gates.

로컬 실행만으로 공개 노드의 정직성·가짜 참여자 방어·휴대폰 백그라운드 GPS·클라우드 한도·지역별 통신 성능·실데이터 법적 적합성을 증명하지 않습니다. 실제 환경 평가와 배포는 기존 로드맵의 별도 통과 기준으로 유지합니다.
