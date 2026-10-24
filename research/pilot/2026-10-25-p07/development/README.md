# First actual P07 development run / 첫 실제 P07 개발 실행

Main directly ran Node22 publication_checks with the preserved actual-Seoul P06 graph and a new PostgreSQL/HTTP/worker population.55/55 passed. Source58348b0 was dirty; implementation fingerprint is in the original manifest. This is not the final fresh whole-system proof. A separate live DB query observed5 trips,12 remaining traversals after one revocation,2 candidates,6 publications (five main-stream plus one independent concurrency stream) and4 initialized consumer states at that instant; these are not final counts.

메인이 Node22로 기존 검증 서울 그래프와 새DB·HTTP·처리자들을 실행해55개를 통과했습니다. 변경 중 개발 소스이고 지문은 원래 명세에 있으며 최종 새 전체 검증이 아닙니다. 별도실행중DB에는당시여행5개·철회후통과12개·후보2개·게시6개(주요5+독립경쟁1)·초기화된수신상태4개가있었으며최종수와구분합니다.

Main independently checked418 original file hashes, all five standard JWS signatures using Node crypto rather than the product jose helper, four exact HTTP-served artifact pairs, P06 candidate equality, accepted DB byte hashes,30 negative cases' exact refusal/state preservation, actual publisher/consumer SIGKILL and real revoke lock/atomic invalidation, expiry/key revocation with retained high-water, and62 absent owned process IDs plus exact DB/volume absence.

메인이418원문해시·제품helper와별개인Node암호검사로JWS5개·실제HTTP내용4쌍·원P06후보일치·수신DB바이트·부정30사례의정확거부/상태보존·실제강제종료/철회잠금/원자무효화·만료/키철회후최고순번유지·PID62개와DB/볼륨부재를확인했습니다.

Sequence3 committed during the revoke race, then lost its current pointer before HTTP capture. Its original stored signed bytes remain; it is not claimed as an HTTP-served version. The first independent inspector's five-HTTP-capture assumption was corrected accordingly without changing or rerunning product code. The report viewer's two adjacent artifact/JWS links later gained a separator; final whole-run provenance must use that newer source fingerprint. No private key material is archived; negative/private-root includes only the literal invalid sentinel. OSM-derived geometry retains ODbL1.0/© OpenStreetMap contributors.

3번은철회경쟁중커밋후HTTP촬영전에현재참조가제거됐으며저장원본만보존합니다. 독립검사기의HTTP5개가정을정정했고제품코드변경/재실행은없었습니다. 이후화면의붙은링크에구분자를추가했으므로최종전체실행은새지문을사용해야합니다. 실제비밀키는없고private-root부정자료의d는무효한고정표식뿐이며지도파생자료는OSM출처·ODbL을유지합니다.
