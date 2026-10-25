# Local Cloudflare parity / 로컬 Cloudflare 비교

Status: local acceptance at clean d2fb964; whole390 and32 Cloudflare cases passed. Main independently checked184 Cloudflare original hashes,11 full PostgreSQL/Worker pairs,14 actor databases and21 SQLite/WAL copies. Main Sol designed, implemented and reviewed. Hosted/protected acceptance remains. [Report](../../research/pilot/2026-10-25-p13/report.md), [contract](../../docs/33-p13-local-cloudflare-parity.md), [development originals](../../research/pilot/2026-10-25-p13/development/README.md).

상태: 깨끗한 소스의 로컬 전체390개·Cloudflare32개·독립 원문184해시·집계11쌍·객체DB14개·SQLite/WAL21개를 수용했습니다. 메인 Sol이 설계·구현·검토했고 원격/보호 반영은 남습니다.

`npm run simulation:check -- --output NEW_DIRECTORY` now includes32 required post-matching parity/recovery checks after P12. `npm run cloudflare:check -- --graph VERIFIED_GRAPH --aggregation SAME_RUN_P06 --output NEW_DIRECTORY` requires exactly matching clean source/runtime. The explicit `--development-only` path omits the clean-source gate and cannot declare full completion. `npm run cloudflare:types -- --check` verifies generated bindings.

전체 명령에 P12 이후32개 매칭 후 비교/복구 검사를 포함합니다. 개별 명령은 같은 실행의 깨끗한 소스·실행 지문을 요구하고 명시한 개발 전용 경로는 그 조건을 제외하여 전체 완료를 선언하지 못합니다. 생성 바인딩도 따로 검사합니다.

The shared core preserves the P06 canonical protocol. SQLite DO transactions own receipts, pending outbox, contribution effects, revocation and candidate invalidation. Actual Queues only carries bounded private references; acknowledged send is not assumed atomic with storage. A restart reuses only this run's local state, and exact process identities/ports are stopped. Private configuration is removed; a final known-token scan quarantines any discovered credential-bearing file outside upload roots and fails acceptance. No Cloudflare account or remote binding is used.

공유 규칙은 기존 표준 계약을 보존합니다. DO 트랜잭션이 접수·발신 대기·저장 효과·철회·후보 무효화를 맡고 실제 큐는 제한된 비공개 참조만 전달합니다. 전송 확인과 저장이 한 트랜잭션이라고 가정하지 않습니다. 재시작은 이번 로컬 상태만 재사용하고 원래 식별자/포트를 종료합니다. 비공개 설정을 지우고 알려진 비밀값 검사에서 발견한 파일은 업로드 밖으로 격리하며 판정을 실패시킵니다. 계정·원격 바인딩은 사용하지 않습니다.
