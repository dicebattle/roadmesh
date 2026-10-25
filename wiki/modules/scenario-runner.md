# Whole-system scenarios / 전체 시나리오

Status: P12 local acceptance passed at clean5c9d4c4; [report](../../research/pilot/2026-10-25-p12/report.md). Hosted/protected delivery pending. [Canonical contract](../../docs/32-p12-whole-scenarios.md), [development originals](../../research/pilot/2026-10-25-p12/development/README.md). Main Sol designs, implements and verifies. The fixed acceptance adds24 to the prior334; whole358 and296 unit tests passed.

상태: 깨끗한5c9d4c4에서 P12 로컬 판정을 통과했고 원격/보호 반영은 남습니다. 설계·구현·검증은 메인 Sol이 맡고 고정 판정은 기존334개에24개를 더하며 전체358개·단위296개를 통과했습니다.

`npm run simulation:check -- --output NEW_DIRECTORY` builds fresh Seoul roads and executes every implemented module before assembling S01–S15 from exact same-run assertion IDs, original hashes, source/runtime/graph identities and successful cleanup. `npm run scenario:check -- --graph VERIFIED_GRAPH --output NEW_DIRECTORY [--runtime-only]` is a faster development command; it explicitly cannot declare the full matrix complete.

전체 명령은 새 서울 지도를 만들고 구현된 모든 모듈을 실행한 뒤 같은 실행의 정확한 판정 ID·원문 해시·소스/실행/지도 식별·정리 성공으로 S01~S15를 구성합니다. 개별 명령은 빠른 개발용이며 전체 행렬 완료를 선언하지 않습니다.

The adapter distinguishes route-domain errors without bypassing generation/expiry checks. Authenticated BUS/OTHER observations are refused before storage; trusted administrative exclusions apply before node status/dispatch. Actual owned TCP proxies reset or hold route connections while forwarding real status checks. Two fresh outer-supervisor fixtures exercise SIGTERM and deliberate parent failure only after an actual browser/native/rendered-map baseline. Browser context/video/server cleanup has one owner. Unknown traffic is never a closure or a live-speed claim.

연결기는 세대/만료 검사를 유지하며 업무 경로 오류를 구분합니다. 인증된 버스/기타는 저장 전에 거부하고 관리 제외는 노드 조회/전달 전에 적용합니다. 소유 TCP 대리 서버는 실제 상태 조회를 전달하면서 경로 연결을 끊거나 유지합니다. 별도 새 상위 감독 두 경우는 실제 브라우저/엔진/지도 기본 결과 뒤에만 종료 신호·의도한 부모 실패를 적용하고 브라우저 문맥/영상/서버 정리는 한 소유자가 맡습니다. 미확인 교통을 폐쇄·실시간 속도로 주장하지 않습니다.

These remain local authored synthetic tests on public OSM roads. Tiny waiting/parallel-road regressions are explicit, and same-engine round trips are not independent road-accuracy or Internet packet-loss measurements. No public node enrollment, production authentication or real driver traces are implemented here.

공개 OSM 도로에서 자체 합성 자료를 쓰는 로컬 검사입니다. 작은 대기/평행도로 회귀를 명시하고 같은 엔진 왕복을 독립 도로 정확도·인터넷 손실률 측정으로 표현하지 않습니다. 공개 노드 등록·운영 인증·실주행 자료는 여기서 구현하지 않습니다.
