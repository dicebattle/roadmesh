# Continuing implementation goal / 지속 구현 목표

The goal remains the complete local pilot in [P01–P14](11-local-pilot.md), not just this turn's completed modules. After each implementation increment, execute all implemented modules together, inspect actual outputs, publish an English/Korean test report with captures, refresh the recorded demo and both README versions, then push verified work. Main owns design and final evidence; Sol owns implementation.

목표는 이번 차례에 끝낸 모듈만이 아니라 [P01~P14](11-local-pilot.md)의 전체 로컬 파일럿입니다. 구현 단위마다 구현된 모든 모듈을 함께 실행하고 실제 결과를 검사한 뒤 영어·한국어 보고서·캡처·최신 녹화·두 README를 갱신해 검증된 작업을 푸시합니다. 메인은 설계·최종 증거, Sol은 구현을 담당합니다.

## Completion audit / 완료 판정표

| Requirement / 요구사항 | Current evidence / 현재 근거 | State / 상태 |
| --- | --- | --- |
| P01 scenario/replay and P14a fast checks / 일정·재생·빠른 검사 | [P01 module](../wiki/modules/pilot-runner.md) | Verified / 검증 |
| P02 real engine graph / 실제 엔진 그래프 | [P02 proof](../research/pilot/p02-main-2026-10-24.json) | Verified / 검증 |
| P03 vehicle/GPS / 차량·GPS | [Clean integrated proof](../research/pilot/2026-10-24-p03/report.md) | Locally verified / 로컬 검증 |
| P04 real matching and ambiguity handling / 실제 매칭·모호성 처리 | [Module plan](11-local-pilot.md) | Pending / 미구현 |
| P05 durable ingestion, P06 aggregation / 영속 수집·집계 | [Module plan](11-local-pilot.md) | Pending / 미구현 |
| P07 signed publication, P08 actual traffic consumption / 서명 게시·속도 반영 | [Module plan](11-local-pilot.md) | Pending / 미구현 |
| P09 two nodes, P10 gateway/failover / 두 노드·중계/장애 전환 | [Module plan](11-local-pilot.md) | Pending / 미구현 |
| P11 complete client, P12 complete fault matrix / 전체 화면·장애 행렬 | Evidence replay and incremental runner begin now / 증거 재생·점진 실행기부터 시작 | Partial design / 일부 설계 |
| P13 local Cloudflare parity / Cloudflare 로컬 비교 | [Module plan](11-local-pilot.md) | Pending / 미구현 |
| P14b engine integration / 엔진 통합 검사 | Extend CI with current whole-system runner / 현재 전체 실행기를 CI에 연결 | Implementing partial coverage / 일부 범위 구현 중 |
| Whole implemented-system simulation / 구현 모듈 전체 시뮬레이션 | [Fresh 5-stage report](../research/pilot/2026-10-24-p03/report.md) / 새5단계 보고서 | Locally verified / 로컬 검증 |
| Captured test reports on GitHub / 캡처·보고서 게시 | [Report and captures](../research/pilot/2026-10-24-p03/report.md) / 보고서·캡처 | Prepared; GitHub delivery pending / 준비·GitHub 반영 대기 |
| README EN/KO with recorded demo / 한영 README·실제 녹화 | [English](../README.md), [한국어](../README.ko.md), [recording](media/latest.json) | Prepared; publication pending / 준비·게시 대기 |
| Refresh on implementation changes / 구현 변경 때 갱신 | `media:check` fingerprint/hash/README checks / 지문·해시·README 검사 | Locally verified / 로컬 검증 |
| Research other AI-development READMEs / 다른 AI 개발 README 참고 | [Research notes](../wiki/sources/readme-presentation.md) | Source inspection complete / 출처 확인 |

A green unit suite does not finish this goal. Completion requires the full module/scenario contract, actual process/network faults where required, inspected integrated evidence, current media/docs and verified GitHub delivery. Mark unmet or weak evidence as incomplete. Geographic 100/100, production deployment and actual mobile trials remain separate gates and must not be implied by synthetic success.

단위 검사 성공만으로 목표를 완료하지 않습니다. 전체 모듈·시나리오 계약, 필요한 실제 프로세스/통신 장애, 검사한 통합 증거, 최신 미디어/문서, GitHub 반영이 필요합니다. 누락·약한 증거는 미완료로 둡니다. 실제 지역 100/100·운영 배포·실제 모바일 시험은 별도이며 합성 성공으로 주장하지 않습니다.
