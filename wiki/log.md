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

## 2026-10-24 P01/P14a design handoff / P01·P14a 설계 전달

- Request: implement P01 and P14a with main-agent design and Sol coding, direct verification, repository evidence and feature-branch push. Chat is Korean-only; public artifacts and commits remain English/Korean.
  요청: 메인 설계·Sol 코딩으로 P01·P14a 구현, 직접 검증·저장소 증거·작업 브랜치 푸시. 대화는 한국어만, 공개 기록물·커밋은 영어/한국어 병기.
- Main-agent design: [bounded contract](../docs/13-p01-p14a-contract.md). P01 is a fixture-label scheduler with deterministic event digests and required assertion results, not GPS or routing. P14a runs two Python versions with a fail-closed aggregate check and artifacts.
  메인 설계: [범위가 정해진 계약](../docs/13-p01-p14a-contract.md). P01은 고정 이벤트 해시와 필수 검사 결과를 만드는 도로 이름표 일정 실행기이며 GPS·경로 계산은 아님. P14a는 Python 두 버전, 실패를 숨기지 않는 종합 검사, 결과물 보존.
- Implementation owner: Sol (`gpt-6.1-sol`, subagent `bilingual_cli`, reused for this task). Owned paths: pilot tools, pilot tests/fixtures, and the fast-checks workflow. Main owns documentation, review, direct execution, Git and protection changes.
  구현 담당: Sol(`gpt-6.1-sol`, 기존 `bilingual_cli` 하위 에이전트 재사용). 파일럿 도구·테스트·예제·빠른 검사 워크플로 담당. 메인은 문서·검토·직접 실행·Git·보호 설정 담당.
- Branch: `feat/p01-p14a-local-runner`, based on the pending pilot-design branch at `7217aff`. This continuation includes the unmerged design dependency; main remains unchanged. No PR or merge is implied.
  브랜치: 설계 브랜치 `7217aff`에서 이어지는 `feat/p01-p14a-local-runner`. 아직 병합하지 않은 설계에 의존하는 후속 작업이며 main은 그대로 유지. PR 생성·병합을 포함하지 않음.
- Verification plan: one focused unit-suite run by Sol, then main-agent direct checks from a clean source commit, hosted Actions and downloaded artifacts. Add the observed successful aggregate check to main protection afterward while preserving other rules.
  검증 계획: Sol의 집중 테스트 한 번, 메인의 깨끗한 커밋 직접 실행, 원격 Actions와 내려받은 결과물 확인. 이후 실제 성공한 종합 검사를 다른 보호 규칙을 유지하며 main 필수 조건에 추가.

## 2026-10-24 P01 review findings / P01 검토 중 확인한 문제

- Initial Sol suite: 26 tests passed in one run. Main-agent review then directly reproduced two additional issues on the uncommitted candidate: equal-time edge entry preceded departure, and a simulated `events.json` write failure left a `PASS` manifest without events or summary.
  최초 Sol 검사 26개는 한 번에 통과했습니다. 이후 메인이 미커밋 후보에서 직접 두 문제를 재현했습니다. 같은 시각의 도로 진입이 출발보다 먼저 기록됐고, `events.json` 저장 오류를 모의하면 이벤트·요약 없이 `PASS` 목록만 남았습니다.
- Design correction: use semantic event priority (departure → edge entry → fault marker) rather than lexical kind sorting; write the completion manifest last. Sol owns the code and regression-test correction; main updates the contract and rechecks observable evidence. These are concrete findings, not a reason to repeat an otherwise healthy test run.
  설계 보정: 종류 문자열 정렬 대신 출발→도로 진입→장애 표식 우선순위를 사용하고 완료 목록은 마지막에 저장합니다. Sol이 코드·회귀 검사를 수정하고 메인이 계약·실행 증거를 확인합니다. 실제 확인된 문제에 따른 재검증이며 정상 검사를 이유 없이 반복하는 것이 아닙니다.

## 2026-10-24 P01/P14a implementation review / P01·P14a 구현 검토

- Sol implemented `tools/pilot_runner.py`, `tools/pilot_checks.py`, the synthetic fixture, pilot tests and `.github/workflows/fast-checks.yml`. Main reviewed the complete code and workflow. No other runtime modules or dependencies were added.
  Sol이 실행기·직접 검사 도구·합성 예제·파일럿 테스트·워크플로를 구현했고 메인이 전체 코드·워크플로를 검토했습니다. 다른 실행 모듈이나 외부 패키지는 추가하지 않았습니다.
- Final focused command: `python3 -m unittest discover -s tests -p 'test_*.py' -v`. After the two reproduced findings were corrected, 28 tests passed in 1.105 seconds on Python 3.13.7. This was the single justified rerun after the initial 26-test pass.
  최종 집중 명령은 위와 같고 두 재현 문제 수정 후 Python 3.13.7에서 28개가 1.105초에 통과했습니다. 최초 26개 통과 이후 확인된 문제에 따른 한 번의 재실행입니다.
- Main review confirmed semantic same-time ordering, stable fault tie order, completion-manifest-last behavior with removal on failed manifest write, fail/skip exit 1, invalid input exit 2 and existing output preservation. Supported assertions link to `events.json`; unsupported assertions have no evidence path.
  메인은 같은 시각의 의미상 순서·장애 표식 순서·완료 목록의 마지막 기록과 기록 실패 시 제거·실패/생략 종료코드 1·입력 오류 2·기존 출력 보존을 확인했습니다. 지원 검사는 이벤트 증거를 가리키며 미지원 검사는 증거 경로가 없습니다.
- Local direct execution, hosted workflow run and required-check registration follow from the committed implementation and will be recorded in subsequent entries, without rewriting this pre-verification state.
  커밋된 구현의 로컬 직접 실행·원격 워크플로·필수 검사 등록은 이어서 수행하고 이후 항목에 기록하며 검증 전 상태를 소급 변경하지 않습니다.

## 2026-10-24 P01 direct local verification / P01 직접 로컬 검증

- Tested clean source: `a2f3d905cbb979bce672d30f4894cc068b516826`. Main command: `python3 -m tools.pilot_checks --output data/p01-main-verification-20261024`. All five CLI cases passed their expected behavior; failed/unsupported scenarios correctly returned 1 and invalid input returned 2.
  검사한 깨끗한 소스는 위 커밋이며 메인이 위 명령을 실행했습니다. CLI 다섯 사례가 기대 동작을 충족했고 실패·미지원 시나리오는 1, 잘못된 입력은 2를 반환했습니다.
- Main independently checked event count/order/time against seven authored expectations, recomputed the digest from saved events, checked all four manifests against HEAD and clean state, and verified distinct run IDs with equal replay hashes.
  메인이 독립적으로 작성한 일곱 기대 이벤트와 수·순서·시각을 대조하고 저장 이벤트의 해시를 다시 계산했습니다. 실행 목록 네 개의 HEAD·깨끗한 상태와 서로 다른 실행 ID·동일 재생 해시를 확인했습니다.
- An additional CLI attempt targeting an existing evidence directory returned 2; all existing file hashes remained identical. Invalid input created no run directory. [Evidence](../research/pilot/p01-local-2026-10-24.json) is retained; generated raw bundles remain in ignored `data/`.
  기존 증거 폴더를 대상으로 추가 CLI를 실행하자 2를 반환했고 모든 기존 파일 해시가 그대로였습니다. 잘못된 입력은 실행 폴더를 만들지 않았습니다. [증거](../research/pilot/p01-local-2026-10-24.json)를 보존하고 생성 원본은 Git 제외 경로에 남깁니다.
- P01 remains synthetic scheduling only; hosted checks are evaluated separately after the branch push. No real graph, GPS, service, container or deployment was started.
  P01은 합성 일정 실행이며 원격 검사는 브랜치 푸시 후 별도로 확인합니다. 실제 그래프·GPS·서비스·컨테이너·배포는 시작하지 않았습니다.

## 2026-10-24 P14a hosted proof and main gate / P14a 원격 증명과 main 검사 조건

- [Actions run 40065929029](https://github.com/dicebattle/routelens/actions/runs/40065929029) completed successfully on implementation SHA `a2f3d905cbb979bce672d30f4894cc068b516826`. `Python 3.11`, `Python 3.13` and `Required checks` all succeeded. The main agent inspected individual steps and downloaded both evidence artifacts.
  위 구현 SHA의 [Actions 실행 40065929029](https://github.com/dicebattle/routelens/actions/runs/40065929029)에서 Python 두 버전과 종합 검사가 모두 성공했습니다. 메인이 단계별 결과를 확인하고 두 증거 결과물을 내려받았습니다.
- Both artifact sets contained the expected five case results and four completed manifests. Their clean source SHA and event digest matched the local proof; intentional failure and unsupported checks retained FAIL/SKIPPED correctly. [Persisted hosted evidence](../research/pilot/p14a-ci-2026-10-24.json). Artifacts expire after seven days, so compact inspected evidence is committed.
  두 결과물 모두 다섯 사례 결과·완성 목록 네 개를 포함했고 깨끗한 소스 SHA와 이벤트 해시가 로컬 증거와 일치했습니다. 의도적 실패·미지원 검사의 실패/생략도 보존됐습니다. [원격 증거](../research/pilot/p14a-ci-2026-10-24.json)를 기록합니다. 원본 결과물은 7일 후 만료되므로 검사한 핵심 증거를 커밋합니다.
- Main protection now requires `Required checks` from the observed GitHub Actions app ID `15368`, with strict up-to-date checks. PR requirement, administrator enforcement, blocked force pushes/deletion and conversation resolution remain enabled. [Protection read-back](../research/repository/main-protection-p14a-2026-10-24.json).
  main은 실제 GitHub Actions 앱 ID `15368`의 종합 검사와 최신 기준 브랜치 반영을 요구합니다. PR 필수·관리자 적용·강제 푸시/삭제 차단·대화 해결 규칙은 유지합니다. [설정 재조회](../research/repository/main-protection-p14a-2026-10-24.json)를 보존합니다.
- API adjustment: a request specifying both legacy `contexts` and app-bound `checks` was rejected with 422 and did not apply. The corrected request used `checks` only; the successful state was read back. No protection bypass or main update occurred.
  API 보정: 구형 `contexts`와 앱 지정 `checks`를 함께 전달한 요청은 422로 거부돼 적용되지 않았습니다. `checks`만 사용하도록 고친 요청은 성공했고 설정을 재조회했습니다. 보호 우회나 main 변경은 없었습니다.
- Completion boundary: P01 and P14a verified; P02, real engines, geographic evaluation and P14b remain. The workflow prerequisite failure path was inspected and CLI failure handling was tested; no intentionally red hosted workflow was manufactured. Final documentation/evidence commits preserve the tested implementation files and are pushed to the feature branch.
  완료 범위: P01·P14a 검증, P02·실제 엔진·실제 지역 평가·P14b는 남아 있습니다. 워크플로 선행 실패 처리 코드를 확인하고 CLI 실패 동작을 검사했으며 원격 워크플로를 일부러 실패시키는 커밋은 만들지 않았습니다. 최종 문서·증거 커밋은 검사한 구현 파일을 유지한 채 작업 브랜치로 푸시합니다.

## 2026-10-24 Python scope clarification / Python 선택 범위 설명

- User asked why Python was selected. Main checked the original architecture, P01 contract and implementation, then recorded the [rationale and tradeoffs](modules/pilot-runner.md).
  사용자가 Python 선택 이유를 질문했습니다. 메인이 최초 아키텍처·P01 계약·구현을 확인하고 [선택 이유와 비용](modules/pilot-runner.md)을 기록했습니다.
- Python applies to evaluation/replay tooling for standard-library-only execution and consistency with the first validator. It is not the production-core language or a measured performance winner. TypeScript/Node.js was a viable alternative, but no quantitative comparison was performed.
  Python은 표준 라이브러리만으로 실행하는 평가·재생 도구와 첫 검사기와의 일관성에 적용됩니다. 운영 핵심 언어나 성능 비교 우승자로 고른 것은 아닙니다. TypeScript/Node.js도 가능했으며 정량 비교는 하지 않았습니다.
- Boundary: do not duplicate production traffic algorithms in Python. Reassess if sharing TypeScript production types/core becomes important. No code, language migration, tests, or deployment changed; documentation links and whitespace were checked.
  경계: 운영 교통 알고리즘을 Python으로 중복 구현하지 않습니다. TypeScript 운영 타입·핵심 코드 공유가 중요해지면 재검토합니다. 코드·언어 이전·테스트·배포 변경은 없으며 문서 링크·공백만 확인했습니다.
