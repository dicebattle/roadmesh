# README presentation research / README 표현 조사

Inspected official repository READMEs on 2026-10-24. These are AI-development projects; their README structure is useful, but their screenshots, copy, adoption counts and claimed maturity are not RouteLens assets or evidence. This review does not claim their complete histories were authored by AI.

2026-10-24 공식 저장소 README를 확인했습니다. AI 개발 프로젝트의 문서 구조를 참고하되 화면·문구·사용 규모·성숙도 주장을 RouteLens 자산이나 증거로 사용하지 않습니다. 해당 프로젝트의 전체 이력이 AI로 작성됐다고 주장하지 않습니다.

- [Aider](https://github.com/Aider-AI/aider): concise purpose, capability sections and quickstart with links to richer documentation. Apply concise product explanation and runnable examples; do not copy promotional claims or model lists.
  목적·기능·실행법·상세 문서 연결을 참고해 구체적인 소개·실행 예시를 작성합니다. 홍보 문구·모델 목록은 복사하지 않습니다.
- [OpenHands](https://github.com/OpenHands/OpenHands): visible product capabilities and concrete local/server setup paths with prerequisites. Apply an honest implemented/planned distinction and a clear Docker requirement for the real-engine simulation.
  실제 기능과 로컬/서버 실행의 준비 조건을 구분하는 방식을 참고합니다. RouteLens의 구현/계획과 실제 엔진 실행에 필요한 Docker를 명시합니다.
- [Codex](https://github.com/openai/codex): short opening explanation, quickstart early, focused links to documentation/contribution/license. Apply a short first screen and a navigable handbook rather than embedding the whole roadmap in README.
  짧은 첫 설명·앞쪽 실행법·문서/기여/라이선스 연결을 참고합니다. 전체 로드맵을 README에 복사하지 않고 탐색 가능한 문서로 연결합니다.

Chosen RouteLens layout: name and one-sentence purpose → English/Korean switch → actual recorded simulation preview → what works today → one-command simulation → architecture/reuse diagram → evidence and next module → contribution/license. Only real CI/license badges. Separate README.md (English) and README.ko.md (Korean), both linking the same current media and dated report. Every capture references exact tested source and an implementation fingerprint; stale captures fail the media check.

RouteLens는 이름·한 문장 목적 → 한영 전환 → 실제 시뮬레이션 녹화 → 현재 기능 → 한 명령 실행 → 구조/재사용 그림 → 증거·다음 단계 → 기여/라이선스 순서로 구성합니다. 실제 CI·라이선스 배지만 사용하고 영문/국문 파일은 같은 최신 미디어·날짜별 보고서를 연결합니다. 캡처는 정확한 소스·구현 지문에 연결하고 오래된 자료는 검사에서 거부합니다.

AI-assisted commit evidence was also checked directly through GitHub's commit API: Aider commit [`308b1546`](https://github.com/Aider-AI/aider/commit/308b1546a035ef012ac91ffb83a2139d01325526) includes an `aider (gpt-5.4)` co-author trailer. This is evidence of disclosed AI assistance for that commit, not proof that every contribution is agent-written. RouteLens follows the useful transparency practice by recording actual design/implementation ownership and validation in its work log and descriptive commits.

GitHub 커밋 API로 AI 협업 표시도 직접 확인했습니다. 위 Aider 커밋에는 `aider (gpt-5.4)` 공동 작성자 꼬리말이 있습니다. 해당 커밋의 공개된 AI 협업 근거이며 모든 기여가 에이전트 작성이라는 증거는 아닙니다. RouteLens는 실제 설계·구현 담당과 검증을 작업 기록·설명 있는 커밋에 남기는 투명성을 적용합니다.
