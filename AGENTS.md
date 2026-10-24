# Repository instructions

- This repository is in early M0 implementation. Do not describe plans as implemented or measured.
- Start with wiki/index.md, wiki/log.md and the relevant roadmap milestone. Read docs/09-decisions.md before changing architecture.
- Keep changes minimal and understandable. Prefer maintained upstream components and narrow adapters.
- Do not add real location traces, secrets, private conversation exports, or data lacking redistribution permission.
- Never publish, deploy, provision paid resources, message others, or change other repositories without authorization for that action.
- Preserve the graph/version/traffic contract. Unknown or expired observations must not be presented as live traffic.
- Use focused tests for changes; do not restart healthy running tests merely to obtain different output.
- Use the in-app browser for ordinary manual web checks, close temporary tabs, and stop only temporary processes started for this task.
- Do not use subagents by default for small scoped work.

## Persistent project knowledge

- Record every substantive plan, implementation, investigation outcome and verification in this repository during the same task. A chat-only conclusion is incomplete.
- Keep docs/ as the canonical product, architecture, protocol and roadmap; wiki/modules/ records implemented module behavior and boundaries. Link rather than duplicate those documents.
- Add source notes under wiki/sources/ with URLs, access date, relevant findings, confidence and affected decisions. Preserve existing research snapshots; add dated evidence instead of overwriting observations.
- Append dated entries to wiki/log.md with the request, decision, changed code/docs, exact validation commands and outcomes, limitations and next step. Correct errors with a new entry; do not rewrite past outcomes to look successful.
- Update wiki/index.md and relevant canonical pages whenever facts or implementation status change. Explicitly mark superseded plans and contradictions. Do not claim a milestone is done when only a subtask passed.
- Keep facts, hypotheses, proposals and measured results distinct. Summaries must lead back to code, tests or original sources; repeating another summary is not new evidence.
- Before finishing, check internal links, consistency of status and privacy of published material. Do not copy private chats or copyrighted full articles into the public wiki.
- Repository documentation does not authorize deployments, paid resources or unrelated external posts. Follow the user's authorized scope for commits and publishing.
