# RouteLens instructions for Claude

Read and follow [AGENTS.md](AGENTS.md), which is the canonical repository instruction file, including its design and implementation ownership rules.

Claude owns the design, plan and final review. Delegate coding to Codex when available, or to a Sonnet subagent. Do not duplicate the full policy here; keep changes in AGENTS.md so Codex and Claude follow the same project decisions and recording rules.

Claude는 설계·계획·최종 검토를 담당하고 구현은 사용 가능한 Codex 또는 Sonnet 하위 에이전트에 맡깁니다. 공통 지침은 AGENTS.md에서 관리합니다.

Follow the protected-main, feature-branch push, evidence and English-first/Korean-included rules in [the development workflow](docs/12-development-workflow.md).

[개발 작업 절차](docs/12-development-workflow.md)의 main 보호·작업 브랜치 푸시·검증 증거·영어 우선/한국어 병기 규칙을 따릅니다.

Follow the integrated simulation/current-demo rules in AGENTS.md and docs/18-goal-progress.md: whole implemented-system runs, bilingual captured evidence, actual recordings, and fresh English/Korean READMEs after runtime changes. Partial increments do not complete the full pilot goal.

AGENTS.md·docs/18-goal-progress.md의 전체 구현 모듈 실행·이중 언어 캡처 증거·실제 녹화·구현 변경 후 한영 README 갱신 규칙을 따릅니다. 일부 구현 완료로 전체 파일럿 목표를 완료하지 않습니다.
