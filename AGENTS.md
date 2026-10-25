# Repository instructions

- This repository is in early M0 implementation. Do not describe plans as implemented or measured.
- Start with wiki/index.md, wiki/log.md and the relevant roadmap milestone. Read docs/09-decisions.md before changing architecture.
- Keep changes minimal and understandable. Prefer maintained upstream components and narrow adapters.
- Do not add real location traces, secrets, private conversation exports, or data lacking redistribution permission.
- Never publish, deploy, provision paid resources, message others, or change other repositories without authorization for that action.
- Preserve the graph/version/traffic contract. Unknown or expired observations must not be presented as live traffic.
- Use focused tests for changes; do not restart healthy running tests merely to obtain different output.
- Use the in-app browser for ordinary manual web checks, close temporary tabs, and stop only temporary processes started for this task.
- For implementation, follow the model-specific delegation rules below even for small scoped work. Avoid additional delegation for small investigations or documentation-only changes.

## Delivery and language / 결과 전달과 언어

- Follow docs/12-development-workflow.md. Main is protected: work on a focused branch, finish repository changes with a descriptive commit and push, then verify the remote SHA. Never bypass protection or merge without authorization.
  docs/12-development-workflow.md를 따릅니다. main은 보호되어 있으므로 작업 브랜치에서 변경하고, 이유가 드러나는 커밋과 푸시 후 원격 SHA를 확인합니다. 임의로 보호를 우회하거나 병합하지 않습니다.
- Write new or changed repository artifacts in English first with Korean included: UI, CLI, application diagnostics, reports, documentation and commit messages. Conversation with this user stays Korean-only unless requested otherwise. Preserve protocol identifiers and standard tool output; add bilingual context for third-party diagnostics. Do not change the host OS language.
  저장소에 새로 작성하거나 수정하는 UI·CLI·진단·보고서·문서·커밋은 영어 우선에 한국어를 병기합니다. 이 사용자와의 대화는 별도 요청이 없으면 한국어만 사용합니다. 규격 식별자와 표준 도구 원문은 유지하고 외부 오류에는 이중 언어 설명을 추가합니다. 운영체제 언어 설정은 변경하지 않습니다.
- Use .gitmessage as a guide: why, changes, validation and limitations must be understandable to humans and agents. Preserve old commits and immutable reports rather than rewriting history for translation.
  .gitmessage를 기준으로 이유·변경·검증·한계를 사람과 에이전트가 이해하게 작성합니다. 번역을 위해 과거 커밋·보존 보고서를 다시 쓰지 않습니다.
- Local pilot implementation follows docs/11-local-pilot.md. Each module needs a direct test and inspected evidence before completion. Synthetic pipeline proof is separate from real-road accuracy, real mobile behavior and hosted-cloud validation.
  로컬 파일럿 구현은 docs/11-local-pilot.md를 따릅니다. 모듈마다 직접 테스트와 증거 확인 후 완료 처리합니다. 합성 처리 흐름의 검증은 실제 도로 정확도·모바일 동작·클라우드 검증과 구분합니다.

## Design and implementation ownership

- The main agent owns requirements, architecture, interfaces, implementation scope, acceptance criteria and the project plan. It also reviews the implementation and verification evidence before reporting completion.
- When the main agent is an Astra model, delegate coding to a Sol subagent. This includes implementation, code fixes and test code. Use an available Sol model rather than inheriting Astra for the implementation subagent.
- When the main agent is Claude, delegate implementation to Codex when available, or to a Sonnet subagent. Claude remains responsible for design and final review.
- These are model-specific rules: they do not require a main Sol agent to delegate its own coding. Do not infer the active model from task content; use the model identity exposed by the environment.
- Before delegating, provide the decided design, relevant repository documents, owned files/modules, constraints and acceptance checks. Tell the implementer that others may be working in the repository and that it must preserve their edits.
- Prefer one implementation agent for a small module. Do not assign overlapping files to multiple agents or create parallel work that depends on unfinished design decisions.
- The main agent may directly update plans, instructions and knowledge documents. Delegation does not remove its responsibility to check correctness, minimal scope and test evidence.
- If the required implementation model or delegation mechanism is unavailable, report that limitation and resolve the alternative with the user before substituting a different implementation model. Never claim delegation occurred when it did not.
- Record the design owner, actual implementation model/agent, scope, review outcome and verification in wiki/log.md for implementation tasks. Existing authorization boundaries for publishing, deployment and paid resources still apply.

## Persistent project knowledge

- Record every substantive plan, implementation, investigation outcome and verification in this repository during the same task. A chat-only conclusion is incomplete.
- Keep docs/ as the canonical product, architecture, protocol and roadmap; wiki/modules/ records implemented module behavior and boundaries. Link rather than duplicate those documents.
- Add source notes under wiki/sources/ with URLs, access date, relevant findings, confidence and affected decisions. Preserve existing research snapshots; add dated evidence instead of overwriting observations.
- Append dated entries to wiki/log.md with the request, decision, changed code/docs, exact validation commands and outcomes, limitations and next step. Correct errors with a new entry; do not rewrite past outcomes to look successful.
- Update wiki/index.md and relevant canonical pages whenever facts or implementation status change. Explicitly mark superseded plans and contradictions. Do not claim a milestone is done when only a subtask passed.
- Keep facts, hypotheses, proposals and measured results distinct. Summaries must lead back to code, tests or original sources; repeating another summary is not new evidence.
- Before finishing, check internal links, consistency of status and privacy of published material. Do not copy private chats or copyrighted full articles into the public wiki.
- Repository documentation does not authorize deployments, paid resources or unrelated external posts. Follow the user's authorized scope for commits and publishing.

## Integrated simulation and current demos / 통합 시뮬레이션·최신 데모

- Continue the full pilot objective in docs/18-goal-progress.md. An increment passing does not finish unimplemented modules. For each implementation increment, run all implemented modules together through the fresh simulation command and inspect real outputs, not only unit tests or prior PASS files.
  docs/18-goal-progress.md의 전체 파일럿 목표를 유지합니다. 일부 통과를 미구현 모듈의 완료로 보지 않습니다. 구현 단위마다 새 통합 명령으로 구현된 모든 모듈을 실행하고 단위 검사·과거 성공 파일뿐 아니라 실제 결과를 검사합니다.
- Publish bilingual dated reports with exact source/graph identity, screenshots and actual recorded playback. Refresh README.md, README.ko.md and demo assets when runtime behavior changes. Keep the media implementation fingerprint and file hashes valid; do not weaken the check to avoid recapturing.
  정확한 소스·그래프 식별·스크린샷·실제 재생 녹화를 날짜별 이중 언어 보고서로 게시합니다. 실행 동작이 바뀌면 한영 README·데모를 갱신하고 미디어 구현 지문·파일 해시 검사를 유지합니다. 재촬영을 피하려고 검사를 완화하지 않습니다.
- Capture and replay only authored synthetic movement/GPS. Separately authorized public-agency traffic ingestion may preserve actual public observations with explicit PUBLIC_AGENCY source, original time, credential protection and dataset-specific reuse terms; never relabel it SYNTHETIC. Keep roadmap behavior visibly separate from demonstrated behavior. Record when a viewer is evidence playback rather than a complete navigation client; never imply live traffic or real-road accuracy from synthetic success.
  이동·GPS 캡처/재생은 자체 합성만 사용합니다. 별도로 승인된 공공 교통 수집은 출처·원시각·키 보호·자료별 이용 조건을 유지한 실제 공공 관측을 보존하되 합성으로 바꾸지 않습니다. 계획과 실제 시연을 구분하고 증거 재생 화면을 완성된 내비게이션으로 표현하지 않습니다. 합성 성공으로 실시간 교통·실제 도로 정확도를 주장하지 않습니다.

## Primary Seoul simulation / 주요 서울 시뮬레이션

- The primary integrated simulation, reports and demos must use the actual Seoul OpenStreetMap road network with pinned source bytes. Keep tiny-city only as a fast regression fixture. Implement the transition in docs/21-seoul-road-simulation.md before resuming P05.
  주요 통합 시뮬레이션·보고서·데모는 원본 바이트를 고정한 실제 서울 OSM 도로망을 사용합니다. tiny-city는 빠른 회귀 자료로만 유지합니다. P05 전에 서울 전환 설계를 구현합니다.
- Public map data and synthetic movement are distinct: preserve OSM attribution/ODbL and original curved geometry, while vehicles, speeds, waits and GPS faults remain synthetic. Same-engine round trips do not count as independently reviewed real-road accuracy or live traffic evidence.
  공개 지도와 합성 이동을 구분합니다. OSM 출처·ODbL·원래 곡선 지형을 보존하고 차량·속도·정지·GPS 장애는 합성으로 생성합니다. 같은 엔진의 왕복 검사를 독립 실도로 정확도·실시간 교통 증거로 세지 않습니다.
