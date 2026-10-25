# P12 first hosted artifact rejection / P12 첫 원격 원문 거부

Push40148864432 and PR40148884198 at0e37654f5aca0ddaba679a3efa6e8cd5520a9f89 passed whole358 and Node22/24 each296. The simulation job took1468s. Hosted graph f465981b2850c0b79aea9ca751171842125cc964113ef05a53766edc0a465b20; runtime 45f3b1315195c5374ae89dd9e6b8a3ee3357ae77ceb2475b9b505d06fc81d12d. Main independently passed domain, native/signature/client and gateway/node checks, but **does not accept this artifact as complete evidence**.

위 두 실행의 전체358개·Node22/24 각296개는 통과했고 전체 작업은1468초였습니다. 지도·실행 지문을 위에 고정했습니다. 업무·엔진/서명/화면·중계/노드 독립 검사를 통과했지만 **이 묶음을 완전한 원문 근거로 수용하지 않습니다**.

The expanded whole auditor now traverses the sealed tiny matching inventory. After accounting only for exact declared map binaries, one nonbinary original is absent: seoul/tiny/matching/tampered-graph/tiny-city.osm.xml, declared SHA-256 4677bda5062936f23a2c846fdf2dd2ee719c6382e9c1d01d3113cddb2e7ddc10. The upload projection did not include XML. The all-missing scan confirms26 declared binary omissions and exactly this one unsupported omission. No local reconstruction was inserted into the downloaded originals. Commit e393d1f adds XML capture; a fresh hosted run is required.

확대 감사가 작은 매칭의 봉인 목록을 순회하면서 정확한 지도 바이너리 제외 외에 XML 원본 한 개의 누락을 찾았습니다. 선언 해시는 위와 같고 전체 누락 검사에서 바이너리26개와 이 미지원 누락 하나를 확인했습니다. 내려받은 원문에 로컬 복원 자료를 넣지 않았습니다. e393d1f가 XML 보존을 추가하며 새 원격 실행이 필요합니다.

The first new audit encountered an undeclared tiny binary omission; the next audit explicitly bound only the existing graph-declared binary paths, then still rejected XML. Both logs remain. The gateway audit's initial invocation omitted its required expected-source option; corrected invocation passed, with both logs retained. These are audit/delivery scope records, not native-engine failures.

첫 감사는 작은 지도 바이너리 제외 선언의 누락을 만났고 다음 감사는 기존 지도 목록의 정확한 경로만 연결한 뒤에도 XML을 거부했습니다. 두 로그를 보존합니다. 중계 감사 호출의 기대 소스 옵션 누락도 수정 후 통과했으며 원 엔진 실패와 구분합니다.

All 16447 present originals are retained in5 ordered parts. Concatenated SHA-256: a01a471adfb0a524b60bd28b5e75272aff4808e5e434313109119c6d3dba5000. Exact inventory and reconstruction are verified in archive-verification.json; original-files.json.gz lists every present file. Root manifest/assertions/report data and run/audit logs are preserved separately in gzip form. Missing remote bytes remain missing and explicitly rejected.

현재 있는 원문16447개를 순서 있는5조각으로 보존하고 위 결합 해시·정확한 목록·복원을 검증했습니다. 목록·판정·보고서·실행/감사 로그도 별도로 보존합니다. 원격 누락 바이트는 누락 상태로 거부하며 성공으로 바꾸지 않습니다.
