# Corrected-source inspection commands / 수정 소스 검사 명령

Use Node22.23.4; all outputs are new paths outside original roots. / Node22.23.4와 원문 밖 새 출력을 사용합니다.

```sh
node data/run-nav02-corrected-audits.mjs
node data/inspect-nav02-clock-state.mjs data/nav02-whole02/publication
node data/inspect-nav02-clock-signatures.mjs data/nav02-whole02/publication
node data/inspect-nav02-clock-aggregation.mjs data/nav02-whole02/aggregation
node data/inspect-nav02-clock-demo.mjs data/nav02-clock-demo01 data/nav02-clock-demo-independent.json
node data/archive-nav01-evidence.mjs data/nav02-whole02 data/nav02-clock-whole-archive nav02-clock-whole-scratch
NAV02_RESTORE_OUTPUT=data/nav02-clock-restoration-verification.json node data/restore-nav02-hosted.mjs data/nav02-clock-whole-archive data/nav02-clock-demo-archive
```

The host audit driver accepts downloaded original root, exact GitHub source SHA and a fresh nav02 label. It checks recorded remote cleanup without querying unrelated local PIDs; omitted map bytes stay explicitly unverified. The local clean source isfe49b55 and runtime70af32dc; hosted source is the actual final commit, with identical runtime. / 원격 감사는 내려받은 원문·정확한 GitHub소스·새 이름을 요구하고 원 진단으로 정리를 확인하며 지도 제외를 명시합니다. 로컬 깨끗한 소스와 최종 원격 커밋은 다를 수 있으나 실행 지문은 동일해야 합니다.
