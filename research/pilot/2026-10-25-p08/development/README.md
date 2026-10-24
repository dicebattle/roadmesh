# P08 development evidence / P08 개발 검증 근거

These are development runs against the previously verified Seoul graph, not the final fresh whole-system proof. Main designed and directly ran the checks; Sol `gpt-6.1-sol` implemented the core and integration code. All three runs used Node 22.23.4, actual PostgreSQL, HTTP services, separate workers and the pinned Valhalla engine. Their source commit is `f03435bc20611ab7cf4b5d07f91c824943e654ad` with uncommitted implementation changes; each successful run's manifest records its implementation fingerprint.

이 자료는 이전에 검증한 서울 그래프에서 수행한 개발 실행이며, 최종 새 전체 시뮬레이션의 증거는 아닙니다. 메인이 설계하고 직접 검사했으며 Sol이 코어·통합 코드를 구현했습니다. 세 실행 모두 실제 PostgreSQL·HTTP 서비스·별도 처리자·고정 Valhalla 엔진을 사용했습니다. 소스는 위 설계 커밋에 아직 커밋하지 않은 구현 변경이 있는 상태이며, 성공 실행 명세에 구현 지문을 기록했습니다.

Graph / 그래프: `7f4fd63e63aae5e5b961fc26d36ecae0fe30128c5508d4e184109ef16d59a4be`.

Actual image / 실제 이미지: `sha256:34fcb41045d960a181f44583484b7a4372355d4b276f6f78c603e884e706d5c2`.

The roads and original geometry come from public Seoul OSM data. The 15 trips, congestion and GPS are authored synthetic data. The test corridor is three consecutive Teheran-ro edges; this does not establish coverage or accuracy across every Seoul road.

도로와 원래 지형은 공개 서울 OSM 자료입니다. 15여행·정체·GPS는 직접 만든 합성 자료입니다. 대상은 테헤란로의 연속 세 구간이며, 서울 모든 도로의 지원 범위나 정확도를 검증한 것은 아닙니다.

## Preserved runs / 보존한 실행

| Run / 실행 | Outcome / 결과 | Original evidence / 원문 |
| --- | --- | --- |
| development01 | Failed timing gate: 15 successful matching jobs, zero accepted traversals because of ambiguous boundary dwell. Cleanup passed. / 매칭 15개 성공 후 경계 정지 불확실성으로 수용 통과가 없어 시각 검사 실패. 정리 통과. | [Archive](failed-boundary.tar.gz), [console](development01-console.txt) |
| development02 | First 19 cases passed; restart used an obsolete DB port after Docker remapped it. Cleanup passed. / 앞선 19개 통과 후 DB 재시작의 바뀐 포트를 반영하지 못해 실패. 정리 통과. | [Archive](failed-db-endpoint.tar.gz), [console](development02-console.txt) |
| development03 | All 32 required P08 cases passed, including actual DB recovery and exact expiry. Cleanup passed. / 실제 DB 복구·정확한 만료를 포함한 필수 32개와 정리 통과. | [Archive](passed-p08.tar.gz), [console](development03-console.txt) |

The first correction preserves the P04 exclusion policy: target averages remain 0.4–0.6m/s, with clear 5m/s crossings over the first/last 3m and slower movement inside each target. The second correction reconnects existing durable state through the refreshed local endpoint; it does not republish or reaccept the successful snapshot. See the [fixed contract and source correction](../../../../docs/27-p08-traffic-activation.md).

첫 수정은 P04 제외 정책을 유지합니다. 대상 평균은 0.4~0.6m/s로 유지하되 처음과 마지막 3m를 5m/s로 통과하고 내부에서 느리게 움직입니다. 두 번째 수정은 바뀐 로컬 접속 주소로 기존 영속 상태에 다시 연결하며, 성공 스냅샷을 재게시·재수용하지 않습니다. 자세한 내용은 설계 문서를 따릅니다.

## Direct observations / 직접 확인한 결과

- Main independently inspected actual engine requests and responses: the same two-point request changed from 2.119km / 147.404s to 2.412km / 184.731s, avoiding all three target edges. [Intermediate route inspection](p08-development02-main-route-inspection.json) is deliberately labeled as partial evidence from the second run.
  메인이 실제 요청·응답을 독립 검사했습니다. 같은 두 좌표에서 세 대상 구간을 피하며 경로가 위와 같이 바뀌었습니다. 두 번째 실행의 중간 경로 검사는 전체 성공과 구분합니다.
- development03 restored the original shape and 147.404s ETA at exactly 420s. The 419.999s request remained LIVE. Completed route and compilation results paused across expiry were refused with `ACCEPTED_STATE_CHANGED`; a superseded compilation was refused for the same reason.
  세 번째 실행에서 419.999초는 LIVE였고 정확한 420초에 원래 모양·147.404초로 복구됐습니다. 만료를 사이에 두고 멈춘 경로·파일 생성 결과와 새 버전으로 교체된 이전 생성 결과는 명시 사유로 거부됐습니다.
- The real database port changed from 32782 to 32783. Independent raw SQL snapshots before and after restart preserved the event clock, 15 traversals and all consumer identities, high-water values and artifact hashes. [Main's separate live SQL observation](p08-development03-main-live-sql.json) sampled 15 traversals, one publication and three consumers before later faults; those are point-in-time counts.
  실제 DB 포트가 바뀌었지만 재시작 전후 직접 SQL 결과의 시계·통과 15개·수신자·최고순번·파일 해시가 같았습니다. 메인의 별도 실행 중 SQL 조회도 보존하며 당시의 개수를 최종 개수로 표현하지 않습니다.
- Focused checks and their actual command/build logs are in [this archive](focused-verification.tar.gz). It retains the first shared typing failure and its correction. A source guard changed near an initial scenario build, so the final compiled scenario was checked separately and that reason is recorded. Healthy full suites were not rerun for copy-only edits.
  집중 검사·명령·빌드 원문에는 최초 타입 실패와 수정을 함께 보존합니다. 초기 시나리오 빌드 부근의 조건 변경 때문에 최종 컴파일된 시나리오를 별도로 검사한 사유도 기록했습니다. 문구만 수정할 때 정상 전체 검사를 반복하지 않았습니다.

## Archive boundaries / 압축 보존 범위

[Archive hashes](archive-hashes.json) identify exact compressed bytes. Only the regenerable `graph.tar` files are omitted; their lengths and hashes are [listed explicitly](omitted-graph-extracts.json). Exact `traffic.tar` files, signatures, authored observations/truth, original engine responses, process events and cleanup records remain in the archives. Private runtime credentials were removed by owned cleanup and are not archived.

압축 파일의 정확한 해시를 기록했습니다. 다시 만들 수 있는 `graph.tar`만 제외하고 크기·해시를 명시했습니다. 실제 교통파일·서명·합성 관측/정답·엔진 원응답·프로세스 사건·정리 기록은 보존합니다. 비공개 실행 인증값은 소유 자원 정리에서 삭제했으며 압축에 포함하지 않습니다.

The development viewer combines prior P07 evidence with current P08 data and is not the final demonstration. Main's IAB check verified English/Korean controls, all 32 case rows, geographic aspect preservation, no JavaScript errors and no horizontal overflow at 390px. Final clean whole-system execution, fresh recording, hosted inspection and protected merge remain separate delivery steps.

개발 화면은 이전 P07 근거와 현재 P08 자료를 함께 보므로 최종 시연이 아닙니다. 메인은 내장 브라우저에서 한영 조작·검사 32행·지도 비율·스크립트 오류 없음·390px 가로 넘침 없음을 확인했습니다. 깨끗한 전체 실행·새 녹화·원격 검사·보호 병합은 별도 전달 단계입니다.
