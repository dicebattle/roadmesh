# Whole implemented-system pilot / 구현된 전체 파일럿

PASS: 462/462 assertions. / 전체 462개 중 462개 통과.

- tiny-regression: Preserved tiny-city whole-system regression / 기존 tiny-city 전체 회귀
- seoul-graph: Pinned OSM source and fresh Seoul graph / 고정 OSM 원본·새 서울 그래프
- seoul-workload: Nine synthetic vehicles on actual Seoul roads / 실제 서울 도로의 합성 차량9대
- p05: Durable HTTP and PostgreSQL recovery / 영속 HTTP·PostgreSQL 복구
- p06: Actual short-trip ingestion and unsigned aggregation / 실제짧은여행 수집·서명전집계
- p07: Signed HTTP publication and durable consumer acceptance / 서명 HTTP 게시·영속 수신 수용
- p08: Accepted traffic files, actual routing and exact expiry / 수용 교통파일·실제 경로·정확한 만료
- p09: Persistent native two-node routing, draining and expiry / 지속 엔진 두 노드 경로·요청 마무리·만료
- p10: Version-aware route gateway and bounded failover / 버전확인 경로중계·제한된 전환
- p11: Actual same-origin browser route client and freshness / 실제 같은 출처 브라우저 경로·신선도
- p12: Whole-system faults and same-run S01–S15 evidence / 전체 장애·같은 실행 S01~S15 근거
- p13: Actual local Worker, Queue and SQLite aggregation parity / 실제 로컬 Worker·큐·SQLite 집계 비교
- nav01: Native English/Korean turn guidance and browser boundaries / 엔진 한영 회전 안내·브라우저 경계
- nav02: Actual Seoul route progress and synthetic GPS replay / 실제 서울 경로 진행·합성 GPS 재생
- public-speeds: Public-source native refresh, expiry, recovery and durable withdrawal / 공공 출처 엔진 갱신·만료·복구·영속 철회

Actual Seoul OSM; authored movement, traffic and provider-protocol faults. Actual agency acquisition/browser proof is separate. Geographic quality, device behavior and production gates remain open.
실제 서울 OSM 위 자체 이동·교통·제공자 규격 장애 검사입니다. 실제 기관 수집/화면 근거는 별도이며 실도로 품질·단말·운영 기준은 남아 있습니다.
