# Current navigation work / 현재 내비게이션 작업

[Usable navigation roadmap](../docs/35-usable-navigation-roadmap.md) · [NAV-01 fixed contract](../docs/36-nav01-turn-guidance.md). Design fixed; implementation/acceptance in progress on `feat/navigation-guidance`. P01–P14 historical checkpoints below remain preserved.

실사용 내비게이션 계획·NAV-01 계약을 확정했고 작업 브랜치에서 구현·검증을 진행합니다. 아래 P01~P14 중간 기록은 과거 시점으로 보존합니다.

# RouteLens 프로젝트 위키

P01–P14 local-pilot runtime acceptance is complete locally and on GitHub Actions: whole 390, Node.js 22/24 each 303. Main independently checked 16,236 hosted original hashes, 11 complete PostgreSQL/Worker pairs and 21 SQLite copies across 14 actors. The runtime fingerprint matches the accepted local run and actual recordings. Protected integration and the latest checked head are tracked by [PR #14](https://github.com/dicebattle/routelens/pull/14). Geographic 100/100, real driving, live traffic and production deployment remain separate.

P01~P14 로컬 파일럿의 실행 검증을 로컬과 GitHub Actions에서 마쳤습니다. 전체 390개와 Node.js 22·24 각각 303개를 통과했고, 메인이 원격 원문 해시 16,236개·집계 전체 11쌍·객체 14개의 SQLite 복사본 21개를 독립 확인했습니다. 실행 지문은 수용한 로컬 실행·실제 녹화와 같습니다. 보호 병합과 최신 검사 커밋은 [PR #14](https://github.com/dicebattle/routelens/pull/14)에서 확인합니다. 실제 지역 100/100·실주행·실시간 교통·운영 배포는 별도입니다.

[Hosted evidence / 원격 근거](../research/pilot/2026-10-25-p13/hosted/README.md). Older progress below is historical. / 아래 진행 기록은 과거 시점입니다.

Current: [P13 clean390 and user walkthrough](../research/pilot/2026-10-25-p13/report.md). P12 is protected-merged; P13/P14b hosted/protected acceptance remains. / 현재: P13 깨끗한390개·사용자 영상 수용, P12보호 병합·P13/P14b원격/보호 반영 남음.


Current P12 checkpoint: local358/296,15,888 original hashes, actual126.45s excerpts and390px IAB passed; hosted/protected delivery pending. [P12 report](../research/pilot/2026-10-25-p12/report.md). / 현재 P12는 로컬358/296개·원문15,888개·실제126.45초 발췌·390픽셀 수동 확인을 통과했고 원격/보호 반영은 남습니다.

Previous checkpoint / 이전 상태: P01–P11 are protected-merged. P11 passed clean whole334, unit285, independent originals,390px manual IAB and a102.8s actual client recording. [Latest report](../research/pilot/2026-10-25-p11/report.md). P11 hosted334/285 and protected PR12 passed; P12–P14 remain. Earlier entries are historical. / P01~P11은 보호 병합했고 P11은 전체334개·단위285개·독립 원문·390픽셀 수동 화면·102.8초 녹화를 통과했습니다. P11 원격334/285·PR12 보호 반영을 확인했으며 P12~P14는 남아 있고 아래 기록은 당시 상태입니다.


Verified: [TypeScript P01/P14a tools](modules/pilot-runner.md), 33 tests and independent local/Node 22/24 hosted evidence. [Migration proof](../research/pilot/typescript-migration-2026-10-24.json). [P02 graph proof](modules/test-graph.md) is also complete. [P03 and fresh whole-module simulation](modules/vehicle-simulation.md) are locally and on hosted Docker verified; [recorded evidence](../research/pilot/2026-10-24-p03/report.md) includes 30/30 checks. **P04 now passes48/48 locally and on hosted Docker**; [evidence](../research/pilot/2026-10-24-p04/report.md), hosted evidence downloaded and inspected. The [actual Seoul simulation](modules/seoul-simulation.md) passes tiny48 + Seoul29 locally and on hosted Linux, plus Node22/24 each122/122; Seoul PR #5 is merged. [P05 durable ingestion](modules/durable-ingestion.md) now passes111 whole-pipeline assertions locally, including34 actual HTTP/PostgreSQL recovery checks; [evidence](../research/pilot/2026-10-24-p05/report.md). Hosted Node22/24 each137/137 and Linux Docker111/111 also passed; main inspected1,883 downloaded artifact hashes and actual DB/process evidence. The complete pilot and geographic 100/100 gate remain separate. [Development workflow](../docs/12-development-workflow.md): protected main with required CI, descriptive bilingual commits and feature-branch pushes.

[TypeScript P01/P14a](modules/pilot-runner.md)의 33개 검사·독립 로컬 실행·Node 22/24 원격 증거를 검증했습니다. [전환 증거](../research/pilot/typescript-migration-2026-10-24.json)를 보존합니다. [P02 그래프 검증](modules/test-graph.md)도 완료했습니다. [P03·전체 구현 모듈 통합](modules/vehicle-simulation.md)을 로컬·원격 Docker 검증했고 [녹화 증거](../research/pilot/2026-10-24-p03/report.md)에30/30을 기록했습니다. **P04 로컬·원격Docker48/48을 검증**했고 [증거](../research/pilot/2026-10-24-p04/report.md)를 남겼으며 원격 원문도 내려받아 검사했습니다. [실제 서울 시뮬레이션](modules/seoul-simulation.md)의 tiny48·서울29를 로컬·원격Linux에서 검증했고 Node22·24도 각각122/122를 통과했습니다. 서울 PR #5를 병합했고 [P05 영속 수집](modules/durable-ingestion.md)은 실제 HTTP·PostgreSQL 복구34개를 포함해 전체111개 로컬 검사를 통과했고 [증거](../research/pilot/2026-10-24-p05/report.md)를 보존합니다. 원격 Node22·24각각137개·LinuxDocker111개도 통과했고 메인이 내려받은 해시1,883개·실제DB/프로세스 증거를 검사했습니다. 전체 파일럿과 실제 도로 자료 100/100개 조건은 별도입니다. [개발 절차](../docs/12-development-workflow.md)는 필수 CI를 포함한 main 보호·상세한 이중 언어 커밋·작업 브랜치 푸시입니다.

Geographic M0 / RM-001 remains in progress, with zero reviewed real-road cases in each category. Corpus/P01/P02/P03/P04/P05/P06 tools and a recorded evidence viewer exist; complete navigation and deployment do not.

실제 지역 M0 / RM-001은 진행 중이며 검토한 실제 도로 사례는 각각 0개입니다. 자료·P01/P02/P03/P04/P05/P06 도구·녹화 증거 화면은 구현됐지만 완전한 내비게이션·배포는 없습니다.

- [P02 graph evidence / P02 그래프 증거](../research/pilot/p02-main-2026-10-24.json)
- [P03 design / P03 설계](../docs/16-p03-vehicle-simulation.md)

## 현재 구현과 다음 작업

- [P07 signed publication / 서명 게시](modules/signed-publication.md): local206 passed with exact signature, durable state and cleanup inspection; current [report and demo](../research/pilot/2026-10-25-p07/report.md). Hosted206 and Node22/24 each200 passed; P08 activation is next. / 로컬206개·서명/영속상태/정리 검증 완료·최신 보고서/영상 갱신. 원격206개·Node각200개도 통과했고 다음은 P08 속도 적용입니다.

- [P06 fixed contract / P06 고정 계약](../docs/23-p06-aggregation-contract.md): actual Seoul aggregation passed the fresh local151-check pipeline; hosted151 and Node22/24 each183 verified. [Report](../research/pilot/2026-10-24-p06/report.md). / 실제 서울 집계의 새 로컬151개 검사를 통과했으며 원격151개·Node22/24각183개도 검증했습니다.
- [Observed projection v3 / 관측 투영 v3](../docs/24-observed-projection-policy.md): a failed actual-Seoul slow-traffic probe exposed endpoint interpretation errors; preserve its original criteria and verify the correction before P06 completion. / 실제 서울 저속 시나리오에서 끝점 해석 오류가 드러났습니다. 원래 기준을 보존하고 보정을 검증한 뒤 P06을 완료합니다.

- [시험자료 검사 모듈](modules/evaluation-corpus.md): 실행법, 입력 계약, 검사 범위, 검증 근거.
- [누적 작업 기록](log.md): 요청·설계 결정·실행 결과·남은 일.
- Geographic work remains pending: RM-001b selects real test regions and reviewed sources. / 실제 지역 작업 RM-001b의 시험 지역·검토 출처 선정은 별도로 남아 있습니다.

## 기준 문서

설계의 원본은 아래 docs 문서에 유지합니다. 이 위키에는 같은 설계를 복사하지 않습니다.

| 문서 | 내용 |
| --- | --- |
| [제품 범위](../docs/01-product-scope.md) | 만들 제품과 단계별 제외 범위 |
| [아키텍처](../docs/02-architecture.md) | 서비스와 데이터 흐름 |
| [재사용 판단](../docs/03-build-or-reuse.md) | 오픈소스 선택과 직접 개발 영역 |
| [제품 계약](../docs/04-protocol.md) | 아직 구현되지 않은 데이터·API 초안 |
| [로드맵](../docs/05-roadmap.md) | 개발 순서·선행조건·통과 기준 |
| [용량과 비용](../docs/06-capacity-and-cost.md) | 가정과 계산; 실측 아님 |
| [개인정보·신뢰](../docs/07-privacy-and-trust.md) | 데이터 공개·보관·위협 모델 |
| [버스 확장](../docs/08-transit-extension.md) | 별도 제품으로 남긴 방향 |
| [설계 결정](../docs/09-decisions.md) | 채택·보류·미결정 사항 |
| [공식 출처](../docs/10-sources.md) | 기존 조사 출처와 공개 메타데이터 |
| [Local pilot / 로컬 파일럿](../docs/11-local-pilot.md) | Modules, contracts, scenarios and evidence / 모듈·계약·시나리오·증거 |
| [Workflow / 개발 절차](../docs/12-development-workflow.md) | Branch protection and bilingual delivery / 브랜치 보호·이중 언어 결과 전달 |
| [P01/P14a contract / P01·P14a 계약](../docs/13-p01-p14a-contract.md) | Executable scope and acceptance checks / 실행 범위와 통과 검사 |

- [TypeScript migration / TypeScript 전환](../docs/14-typescript-migration.md)
- [P02 graph contract / P02 그래프 계약](../docs/15-p02-test-graph.md)

## 출처와 검증 자료

- [LLM-Wiki 적용 판단](sources/llm-wiki.md): 사용자가 지정한 글과 이 저장소에 적용한 규칙.
- [오픈소스 조사 스냅샷](../research/upstream-snapshot.json): 최초 조회 결과, 기존 내용을 덮어쓰지 않음.
- [검사 모듈 실행 결과](../research/evaluation-corpus/2026-10-24-synthetic-report.json): 합성 예제의 미준비 판정과 파일 해시.
- [집중 테스트](../tests/evaluation_corpus.test.ts): 오류 입력·중복·출처·준비 수 경계 검증.
- [Bilingual CLI verification / 이중 언어 CLI 검증](../research/evaluation-corpus/2026-10-24-bilingual-cli-verification.json): direct commands and outputs from a clean committed source / 커밋된 깨끗한 소스의 직접 명령과 출력.
- [P01 direct local proof / P01 로컬 직접 증거](../research/pilot/p01-local-2026-10-24.json): five cases, exact source identity, independent event order and output preservation / 다섯 사례·정확한 소스·독립 이벤트 순서·출력 보존.
- [P14a hosted proof / P14a 원격 증거](../research/pilot/p14a-ci-2026-10-24.json): two Python versions and downloaded-artifact inspection / Python 두 버전과 다운로드 결과물 검사.
- [Required CI protection / 필수 CI 보호](../research/repository/main-protection-p14a-2026-10-24.json): observed Actions check bound to main / 실제 Actions 검사를 main에 연결.

## 기록 방법

새 자료는 출처와 접근 날짜를 기록하고, 관련 설계·모듈 페이지를 갱신한 뒤 작업 기록에 결과를 추가합니다. 추정과 확인된 결과를 구분하며, 기존 주장과 충돌하면 해당 문서에서 변경 이유를 설명합니다. 기록 규칙은 [AGENTS.md](../AGENTS.md)에 있습니다.

- [Full goal audit / 전체 목표 판정](../docs/18-goal-progress.md)
- [Integration and media contract / 통합·미디어 계약](../docs/17-simulation-evidence-delivery.md)

- [P04 next design / P04 후속 설계](../docs/19-p04-matching-design.md)

- [P04 matching / P04 매칭](modules/map-matching.md)
- [P05 design / P05 설계](../docs/20-p05-ingestion-design.md)

- [Seoul simulation contract / 서울 시뮬레이션 계약](../docs/21-seoul-road-simulation.md)
- [Seoul OSM sources / 서울 OSM 출처](sources/seoul-osm.md)

- [Traffic aggregation module / 교통 집계 모듈](modules/traffic-aggregation.md): fixed window, contributor median and deletion behavior. / 고정 창·기여자 중앙값·삭제 동작.

- [P07 publication contract / P07 게시 계약](../docs/25-p07-publication-contract.md): implemented and locally verified; [report](../research/pilot/2026-10-25-p07/report.md), [module](modules/signed-publication.md). / 구현·로컬·원격206개·Node각200개 검증 완료.

- [Latest corrected206-run report / 최신수정206개보고서](../research/pilot/2026-10-25-p07-claim-fix/report.md): reproduced P05 claim race fixed; local proof and new recording complete; corrected hosted206 and Node22/24 each202 passed. / P05작업선택경쟁재현·수정, 새로컬/원격206개·Node각202개·녹화검증완료.

- [P08 activation contract / P08 속도반영계약](../docs/27-p08-traffic-activation.md): fixed after protected P07 merge; fresh15-trip source, immutable traffic generations and exact expiry are required. / P07보호병합후고정·새15여행자료/불변속도세대/정확만료필수.
- [P08 routing module / P08 경로 반영 모듈](modules/traffic-routing.md): actual Seoul development32 passed; [failures and original evidence](../research/pilot/2026-10-25-p08/development/README.md) retained. Fresh whole-system delivery follows. / 실제 서울 개발32개 통과·실패와 원문 보존·새 전체 반영 예정.
- [Current238-case report / 현재238개 보고서](../research/pilot/2026-10-25-p08/report.md): fresh actual Seoul graph, accepted traffic detour, exact expiry, independent inspection and34.7s recording. Hosted delivery pending. / 새 실제 서울 그래프·수용 교통 우회·정확 만료·독립검사·34.7초 녹화, 원격 반영 대기.
- [Corrected portable238 proof / 끝점 호환성 보완238개 근거](../research/pilot/2026-10-25-p08-portability/report.md): original source coordinates retained, fresh local238 and4,159 independent hashes; new actual recording. Corrected hosted delivery pending. / 원지형 보존·새 로컬238개·독립해시4,159개·새 실제녹화, 수정 후 원격 반영 대기.
- [P09 preparation only / P09 사전 조사](../research/pilot/2026-10-25-p09-preparation/README.md): native HTTP listener observed, but no route request completed because the probe omitted IPv4-mapped IPv6 readiness. / 실제HTTP리스너를 관찰했으나 준비감시 누락으로 경로요청은 수행하지 못함.

- [Corrected hosted Seoul proof / 보완 후 원격 서울 근거](../research/pilot/2026-10-25-p08-portability/hosted/README.md): 238 actual cases, Node22/24 each217,4,122 independently checked present hashes; protected merge pending. / 실제238개·Node각217개·존재하는 해시4,122개 독립 검사·보호병합 대기.
- [P09 successful capability retry / P09 실행 능력 재검사](../research/pilot/2026-10-25-p09-preparation/retry/README.md): same daemon, two actual HTTP routes; lifecycle implementation remains. / 같은 데몬으로 실제HTTP두건·수명주기 구현은 남음.

- [P09 fixed lifecycle contract / P09 고정 수명주기 계약](../docs/28-p09-routing-nodes.md): implementation in progress;32 required actual cases planned, no P09 pass claim yet. / 구현중·필수실제32사례계획·P09통과주장없음.
- [P09 routing-node module / P09 경로 노드 모듈](modules/routing-nodes.md): actual development32 passed after preserving three failures; clean whole270 and current media follow. / 세 실패를 보존하고 실제 개발32개 통과·깨끗한 전체270개와 최신 녹화 예정.

- [P10 gateway contract](../docs/29-p10-route-gateway.md), [module](modules/route-gateway.md), [development32 proof](../research/pilot/2026-10-25-p10/development/README.md): actual independent native failover and main original inspection passed; fresh whole302 and delivery remain. / 실제 독립 엔진 전환·메인 원문 검사를 통과했으며 새 전체302개와 반영은 남습니다.

- [Actual route client / 실제 경로 클라이언트](modules/route-client.md): development proof; final delivery pending / 개발 근거·최종 반영 대기.

Latest: [P11 actual client proof](../research/pilot/2026-10-25-p11/report.md), [P10 protected hosted delivery](../research/pilot/2026-10-25-p10-worker/hosted/README.md), [P12 gap review draft](../docs/31-p12-scenario-gap-review.md).

최신: P11 실제 화면 검증·P10 원격 보호 반영·P12 공백 검토 초안입니다.

[P12 fixed design / P12 확정 설계](../docs/32-p12-whole-scenarios.md) · [P11 hosted proof / P11 원격 근거](../research/pilot/2026-10-25-p11/hosted/README.md)

- [P12 scenario runner candidate / P12 시나리오 실행 후보](modules/scenario-runner.md): clean358/296 and independent saved bytes passed; hosted/protected delivery remains. / 깨끗한358/296개·독립 저장 바이트 통과·원격/보호 반영 남음.

[P13 local parity candidate / P13 로컬 비교 후보](modules/cloudflare-parity.md) · [fixed design / 확정 설계](../docs/33-p13-local-cloudflare-parity.md) · [P14b final CI gate / P14b 최종 CI 조건](../docs/34-p14b-final-integration.md). Unit303, actual P06 export34 and development31/11-byte-pairs passed; new clean390/media/hosted remain. / 단위303개·실제 P06 입력34개·개발31개/바이트11쌍 통과·새 깨끗한390개/미디어/원격 남음.

## Current local acceptance / 현재 로컬 수용

[P13 clean390 report](../research/pilot/2026-10-25-p13/report.md): actual Seoul, independent16,061 hashes,32 local Cloudflare checks/11 full result pairs, actual32s user video and155.05s developer capture. [P12 corrected hosted/protected record](../research/pilot/2026-10-25-p12/hosted/README.md). P13/P14b hosted/protected delivery remains. Earlier progress entries above are historical checkpoints.

현재 로컬 전체390개·독립 해시16,061개·Cloudflare32개/전체 결과11쌍·실제 사용자32초/개발155.05초 녹화를 확인했습니다. P12는 수정 원격·보호 반영을 마쳤고 P13/P14b의 원격·보호 반영은 남습니다. 위 진행 기록은 과거 중간 상태입니다.
