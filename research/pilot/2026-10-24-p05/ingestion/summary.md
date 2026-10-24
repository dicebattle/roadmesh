# Durable synthetic ingestion / 영속 합성 수집

PASS: actual HTTP, PostgreSQL and separate worker processes.
통과: 실제 HTTP·PostgreSQL·별도처리자.

Logical primary-store deletion only; not WAL/backups erasure, production authentication or P06 aggregation.
주저장소 논리삭제이며 WAL/백업완전삭제·운영인증·P06집계 검증이 아닙니다.
