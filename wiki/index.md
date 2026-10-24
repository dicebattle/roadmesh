# RouteLens 프로젝트 위키

Verified: [TypeScript P01/P14a tools](modules/pilot-runner.md), 33 tests and independent local/Node 22/24 hosted evidence. [Migration proof](../research/pilot/typescript-migration-2026-10-24.json). [P02 graph proof](modules/test-graph.md) is also complete. [P03 and fresh whole-module simulation](modules/vehicle-simulation.md) are locally and on hosted Docker verified; [recorded evidence](../research/pilot/2026-10-24-p03/report.md) includes 30/30 checks. **P04 now passes48/48 locally and on hosted Docker**; [evidence](../research/pilot/2026-10-24-p04/report.md), hosted evidence downloaded and inspected. Next: **P05 durable ingestion**. The complete pilot and geographic 100/100 gate remain separate. [Development workflow](../docs/12-development-workflow.md): protected main with required CI, descriptive bilingual commits and feature-branch pushes.

[TypeScript P01/P14a](modules/pilot-runner.md)의 33개 검사·독립 로컬 실행·Node 22/24 원격 증거를 검증했습니다. [전환 증거](../research/pilot/typescript-migration-2026-10-24.json)를 보존합니다. [P02 그래프 검증](modules/test-graph.md)도 완료했습니다. [P03·전체 구현 모듈 통합](modules/vehicle-simulation.md)을 로컬·원격 Docker 검증했고 [녹화 증거](../research/pilot/2026-10-24-p03/report.md)에30/30을 기록했습니다. **P04 로컬·원격Docker48/48을 검증**했고 [증거](../research/pilot/2026-10-24-p04/report.md)를 남겼으며 원격 원문도 내려받아 검사했습니다. 다음은 **P05 영속 수집**입니다. 전체 파일럿과 실제 도로 자료 100/100개 조건은 별도입니다. [개발 절차](../docs/12-development-workflow.md)는 필수 CI를 포함한 main 보호·상세한 이중 언어 커밋·작업 브랜치 푸시입니다.

Geographic M0 / RM-001 remains in progress, with zero reviewed real-road cases in each category. Corpus/P01/P02/P03/P04 tools and a recorded evidence viewer exist; complete navigation and deployment do not.

실제 지역 M0 / RM-001은 진행 중이며 검토한 실제 도로 사례는 각각 0개입니다. 자료·P01/P02/P03/P04 도구·녹화 증거 화면은 구현됐지만 완전한 내비게이션·배포는 없습니다.

- [P02 graph evidence / P02 그래프 증거](../research/pilot/p02-main-2026-10-24.json)
- [P03 design / P03 설계](../docs/16-p03-vehicle-simulation.md)

## 현재 구현과 다음 작업

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
- [P05 next design / P05 후속 설계](../docs/20-p05-ingestion-design.md)
