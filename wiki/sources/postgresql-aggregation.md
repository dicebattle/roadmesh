# PostgreSQL aggregation consistency / PostgreSQL 집계 일관성

Accessed2026-10-24. Primary sources: [PostgreSQL18 trigger behavior](https://www.postgresql.org/docs/18/trigger-definition.html), [explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html).

2026-10-24에 공식 PostgreSQL18 트리거·명시 잠금 문서를 확인했습니다.

Triggers execute in the modifying statement's transaction; failure rolls back both. Row locks are retained until transaction end and their mode determines conflicting operations. This supports a narrow traversal-delete trigger that removes derived P06 candidates in the same revoke/retention transaction, combined with a consistent clock→contributor→candidate lock order. These documents establish database behavior, not application correctness: actual concurrent finalization/revocation, rollback and retry read-backs remain required.

트리거가 변경 문장과 같은 트랜잭션에서 실행되고 실패 시 함께 롤백되며 행 잠금은 종료까지 유지됨을 확인했습니다. 이를 근거로 통과 삭제와 같은 철회/보관 트랜잭션에서 집계 후보를 무효화하고 시계→기여자→후보 순서를 유지합니다. 공식 문서는 DB동작의 근거이며 애플리케이션 정확성은 실제 동시 확정/철회·롤백·재시도 재조회로 별도 증명해야 합니다.

Decision: [P06 executable contract](../../docs/23-p06-aggregation-contract.md). Confidence: high for documented database semantics; unverified for the new implementation until direct execution. Keep existing pinned PostgreSQL/pg versions from [P05 source notes](postgresql-ingestion.md).

결정은 P06계약이며 문서화된DB의미는높은신뢰·새구현은직접실행전미검증입니다. 기존P05고정버전을유지합니다.
