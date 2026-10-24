# Mobile report correction / 모바일 보고서 보완

Clean source `ead191413f40c16067965c31b483f5a8f0a4219c` passed all270 fresh actual cases and235 unit/focused tests. Main independently checked7,112 original hashes, all prior module audits and P09's44 native requests/nine standard signatures. At390px, subsequent actual IAB inspection found the new selectors widening the document to534px. This was a presentation failure, not a failed routing simulation.

위 깨끗한 커밋에서 새 실제270개와 단위·집중235개를 모두 통과했고 메인이 원문해시7,112개·기존모듈·P09실제요청44건/서명9개를 독립 확인했습니다. 이후390픽셀 내장브라우저 검사에서 새 선택상자가 문서너비를534픽셀로 늘렸습니다. 경로 실행은 통과했고 화면 배치가 실패한 경우입니다.

Only P09 labels/selectors receive scoped grid/width/min-width styles. Geometry, data, controls and all older sections remain unchanged. Build and the four existing integration/report focused tests passed once. The main agent checked the preview in English and Korean, then exact expiry with all32 checks expanded: document width390, both selectors362, no console errors/warnings. The viewport was reset and the owned tab/server were closed.

P09 라벨·선택상자에만 격자/너비/최소너비 규칙을 추가했습니다. 지형·자료·조작·이전 영역은 그대로입니다. 빌드와 기존 관련 검사4개를 한 번 통과한 뒤, 메인이 영어·한국어·만료·32개 펼침 상태에서 문서너비390·선택상자362·오류/경고없음을 확인했습니다. 화면 크기를 복원하고 소유 탭·서버를 종료했습니다.

[Before measurement](mobile-before.json) · [After preview measurement](mobile-after.json) · [Earlier clean whole inspection](before-whole-verification.json) · [Node inspection](before-node-verification.json) · [Traffic inspection](before-traffic-verification.json) · [235-test log](before-unit.log.gz) · [Original rendered report and manifests](before-rendered-report.tar.gz) · [Preview/build/focused evidence](preview-verification.tar.gz).

The earlier-report archive is a selected record of the clean run and its rendered UI, not a complete raw-engine bundle. Its full originals remain locally preserved. Preview report data retains the original run's bytes and source identity; it is not relabeled as a new execution. A fresh clean whole run and new recording after this CSS correction will be the current published proof.

이전보고서 압축은 깨끗한 실행·화면의 선별 기록이며 전체 엔진 원문 묶음은 아닙니다. 원문 전체는 로컬에 보존합니다. 미리보기 자료는 원실행의 바이트·소스 식별을 유지하며 새 실행으로 바꿔 적지 않습니다. CSS 보완 뒤 새 전체 실행과 녹화를 최신 공개 근거로 사용합니다.

Independent audit correction: the first development inspection incorrectly expected only alg/kid in a JWS header. Original P07 specifies alg/kid/typ with typ=routelens-traffic-manifest+jws. The inspector now checks that exact contract, and the clean whole-run audit passed. The [original inspection failure](inspector-first-header-assumption.log.gz) is retained; no production verifier or simulation criterion was weakened.

독립 검사기의 최초 개발 실행은 JWS헤더에 alg/kid만 있다고 잘못 가정했습니다. 원래 P07의 정확한 alg/kid/typ 계약으로 검사기를 고친 뒤 깨끗한 전체 원문 검사를 통과했습니다. 첫 검사기 실패를 보존하고 생산 검증기나 시뮬레이션 기준은 완화하지 않았습니다.
