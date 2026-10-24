# Contributing to RouteLens

RouteLens is in early M0 implementation. Start with the [wiki index](wiki/index.md) and [roadmap](docs/05-roadmap.md), then propose a small, testable change. Korean and English contributions are welcome.

- Keep routing algorithms, rendering, cryptographic primitives and transport internals in maintained upstream projects. Prefer adapters over forks.
- Use synthetic fixtures by default. Do not submit real driving traces, precise personal locations, credentials, private conversations, or third-party data without redistribution rights.
- Explain the user-visible behavior, the change, and the evidence. Distinguish a local test, a deployment, and a real driving validation.
- Run focused checks appropriate to the change. Changes to ingestion require duplicate-delivery and partial-failure checks; changes to map or traffic versions require mismatch and expiry checks.
- Pin dependencies and container digests when adding executable components. Preserve upstream notices and record data provenance.
- When using AI assistance, review and understand the contribution and verify its behavior. Generated code is not evidence that a feature works.
- Include knowledge updates with each substantive change: update the canonical design or module page, append evidence and next steps to [wiki/log.md](wiki/log.md), and maintain index links. Distinguish planned, implemented, locally verified and deployed work. See [AGENTS.md](AGENTS.md) for the recording convention.

Contributions are accepted under Apache-2.0 unless a file explicitly retains another upstream license. Sign off commits under [Developer Certificate of Origin 1.1](https://developercertificate.org/) to confirm that you have the right to contribute. A sign-off is not a transfer of copyright.

Do not submit patches or messages to upstream projects on someone else's behalf without their authorization. Follow each upstream project's contribution policy separately.
