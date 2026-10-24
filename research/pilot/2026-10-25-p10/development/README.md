# P10 development proof / P10 개발 검증

Main directly executed `node dist/tools/gateway_checks.js --graph /Users/dice/Documents/routelens/data/p09-responsive-main-20261025/seoul/graph --output data/p10-development01` with Node22.23.4. All32 actual cases passed on dirty source8e78703, runtime fingerprint `bebae7f5f5e7c8efed69627735ef82a2749570d1bba66937c3507dfe990dc538`. The previously verified graph9759ac2d is reused only for this development check; all15 source trips, aggregation, signing, gateway consumer and native node processes are newly executed. This does not replace the required clean fresh-graph whole302.

메인이 Node22.23.4로 위 명령을 직접 실행해32개 실제 검사를 통과했습니다. 미커밋 소스8e78703·위 실행지문을 기록합니다. 기존 검증 그래프9759ac2d는 이 개발 검사에만 재사용하고15개 원여행·집계·서명·중계수신자·엔진프로세스는 새로 실행했습니다. 깨끗한 새 그래프의 전체302개를 대신하지 않습니다.

[Independent proof](main-independent.json) checked2,723 original listed hashes,94 graph hashes, three standard Ed25519 publications, authored movements and observed timings, three independent durable consumers and exact native evidence.38 native route/trace pairs were inspected;18 successful public responses were each tied to one distinct matching original pair. Identical repeated native requests lack a public request ID, so candidate multiplicity is reported rather than inventing an exact causal ID.

[독립 근거](main-independent.json)는 원목록해시2,723개·지도해시94개·표준서명3개·합성이동/관측시간·독립영속수신자3개·엔진원문을 검사했습니다. 경로/추적38쌍과 공개성공18건을 서로다른일치원문에 연결했습니다. 같은반복계산의엔진규격에는공개요청ID가없어원문후보수를명시하고없는인과ID를만들지않습니다.

The real primary SIGKILL selected node B at the same accepted version. The long congestion detour has zero live-edge coverage, while the source-authored12m interior route has coverage1 and22.254s duration. Non-live correction restores0.780s on that short route; exact expiry clears the snapshot and restores the original long baseline2.119km/147.404s. Shared request timeout was12.012s; a4,000ms propagated lease was released in4.155s, within the predeclared500ms observation allowance. Client abort released gateway admission in32.517ms. Main directly observed15 traversals and matching accepted snapshot bytes in gateway/nodeA/nodeB through [live SQL](main-live-sql.json).

첫노드를실제로강제종료한뒤같은버전의B로전환했습니다. 장거리혼잡우회의적용률은0,원자료에서정한12m내부구간의적용률은1·시간은22.254초였습니다. 비실시간정정후짧은경로는0.780초로복구하고정확만료후자료를해제해장거리기본2.119km/147.404초를복구했습니다. 전체요청제한12.012초·4초전달요청반납4.155초는사전에정한관측여유500ms안입니다. 연결취소후중계접수반납은32.517ms였습니다. 메인이실행중SQL로15통과·독립세수신자의같은수용내용을직접확인했습니다.

Main confirmed26 owned host PIDs,28 exact containers, the dedicated volume and recorded ports absent. [Quick check](main-quick.json) covers only its explicitly listed owner subset; the detailed independent proof expands ownership from all original command records. [Original archive](originals.tar.gz) contains2,723 files, with only `bundle/graph.tar` omitted and hashed in [the exact list](omitted-files.json); the source graph is separately preserved under the P09 evidence. [Archives and inventory](archives.json).

메인이소유PID26개·정확한컨테이너28개·전용볼륨·기록된포트부재를확인했습니다. 빠른검사는명시한소유자부분집합만이고상세검사가모든원명령의소유권으로확장합니다. 원문압축은2,723개를담고지도묶음하나만정확히제외·해시기록합니다. 원그래프는P09근거로별도보존합니다.

[Focused evidence](focused-verification.tar.gz) preserves the original strict build4 errors and the initial26-test24pass/2fail run. Corrections changed only invalid fixture default-percent fields and internal status timeout classification. The affected nine core tests passed; a main-review file-write failure regression additionally passed after moving initial evidence writes into the admission cleanup boundary. Final distinct core/affected27 plus integration/affected19 passed without repeating healthy suites. The archive packaging command initially used a wrong relative file-list path; it was corrected to an absolute path and exact archive inventory verified, without rerunning the simulation or altering originals.

집중근거에최초타입오류4개·최초26개중24통과/2실패를보존합니다. 상위규격과다른시험자료기본비율·내부상태타임아웃사유만수정한영향코어9개를통과했습니다. 메인이찾은기록실패의접수누수는초기기록도정리범위에넣고실제폴더실패회귀로확인했습니다. 최종고유코어/영향27개·통합/영향19개를통과했으며정상검사를반복하지않았습니다. 압축명령의목록상대경로오류는절대경로로고쳐정확한목록을검사했고시뮬레이션재실행·원문수정은없었습니다.

Limits: approved local peers and synthetic input; no malicious-peer consensus, packet loss, live traffic, production latency or independent real-driving accuracy claim. Clean whole302, browser review, new recording, hosted inspection and protected delivery remain required.

한계: 승인로컬노드·합성자료이며악성노드합의·패킷손실·실시간교통·운영지연·독립실주행정확도를주장하지않습니다. 깨끗한전체302개·브라우저·새녹화·원격검사·보호반영을이어갑니다.
