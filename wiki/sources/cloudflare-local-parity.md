# Cloudflare local parity sources / Cloudflare 로컬 비교 출처

Accessed2026-10-25; primary official docs and npm metadata. These establish available APIs, not RouteLens implementation or production guarantees. Locked candidates: Wrangler4.152.0 (Node>=22), workers-types5.20261024.1; inspect the installed config schema/types and local help before coding. Runtime installation remains local.

2026-10-25 공식 문서·npm 메타데이터 확인입니다. API 제공 근거이며 RouteLens 구현·운영 보증은 아닙니다. 고정 후보는 위 버전이고 설치 스키마·타입·로컬 도움말도 검사하며 실행은 로컬입니다.

- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/): binding-based access, bounded bodies, awaited work and generated binding types. / 바인딩·본문 제한·비동기 완료·생성 타입을 적용합니다.
- [SQLite DO API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/): synchronous SQL and transactionSync rollback, SQLite class migration and per-object private storage. / 동기 SQL·트랜잭션 롤백·SQLite 이전·객체별 비공개 저장을 사용합니다.
- [DO rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/): coordinate per logical owner; initialization concurrency gate only; no remote I/O in atomic state changes. / 논리 소유자별 조정·초기화 동시성 제한·원자 변경 중 외부 I/O 제외입니다.
- [Queues local development](https://developers.cloudflare.com/queues/configuration/local-development/): Wrangler/Miniflare runs producer and consumer locally; hosted consumer concurrency is unsupported locally. / 로컬 생산/소비 실행과 원격 동시성 차이를 명시합니다.
- [Queues APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/) and [delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/): await producer send and use actual acknowledgement/retry; duplicate effects must be prevented by application state. / 전송 완료·실제 확인/재시도·애플리케이션 중복 효과 방지를 적용합니다.
- [Wrangler API](https://developers.cloudflare.com/workers/wrangler/api/): unstable_dev is deprecated; use the installed supported CLI for the owned persistent local integration instead of a deprecated harness. / 폐기 예정 API 대신 설치된 CLI로 소유·보존 실행을 구성합니다.
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/) and [Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/): confirm local-only flags and existing SHA-256 compatibility. / 로컬 전용 옵션·기존 해시 호환성을 확인합니다.

Confidence: high for retrieved interfaces and the explicit local concurrency limit; actual RouteLens parity remains unproven until direct execution. Affected decision: [P13 contract](../../docs/33-p13-local-cloudflare-parity.md); preserve P06/P07 canonical contracts and keep Valhalla outside ordinary Workers.

확인한 인터페이스·명시된 로컬 한계의 신뢰도는 높지만 실제 동등성은 직접 실행 전까지 미검증입니다. P13 계약에 반영하고 기존 표준 계약·외부 엔진 경계를 유지합니다.
