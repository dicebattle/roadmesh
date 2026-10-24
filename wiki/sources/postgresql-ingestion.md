# PostgreSQL ingestion sources / PostgreSQL 수집 출처

Inspected 2026-10-24 by the main design agent before P05 implementation. These documents justify primitive selection, not a RouteLens recovery-success claim. [Contract](../../docs/22-p05-executable-contract.md).

P05 구현 전에 메인이 2026-10-24 확인했습니다. 아래 자료는 구현 수단 선택의 근거이며 RouteLens 복구 성공을 증명하는 자료는 아닙니다.

| Source / 출처 | Used decision / 반영한 결정 |
| --- | --- |
| [PostgreSQL 18 SELECT locking](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE) | Short queue claim with row locks and SKIP LOCKED; no lock held through matching / 짧은 행 잠금 작업 확보·매칭 중 잠금 없음 |
| [PostgreSQL isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | Explicit lock order, uniqueness and revalidation rather than assuming an ordinary read reserves a row / 단순 조회를 예약으로 보지 않고 잠금 순서·고유 제약·재검사 적용 |
| [PostgreSQL WAL configuration](https://www.postgresql.org/docs/18/runtime-config-wal.html) | Keep durability settings enabled and inspect actual settings in restart proof / 내구성 설정을 켜고 재시작 검증에서 실제 값 조회 |
| [PostgreSQL date/time types](https://www.postgresql.org/docs/18/datatype-datetime.html) | Store UTC instants as timestamptz; keep event time distinct from DB lease clock / UTC 시점을 저장하고 관측시간과 DB 임대 시계를 분리 |
| [node-postgres transactions](https://node-postgres.com/features/transactions) | One checked-out client for BEGIN through COMMIT/ROLLBACK / 트랜잭션 전체에 같은 연결 사용 |
| [node-postgres parameterized queries](https://node-postgres.com/features/queries) | Bound SQL values; fixed schema/table identifiers / SQL 값 매개변수·고정 스키마/테이블 이름 |
| [Official PostgreSQL Docker image](https://hub.docker.com/_/postgres) | Pin official PostgreSQL18.6-bookworm OCI index and preserve persistent volume across restart / 공식 이미지 해시 고정·재시작 때 영속 볼륨 유지 |

Registry checks / 레지스트리 확인:

```text
docker buildx imagetools inspect postgres:18.6-bookworm
index sha256:bbf83594798e144bff365a9c191c5d779f181fb3135902064ab8ff11918020fc
linux/amd64 sha256:6b38fe68f2c02cafffbbce7496f76d110d8a947c039bd22c067e9a43c2250240
linux/arm64/v8 sha256:a5377a521c0383c9862394c90bdbf7707800ac9a6e40d18318193badfac52ce0
npm view pg version dist.integrity engines --json
pg 8.23.1; node >=16; integrity sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==
npm view @types/pg version dist.integrity --json
@types/pg 8.23.1; integrity sha512-fKVHpikPdg4GKks3JuLEhvwSyvwzF23hnabPy6DD8ljVbC7+6J5dQzdv4arV6jqq57djnMgs1HKBxX4P8aBI3A==
```

Runtime acceptance still requires real HTTP, PostgreSQL, process kills/restarts, stale-owner attempts and persisted read-back. Logical deletion from the primary store does not prove forensic erasure of WAL/backups. This is synthetic local technical evidence only.

실행 수용은 실제 HTTP·PostgreSQL·프로세스 종료/재시작·만료한 소유자의 저장 시도·DB 재조회로 별도 증명해야 합니다. 기본 저장소의 논리 삭제를 WAL·백업의 물리적 완전 삭제로 주장하지 않으며 합성 로컬 기술 검증 범위입니다.
