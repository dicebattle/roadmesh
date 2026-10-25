# Continuing pilot goal / 지속 파일럿 목표

The goal remains the complete local P01–P14 pilot. Each increment needs fresh actual-process execution of all implemented modules on actual Seoul OSM, inspected originals, bilingual reports and actual recordings, updated READMEs, branch push and verified protected delivery. A partial module or green unit suite does not finish the goal.

목표는 전체 로컬 P01~P14 파일럿입니다. 구현 단위마다 실제 서울 OSM에서 구현된 모든 모듈의 프로세스를 새로 실행하고 원문을 검사해야 합니다. 한영 보고서·실제 녹화·README·작업 브랜치 푸시·보호 반영도 확인합니다. 일부 모듈이나 단위 검사 성공으로 전체 목표를 완료하지 않습니다.

| Requirement / 요구사항 | Evidence / 근거 | Current state / 현재 상태 |
| --- | --- | --- |
| P01/P14a scenario and fast checks / 시나리오·빠른 검사 | [Module](../wiki/modules/pilot-runner.md) | TypeScript migration and hosted checks verified / TypeScript 전환·원격 검사 확인 |
| P02/P03/P04 graph, vehicles and matching / 지도·차량·매칭 | [Seoul module](../wiki/modules/seoul-simulation.md) | Actual Seoul primary simulation; tiny regression retained / 실제 서울 주요 검증·작은 회귀 유지 |
| P05 ingestion / 영속 수집 | [Module](../wiki/modules/durable-ingestion.md) | Protected-merged, local/hosted evidence / 보호 병합·로컬/원격 근거 |
| P06 aggregation / 집계 | [Module](../wiki/modules/traffic-aggregation.md) | Protected-merged, local/hosted evidence / 보호 병합·로컬/원격 근거 |
| P07 publication / 서명 게시 | [Module](../wiki/modules/signed-publication.md) | Protected-merged including claim-race correction / 작업 선택 경쟁 수정 포함 보호 병합 |
| P08 traffic application / 교통 반영 | [Report](../research/pilot/2026-10-25-p08-portability/report.md) | Local/hosted238; protected PR9 / 로컬·원격238·보호 PR9 |
| P09 persistent nodes / 지속 노드 | [Report](../research/pilot/2026-10-25-p09/report.md) | Local/hosted270, Node22/24 each235; protected PR10 / 로컬·원격270·Node각235·보호 PR10 |
| P10 gateway and failover / 중계·장애 전환 | [Hosted proof](../research/pilot/2026-10-25-p10-worker/hosted/README.md) | Corrected local/hosted302, unit262; protected PR11 merged / 수정 로컬·원격302·단위262·PR11 보호 병합 |
| P11 actual client / 실제 경로 클라이언트 | [Report](../research/pilot/2026-10-25-p11/report.md) | Local/hosted334 and285 tests, actual102.8s recording; protected PR12 merged / 로컬·원격334·단위285·실제102.8초 녹화·PR12 보호 병합 |
| P12 full fault matrix / 전체 장애 행렬 | [Fixed design](32-p12-whole-scenarios.md) | Local/hosted358/296 and independent15,975 hosted hashes; protected PR13 merged / 로컬·원격358/296개·독립 원격15,975해시·PR13 보호 병합 |
| P13 local Cloudflare parity / 로컬 Cloudflare 비교 | [Contract](33-p13-local-cloudflare-parity.md) | Clean390/32 local,11 full pairs and SQLite originals accepted; hosted remains / 깨끗한 로컬390/32개·전체11쌍·SQLite원문 수용·원격 남음 |
| P14b final integration CI / 최종 통합 CI | [Fixed gate](34-p14b-final-integration.md) | Implemented390 required gate and XML/SQLite originals; hosted acceptance remains / 구현390개 필수 조건·XML/SQLite원문·원격 판정 남음 |
| Current demo and README / 최신 데모·README | [Media](media/latest.json), [EN](../README.md), [KO](../README.ko.md) | P13 actual32s user flow with EN/KO captions, separate155.05s developer video and390px IAB / P13 실제32초 한영 사용자 영상·별도155.05초 개발 영상·390픽셀 수동 확인 |
| AI-project README research / AI 프로젝트 README 참고 | [Source notes](../wiki/sources/readme-presentation.md) | Completed source review / 출처 검토 완료 |

## Earlier delivery checkpoints / 이전 반영 기록

P10 PR11 merged the checked head a5be89e as a4b96c675198219e5474158e78d69ae8e03d270a after push40139486989 and PR40139490949 passed. Main inspected9,932 hosted hashes,38 native pairs/18 replies and73 worker jobs. Protection remained enabled. [Hosted record](../research/pilot/2026-10-25-p10-worker/hosted/README.md).

P10의 검사한 커밋을 푸시·PR 통과 후 보호 병합했습니다. 메인이 원격 해시9,932개·엔진38쌍/응답18건·작업73개를 확인했고 보호 설정을 유지했습니다.

P11 clean c63c556 passed285 unit tests and fresh whole334. Main independently checked12,225 file hashes, client27 native pairs/12 browser bindings and exact local cleanup. A fresh interactive fixture supplies the102.8s client recording; its8 successful requests bind to originals and22 owned containers are gone. P10 protected ancestry is included. Hosted push40141450307 and PR40141478545 passed; main inspected12,054 hashes and protected-merged PR12 as b7e383c. Next: implement the fixed [P12 design](32-p12-whole-scenarios.md).

P11은 깨끗한 소스에서 단위285개·새 전체334개를 통과했습니다. 메인이 해시12,225개·클라이언트 엔진27쌍/브라우저12건·정리를 확인했습니다. 새 대화형 실행의102.8초 녹화에서 성공8건을 원문과 연결하고 소유 컨테이너22개 부재를 확인했습니다. P10 보호 병합 이력을 포함했습니다. 원격 두 실행과 해시12,054개를 확인하고 PR12를 b7e383c로 보호 병합했습니다. 다음은 고정한 P12 설계의 구현입니다.

At the P11 checkpoint, P12–P14 remained unfinished. Geographic100/100, real mobile trials, live traffic, public-peer honesty and production deployment are separate gates; synthetic success never satisfies them.

P11 중간 시점에는 P12~P14가 미완료였습니다. 실제 지역100/100·실제 모바일·실시간 교통·공개 노드 정직성·운영 배포는 별도 기준이며 합성 성공으로 충족하지 않습니다.

P12 local acceptance now passed at clean5c9d4c4: whole358, unit296, independent15,888 hashes, saved354-input matrix, live SQL, actual native/transport/supervisor proof and refreshed bilingual media. The first clean matrix rejection and corrected-auditor inventory omission remain preserved. [Report](../research/pilot/2026-10-25-p12/report.md). Next: push, inspect hosted originals and protected-merge; then P13/P14b.

P12는 깨끗한5c9d4c4에서 전체358개·단위296개·독립 해시15,888개·저장 입력354개 행렬·실행 중 SQL·실제 엔진/통신/감독·최신 한영 미디어를 통과했습니다. 첫 행렬 거부와 감사 목록 누락을 보존합니다. 다음은 푸시·원격 원문·보호 병합과 P13/P14b입니다.

## P13 local acceptance and clearer user documentation / P13 로컬 수용·사용자 설명 개선

Clean d2fb964/runtime ba9395ec passed fresh390 after the narrow report correction. Main independently checked16,061 original hashes; P13 matched eleven complete result pairs,184 original hashes and21 SQLite/WAL copies across14 actors. Native/signature/browser/fault/live-SQL audits passed. The actual developer155.05s recording has7 successful native bindings and exact cleanup. The README now leads with project purpose, architecture and a32s ordinary user flow, with EN/KO captions outside the untouched frame. P12 corrected hosted358/296 and15,975 hashes passed and PR13 protected-merged as1f1f1a0. P13 includes that ancestry with unchanged runtime bytes.

좁은 보고서 수정 뒤 깨끗한 소스에서 새390개·독립16,061해시·집계 전체11쌍·Cloudflare184해시·객체14개/SQLite21개와 엔진·서명·화면·장애·SQL을 확인했습니다. 개발155.05초 녹화의7개 엔진 연결과 정리를 확인하고 README를 목적·아키텍처·실제 사용자32초 한영 자막 영상 중심으로 바꿨습니다. P12 수정 원격358/296개·15,975해시·PR13 보호 병합과 같은 실행바이트의 이력을 포함했습니다.

Remaining for the full pilot: push P13, inspect actual hosted390 and Node22/24 results with XML/SQLite originals, retain hosted evidence and complete normal protected delivery. Geographic100/100, real driving/live traffic and production deployment remain separate.

전체 파일럿의 남은 조건은 P13푸시·실제 원격390개/Node22·24와 XML/SQLite원문 검사·원격 근거 보존·정상 보호 반영입니다. 실제 지역100/100·실주행/실시간 수집·운영 배포는 별도입니다.
