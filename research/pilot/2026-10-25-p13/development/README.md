# P13 development evidence / P13 개발 근거

Main Sol designed, implemented and directly verified this candidate. This checkpoint is **not clean whole390 acceptance**. [Fixed contract](../../../../docs/33-p13-local-cloudflare-parity.md), [verified archive](archive-verification.json), [original inventory](original-files.json.gz).

메인 Sol이 설계·구현·직접 검증한 후보이며 **깨끗한 전체390개 판정이 아닙니다**. 확정 계약·검증 묶음·원 목록을 연결했습니다.

- `smoke/`: actual local Worker→Queue→SQLite and a real process restart retained five rows. Contribution metadata is explicitly artificial on a prior verified Seoul catalog; no actual matcher parity is claimed by this smoke test. The original checkpoint did not record a complete source fingerprint, so it is not final-source proof.
- `smoke/`: 실제 로컬 Worker→큐→SQLite와 프로세스 재시작 후5행을 확인했습니다. 이전 서울 목록에 만든 인공 통과 정보이며 실제 매칭 비교·최종 소스 근거로 세지 않습니다. 이 초기 실행에는 완전한 실행 지문이 없습니다.
- `postgresql/`: actual P06 GPS/HTTP/matching/SQL34 cases passed with11 exact read-only finalization inputs. [Independent audit](postgresql-independent.json) checked784 hashes, timing/median, revocation, killed processes and current cleanup. Source0e37654 dirty; runtimea7452db4… is retained in the original manifest. A successful CLI is silent; no duplicate invocation was needed.
- `postgresql/`: 실제 P06 GPS·HTTP·매칭·SQL34개와 정확한 확정 입력11종을 보존했습니다. 독립 해시784개·시간/중앙값·철회·강제 종료·정리를 확인했습니다. 미커밋 소스·원 실행 지문을 유지하고 조용히 성공한 CLI를 중복 실행하지 않았습니다.
- `parity/`: actual local workerd/Queues/SQLite passed31 development checks, including11 complete byte-identical PostgreSQL/Worker result pairs, post-commit queue retry, no duplicate effect, revocation, retention, outbox restart/flush and immutable catalog rejection. Clean same-run source binding is deliberately omitted; original status is DEVELOPMENT_ONLY, not the32-case complete gate. Four owned Wrangler/workerd sessions stopped; private configuration was removed.
- `parity/`: 실제 로컬31개·PostgreSQL/Worker 전체 결과11쌍의 바이트 일치·저장 후 큐 재전달·중복 효과 방지·철회·보관 만료·발신 대기 재시작/복구·목록 변경 거부를 확인했습니다. 깨끗한 같은 실행 출처 조건은 의도적으로 제외하고 개발 전용 상태를 유지합니다. 소유 세션4개를 종료하고 비공개 설정을 제거했습니다.
- [Independent saved-byte/SQLite audit](p13-parity-dev01-independent.json):185 original hashes,11 canonical pairs,14 actual actor databases,21 SQLite integrity checks including retained WAL, and exact original process identities absent. SQLite was inspected on a copy; original hashes were checked again afterward. Node built-in SQLite's experimental warning is retained.
- 독립 원문185개·표준11쌍·실제 객체 DB14개·SQLite21개/WAL 무결성과 원래 프로세스 종료를 확인했습니다. 복사본을 읽고 원 해시를 다시 대조했으며 Node SQLite 실험 경고도 보존했습니다.
- Final candidate `npm test` passed303/303 on Node22; generated Wrangler bindings check passed. Earlier302 and focused6 also remain. Later error normalization, body-capacity guards and final credential-state quarantine are candidate changes; the upcoming clean390 run must cover the complete final bytes.
- 최종 후보 Node22 단위303개·생성 바인딩 검사를 통과했고 앞선302개·집중6개도 보존합니다. 뒤에 추가한 오류 구분·용량 제한·최종 상태 자격정보 격리는 새 깨끗한390개에서 최종 바이트를 검증해야 합니다.

Initial worker type checks failed because the current Workers TextDecoder type requires explicit ignoreBOM and RPC cannot return an arbitrary unknown value. Preserve these logs; use the existing default false BOM behavior explicitly and a serialized JSON RPC result with explicit error discriminants. Known validation errors remain422; unexpected service failures remain503. Do not copy error prototypes or weaken types.

첫 Worker 타입 검사는 명시적인 BOM 옵션과 RPC의 임의 unknown 반환 때문에 실패했습니다. 실패 로그를 보존하고 기존 기본값을 명시하며 오류 구분을 포함한 직렬화 JSON 결과를 전달합니다. 입력 오류422·예상 밖 서비스 실패503을 구분하고 오류 원형 복사나 타입 완화를 사용하지 않습니다.

Dependencies: Wrangler4.152.0, workerd1.20261019.1, workers-types5.20261024.1. The formatter was transient Prettier3.9.10; it is not a runtime dependency. Actual cloud placement, hosted queue concurrency, raw GPS ingress, publication and routing on Cloudflare remain outside this local post-matching scope. New clean390, independent final originals, actual media, hosted/protected delivery remain required.

의존성과 일시적인 포매터 버전을 위에 고정했습니다. 클라우드 배치·원격 큐 동시성·Cloudflare의 원시 GPS 수집/게시/경로 운영은 로컬 매칭 후 비교 범위가 아닙니다. 새 깨끗한390개·최종 원문 독립 검사·실제 녹화·원격/보호 반영이 남습니다.
