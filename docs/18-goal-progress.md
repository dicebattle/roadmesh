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
| P10 gateway and failover / 중계·장애 전환 | [Current report](../research/pilot/2026-10-25-p10-worker/report.md), [module](../wiki/modules/route-gateway.md) | Worker correction: clean302, unit262, independent originals and recording passed; new hosted/protected delivery pending / 작업 스레드 수정의 로컬·원문·녹화 통과·새 원격/보호 반영 대기 |
| P11 actual client / 실제 경로 클라이언트 | [Pilot plan](11-local-pilot.md) | [Development32](../research/pilot/2026-10-25-p11/development/README.md) passed; clean whole334/media/hosted remain / 실제 개발32개 통과·깨끗한 전체334개/영상/원격 검증은 남음 |
| P12 full fault matrix / 전체 장애 행렬 | [Pilot plan](11-local-pilot.md) | Incremental actual runner exists; complete matrix remains / 점진 실제 실행기는 있으며 전체 행렬은 남음 |
| P13 local Cloudflare parity / 로컬 Cloudflare 비교 | [Pilot plan](11-local-pilot.md) | Not implemented / 미구현 |
| P14b final integration CI / 최종 통합 CI | Existing required actual-engine job / 필수 실제 엔진 작업 | Current modules tested; complete pilot matrix remains / 현재 모듈 검사·전체 파일럿 행렬은 남음 |
| Current demo and README / 최신 데모·README | [Media](media/latest.json), [EN](../README.md), [KO](../README.ko.md) | Actual60.45s corrected P10 recording, source/hash binding and mobile review / 실제60.45초 수정 P10 녹화·소스/해시·모바일 확인 |
| AI-project README research / AI 프로젝트 README 참고 | [Source notes](../wiki/sources/readme-presentation.md) | Completed source review / 출처 검토 완료 |

## Current delivery / 현재 반영

P09 PR10 merged as `dfdfe2352f6e0fcb63c3ca2486bb80e5c7d5c187` after final head0ba7582 passed push40131572290 and PR40131577384. Required checks, strict base freshness and administrator protection remained enabled. No branch deletion or bypass. All pre-existing branches are contained in main; only the new P10 branch remains. [Merge evidence](../research/repository/p09-protected-merge-2026-10-25.json).

P09 PR10은 최종 커밋의 푸시·PR 필수 검사 두 건을 통과한 뒤 위 커밋으로 병합했습니다. 필수 검사·최신 기준·관리자 보호를 유지했고 브랜치 삭제나 보호 우회는 없었습니다. 기존 브랜치는 모두 main에 포함됐으며 새 P10 브랜치만 진행 중입니다.

P10 first passed local/hosted302, but final head5a6d7d7 failed concurrent admission preparation on both hosted runs. Main preserved those failures and corrected the blocking bundle work with an owned worker thread, keeping byte verification and all acceptance limits. Clean8f9c9f7 now passed262 unit tests and fresh whole302; main inspected9,799 hashes,38 native pairs/18 API bindings,73 worker jobs and exact cleanup. A new60.45s recording and both READMEs reflect that source. New hosted inspection and protected merge are next. [Current report](../research/pilot/2026-10-25-p10-worker/report.md).

P10은 처음 로컬·원격302개를 통과했지만 최종 커밋의 두 원격 실행에서 동시 접수 준비가 실패했습니다. 실패를 보존하고 바이트 검증·통과 기준을 유지한 채 작업 스레드로 수정했습니다. 깨끗한8f9c9f7의 단위262개·새 전체302개를 통과했고 해시9,799개·엔진38쌍/공개18건·작업73개·정리를 독립 확인했습니다. 새60.45초 녹화·한영 README를 갱신했으며 다음은 새 원격 검사와 보호 병합입니다.

Geographic100/100, real mobile trials, live traffic, public-peer honesty and production deployment remain separate gates. Synthetic success never satisfies them.

실제 지역100/100·실제 모바일 시험·실시간 교통·공개 노드 정직성·운영 배포는 별도 기준이며 합성 성공으로 충족하지 않습니다.

Final-head PR40135410268 and push40135406234 failed the concurrency phase; the correction now has fresh local evidence, while new hosted verification and protected merge remain. [Preserved failures](../research/pilot/2026-10-25-p10/hosted-failures/README.md).

최종 PR·푸시의 동시 요청 단계가 실패해 작업 스레드 수정과 새 로컬 근거를 확인했으며 새 원격 검증 뒤 보호 병합합니다. 실패 원문을 별도로 보존합니다.
