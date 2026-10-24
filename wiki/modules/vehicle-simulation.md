# P03 vehicle/GPS and integrated replay / P03 차량·GPS·통합 재생

Implementation: TypeScript, designed/reviewed by main and implemented by Sol. [Contract](../../docs/17-simulation-evidence-delivery.md). The standalone simulator consumes a verified fresh P02 graph bundle; the integrated command executes every implemented module rather than reading previous successful reports. [Clean-source evidence and captures](../../research/pilot/2026-10-24-p03/report.md) verify 5 fresh stages and 30/30 assertions on `5422399`.

구현은 TypeScript이며 메인이 설계·검토하고 Sol이 작성했습니다. 개별 생성기는 검증된 P02 그래프를 사용하고 통합 명령은 과거 성공 보고서를 읽는 대신 현재 구현된 모듈을 실제 실행합니다. [깨끗한 소스 증거·캡처](../../research/pilot/2026-10-24-p03/report.md)는 위 커밋의 새5단계·30/30판정을 확인합니다.

```sh
npm ci
npm run build
npm run simulation:check -- --output data/new-simulation
npm run report:serve -- data/new-simulation
```

Open the printed loopback URL at `/report.html`. The offline HTML can also be opened directly; relative evidence links require the accompanying report files. The fixture's `BIND_FRESH_GRAPH` field is a template marker, replaced by the integrated runner with the graph built in that same run. It is not an accepted standalone graph ID.

출력한 로컬 주소의 `/report.html`을 엽니다. HTML을 직접 열 수도 있지만 증거 상대 링크에는 함께 생성된 파일들이 필요합니다. 시험자료의 그래프 표식은 통합 실행기가 같은 실행에서 만든 실제 그래프 ID로 바꾸며, 개별 생성기의 유효한 그래프 ID가 아닙니다.

## Independent truth and observations / 독립 정답·관측

Three authored paths use explicit speed schedules. The simulator computes independent truth before seeded noise or half-open missing-sample intervals. It preserves sample identity and true traversal times under noise/drop changes, declaration reordering and unrelated vehicles. Observations contain no truth edge ID and always declare SYNTHETIC. The first model only supports the authored equatorial tiny-city fixture; it is not a general geographic simulator.

세 차량은 직접 정한 경로·속도 일정을 사용합니다. 시드 잡음·반열린 누락 전에 정답을 계산하고 잡음/누락·선언 순서·다른 차량 추가가 표본 식별과 참 통과 시각을 바꾸지 않도록 합니다. 관측에 정답 구간 ID를 넣지 않고 합성을 명시합니다. 첫 모델은 자체 적도 시험망만 지원하며 범용 지리 생성기가 아닙니다.

The integrated acceptance values are hand-calculated: 187 truth samples, 177 observations, ten missing samples and eight traversals. Baseline arrival is 44479 ms; the upper route arrives at 93957 ms after an initial five-second wait. The 25-second observation is present after the [15,25)-second gap. Reported simulation time is separate from measured process execution duration.

독립 계산한 통합 기대값은 정답187·관측177·누락10·통과8입니다. 기본 경로 도착은44479ms, 상단 경로는5초 대기 후93957ms입니다. 15초 이상25초 미만의 누락 뒤25초 관측은 존재합니다. 시뮬레이션 시간과 프로세스 실제 실행시간을 구분합니다.

## Recorded evidence and freshness / 녹화 증거·최신 상태

The report renderer uses only supplied run data. It does not rewrite the source commit. Playback includes time/vehicle/speed controls, true/observed overlays, omission markers, whole-fixture extent and English/Korean switching. This is an evidence viewer, not the complete P11 navigation client. Captures are made from the final clean-source run, while the implementation fingerprint excludes documentation-only changes.

보고 화면은 주어진 실행 자료만 사용하고 소스 커밋을 다시 쓰지 않습니다. 시간·차량·배속·정답/관측·누락·전체 시험망·언어를 조작할 수 있지만 완성된 P11 내비게이션 화면은 아닙니다. 최종 깨끗한 실행을 캡처하고 문서만 바뀌는 경우 구현 지문은 유지합니다.

`npm run media:check` requires a real source commit, matching clean report provenance, unchanged runtime fingerprint, matching report/assets, MP4/GIF/PNG artifacts and current links in both READMEs. It detects stale evidence; it does not itself prove that a movie was honestly recorded. Main inspects the actual browser/video before publishing. Raw graph binaries remain local; small report evidence and capture metadata are committed.

미디어 검사는 실제 커밋·깨끗한 보고서 출처·구현 지문·보고서/자산 해시·영상/미리보기/화면·한영 README 링크를 요구합니다. 오래된 증거를 감지하지만 영상의 진실성을 스스로 증명하지는 않습니다. 메인이 실제 화면·녹화를 확인한 뒤 게시합니다. 그래프 바이너리는 로컬에 두고 작은 증거·캡처 정보를 커밋합니다.

## Remaining work / 남은 일

P04 noisy map matching and ambiguity exclusion, P05–P10 traffic and distributed nodes, complete P11/P12, P13 and the full P14b fault matrix remain. The implemented CI integration is a fresh real-engine subset of the final system. Geographic road accuracy, real mobile behavior and production deployment are separate unverified gates.

P04 잡음 매칭·모호성 제외, P05~P10 교통/분산 노드, P11/P12 전체, P13·P14b 전체 장애 행렬은 남습니다. 현재 CI 통합은 최종 시스템의 실제 엔진 부분 집합이며 실제 지역 정확도·모바일·운영 배포는 별도 미검증 단계입니다.
