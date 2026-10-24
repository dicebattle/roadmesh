# Signed traffic publication / 교통정보 서명 게시

P07 publishes P06 synthetic candidates as immutable JSON bytes with a standard Ed25519 compact JWS manifest, serves them over actual loopback HTTP, and persists a separate consumer's verified acceptance. Main designed the contract and reviewed the evidence; Sol implemented the production modules and tests. [Canonical contract](../../docs/25-p07-publication-contract.md) · [Actual execution report](../../research/pilot/2026-10-25-p07/report.md).

P07은 P06 합성 후보를 불변 JSON과 표준 Ed25519 JWS 목록으로 게시하고 실제 로컬 HTTP로 제공하며 별도 수신자의 검증·수용 상태를 영속 저장합니다. 메인이 계약 설계·증거 검토를, Sol이 생산 코드·테스트 구현을 맡았습니다.

## Ownership and boundaries / 책임과 경계

- **jose6.2.13** supplies standard signing and verification. RouteLens checks exact bytes, schema, local key permissions, graph/namespace/region/publisher, event time and durable ordering. PostgreSQL supplies transactions, locks and uniqueness.
- Publication reads the authoritative P06 row and atomically commits bytes, signature, sequence and current pointer. Repeating the same candidate/key returns the same version. Key rotation does not reset the sequence.
- A consumer verifies the signed manifest and exact artifact hash/length, then checks the persisted clock again in its acceptance transaction. Restart, replay or concurrency cannot lower the highest accepted sequence. Invalid input preserves a still-valid prior version.
- Source revocation invalidates the current lookup in the same transaction. Recomputed content is a higher-sequence correction. Already downloaded files cannot be recalled from an offline consumer; TTL, a newer received version or configured key revocation bounds their use.
- Expiry or key revocation clears unusable active bytes while retaining the highest sequence. No clock sweep or publisher process is needed to enforce expiry on status reads.

표준 서명은 jose, 원자적 저장·잠금·고유 제약은 PostgreSQL을 재사용합니다. RouteLens는 정확한 바이트·스키마·키 권한·지도/영역/지역/게시자·시각·영속 순서를 검사합니다. 게시자는 P06 원본 행을 읽고 바이트·서명·순번·현재 참조를 함께 저장하며 동일 후보/키의 재시도는 동일 버전입니다. 수신자는 파일을 검증한 뒤 저장 트랜잭션에서 현재 시각을 다시 확인하고, 재시작·낮은 순번·경쟁이 최고 순번을 낮추지 못하게 합니다. 부적합 입력은 아직 유효한 기존 버전을 보존합니다. 철회는 현재 조회를 같은 트랜잭션에서 무효화하고 재집계는 더 높은 순번으로 게시하지만, 오프라인 수신자의 파일을 즉시 회수하지는 못합니다. 만료·키 철회는 사용 가능한 바이트를 제거하고 최고 순번은 남깁니다.

## Run / 실행

```sh
npm ci
npm run build
npm run simulation:check -- --output data/new-p07-whole
npm run report:serve -- data/new-p07-whole
```

The whole command builds a fresh Seoul graph and runs every implemented module. For a focused development run against an already verified graph, use `npm run publication:check -- --graph PATH_TO_GRAPH --output NEW_DIRECTORY`. Node22/24 and Docker are required. The harness owns and cleans its PostgreSQL volume, HTTP services, workers and per-run private keys. Public evidence includes public roots and signed bytes only. The invalid-private-root fixture deliberately contains the literal sentinel `d: "invalid-private-field"`; it is not a generated private key.

전체 명령은 서울 그래프를 새로 만들고 구현된 모든 모듈을 실행합니다. 이미 검증된 그래프의 집중 개발 실행에는 위 publication 명령을 사용합니다. Node22/24·Docker가 필요하며 실행기가 DB·볼륨·HTTP·처리자·매번 생성한 비밀 키를 소유·정리합니다. 공개 증거에는 공개 키와 서명 바이트만 포함합니다. 잘못된 비밀 키 입력 사례의 고정 문자열은 생성된 비밀 키가 아닙니다.

## Limits and next module / 한계와 다음 모듈

All traffic is SYNTHETIC on actual Seoul OSM roads. P07 proves publication and durable acceptance; **P08 must still compile and activate those accepted speeds in a real Valhalla process and prove route/cost change plus expiry rollback**. Production HTTPS/authentication, remote key discovery, distributed node selection and the finished navigation client remain outside P07. The replay viewer displays recorded evidence.

모든 교통정보는 실제 서울 OSM 위에서 만든 합성 자료입니다. P07은 게시·영속 수용을 검증하며, **P08에서 수용한 속도를 실제 Valhalla에 반영해 경로/비용 변화와 만료 후 복구를 증명해야 합니다.** 운영 HTTPS·인증·원격 키 조회·분산 노드 선택·완성된 내비게이션은 P07 범위 밖이고 화면은 기록된 증거를 재생합니다.
