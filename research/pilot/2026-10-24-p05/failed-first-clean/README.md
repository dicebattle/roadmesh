# First clean P05 run: incomplete / 첫 깨끗한 P05 실행: 미완료

Source `c8c9c6bc2471f9aa1415862c79906b755928bde4` passed fresh tiny48 + Seoul29 + P05's first21 assertions. API acceptance had committed, its response was interrupted, and the same PostgreSQL container/volume restarted. Reconnection then used a stale dynamic host port and failed. No final PASS manifest exists. All owned resources were cleaned.

위 깨끗한 소스에서 새 tiny48·서울29·P05초반21검사를 통과했습니다. API접수커밋뒤응답을중단하고 같은DB컨테이너/볼륨을재시작했으나 옛임시포트로연결해실패했습니다. 최종통과목록은없고 소유자원은정리됐습니다.

[Independent partial verification](main-partial-verification.json) covers215 stored/reference traversals, geometry/duration/timing and exact recovery-result bytes. [One isolated diagnosis](restart-diagnosis.json) proves port reassignment, not a speculative delay. Runtime now refreshes the real mapping and waits for hostTCP; the harness gives the new address to replacement clients. Later engine-failure, retention/revocation and active-engine cleanup cases remain unverified by this run.

독립부분검사는215저장/기준통과·지형/시간·복구결과바이트를대조합니다. 별도진단1회에서단순지연이아닌포트재배정을확인했습니다. 실행기는실제매핑을갱신·hostTCP를확인하고대체클라이언트에새주소를줍니다. 이실행은후반엔진실패·보관/철회·실행중엔진정리를검증하지못했습니다.
