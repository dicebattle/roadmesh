# P11 actual route client / P11 실제 경로 클라이언트

Status update: implemented and locally verified by clean whole334 and unit285; [report](../research/pilot/2026-10-25-p11/report.md). Hosted334/285 and protected PR12 are complete; see the report delivery update. The following fixed design was recorded before implementation. P10 is verified locally and its hosted delivery runs in a separate checkout. P11 may start from that verified source, but must incorporate protected P10 ancestry before delivery. The existing report remains an immutable evidence player; this module adds actual browser requests to the gateway.

상태 갱신: 구현 후 깨끗한 전체334개·단위285개와 보고서 검증을 통과했고 원격334/285개와 PR12 보호 반영도 완료했습니다. 아래는 구현 전에 메인이 고정한 설계입니다. P10은 로컬 검증을 마쳤고 별도 폴더에서 원격 반영을 진행합니다. 검증된 소스에서 P11을 시작하되 반영 전 P10의 보호 병합 이력을 포함합니다. 기존 보고서는 불변 증거 재생기로 유지하고, 이번에는 브라우저가 실제 중계 서버에 요청하는 화면을 추가합니다.

## Product scope and composition / 제품 범위와 화면 구성

The audience is an open-source contributor trying the local Seoul pilot. The page's single job is to choose two locations, request a real route and understand whether the displayed result remains current. Reuse MapLibre GL JS6.15.0 for map interaction and local GeoJSON rendering, esbuild0.28.2 for the TypeScript browser bundle, and Playwright1.64.1 for automated browser regression. Pin exact versions. No React framework, geocoder, proprietary tiles, remote fonts or real geolocation collection is required. All map/style/worker assets are served locally; retain OSM/ODbL and upstream licenses.

사용자는 로컬 서울 파일럿을 실행하는 오픈소스 기여자입니다. 화면의 목적은 두 위치를 선택해 실제 경로를 요청하고, 보이는 결과가 아직 유효한지 이해하는 것입니다. 지도 조작·로컬 GeoJSON은 MapLibre, TypeScript 묶음 생성은 esbuild, 자동 브라우저 회귀는 Playwright를 재사용하고 버전을 고정합니다. 별도 프레임워크·지오코딩·독점 타일·외부 글꼴·실제 위치 수집은 필요하지 않습니다. 지도·스타일·작업자 자료는 로컬에서 제공하고 출처·라이선스를 유지합니다.

Map-first layout: a quiet360px route form beside the actual Seoul road map on desktop; form and result precede a usable map on390px. Use existing RouteLens colors: ink#172B3A, paper#F5F7F9, road#CAD4DF, baseline#18816B, applied traffic#CC481D, focus#2166AC. Display typography uses Avenir Next/Apple SD Gothic Neo fallbacks with restrained bold headings; body uses the native system sans stack and tabular numbers for timing. The distinctive element is the real road geometry with origin/destination markers and one returned route, not decorative dashboard cards. Keep one persistent synthetic-data label, bilingual language switch and visible OSM attribution. Hashes/process internals belong only in an optional evidence disclosure. No hero, decorative metrics or celebratory success copy.

데스크톱은360픽셀의 조용한 입력 영역과 실제 서울 지도를 나란히 놓고,390픽셀에서는 입력·결과 뒤에 조작 가능한 지도를 둡니다. 기존 색상과 시스템 글꼴을 사용하고 숫자는 정렬해 읽기 쉽게 합니다. 화면의 중심은 실제 도로와 출발·도착 표시, 반환한 경로 하나입니다. 합성 자료 표시·한영 전환·OSM 출처를 유지하고 해시·내부 식별자는 선택해서 여는 근거 영역에만 둡니다. 장식용 통계 카드나 홍보 문구를 만들지 않습니다.

Presets use source-authored long Teheran-ro and short interior35%→65% coordinates. Also allow finite in-envelope numeric latitude/longitude entry with labels and keyboard submission. No arbitrary URL input. Show loading, empty, unavailable, timeout and invalid-input states with a concrete next action. Respect reduced motion; MapLibre fitBounds must use nonanimated updates when requested. If WebGL is unavailable, show an explicit map-unavailable message and a readable route summary, never fake a rendered map.

원그래프에서 정한 테헤란로 장거리와 내부35%~65% 좌표를 기본 선택으로 제공합니다. 범위 안의 유한한 위·경도를 직접 입력하고 키보드로 요청할 수 있게 하며 임의 주소 입력은 받지 않습니다. 로딩·빈 결과·사용 불가·시간 초과·입력 오류에 다음 행동을 안내합니다. 동작 줄이기를 존중하고 WebGL을 쓸 수 없으면 지도를 그린 척하지 않고 지도 불가와 읽을 수 있는 결과를 표시합니다.

## Gateway freshness refinement / 중계 신선도 계약 확장

P10 public successful routes gain exactly six fields: `high_water:number`, `checked_at_event_time:string`, `traffic_published_at:string|null`, `traffic_valid_until:string|null`, `source_class:"SYNTHETIC"`, `clock_basis:"SIMULATION_EVENT_TIME"`. Populate from the final authoritative accepted-state inspection after native result validation; never from peer claims. Existing `calculated_at` remains the real execution timestamp and is not used as the synthetic traffic clock. Extend exact allowlist checks and independent inspectors, preserving every prior302 case.

P10 공개 성공 응답에 위 여섯 필드만 추가합니다. 엔진 결과를 검증한 뒤 최종 수용 상태에서 값을 가져오며 노드의 주장으로 채우지 않습니다. 기존 calculated_at은 실제 계산 시각으로 유지하고 합성 교통 시계로 사용하지 않습니다. 기존302개를 보존하면서 정확한 공개 필드 검사와 독립 검사기도 확장합니다.

Add authenticated `GET /v1/route-context`: `{schema_version:"0.1",graph_id,high_water,traffic_snapshot_id,sequence,checked_at_event_time,traffic_published_at,traffic_valid_until,source_class,clock_basis}`. Its bounded2s store inspection authorizes only the current accepted traffic context. It does not claim any node is ready. Failure uses existing bilingual503 STORE_UNAVAILABLE. No public clock mutation or fault-control endpoint.

인증된 문맥 조회는2초로 제한된 저장소 검사에서 현재 수용 교통정보만 반환합니다. 노드가 준비됐다는 뜻으로 사용하지 않고 실패는 기존 한영503으로 표시합니다. 공개 시계 변경·장애 제어 API는 만들지 않습니다.

## Local app server and lifetime / 로컬 화면 서버와 수명

A narrow owned loopback server serves the built frontend, original context roads/presets and same-origin `/api/routes` and `/api/route-context` forwarding. Keep gateway tokens and configuration server-side; use a generated HttpOnly SameSite=Strict session cookie for local API access. Bootstrap page issuance is a local pilot convenience, not production authentication. Require exact127.0.0.1 Host/port, reject cross-site API requests, require exact Origin on POST, no CORS and no redirects. Validate body/response bounds, paths and static file allowlists. CSP permits only required local scripts/styles/workers/data images; no third-party connections. Never log cookie/authorization values into evidence.

소유 로컬 서버가 프런트엔드·원래 도로·좌표 선택과 같은 출처의 API를 제공합니다. 중계 토큰·설정은 서버에만 두고 로컬 API는 생성한 HttpOnly·SameSite=Strict 쿠키를 사용합니다. 이는 운영 인증이 아닌 로컬 편의 기능입니다. 정확한 호스트·포트와 POST Origin을 검사하고 교차 사이트 API·CORS·리다이렉트·경로 이탈을 거부합니다. 본문·응답·정적 파일을 제한하고 외부 연결 없이 필요한 CSP만 허용합니다. 쿠키·인증값을 근거에 기록하지 않습니다.

`pilot:serve -- --graph VERIFIED_GRAPH --output NEW_DIRECTORY` starts a fresh authored15-trip source, publication service, two native nodes, gateway and client server. Validate graph provenance, retain process ownership immediately, and stop all owned resources after15minutes or SIGINT/SIGTERM. Do not remove original graphs or user-owned services. Normal interactive mode advances the simulation event clock monotonically from its initial270s using elapsed monotonic time; expiry therefore happens naturally. A private supervisor/IPC mode can hold or advance the scenario for deterministic tests and main IAB verification. Controls are not served to the browser. Reuse prepareNodeSource/OwnedIngestionRuntime and narrow helpers; avoid broad refactoring of P09/P10.

명령 하나로 검증 그래프에 새15여행 원자료·게시 서버·두 엔진 노드·중계·화면 서버를 띄웁니다. 즉시 소유권을 기록하고15분 또는 종료 신호에 자신이 만든 자원만 정리합니다. 일반 실행에서는 단조 경과 시간에 따라270초부터 모의 시계를 진행해 자연스럽게 만료시킵니다. 결정적 검사와 내장 브라우저 확인을 위한 제어는 비공개 감독 통신에만 두며 브라우저에는 제공하지 않습니다. 기존 준비·소유 도구를 좁게 재사용하고 무관한 모듈을 재작성하지 않습니다.

## Client state / 클라이언트 상태

Use a request generation counter plus AbortController. Input change/new submission invalidates the displayed route and cancels the preceding request. Late completion never replaces newer input or result. Poll route context once per second without overlap, with a3s client bound; pause while hidden and revalidate on visibility return. Never let an older checked event time or lower high-water overwrite newer authority. Compare route graph/snapshot/high-water and expiry against the latest successful context; a changed version, expiry or failed freshness check clears the active route layer and marks the result unverified/expired with a recalculate action. A fresh route response can establish its own newer context. A failed route cannot leave the old line looking current. Do not infer freshness from browser wall time.

요청 세대 번호와 취소 신호를 함께 사용합니다. 입력 변경·새 요청 때 이전 표시와 요청을 무효화하고 늦은 완료가 최신 결과를 덮지 못하게 합니다. 문맥은 겹치지 않게1초마다 확인하며 브라우저 요청은3초로 제한합니다. 숨겨진 동안 멈췄다가 돌아오면 다시 확인합니다. 낮은 수신 순번이나 옛 관측 시각이 새 승인을 덮지 않도록 합니다. 버전 변경·만료·신선도 조회 실패 때 활성 경로선을 지우고 다시 계산할 수 있게 안내합니다. 실패 뒤 옛 경로가 현재 결과처럼 남아서는 안 되며 브라우저 실제 시계로 합성 자료의 신선도를 추정하지 않습니다.

Show route distance/time and actual route coverage; label BASE_ONLY separately from LIVE_MIXED. When present, traffic age is checked event time minus published event time and is explicitly labeled simulation time. Baseline with no accepted snapshot has no invented age. Keep all user text available in English and Korean; initial English, readable Korean spacing, local language preference across reload. Use textContent, accessible labels, status live regions and visible focus; no HTML interpolation from network data.

거리·시간·실제 경로 적용률을 표시하고 기본 속도와 교통 적용을 구분합니다. 교통정보 나이는 검사한 모의 시각에서 게시 모의 시각을 뺀 값으로 명확히 표시합니다. 수용 자료가 없는 기본 경로에 나이를 꾸며 넣지 않습니다. 영어를 기본으로 한영 문구와 새로고침 뒤 언어 선택을 유지하며, 한국어 띄어쓰기·입력 이름·상태 알림·키보드 초점을 읽기 쉽게 만듭니다. 네트워크 문자열은 HTML로 삽입하지 않습니다.

## Actual acceptance / 실제 수용 검사

Keep all302 prior cases and add32 fixed P11 cases, total334: fresh-source, bundled-offline, loopback-session, unauthenticated-api, origin-rejected, path-traversal, bootstrap-privacy, authority-clock, map-ready, baseline-request, live-request, route-coverage, primary-kill-failover, unavailable-clears-route, deadline-clears-route, changed-version-rejected, authority-change-invalidates, exact-expiry, input-change-cancels, late-response-ignored, older-authority-ignored, invalid-input, keyboard-submit, english, korean, mobile390, no-external-requests, no-geolocation, reload-state, public-privacy, browser-cleanup, owned-cleanup. No case may be skipped or replaced by a hardcoded success.

기존302개를 보존하고 위 고정32개를 추가해334개로 검증합니다. 항목을 생략하거나 하드코딩한 성공으로 대체하지 않습니다.

Actual successful browser routes must reach the real gateway and native nodes. Use private parent controls for process kill, version/clock changes and held requests. Clearly labeled transport test proxies may test delayed/out-of-order responses but cannot count as native success. Automated headless browser regression is part of the actual whole runner and CI, separate from main manual IAB review. Record browser/version, request/response binding, rendered route coordinates, observed states, console/network outcomes, screenshots and exact browser/process cleanup. Prefer one owned browser server/session; close in finally and verify its PID/start identity tree. CI may use software WebGL explicitly, never as hardware-performance proof. Preserve all evidence on failure. Main must inspect the actual client through IAB, capture real video, update reports/READMEs, push and inspect hosted originals before protected delivery.

성공 경로는 실제 중계와 엔진까지 도달해야 합니다. 프로세스 종료·버전/시계 변경·요청 대기는 비공개 부모 제어로 수행합니다. 지연·순서 오류용 시험 대리 서버는 명시하고 엔진 성공으로 세지 않습니다. 자동 브라우저 회귀는 전체 실행기·CI에 포함하고 메인의 내장 브라우저 수동 확인과 구분합니다. 브라우저 버전·원요청 연결·표시 좌표·상태·콘솔/통신·화면·정리를 보존합니다. 소유 브라우저 하나를 재사용하고 finally 종료 뒤 PID와 시작 식별자를 확인합니다. CI의 소프트웨어 WebGL은 명시하며 하드웨어 성능을 주장하지 않습니다. 실패 근거도 보존하고 메인이 실제 화면·녹화·보고서·README·원격 원문·보호 반영을 확인합니다.

Automatic interactive mode publishes the initial fresh LIVE candidate once and reconciles the gateway and both nodes before READY. Supervised mode starts at baseline and exposes publication only through private control. Start elapsed-time advancement at readiness; do not overlap clock writes. The app server independently rejects coordinates outside bootstrap bounds with422 INVALID_INPUT, while the lower-level gateway's existing global coordinate contract remains unchanged.

일반 실행은 처음의 실제 LIVE 후보를 한 번 게시하고 중계·두 노드를 조정한 뒤 화면 준비를 알립니다. 감독 실행은 기본값에서 시작하고 게시를 비공개 제어로만 수행합니다. 준비 완료부터 경과 시간을 적용하고 시계 쓰기를 중첩하지 않습니다. 화면 서버도 초기 범위 밖 좌표를 독립적으로422로 거부하되 하위 중계의 기존 전역 좌표 계약은 유지합니다.

### Interrupted startup and browser cleanup / 준비 중 중단과 브라우저 정리

Main review found that installing signal handlers only after READY leaves startup unprotected, and the existing ingestion owner exits after its own cleanup without waiting for browser-specific handlers. Register cancellation before startup and reject new owned resource creation after cancellation. Closing stops new mutations, bounds the drain of existing work and still cleans owned resources if evidence writing fails. The completion promise must resolve even when final diagnostic writes fail; such failure is not clean success.

메인 검토에서 화면 준비 뒤에만 종료 신호를 등록하면 준비 단계가 보호되지 않고, 기존 수집 실행기는 별도 브라우저 종료를 기다리지 않고 정리 후 종료한다는 점을 확인했습니다. 시작 전에 취소를 등록하고 취소 뒤 새 소유 자원 생성을 막습니다. 종료 시 새 변경을 막고 진행 중 작업 대기를 제한하며 기록 쓰기에 실패해도 자원을 정리합니다. 최종 진단 쓰기 실패에도 완료 신호는 끝나야 하며 이를 정상 정리로 표시하지 않습니다.

Add one optional, bounded before-cleanup callback to the existing owned runtime, default absent, so the same signal path closes the exact browser before database/process cleanup and exit. A callback failure or timeout cannot skip the owner's cleanup. The browser runner also bounds barriers and response collection, records failures, closes in finally and uses a15-minute owned-session deadline. Do not terminate unrelated browser processes or change P09/P10 behavior when no callback is installed.

기존 소유 실행기에 선택적인 종료 전 콜백 하나와 기한을 추가합니다. 기본값은 없으며 같은 신호 경로에서 정확한 소유 브라우저를 닫은 뒤 DB·프로세스를 정리하고 종료합니다. 콜백 실패·기한 초과로 기존 정리가 생략되어서는 안 됩니다. 브라우저 실행기도 단계 대기·응답 수집에 기한을 두고 실패를 기록하며 finally 정리와15분 세션 기한을 적용합니다. 무관한 브라우저를 종료하지 않고 콜백 없는 P09/P10 동작을 유지합니다.

Public browser contracts live in dependency-free `gateway_public_types.ts` and `client_public_types.ts`; the existing server type modules re-export them. This preserves server imports and the same DTO shape while browser TypeScript keeps `types:[]`. The first browser build exposed transitive Node-only types. Do not enable all Node globals in browser checking or maintain duplicated drifting route contracts; move only public type declarations, without runtime refactoring.

공개 브라우저 계약은 의존성 없는 두 타입 파일에 두고 기존 서버 타입 모듈에서 다시 내보냅니다. 서버 가져오기 경로와 같은 자료 구조를 보존하면서 브라우저 검사는 Node 전역 타입 없이 유지합니다. 첫 브라우저 빌드에서 간접적인 Node 전용 타입 의존성이 드러났습니다. 브라우저 검사에 모든 Node 전역을 허용하거나 서로 어긋날 수 있는 계약을 복제하지 않고, 실행 로직 변경 없이 공개 타입 선언만 옮깁니다.
