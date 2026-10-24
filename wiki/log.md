# RouteLens 작업 기록

새 항목은 아래에 추가합니다. 기존 기록의 잘못된 주장은 새 정정 항목에서 해당 기록을 가리킵니다. 날짜는 Asia/Seoul 기준입니다.

## 2026-10-24 최초 설계 기준

- 상태: 설계 문서·라이선스·공개 저장소 생성. 당시 실행 모듈은 없었음.
- 기준 커밋: `88faf078e2dffad7ec72679f090e7411b6fb3e09`.
- 결정: [설계 결정 ADR-001~010](../docs/09-decisions.md), [개발 순서](../docs/05-roadmap.md).
- 증거: [공개 오픈소스 조회 결과](../research/upstream-snapshot.json). 엔진 성능·실제 운영비는 미측정.

## 2026-10-24 이름 확정과 기록 체계 적용

- 요청: Metro Lens에서 파생된 프로젝트 이름을 RouteLens로 확정하고 GitHub 저장소·로컬 폴더·문서에 적용. 향후 계획·구현도 저장소에 기록.
- 결과: `dicebattle/routelens`, 로컬 폴더명 `routelens`, 문서의 현재 제품명 RouteLens로 통일. 기존 커밋 이력과 공개 조사 스냅샷은 보존.
- 결정: [ADR-011~013](../docs/09-decisions.md). 기존 RM 작업 번호는 추적 가능성을 위해 유지.
- 기록 규칙: [사용자가 지정한 글의 적용 판단](sources/llm-wiki.md), [AGENTS.md](../AGENTS.md), [인덱스](index.md).
- 경계: 개인 대화 원문을 공개 위키에 복사하지 않음. 이번 작업은 이름 변경·로컬 구현·저장소 기록이며 서비스 배포는 없음.

## 2026-10-24 RM-001a 시험자료 검사 도구 구현

- 선택 이유: 경로 엔진을 평가하기 전에 입력의 출처와 검토 상태를 구분해야 함. [전체 계획](../docs/05-roadmap.md)의 첫 작업을 작은 하위 작업으로 분리.
- 구현: [검사 도구](../tools/evaluation_corpus.py), [합성 입력](../fixtures/evaluation/synthetic-seoul.json), [집중 테스트](../tests/test_evaluation_corpus.py).
- 동작: 형식·좌표·GPS 순서·중복·참조·검토 근거 검사. 합성·불확실·미검토 자료를 실제 검토 사례 100개 기준에서 제외. 구조 유효와 자료 준비 완료를 다른 종료코드로 구분.
- 검증 환경: Python 3.13.7, 로컬 실행.
- 검증 명령: `python3 -m unittest discover -s tests -p 'test_evaluation_corpus.py' -v` — 10개 통과, 한 번 실행.
- 실행 명령: `python3 -m tools.evaluation_corpus fixtures/evaluation/synthetic-seoul.json` — 형식 유효, 실제 검토 사례 경로 0/100·매칭 0/100, 미준비 판정.
- 종료코드: 기본 모드 0, `--require-ready` 1, 잘못된 입력 2를 집중 테스트에서 확인.
- 산출 근거: [모듈 문서](modules/evaluation-corpus.md), [입력 해시가 포함된 결과](../research/evaluation-corpus/2026-10-24-synthetic-report.json).
- 문서 검증: 내부 링크·코드 블록·JSON·이름 통일·결과 파일과 입력 해시 일치 검사 및 `git diff --check` 통과. 실제 GitHub 저장소 이름과 원격 주소도 `dicebattle/routelens`로 확인.
- 한계: 출처의 실제 이용 권리와 기대 결과의 사실성을 자동 확인하지 않음. 합성 자료의 서울 범위는 실제 시험 지역 확정이 아님. 경로 엔진 호출·지도 생성·실주행 검증은 미수행.
- 다음: RM-001b의 실제 지역·공개 원본·소수 검토 사례 선정, 이후 RM-001c 자료 확보와 RM-002 지도 생성으로 진행.

## 2026-10-24 설계와 구현 담당 규칙

- 요청: 설계는 메인 에이전트가 담당. 메인이 Astra이면 코딩은 Sol 하위 에이전트, Claude이면 Codex 또는 Sonnet 하위 에이전트가 담당.
- 적용: [AGENTS.md](../AGENTS.md)에 모델별 위임·파일 소유권·메인 에이전트의 최종 검토 책임을 기록. 작은 코드 변경에도 이 규칙을 우선 적용하며, 소규모 조사·문서 변경에는 불필요한 위임을 하지 않음.
- Claude 진입점: [CLAUDE.md](../CLAUDE.md)가 공통 지침을 읽도록 연결. 지침을 두 파일에 중복 관리하지 않음.
- 범위: RouteLens 저장소에 적용. 메인이 Sol인 경우까지 구현 위임을 요구하는 규칙으로 확대하지 않음. 구현 모델을 사용할 수 없으면 다른 모델로 조용히 대체하지 않고 사용자와 대안을 정함.
- 이번 변경은 지침·기록만 수정하므로 메인 에이전트가 직접 수행. 코드 변경·하위 에이전트 구현·배포는 없음.
- 검증: 문서 차이와 참조 파일을 확인하고 `git diff --check` 수행. 실행 코드 변경이 없어 기존 테스트는 재실행하지 않음.
- 다음 개발 작업은 RM-001b로 유지. 이후 구현 작업 기록에는 실제 설계·구현 담당과 검증 결과도 남김.

## 2026-10-24 Local pilot and protected delivery / 로컬 파일럿과 보호된 결과 전달

- Request: design all modules for a locally verifiable pilot, prove each module through direct tests, protect main, end tasks with pushes, and use English-first/Korean messages and explanatory commits.
  요청: 로컬에서 전체 검증할 파일럿 모듈 설계, 모듈별 직접 테스트, main 보호, 작업 종료 시 푸시, 영어 우선·한국어 안내와 설명이 있는 커밋.
- Design owner: main agent. [P01–P14 plan](../docs/11-local-pilot.md) defines contracts, dependencies, fifteen end-to-end scenarios, evidence and limits. No pilot module was implemented in this task.
  설계 담당: 메인 에이전트. [P01~P14 계획](../docs/11-local-pilot.md)에 계약·선행 조건·전체 시나리오 15개·증거·한계를 정의했으며 이번 작업에서 파일럿 모듈은 구현하지 않음.
- Revised decision: synthetic integration can proceed before the geographic 100/100 corpus is ready. The corpus gate is retained for real-road accuracy. This supersedes the earlier universal RM-001b-first order, not the requirement for real-world evidence.
  변경 결정: 실제 도로 자료 100/100개 준비 전에도 합성 통합 검증 진행 가능. 해당 기준은 실제 도로 정확도에 유지. 모든 구현에 RM-001b를 먼저 요구하던 순서를 바꾸며 실제 증거 요구를 없애지 않음.
- Live repository setting: PR required, administrator enforcement, force-push/deletion blocked, conversations resolved. Approval count 0 for solo maintenance; CI checks not yet required. [Read-back evidence](../research/repository/main-protection-2026-10-24.json).
  실제 저장소 설정: PR 필수·관리자 적용·강제 푸시/삭제 차단·리뷰 대화 해결. 단독 운영 승인자 0명, 필수 CI는 아직 없음. [재조회 증거](../research/repository/main-protection-2026-10-24.json).
- Workflow: [English/Korean delivery rules](../docs/12-development-workflow.md), tracked [.gitmessage](../.gitmessage), AGENTS/CLAUDE instructions. Work branch: `docs/local-pilot-validation-plan`; no main push, PR creation, merge or deployment.
  절차: [영어/한국어 전달 규칙](../docs/12-development-workflow.md), [.gitmessage](../.gitmessage), AGENTS/CLAUDE 지침. 작업 브랜치 `docs/local-pilot-validation-plan`; main 푸시·PR 생성·병합·배포 없음.
- Implementation owner for the existing CLI localization only: Sol subagent (`gpt-6.1-sol`, task `bilingual_cli`). Files: `tools/evaluation_corpus.py`, `tests/test_evaluation_corpus.py`. Main agent reviewed the diff and verified English fields/exit codes remain compatible. Korean readiness text is additive (`blockers_ko`).
  기존 CLI 언어 변경 구현 담당: Sol 하위 에이전트(`gpt-6.1-sol`, `bilingual_cli`). 담당 파일은 검사 도구·테스트 두 개. 메인 에이전트가 차이를 검토해 영문 필드·종료코드 호환 유지와 한국어 준비 상태 필드 추가를 확인.
- Focused verification: `python3 -m unittest discover -s tests -p 'test_evaluation_corpus.py' -v` — 13 tests passed, one run by the implementer. No duplicate suite run by the main agent. Third-party error details retain English with Korean corrective guidance; OS locale was not changed.
  집중 검증: 위 명령으로 구현자가 한 번 실행해 13개 통과. 메인 에이전트는 같은 전체 검사를 중복 실행하지 않음. 외부 오류 세부사항은 영어 원문과 한국어 해결 안내를 제공하며 운영체제 언어는 변경하지 않음.
- Next: P01 scenario/evidence contract and P14a fast continuous checks; make real successful CI check names required after that work. Existing historical evidence is preserved; older documents have not all been retroactively translated.
  다음: P01 시나리오·증거 계약과 P14a 빠른 지속 검사. 해당 작업 후 실제 성공한 CI 검사 이름을 필수 등록. 과거 증거는 보존하며 모든 과거 문서를 소급 번역한 상태는 아님.

## 2026-10-24 Committed CLI verification / 커밋된 CLI 직접 검증

- Main agent executed three direct CLI checks on clean commit `e78fb82`: help exits 0 with EN/KO guidance, the synthetic corpus with `--require-ready` exits 1 and explains 0/100 in both languages, and a missing input exits 2 with recovery guidance.
  메인 에이전트가 미커밋 변경 없는 `e78fb82`에서 CLI를 직접 검사했습니다. 도움말은 영어·한국어와 종료코드 0, 합성 자료 엄격 검사는 0/100 설명과 종료코드 1, 없는 파일 입력은 해결 안내와 종료코드 2를 확인했습니다.
- [Exact commands, outputs and source identity](../research/evaluation-corpus/2026-10-24-bilingual-cli-verification.json) preserve the evidence. The focused suite was not repeated. This follow-up changes evidence and index/log documents only; tested implementation files are unchanged.
  [정확한 명령·출력·소스 식별 정보](../research/evaluation-corpus/2026-10-24-bilingual-cli-verification.json)를 보존했습니다. 집중 테스트 전체는 반복하지 않았습니다. 후속 변경은 증거·인덱스·기록뿐이며 검증한 구현 파일은 바뀌지 않았습니다.
- Pilot status remains design-only. Handoff target is the pushed `docs/local-pilot-validation-plan` branch; main remains protected and unchanged by this task's commits.
  파일럿은 계속 설계 단계입니다. 결과 전달 대상은 푸시한 `docs/local-pilot-validation-plan` 브랜치이며 이번 커밋으로 보호된 main을 변경하지 않습니다.
