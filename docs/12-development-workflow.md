# Development workflow / 개발 작업 절차

Effective 2026-10-24. Every task with repository changes ends with a descriptive commit, a feature-branch push, and remote commit verification. Pushing is the handoff; merging and deployment are separate actions.

2026-10-24부터 저장소 변경 작업은 이유가 드러나는 커밋, 작업 브랜치 푸시, 원격 커밋 확인으로 마무리합니다. 푸시는 결과 전달이며 병합·배포는 별도 작업입니다.

## Protected main / main 보호

| Rule / 규칙 | Applied setting / 적용 설정 |
| --- | --- |
| Pull request before merging / 병합 전 PR | Required / 필수 |
| Administrator enforcement / 관리자 적용 | Enabled / 적용 |
| Force pushes / 강제 푸시 | Blocked / 차단 |
| Branch deletion / 브랜치 삭제 | Blocked / 차단 |
| Resolve review conversations / 리뷰 대화 해결 | Required / 필수 |
| Independent approving reviewers / 별도 승인자 | 0 for the initial solo-maintainer repository / 초기 단독 유지관리 저장소이므로 0명 |
| Required automated status checks / 필수 자동 검사 | None yet; add actual successful check names in P14a / 아직 없음; P14a에서 실제 성공한 검사 이름을 등록 |

This protection blocks ordinary direct pushes, including administrator pushes. It does not prevent the owner from explicitly changing settings. Requiring a pull request is not the same as requiring an independent approval. Increase approval requirements when another maintainer is available. Do not invent a required CI check that has never run.

이 보호는 관리자를 포함한 일반적인 직접 푸시를 막습니다. 소유자가 설정 자체를 변경하는 권한까지 없애지는 않습니다. PR 필수와 독립된 사람의 승인 필수는 다릅니다. 다른 유지관리자가 생기면 승인 조건을 강화합니다. 실행한 적 없는 CI 검사 이름을 임의로 필수 등록하지 않습니다.

The settings were applied and read back through GitHub's branch-protection API; see [recorded settings](../research/repository/main-protection-2026-10-24.json). No direct push was attempted as a destructive test. The [GitHub API documentation](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection) defines these settings.

GitHub 브랜치 보호 API로 적용 후 재조회했습니다. [기록된 설정](../research/repository/main-protection-2026-10-24.json)을 참고하세요. 보호 확인을 위해 실제 직접 푸시를 시도하지는 않았습니다. 설정의 의미는 [GitHub API 문서](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection)에 따릅니다.

## Task sequence / 작업 순서

1. Read the wiki and inspect status. Preserve unrelated changes. Start a focused branch from current `origin/main`; an ongoing task may continue its existing branch after checking divergence.
2. Record the intended behavior, module boundary and acceptance checks before coding. The main agent designs and reviews; the configured implementation model writes code.
3. Run the focused test and inspect actual outputs. Add integration checks only when the implemented boundary needs them. Record failures and limitations honestly.
4. Update the canonical design, module page, wiki log and index. Keep machine-readable run evidence tied to exact inputs and code.
5. Commit using the English-first/Korean-second template. Do not rewrite shared history to improve wording.
6. Push the working branch and compare its remote SHA with local HEAD. A local commit alone is not task completion. If push fails, preserve the work and report that the handoff is incomplete.
7. Open or update a pull request only when authorized for that action. Do not merge, disable protection or force-push to finish a task. A pushed branch is a valid handoff pending review.

1. 위키·작업 상태를 읽고 다른 변경을 보존합니다. 새 작업은 최신 `origin/main`에서 범위가 명확한 브랜치를 만들고, 진행 중인 작업은 분기 상태를 확인한 뒤 기존 브랜치를 이어갑니다.
2. 코드 작성 전에 동작·모듈 경계·통과 기준을 기록합니다. 메인 에이전트가 설계·검토하고 지정된 구현 모델이 코드를 작성합니다.
3. 집중 테스트와 실제 출력을 확인합니다. 구현한 연결 경계에 필요할 때 통합 검사를 추가하고 실패·한계를 그대로 기록합니다.
4. 기준 설계·모듈 문서·작업 기록·인덱스를 함께 갱신합니다. 실행 증거는 정확한 입력과 코드에 연결합니다.
5. 영어 우선·한국어 병기 템플릿으로 커밋합니다. 문구 개선을 위해 공유된 이력을 다시 쓰지 않습니다.
6. 작업 브랜치를 푸시하고 원격 SHA와 로컬 HEAD를 비교합니다. 로컬 커밋만으로 완료 처리하지 않으며, 푸시에 실패하면 작업을 보존하고 전달 미완료를 보고합니다.
7. PR 작성·수정은 해당 작업의 승인이 있을 때 수행합니다. 작업 마무리를 위해 임의로 병합·보호 해제·강제 푸시하지 않습니다. 검토를 기다리는 브랜치 푸시는 정상적인 결과 전달입니다.

## Commit messages / 커밋 메시지

Use a concrete English subject followed by a Korean subject/summary. Explain **why**, **what changed**, **how it was checked**, and **what remains unverified**. Avoid messages such as `update`, `fix`, or `작업 완료` without context. Keep trailers such as `Signed-off-by` in their standard machine-readable form.

구체적인 영문 제목 뒤에 한국어 제목·요약을 적습니다. **왜 작성했는지, 무엇을 바꿨는지, 어떻게 확인했는지, 무엇이 미검증인지**를 설명합니다. 맥락 없는 `update`, `fix`, `작업 완료` 같은 메시지는 피합니다. `Signed-off-by` 등 도구가 읽는 표준 꼬리말은 번역하지 않습니다.

The tracked [.gitmessage](../.gitmessage) provides a template. Local repositories may set `commit.template` to that file. Agents creating commits with `-F` must still follow the content requirements. Use a file for multiline messages to preserve line breaks safely.

버전 관리하는 [.gitmessage](../.gitmessage)를 템플릿으로 사용합니다. 로컬 Git의 `commit.template`에 연결할 수 있습니다. `-F`로 커밋하는 에이전트도 같은 내용을 작성해야 하며, 여러 줄 메시지는 파일로 전달해 줄바꿈을 보존합니다.

## English first, Korean included / 영어 우선·한국어 병기

Apply this to new or changed user-facing UI copy, CLI help/errors, application logs intended for people, test failure guidance, reports, documentation, commit messages and task replies. Keep protocol keys, enum values, commands, identifiers and standard tool output intact. Structured messages should use stable codes plus `message_en` and `message_ko`; existing interfaces may add a Korean field without renaming their English fields.

새로 작성하거나 바꾸는 UI 문구·CLI 도움말/오류·사람이 읽는 로그·테스트 실패 안내·보고서·문서·커밋 메시지·대화 답변에 적용합니다. 프로토콜 키·enum·명령어·식별자·표준 도구 출력은 유지합니다. 구조화된 메시지는 고정 코드와 `message_en`, `message_ko`를 사용하고, 기존 인터페이스는 영문 필드 이름을 유지하며 한국어 필드를 추가할 수 있습니다.

Third-party runtime errors are preserved verbatim with English/Korean context or recovery guidance. The rule does not mean changing the user's operating-system language, GitHub UI language, or upstream source code. Historical commits and immutable evidence are not rewritten. Older Korean-only planning documents remain historical baseline content and should gain English counterparts when substantively revised; do not claim that the entire archive has already been translated.

외부 실행 도구 오류는 원문을 보존하고 영어·한국어 맥락 또는 해결 안내를 덧붙입니다. 사용자 운영체제·GitHub 화면의 언어 설정이나 외부 소스 코드를 바꾸라는 뜻으로 해석하지 않습니다. 과거 커밋과 보존된 증거는 다시 쓰지 않습니다. 기존 한국어 중심 설계 문서는 기준 기록으로 남기고 실질적으로 갱신할 때 영어를 추가하며, 전체 과거 자료의 번역이 끝났다고 주장하지 않습니다.
