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
- 구현: [검사 도구](https://github.com/dicebattle/routelens/blob/0095b3b2611b1ced21e8c39f788d9799bf58dbd9/tools/evaluation_corpus.py), [합성 입력](../fixtures/evaluation/synthetic-seoul.json), [집중 테스트](https://github.com/dicebattle/routelens/blob/0095b3b2611b1ced21e8c39f788d9799bf58dbd9/tests/test_evaluation_corpus.py).
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

## 2026-10-24 TypeScript migration implementation / TypeScript 전환 구현

- User explicitly requested one TypeScript toolchain, Sol implementation, direct proof, branch push, continued modules and merging current branches. Main wrote [migration design](../docs/14-typescript-migration.md) and [P02 contract](../docs/15-p02-test-graph.md); Sol (`gpt-6.1-sol`, agent `bilingual_cli`) implemented the migration. Main reviewed all runtime code, tests and CI. Existing feature branch includes the earlier planning branch.
  사용자가 TypeScript 통일·Sol 구현·직접 검증·푸시·후속 개발·현재 브랜치 병합을 요청했습니다. 메인이 전환·P02 계약을 작성하고 위 Sol이 전환 코드를 구현했습니다. 메인이 실행 코드·검사·CI를 검토했고 기존 기능 브랜치는 앞선 계획 브랜치를 포함합니다.
- Before removing Python tools/tests, Sol captured [reference outputs](../fixtures/compat/python-0095b3b.json) from `0095b3b2611b1ced21e8c39f788d9799bf58dbd9`. TypeScript preserves 17 scenario event streams/digests/assertion reports, 150 random draws across five seeds, two corpus reports and six invalid-input exit cases. Historical implementation and evidence remain in Git.
  Python 도구·검사를 제거하기 전에 위 리비전 기준 출력을 보존했습니다. 시나리오 17개·난수 150개·자료 보고서 2개·잘못된 입력 6개의 동등성을 검사했으며 과거 구현·증거는 Git에 남깁니다.
- Sol ran `npm exec --yes --package=node@22.23.4 -- npm test` once: strict TypeScript build and 33 tests passed (28 prior categories + 5 migration categories), 0 failed/skipped, 1243.878917 ms. Main reviewed reference assertions and explicit numeric-domain tightening: unsafe integer inputs now fail instead of risking JavaScript precision loss. Runtime manifests retain `python: null` and add actual `node` version.
  Sol이 위 명령을 한 번 실행해 엄격 빌드·33개 검사(기존 28범주+전환 5범주)가 통과했고 실패·생략은 0개입니다. 메인은 기준 비교와 안전 정수 범위 강화를 검토했습니다. 목록의 Python 값은 null이며 실제 Node 버전을 추가합니다.
- Exact dependencies: TypeScript 5.9.3, @types/node 22.20.5, random-js 2.1.0, jsonc-parser 3.3.1. CI targets Node 22/24 and preserves `Required checks`. Main's clean-source direct checks and hosted artifact inspection follow; this entry does not claim them complete.
  의존성을 위 버전으로 고정했고 CI는 Node 22/24·기존 종합 검사 이름을 유지합니다. 메인의 깨끗한 소스 직접 실행·원격 결과물 검사는 이어서 수행하며 아직 완료로 주장하지 않습니다.

## 2026-10-24 TypeScript direct and hosted proof / TypeScript 직접·원격 증명

- Main ran Node 22.23.4 `dist/tools/pilot_checks.js --output data/ts-main-20261024` on clean `65e97bc07365dacfa0696bc943fe6246d126e8fb`: five expected CLI cases passed. Independently checked offsets `[19,19,41,41,141,500,500]`, canonical SHA `ed8ebc875052b4a7365d079d35265fa7867334c40d84b6626f402263f7fe7eb6`, four clean source identities, distinct run UUIDs and no graph/engine claim. Reusing an output directory returned 2 without changing file hashes. Invalid input created no output. Corpus `--require-ready` returned 1 with zero reviewed roads.
  메인이 위 깨끗한 커밋을 직접 실행해 5사례·독립 이벤트 시각/해시·출처·고유 실행 ID·엔진 미실행 표시를 검사했습니다. 기존 출력은 종료코드 2로 거부하고 파일을 보존했으며 잘못된 입력은 출력이 없었습니다. 자료 검사 엄격 모드는 실제 도로 0개로 종료코드 1을 반환했습니다.
- Push run [40069570003](https://github.com/dicebattle/routelens/actions/runs/40069570003) passed Node 22, Node 24 and Required checks. Main downloaded both artifacts and inspected ten CLI cases/eight manifests, matching clean source SHA and the exact local event digest. [Compact evidence](../research/pilot/typescript-migration-2026-10-24.json). [PR #1](https://github.com/dicebattle/routelens/pull/1) combines the planning branch and P01/P14a implementation history. Final documentation commit has no runtime changes.
  푸시 실행의 Node 22·24·종합 검사가 통과했습니다. 메인이 두 결과물의 10개 CLI 사례·8개 목록을 내려받아 깨끗한 SHA·로컬 해시와 대조했습니다. PR #1에 계획·구현 이력을 함께 반영하며 최종 기록 커밋은 실행 코드를 바꾸지 않습니다.
- Limits: synthetic scheduling only; no claim of national road quality or language performance advantage. Next module has a recorded P02 design and will use real Valhalla graph/route evidence.
  한계: 합성 일정 검증이며 전국 도로 품질·언어 성능 우위는 주장하지 않습니다. 다음 P02는 기록된 설계에 따라 실제 Valhalla 그래프·경로 증거를 검증합니다.

## 2026-10-24 Protected integration and P02 start / 보호된 병합·P02 시작

- User-authorized [PR #1](https://github.com/dicebattle/routelens/pull/1) merged with commit `dca0c5219acf3cfece4045e1f731397d2fe36694` after final-head Node 22/24 and Required checks passed. Feature tip `abab4098c8b077e90ecb396691dc28cb561f2534` was verified remotely before merge. Both `docs/local-pilot-validation-plan` and `feat/p01-p14a-local-runner` are ancestors of the new main; all branches existing at the request are integrated without deleting their names.
  사용자 요청에 따라 PR #1을 최종 HEAD 필수 검사 통과 후 위 커밋으로 병합했습니다. 기능 브랜치의 원격 해시를 확인했고 계획·기능 브랜치 모두 새 main의 조상임을 검사했습니다. 요청 당시 모든 브랜치 작업을 통합했으며 브랜치 이름은 삭제하지 않았습니다.
- Protection read-back: strict Required checks from Actions app 15368, PR requirement, admin enforcement, blocked force push/deletion, approvals 0 for solo maintenance. No bypass was used. P02 begins on `feat/p02-test-graph` from updated main, under the recorded contract. Sol owns runtime/tests/fixtures; main owns design, independent verification and evidence.
  보호 재조회에서 Actions 앱 15368 필수 검사·최신 기준 반영·PR 필수·관리자 적용·강제 푸시/삭제 차단·단독 관리 승인 수 0을 유지했습니다. 보호 우회는 없습니다. 갱신 main에서 P02 브랜치를 만들고 기록된 계약에 따라 Sol이 코드·검사·자료, 메인이 설계·독립 검증·증거를 담당합니다.

## 2026-10-24 P02 implementation and review / P02 구현·검토

- Main designed [P02](../docs/15-p02-test-graph.md), reviewed fixture geometry/expectations and runtime/test code. Sol (`gpt-6.1-sol`, `bilingual_cli`) implemented TypeScript orchestration, graph-evidence validation, a fictional 11-way XML/JSON fixture, pinned Valhalla/Osmium Dockerfile and 15 focused tests. Main also recorded the next [P03 design](../docs/16-p03-vehicle-simulation.md); P03 remains unimplemented.
  메인이 P02 설계·지형/기대값·실행/테스트 코드를 검토했고 위 Sol이 TypeScript 실행 관리·증거 검사·가상 도로 11개·고정 엔진 Dockerfile·집중 검사 15개를 구현했습니다. 다음 P03 설계도 기록했으며 P03 구현은 아직 없습니다.
- Review corrections before final proof: same-OD alternatives; required expectations cannot be omitted; stored-engine versus original-fixture direction separated; actual no-path JSON/exit 1 recognized; edge IDs stored as strings; whole graph identity binds produced tile hashes; engine-evidence mismatches return 1 rather than input-error 2. Runtime/source/host/resource limits are recorded without claiming measured peak memory.
  최종 증거 전에 같은 출발/도착 우회·기대값 누락 거부·엔진/원본 방향 구분·실제 경로 없음 응답·문자열 구간 ID·타일 해시 결합·엔진 불일치 종료코드를 보정했습니다. 실제 실행/소스/호스트/한도를 기록하고 최대 메모리 실측으로 표현하지 않습니다.
- Sol's first development integration failed on an incorrect assumption that version output had a Valhalla prefix; exit 2, no completed manifest and cleanup were observed. After correcting the version check, `npm exec --yes --package=node@22.23.4 -- npm run graph:check -- --output data/p02-development-02` passed 8 assertions (22 directed mappings, six route cases and cleanup) in 4642.510583 ms. This dirty-source run preceded the final edge-ID/graph-identity metadata changes and is not final clean-source proof.
  최초 개발 통합은 버전 접두사 가정으로 실패했으며 종료코드 2·완료 목록 없음·정리를 확인했습니다. 보정 후 위 명령으로 22개 방향 대응·6경로·정리의 8판정이 통과했습니다. 미커밋 개발 실행이며 최종 식별자 보정 이전이므로 최종 깨끗한 증거로 사용하지 않습니다.
- Focused validation: initial `npm test` stopped at compilation due to a misplaced metadata field; corrected before tests. The next actual test run passed 47/48 in 1168.555583 ms. One new test incorrectly assumed a particular stored shape orientation. It was corrected to use an explicitly reversed unit input while retaining actual-response checks. Strict build then passed, followed by only the failing case: `npm exec --yes --package=node@22.23.4 -- node --test --test-name-pattern 'engine shape direction' dist/tests/test_graph.test.js` → 1/1 PASS, 90.5945 ms. Already-passing tests were not repeated locally. Final full 48-case result will come from CI.
  최초 검사는 메타데이터 필드 위치 때문에 컴파일에서 중단돼 수정했습니다. 다음 실제 검사는 47/48 통과했으며 신규 한 검사의 저장 지형 방향 가정이 잘못됐습니다. 실제 응답 검사는 유지하고 반전 입력을 명시해 보정한 뒤 엄격 빌드·실패 검사 하나만 재실행하여 통과했습니다. 이미 통과한 검사는 로컬에서 반복하지 않고 최종 48개 결과는 CI로 확인합니다.
- Main now commits implementation before independent Docker execution. Hosted checks remain engine-free P14a; P14b and forced supervisor-termination recovery remain separate work. Sol verified no owned P02 containers remained after development checks.
  메인이 구현을 먼저 커밋한 뒤 독립 Docker 검증을 실행합니다. 원격 검사는 엔진 없는 P14a이며 P14b·감독 프로세스 강제 종료 복구는 별도입니다. Sol은 개발 검사 후 소유 컨테이너가 없는 것을 확인했습니다.

## 2026-10-24 P02 independent proof / P02 독립 증명

- Main directly ran `/Users/dice/.npm/_npx/361c55be1121897e/node_modules/node/bin/node dist/tools/test_graph.js --output data/p02-main-20261024` on clean `7d68fd0e980b8b1c246498a3bd2c29330c22c735`. Eight assertions passed, including 22 directed edge mappings and six route cases. Total 6341.543167 ms includes warm-image preparation; it is not a production benchmark or peak-memory measurement.
  메인이 위 깨끗한 소스에서 Node 22.23.4로 직접 실행해 22방향 대응·6경로·정리의 8판정이 통과했습니다. 준비 포함 6341.543167ms는 이미지가 이미 있는 실행이며 운영 벤치마크·최대 메모리 측정이 아닙니다.
- Main independently inspected raw route/trace responses, expected way sequences, forbidden transition absence, exact 442/exit-1 negative responses, unique string IDs, car-access flags, source/runtime/host and all input/PBF/config/tile hashes. Recomputed graph identity from inputs/image/engine/tile hashes. Actual pre-cleanup container inspection confirms no network or published ports and CPU 2/2 GiB limits. Post-run Docker listing has zero owned containers. Reusing output returns 2 and preserves existing hashes.
  메인이 원본 경로/구간 응답·도로 순서·금지 전환 부재·정확한 오류/종료코드·문자열 ID·통행권한·출처·전체 파일 해시를 독립 검사하고 그래프 식별을 다시 계산했습니다. 실제 컨테이너 조회로 통신/포트 없음·자원 한도를 확인했고 실행 후 잔여 소유 컨테이너 0개·기존 출력 보존을 확인했습니다.
- [CI 40070623970](https://github.com/dicebattle/routelens/actions/runs/40070623970) on the same implementation passed Node 22/24 and Required checks. Main inspected logs: both versions report 48 passed, 0 failed/skipped. Hosted P14a remains engine-free. [Preserved proof](../research/pilot/p02-main-2026-10-24.json), [module](modules/test-graph.md).
  같은 구현의 CI에서 Node 22·24·종합 검사가 통과했고 메인이 로그의 버전별 48통과·실패/생략 0개를 확인했습니다. 원격 P14a는 엔진을 실행하지 않으며 실제 엔진 증거는 로컬 실행입니다. 위 증거·모듈 문서를 보존합니다.
- Next is P03 with its design already recorded; P04 matching, traffic, two-node reliability and the complete pilot remain. User-authorized protected integration follows after the final documentation head passes required checks; no protection bypass.
  다음은 설계가 기록된 P03이며 P04 매칭·교통·두 노드 신뢰성·전체 파일럿은 남아 있습니다. 사용자 요청의 보호된 병합은 최종 문서 HEAD 필수 검사 후 수행하며 보호를 우회하지 않습니다.

- Final consistency check: 21 current documentation pages had no missing relative file links. Updated the geographic module's next-step pointer to P03; its real-road quota and readiness behavior remain unchanged. Final branch SHA is verified against origin before protected PR integration.
  최종 일관성 검사에서 현재 문서 21개의 상대 파일 링크 누락은 없었습니다. 실제 지역 모듈의 다음 단계만 P03으로 맞추고 실제 도로 기준·준비 동작은 유지했습니다. 보호된 PR 병합 전에 작업 브랜치 SHA를 원격과 대조합니다.

## 2026-10-24 Continuing pilot and recorded evidence goal / 지속 파일럿·녹화 증거 목표

- User requested continuing implementation, periodic simulations of every implemented module, captured reports on GitHub, English/Korean project READMEs with recorded demos, updates after implementation changes, and reference research into AI-development READMEs. The [completion audit](../docs/18-goal-progress.md) preserves the complete P01–P14 objective; P03 is an increment, not the goal's endpoint. The preceding turn made verified progress: P02 was merged and directly demonstrated, with no leftover owned container.
  사용자가 지속 구현·전체 구현 모듈 시뮬레이션·GitHub 캡처 보고서·한영 README와 녹화·변경 시 갱신·참고 조사를 요청했습니다. 완료 판정표에 전체 목표를 유지하며 P03만으로 완료하지 않습니다. 이전 차례는 P02 병합·직접 증거·잔여 컨테이너 없음으로 검증된 진전입니다.
- Main rechecked clean main `6181f2a`, fetched origin, and began `feat/p03-simulation-evidence`. Main wrote the [P03/integration/media contract](../docs/17-simulation-evidence-delivery.md). Sol `bilingual_cli` owns simulation/runtime/tests/CI; Sol `simulation_viewer` owns evidence rendering, local report server and media freshness validation. Their data contract is fixed, ownership is disjoint and main retains final review/capture responsibility.
  메인이 깨끗한 main·원격을 확인하고 새 작업 브랜치에서 계약을 작성했습니다. Sol 두 명은 실행·검사·CI와 증거 화면·서버·미디어 검사로 소유 범위를 나눕니다. 자료 계약을 고정하고 메인이 최종 검토·캡처를 담당합니다.
- Main inspected Aider/OpenHands/Codex official README sources; [research notes](sources/readme-presentation.md) record the adapted structure and limits. The frontend-design skill guides the evidence replay's map-first presentation. In-app browser checks remain default; Playwright is reserved for actual video capture where unavailable in-app, with owned-session cleanup.
  공식 README 조사·적용 범위·한계를 출처 문서에 기록했습니다. frontend-design으로 지도 중심 증거 화면을 구성하고 내장 브라우저로 검토합니다. 내장 기능이 없는 영상 녹화에만 Playwright를 사용하며 소유 세션을 정리합니다.

## 2026-10-24 P03 development integration and viewer review / P03 개발 통합·화면 검토

- Sol `bilingual_cli` implemented bundle integrity checks, P03 and the fresh integrated runner. Its first focused run of 18 new tests passed in 1098.608917 ms; a TypeScript test-argument typing error was fixed before that test execution. Development command `node dist/tools/simulation_checks.js --output data/p03-development-01` (Node 22.23.4) executed fresh corpus/P01/P02/P03/replay stages: 30/30 assertions passed, with 187 truth samples, 177 observations, ten omissions and eight traversals. The dirty development run is not final publication evidence. Owned Docker containers were absent afterward.
  Sol이 묶음 무결성·P03·새 통합 실행기를 구현했고 신규18개 집중 검사가 최초 실행에서 통과했습니다. 테스트 인자 타입 오류는 실행 전에 수정했습니다. 개발 통합에서 모든 모듈을 실제 실행해30/30과독립 개수가 일치했지만 미커밋 개발 실행이므로 최종 공개 증거로 쓰지 않습니다. 소유 컨테이너 잔여는 없었습니다.
- Sol `simulation_viewer` implemented offline rendering, a bounded loopback server and media freshness verification. Focused checks covered supplied provenance, script escaping, server path/symlink boundaries, stale/missing/modified artifacts and both README links. Main inspected actual development output in the in-app browser: English/Korean switching, time scrubber, replay/pause (26.2 → 45.6 simulated seconds), vehicle selection, full-fixture toggle and keyboard Home/End. At a 390-pixel mobile breakpoint, document width and scroll width were both 390.
  다른 Sol이 외부 연결 없는 재생·로컬 서버·미디어 검사를 구현했습니다. 출처·스크립트 삽입·경로·자료 변조·한영 README 링크를 집중 검사했고 메인이 실제 브라우저로 언어·시각·재생/정지·차량·전체망·키보드를 확인했습니다. 모바일390px에서 가로 넘침이 없었습니다.
- Visual review found that a fixed-height map pushed controls off a 720-pixel viewport and road/vehicle labels overlapped. Sol made the map viewport-responsive, kept screen-space text sizes, moved road labels to segment midpoints and separated directional label placement. Main rechecked the resulting actual report. Preview HTML variants preserved original run reports; final capture will regenerate from clean source.
  실제 검토에서720px 화면의 조작부 밀림·라벨 겹침을 발견해 Sol이 화면 크기 대응·글자 크기·중간점 라벨·상하/좌우 배치를 보정했고 메인이 다시 확인했습니다. 미리보기는 원본 보고서를 보존하며 최종 캡처는 깨끗한 소스로 다시 생성합니다.
- CI now keeps the existing Node 22/24 unit gate and adds media freshness plus a separate real Docker integrated run to Required checks. It triggers on push/PR/manual dispatch. An initially proposed daily schedule was removed by main: this task's periodic checks run with implementation increments; no arbitrary daily time was adopted. Small raw JSON/trace evidence is uploaded for seven days, without graph binaries.
  CI에 미디어 최신 상태·실제 Docker 통합을 추가하고 기존 Node 두 버전과 함께 필수 조건으로 묶었습니다. 푸시/PR/수동 실행을 사용하고 임의의 매일 실행 시간은 메인이 제외했습니다. 구현 단위별 검사를 수행하며 작은 원본JSON/경로 증거를7일 보관하고 그래프 바이너리는 제외합니다.

## 2026-10-24 Clean P03 integration and captured demo / 깨끗한 P03 통합·데모 캡처

- Main executed `node dist/tools/simulation_checks.js --output data/p03-main-20261024` using Node 22.23.4 on clean `5422399dcfbce746990600fbdda7ab2cca183f09`. Five fresh stages and 30/30 assertions passed. Main independently recomputed raw file/tile hashes, checked all child source identities, 187/177/10/8 counts, exact baseline/upper exits, initial waiting, half-open drop times, seed/fault invariance, invalid/tampered rejection and preservation of existing output. [Report](../research/pilot/2026-10-24-p03/report.md), [independent proof](../research/pilot/2026-10-24-p03/main-verification.json).
  메인이 위 깨끗한 소스로 새5단계·30판정을 실행하고 원본/타일 해시·하위 출처·독립 개수/시각·대기/누락·재생 불변성·거부/기존 출력 보존을 직접 확인했습니다. 증거를 위 경로에 보존합니다.
- Main opened the clean report in-app, then recorded actual Chrome playback through one owned Playwright CLI session. Final MP4 is 31 seconds, 1280×720 H.264/20fps; GIF and EN/KO/assertion screenshots derive from that actual run. Representative frames and final decoding were inspected. Recording browser closed, daemon PID absent, CLI list reported no browsers; in-app tab closed and temporary viewport reset. Report server timed out and its port no longer listened; no owned engine containers remained.
  메인이 깨끗한 보고서를 내장 브라우저로 확인하고 소유 Playwright 세션 하나로 실제 Chrome 재생을 녹화했습니다. MP4·GIF·영문/국문/판정 화면은 실제 실행에서 나온 자료이며 프레임·디코딩도 확인했습니다. 브라우저·내장 탭·화면 크기 임시 설정을 정리하고 서버 포트·컨테이너 잔여 없음도 확인했습니다.
- The initial Chrome-for-Testing launch failed because its expected executable was absent; that daemon exited. Recording used an isolated installed Chrome profile instead. The optional favicon returned 404; no report-script failure occurred. No user browser profile/session was reused or closed. `media:check` passed against the current implementation fingerprint and both README links.
  최초 테스트용 Chrome 실행은 파일 부재로 종료됐고 설치된 Chrome의 격리 프로필로 녹화했습니다. 선택적 favicon의404외에 보고서 스크립트 오류는 없었습니다. 사용자 프로필/세션을 재사용하거나 닫지 않았으며 현재 미디어 검사가 통과했습니다.
- Captured reports/media are prepared for GitHub delivery. Runtime files remain identical to the recorded implementation; only evidence/docs and temporary-output ignore rules follow. Full hosted checks and artifact read-back are evaluated after push. The overall goal remains active: P04 onward and the complete pilot are not done.
  GitHub 반영용 캡처·보고서를 준비했고 녹화한 실행 코드는 그대로 유지하며 증거·문서·임시 출력 무시 규칙만 이어집니다. 원격 검사·결과물 재조회는 푸시 후 확인합니다. P04 이후 전체 파일럿은 아직 미완료이며 목표를 계속 유지합니다.

## 2026-10-24 Hosted whole-module evidence / 원격 전체 구현 모듈 증거

- [Actions 40080824622](https://github.com/dicebattle/routelens/actions/runs/40080824622) on pushed `3f735adc6c6ad2b5b9e6a1ba101d81504a1b78f5` passed Node22/24 (71/71 each), media validation, the actual fresh Docker integrated job and Required checks. Main downloaded all artifacts, checked the exact clean source, recomputed available root/P03 hashes and verified 30 assertions, independent counts/crossings, replay hashes and engine cleanup. [Hosted evidence](../research/pilot/2026-10-24-p03/hosted-verification.json).
  푸시한 위 커밋에서 Node두버전각71개·미디어·실제새Docker통합·종합검사가 통과했습니다. 메인이 결과물을 내려받아 깨끗한 소스·원본 해시·30판정·독립 개수/시각·재생·정리를 확인했습니다.
- Local/hosted image architectures differ (arm64/amd64), so graph IDs differ deliberately; each run preserves its own graph ID across modules. Runtime fingerprint matches the captured implementation. No protection bypass or graph-ID substitution occurred.
  로컬/원격 이미지 아키텍처 차이에 따라 그래프 ID는 다르며 각 실행 내부에서는 정확한 식별을 유지합니다. 구현 지문은 녹화와 일치하고 보호 우회·그래프 치환은 없습니다.
- Main inspected the official map-matching API and recorded [P04 design notes](../docs/19-p04-matching-design.md). Exact release response fields and exclusion/interpolation thresholds must be probed before coding. P04 has not been marked implemented, and the continuing full-project goal remains active.
  공식 매칭 API를 확인하고 P04 설계 기록을 남겼습니다. 코딩 전에 고정 릴리스 필드·제외/보간 기준을 실제로 확인해야 합니다. P04 구현으로 표시하지 않으며 전체 목표를 계속 유지합니다.

## 2026-10-24 P04 design and pinned engine investigation / P04 설계·고정 엔진 조사

- Main verified clean main `fe1990d`, then created `feat/p04-map-matching`. P03 was verified progress; the full pilot goal remains active. [P04 contract](../docs/19-p04-matching-design.md) now fixes observations-only input, graph integrity, 3-second continuity, conservative parallel-road exclusion, observed boundary interpolation, complete/partial traversal rules and bounded finalization across input batches.
  메인이 깨끗한 main을 확인하고 작업 브랜치를 만들었습니다. P03은 검증된 진전이며 전체 파일럿 목표는 계속됩니다. P04 계약에 관측 전용 입력·그래프 무결성·3초 연속성·평행도로 제외·관측 경계 보간·완전/일부 통과·배치 문맥을 확정했습니다.
- Main executed four real pinned Valhalla 3.9.1 map-snap requests on the reverified P03 graph with network disabled and a read-only graph mount. [Probe evidence](../research/pilot/2026-10-24-p04/probe/inspection.json) preserves raw requests/responses and truthful cleanup diagnostics. An ambiguous midpoint was successfully assigned to AB by the engine, so successful matching alone is not an acceptance criterion. Initial duplicate-coordinate waiting points were returned as interpolated; they must not lose their observed times.
  메인이 재검사한 P03 그래프를 읽기 전용 연결·통신 차단 상태에서 실제 엔진 네 번을 실행했습니다. 요청·응답·정리 진단을 보존했습니다. 모호한 중간점도 AB 성공으로 나와 엔진 성공만으로 수용하지 않습니다. 초기 정지 반복점은 보간으로 반환됐지만 원래 관측시간을 버리면 안 됩니다.
- Main delegated implementation to existing Sol agents: `bilingual_cli` owns matcher, narrowly shared container support, tests and full integration; `simulation_viewer` owns optional report data/rendering and focused viewer tests. Main owns design, independent review, integrated execution, capture, documentation and authorized protected delivery. Files do not overlap.
  기존 Sol 두 명에게 구현을 위임했습니다. 한 명은 매칭·필요한 컨테이너 지원·검사·전체 통합을, 다른 한 명은 보고 자료/화면·집중 검사를 맡습니다. 메인은 설계·독립 검토·통합 실행·캡처·문서·보호된 결과 전달을 담당하며 파일 소유 범위를 나눴습니다.

- Review found that unmatched/distance-excluded middle points could otherwise bridge same-edge entry and exit. Sol added an explicit timing break and regressions. Main also checked pinned source support for request-file arguments, avoiding oversized command arguments, and fixed per-vehicle limits to P03's3,001 samples. Integration implementation was transferred to the now-available `simulation_viewer` Sol after the matcher API was saved; backend runtime/tests remain with `bilingual_cli` and file ownership stays disjoint.
  검토에서 구간 중간 미대응/거리 제외를 건너 진입·진출을 이을 가능성을 발견해 Sol이 단절·회귀 검사를 추가했습니다. 메인은 고정 소스의 요청 파일 지원을 확인해 긴 명령 인자를 피하고 차량별 한도를 P03의3,001개로 고정했습니다. 매칭 API 저장 후 통합은 작업이 끝난 다른 Sol에게 이관했고 실행 코드·검사는 기존 Sol이 유지하며 파일 소유는 겹치지 않습니다.
- Historical P03 result data is unchanged. Its narrative media links now point to the exact P03 merge commit, and original media metadata bytes are archived alongside the report so refreshing the current demo cannot replace historical proof. Main recorded [P05's next responsibility and direct crash-recovery gate](../docs/20-p05-ingestion-design.md); it remains planned.
  P03 원본 결과는 유지하고 서술 보고서의 미디어 링크만 당시 병합 커밋에 고정했습니다. 원래 메타데이터도 보존해 최신 데모 교체로 과거 증거가 바뀌지 않게 했습니다. 메인은 P05 책임·실제 중단 복구 기준을 후속 설계에 기록했으며 아직 계획입니다.

- Sol's first focused matcher run passed21/21 in842.182167ms under Node22.23.4: `node --test dist/tests/matching_evidence.test.js dist/tests/map_matcher.test.js`. The viewer file passed6/6 once; the integration-evaluator file passed6/6 once. Strict TypeScript builds passed. These are focused code checks, not the pending full real-engine run. No whole simulation had been run before this implementation commit.
  Sol의 최초 매칭 집중 검사21/21이 Node22.23.4에서842.182167ms로 통과했습니다. 화면 파일6/6·통합 평가 파일6/6도 각각 한 번 통과했고 strict 빌드가 성공했습니다. 이는 집중 코드 검사이며 전체 실제 엔진 검증은 다음 단계입니다. 이 구현 커밋 전에는 전체 시뮬레이션을 실행하지 않았습니다.

- First clean integration at `5afbb0c` exited1: `node dist/tools/simulation_checks.js --output data/p04-main-20261024`. Normal matching,3m-noise internal boundaries(max444ms), parallel exclusion and split/overlap parity passed. The tampered input was correctly refused, but its input directory and requested output directory shared a name, so the evaluator mistook the pre-existing P02 manifest for a new output. Sol is separating the paths and adding a regression; [original failure](../research/pilot/2026-10-24-p04/failed-first-run/README.md) is preserved. Owned container listing was empty after the failed run.
  최초 깨끗한 전체 실행은 종료1이었습니다. 정상 매칭·3m잡음 내부 경계(최대444ms)·평행 제외·분할/중첩은 통과했습니다. 변조 입력도 정상 거부됐지만 입력·출력 폴더 이름이 겹쳐 평가기가 기존P02목록을 새 결과로 오인했습니다. Sol이 경로를 분리하고 회귀 검사를 추가하며 원래 실패는 보존합니다. 실패 후 소유 컨테이너 목록은 비어 있었습니다.
- Sol separated rejected-output directories and recorded their paths/manifest absence. The new regression initially failed because its test fixture tried to create an already existing temporary directory; changing it to a child directory made the single targeted retry pass. Strict build passed. This was a test setup failure, separate from the original integration-path bug.
  Sol이 거부 결과 폴더를 분리하고 경로·완료 목록 부재를 기록했습니다. 새 회귀의 첫 실행은 시험자료가 이미 있는 임시 폴더를 다시 생성해 실패했고 하위 폴더로 바꾼 한 번의 집중 재실행이 통과했습니다. strict 빌드도 통과했습니다. 원래 통합 경로 결함과 별개의 검사 준비 오류입니다.

- Clean source `dccafeb197a1f878ea0e61ac3dd77156185d4424` passed the single corrected full integration:48/48,6 stages. Main independently checked137 raw matching file hashes, fixed clean boundary times(max1ms), noisy internal boundary error(max444ms),177/177 matched points with6/8 complete traversals accepted,21/21 parallel exclusions, exact split/overlap result bytes and absent owned containers. The missing2 baseline traversals and1 noisy traversal remain explicit in full-denominator evaluations.
  수정한 깨끗한 소스의 전체 통합 한 번이6단계·48/48을 통과했습니다. 메인이 원본 매칭137해시·깨끗한 경계 최대1ms·잡음 내부 최대444ms·177관측 대응/8통과 중6수용·평행21제외·분할/중첩 바이트 동일성·컨테이너 부재를 확인했습니다. 기본2개·잡음1개의 미회수 통과를 전체 분모 평가에 그대로 남겼습니다.
- In-app desktop/mobile inspection passed language, time/omission, vehicle/toggle and playback checks with no horizontal overflow or captured JavaScript errors. Recorded17.75s actual playback and refreshed both READMEs, screenshots and GIF/MP4. The first capture attempt used a stale details reference after language change and was discarded; the owned browser closed. A second isolated capture completed and both its daemon/browser PIDs were confirmed absent. Only the standard favicon404 appeared. Media fingerprint and hashes passed. Hosted CI/push remain the next gate.
  내장 브라우저 데스크톱/모바일에서 언어·시각/누락·차량/표시·재생을 확인했고 가로 넘침·확인된 JavaScript 오류는 없었습니다. 실제17.75초 녹화·두README·스크린샷·GIF/MP4를 갱신했습니다. 첫 캡처는 언어 변경 뒤 오래된 참조를 사용해 폐기됐고 해당 브라우저를 닫았습니다. 두 번째 격리 녹화는 완료했고 데몬/브라우저 PID 부재를 확인했습니다. favicon404만 있었으며 미디어 지문·해시는 통과했습니다. 다음은 원격 CI·푸시입니다.
