# P11 development proof / P11 개발 검증

The actual browser pilot passed all32 required cases on the previously verified Seoul graph, with newly authored15 trips and fresh database, publisher, two native nodes, gateway and client server. Source9ad5455343650ac38432d47c1a866536df3e7579 was **dirty**; runtime fingerprint was fc9f59336aaf40064fa19ff3a81e34dc5ed0eadaa13b860245026ef32bf28f6b. This is development evidence, not clean whole334 or final delivery. The P10 final-hosted concurrency correction must be incorporated before those gates.

기존에 검증한 서울 그래프에서 새15여행·DB·게시 서버·지속 노드 두 개·중계·화면 서버를 실제 실행해 브라우저 필수32개를 모두 통과했습니다. 위 소스에는 **미커밋 변경**이 있었으며 실행 지문을 함께 기록했습니다. 개발 근거이고 깨끗한 전체334개나 최종 반영 근거가 아닙니다. 이후 단계 전에 P10 최종 원격 동시 요청 수정을 포함해야 합니다.

Main directly ran Node22.23.4 and independently checked2,410 inventoried original hashes, four Ed25519 publications with standard crypto,27 native route/trace pairs and12 browser-success bindings. The browser response, gateway request/result, native daemon identity, original geometry, actual coverage and MapLibre source geometry agree. Exact repeated native calculations can have multiple matching candidates because the native protocol omits the public request ID; each binding uses a distinct matching pair. [Independent proof](main-verification.json), [inspector](inspectors/inspect-client.mjs), [run source](source.json).

메인은 Node22.23.4로 직접 실행하고 목록 원문 해시2,410개·표준 암호 도구의 Ed25519 게시4개·엔진 경로/추적27쌍·브라우저 성공12건을 독립 대조했습니다. 브라우저 응답·중계 원요청/결과·엔진 실행 식별·원래 지형·실제 적용률·MapLibre 지도 자료가 일치했습니다. 네이티브 규격에 공개 요청 ID가 없어 동일 계산은 여러 후보와 일치할 수 있으며 성공마다 서로 다른 원문 쌍을 연결합니다.

A [read-only live SQL observation](main-live-sql.json) found15 traversals, one publication and the independent p11-gateway/p11-node-a/p11-node-b consumers at the same sequence1 and snapshot. Main verified the recorded browser PID/start identities absent and the exact recorded container identifiers, volume and child PIDs absent after cleanup. The container list includes both IDs and names and must not be interpreted as a count of distinct containers.

[실제 DB 읽기 전용 조회](main-live-sql.json)에서 통과15개·게시1개와 서로 독립적인 중계/노드 수신자3개가 같은 순번1·스냅샷을 수용했음을 확인했습니다. 종료 뒤 기록한 브라우저 PID/시작 식별자와 정확한 컨테이너 식별자·볼륨·자식 PID 부재도 확인했습니다. 컨테이너 목록에는 ID와 이름이 함께 있으므로 목록 길이를 서로 다른 컨테이너 수로 해석하지 않습니다.

The separate [startup interruption](startup-main-verification.json) sent actual SIGTERM after the first owned child started but before READY. Parent99497 exited130; its child99534, database container and volume were absent after approximately588ms. This proves that recorded startup boundary, not every possible interruption point. The raw startup archive and script are retained. Core focused tests passed25/26 initially; the invalid-Host test transport was corrected and only its one failing case reran successfully. Integration focused tests passed21/21 once. Build failures and successful revisions remain in the supplemental archives.

별도 [준비 중 중단](startup-main-verification.json)은 첫 소유 자식이 시작되고 화면 준비 전인 지점에서 실제 SIGTERM을 보냈습니다. 부모는130으로 종료했고 약588밀리초 뒤 자식·DB 컨테이너·볼륨이 없었습니다. 기록된 준비 경계를 증명하며 모든 중단 지점을 검증했다고 주장하지 않습니다. 원문 압축과 실행 스크립트를 보존합니다. 코어는 최초25/26개 통과 뒤 잘못된 Host 시험의 전송 방식을 수정해 실패한 한 개만 재검사했고, 통합 집중21개는 한 번 모두 통과했습니다. 빌드 실패와 성공한 수정 이력도 별도 압축에 남깁니다.

- [Original archive inventory](archive-verification.json):2,410 original files; one graph.tar omitted with its exact hash. Join listed parts in order. / 원문2,410개·정확한 해시로 표시한 지도 압축1개 제외. 목록 순서로 조각을 연결합니다.
- [Supplemental archive hashes](supplemental-archives.json): core/integration unit logs and startup originals. / 코어·통합 집중 검사와 준비 중 중단 원문.
- [Assertions](assertions.json), [browser cleanup](browser/cleanup.json), [console](browser/console.json). / 판정·브라우저 정리·콘솔.
- [Desktop Korean](screenshots/korean-live.png), [390px Korean](screenshots/mobile390-live.png), [baseline map](screenshots/desktop-baseline.png), [expiry/baseline](screenshots/mobile390-expired.png). / 데스크톱·모바일·기본 지도·만료 뒤 기본값.

Main inspected the desktop Korean and390px screenshots. The automated browser used explicit software WebGL and recorded expected graphics readback warnings and intentionally induced HTTP503/504/409 errors; there were no uncaught page errors. No external map requests or real geolocation calls occurred. Manual IAB verification, actual final video, current README refresh and hosted proof remain pending. Synthetic traffic on actual Seoul roads does not establish real-driving accuracy or production performance.

메인은 데스크톱 한국어와390픽셀 화면을 확인했습니다. 자동 브라우저는 명시한 소프트웨어 WebGL을 사용했고 그래픽 읽기 경고와 의도적으로 발생시킨 HTTP503/504/409 오류를 보존했으며 처리하지 못한 페이지 오류는 없었습니다. 외부 지도 요청·실제 위치 조회는 없었습니다. 내장 브라우저 수동 확인·최종 실제 영상·README 갱신·원격 검증은 아직 남았습니다. 실제 서울 도로 위의 합성 교통으로 실주행 정확도·운영 성능을 주장하지 않습니다.
