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
| P12 full fault matrix / 전체 장애 행렬 | [Fixed design](32-p12-whole-scenarios.md) | Local358/296,15,888 original hashes and actual126.45s edited capture passed; hosted/protected delivery pending / 로컬358/296·원문15,888개·실제126.45초 편집 녹화 통과·원격/보호 반영 남음 |
| P13 local Cloudflare parity / 로컬 Cloudflare 비교 | [Contract](33-p13-local-cloudflare-parity.md) | Candidate303 units, P06 export34 and development31/11 pairs; clean390 pending / 후보 단위303개·P06 입력34개·개발31개/11쌍·깨끗한390개 남음 |
| P14b final integration CI / 최종 통합 CI | [Fixed gate](34-p14b-final-integration.md) | Candidate390 required gate plus XML/SQLite originals; hosted acceptance remains / 후보390개 필수 조건·XML/SQLite 원문·원격 판정 남음 |
| Current demo and README / 최신 데모·README | [Media](media/latest.json), [EN](../README.md), [KO](../README.ko.md) | P12 actual126.45s excerpts plus recorded report evidence, exact source/hash and390px IAB / P12 실제126.45초 발췌·기록 보고서 근거·출처/해시·390픽셀 수동 확인 |
| AI-project README research / AI 프로젝트 README 참고 | [Source notes](../wiki/sources/readme-presentation.md) | Completed source review / 출처 검토 완료 |

## Current delivery / 현재 반영

P10 PR11 merged the checked head a5be89e as a4b96c675198219e5474158e78d69ae8e03d270a after push40139486989 and PR40139490949 passed. Main inspected9,932 hosted hashes,38 native pairs/18 replies and73 worker jobs. Protection remained enabled. [Hosted record](../research/pilot/2026-10-25-p10-worker/hosted/README.md).

P10의 검사한 커밋을 푸시·PR 통과 후 보호 병합했습니다. 메인이 원격 해시9,932개·엔진38쌍/응답18건·작업73개를 확인했고 보호 설정을 유지했습니다.

P11 clean c63c556 passed285 unit tests and fresh whole334. Main independently checked12,225 file hashes, client27 native pairs/12 browser bindings and exact local cleanup. A fresh interactive fixture supplies the102.8s client recording; its8 successful requests bind to originals and22 owned containers are gone. P10 protected ancestry is included. Hosted push40141450307 and PR40141478545 passed; main inspected12,054 hashes and protected-merged PR12 as b7e383c. Next: implement the fixed [P12 design](32-p12-whole-scenarios.md).

P11은 깨끗한 소스에서 단위285개·새 전체334개를 통과했습니다. 메인이 해시12,225개·클라이언트 엔진27쌍/브라우저12건·정리를 확인했습니다. 새 대화형 실행의102.8초 녹화에서 성공8건을 원문과 연결하고 소유 컨테이너22개 부재를 확인했습니다. P10 보호 병합 이력을 포함했습니다. 원격 두 실행과 해시12,054개를 확인하고 PR12를 b7e383c로 보호 병합했습니다. 다음은 고정한 P12 설계의 구현입니다.

P12–P14 remain unfinished. Geographic100/100, real mobile trials, live traffic, public-peer honesty and production deployment are separate gates; synthetic success never satisfies them.

P12~P14는 아직 미완료입니다. 실제 지역100/100·실제 모바일·실시간 교통·공개 노드 정직성·운영 배포는 별도 기준이며 합성 성공으로 충족하지 않습니다.

P12 local acceptance now passed at clean5c9d4c4: whole358, unit296, independent15,888 hashes, saved354-input matrix, live SQL, actual native/transport/supervisor proof and refreshed bilingual media. The first clean matrix rejection and corrected-auditor inventory omission remain preserved. [Report](../research/pilot/2026-10-25-p12/report.md). Next: push, inspect hosted originals and protected-merge; then P13/P14b.

P12는 깨끗한5c9d4c4에서 전체358개·단위296개·독립 해시15,888개·저장 입력354개 행렬·실행 중 SQL·실제 엔진/통신/감독·최신 한영 미디어를 통과했습니다. 첫 행렬 거부와 감사 목록 누락을 보존합니다. 다음은 푸시·원격 원문·보호 병합과 P13/P14b입니다.
