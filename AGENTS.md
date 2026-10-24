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
