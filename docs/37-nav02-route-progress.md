# NAV-02 route progress and synthetic replay / 경로 진행·합성 재생

Status: main Sol design fixed before implementation. NAV-01 is a dependency; this branch includes its existing commits and will deliver both through a protected PR. The user explicitly authorized branch push and main merge. No deployment is authorized. / 상태: 메인 Sol이 구현 전에 설계합니다. NAV-01의 기존 커밋을 의존성으로 포함해 보호 PR로 함께 반영합니다. 사용자는 푸시·main 병합을 승인했으며 배포는 범위 밖입니다.

Current status: fresh local438/438 and direct evidence review passed; exact-head hosted checks and authorized protected merge follow. See the outcome at the end. / 현재 새 로컬438개·직접 근거 검토를 통과했고 정확한 원격 검사·승인된 보호 병합을 이어갑니다. 아래 결과를 참조합니다.

## Scope and reuse / 범위·재사용

Track progress against the exact validated native route/guidance and expose current synthetic position, upcoming native maneuver, distance to it, remaining geometric distance and off-route state. Reuse the existing spherical geodesy math in Node and browser by separating its unchanged error helper from Node-only byte utilities. This is route-bound projection, not a replacement for Valhalla's road-network matcher. Read the actual Seoul road context to withhold a confident snap near competing roads. It cannot resolve grade-separated roads from two-dimensional coordinates alone.

정확한 엔진 경로·안내에 합성 위치를 연결해 다음 회전·그곳까지 거리·전체 남은 지형 거리·이탈 상태를 제공합니다. 기존 구면 계산과 오류 형식을 유지하되 Node 바이트 도구와 분리해 브라우저에서도 재사용합니다. 경로상의 진행 계산이며 엔진의 도로망 매칭을 대체하지 않습니다. 실제 서울 주변 도로와 경쟁하면 확정 위치를 보류하고 2차원 좌표만으로 고가·지하를 구별하지 않습니다.

No actual device location permissions, location uploads, speech, automatic rerouting or real-driving accuracy claim. Replay points are authored locally from this returned geometry and remain explicitly SYNTHETIC. Device adapters follow in NAV-03; rerouting/voice follow in NAV-04. The reviewed100/100 geographic gate remains open.

실제 단말 위치 권한·업로드·음성·자동 재탐색을 추가하지 않습니다. 현재 반환 경로에서 자체 생성한 위치를 SYNTHETIC으로 표시합니다. 단말 연결·재탐색/음성·독립 실도로100/100은 후속입니다.

## Binding and coordinates / 연결·좌표

A session copies an immutable route binding `{request_id, request_sha256, graph_id, generation_id}`, original longitude/latitude polyline and validated NAV-01 maneuvers. Each fix carries that binding, `source_class:"SYNTHETIC"`, finite longitude/latitude, integer nonnegative `event_time_ms`, reported `accuracy_m` in(0,25], optional heading in[0,360) and speed in[0,45]. Heading is used only with speed≥3m/s. Unknown fields, invalid coordinates, excessive uncertainty, future samples, samples older than5000ms and duplicate/reordered times do not advance progress or confidence counters. A clock advance beyond5000ms clears current instructions as STALE. The replay clock is distinct from traffic authority and never refreshes a traffic snapshot.

세션은 요청/지도/세대 연결·원 경로·검증한 안내를 복사합니다. 위치마다 같은 연결·합성 구분·유한한 위경도·정수 관측 시각·보고 오차·선택 방향/속도를 요구합니다. 미지원 필드·좌표 오류·큰 오차·미래·오래된/중복/역순 표본으로 진행이나 연속 판정을 높이지 않습니다. 시간 단절 때 현재 안내를 지우고 재생 시계로 교통자료 수명을 연장하지 않습니다.

All distances in the progress result use spherical lengths of the exact original polyline. `geometry_length_m` may differ slightly from the engine's rounded road length; do not rescale maneuver indexes, invent an ETA, or call geometric remaining distance a measured travel-time estimate. The next instruction is the next native maneuver at its original begin index, not the current segment's text. Advance past a maneuver only after3m beyond the boundary. Final arrival requires reaching the route endpoint under the separate arrival rule.

진행 거리는 원 지형의 구면 길이를 사용하며 반올림된 엔진 거리와 조금 다를 수 있습니다. 인덱스를 다시 만들거나 시간을 추정하지 않습니다. 다음 안내는 다음 원 회전의 시작 정점에서 가져오고 경계를3m 지난 뒤 넘깁니다. 최종 도착은 별도 조건을 따릅니다.

## Conservative states / 보수적 상태

`WAITING`, `ON_ROUTE`, `UNCERTAIN`, `OFF_ROUTE_PENDING`, `OFF_ROUTE`, `ARRIVED`, `STALE`, `INVALIDATED`. Only ON_ROUTE exposes current snapped position, upcoming instruction and distances; ARRIVED exposes endpoint and zero remaining distance. Other states withhold current turn/distance and preserve last-confirmed progress solely as explicitly named diagnostic history. Raw authored fixes are labeled separately from confirmed projected positions.

확인한 위치에서만 현재 회전·거리를 보여주고 불확실·이탈·오래됨에서는 보류합니다. 이전 확정 거리는 진단 이력으로만 남기고 원 합성 위치와 확정한 경로 위치를 구분합니다.

- Initial acquisition must lie within the first50m of this requested route. Reject a destination-only shortcut as arrival. Progress cannot decrease; small jitter may hold the last confirmed position. A backward displacement exceeding15m plus reported accuracy is uncertain. Bound forward progress by `max(25,45*elapsed_s+previous_accuracy+accuracy)`; a position jump cannot skip turns.
- On-route corridor is `max(12, accuracy+5)`m. A plausible competing route segment more than40m away along the route, or another context road whose projection is more than8m from the route projection and within the reported accuracy radius, yields UNCERTAIN. Accurate heading can reject an opposed route segment; context road orientation is not assumed to encode legal direction. Continuity is a constraint, not evidence that the user stayed on the route.
- Off-route requires `distance_to_route - accuracy >= 30m` for three consecutive usable samples over at least2000ms. A stale/rejected/ambiguous sample breaks the streak. One outlier cannot confirm departure. Recovery requires two usable on-route samples over at least1000ms.
- Arrival requires two accurate samples (accuracy≤10m) over at least1000ms within8m along the end and within `max(8,accuracy)`m of its coordinate, after at least `min(20,geometry_length/2)`m of confirmed travel. It confirms the replay route endpoint, not an accessible entrance/parking space.

출발50m 안에서 시작을 확인하고 역행·비현실적 도약·서로 다른 구간/주변 도로의 모호함은 보류합니다. 확정 진행은 줄이지 않으며 작은 흔들림은 유지합니다. 이탈은 보고 오차를 뺀 경로 거리30m 이상인 유효 표본3개·2초를 요구하고 거부/단절/모호함은 연속 수를 끊습니다. 복귀는 표본2개·1초, 도착도 정확한 표본2개·1초와 실제 진행을 요구합니다. 이 수치들은 이번 파일럿의 명시 정책이며 실도로 안전 인증이 아닙니다.

## Replay and UI / 재생·화면

Provide generated noisy-route and departure/rejoin scenarios for the currently calculated route. Start/pause, next sample and reset are ordinary local controls. Show replay time, reported accuracy, state, next native instruction and remaining distances; mark a SYNTHETIC raw position and a confirmed route position distinctly on the existing map. Preserve keyboard and390px readability. Pause when hidden; route/input/language/authority/failure changes stop and invalidate the session and fence old timers. Do not call navigator.geolocation or send replay points to the gateway. Replays are deterministic from fixed authored offsets/times, not random wall-clock noise. A paused synthetic clock is visibly paused.

현재 경로의 오차·이탈/복귀 자료를 생성하고 재생/일시정지·한 표본·초기화를 제공합니다. 모의 시각·오차·상태·다음 안내·남은 거리를 보여주고 합성 원 위치와 확정 위치를 다르게 표시합니다. 입력/언어/승인/실패 변경은 세션을 중단하고 옛 타이머를 차단합니다. 위치 권한·업로드 없이 같은 자료를 반복 재생합니다.

## Fixed acceptance inventory / 고정 통과 목록

Preserve all406 current cases; add32 fixed `nav02-` cases for **438 total**:
`route-binding`, `geometry-distance`, `exact-start`, `next-turn`, `turn-advance`, `remaining-distance`, `bounded-noise`, `stationary-jitter`, `backward`, `impossible-jump`, `bad-accuracy`, `malformed-fix`, `stale-sample`, `future-sample`, `out-of-order`, `duplicate`, `parallel-road-ambiguous`, `route-self-ambiguity`, `offroute-pending`, `offroute-confirmed`, `one-outlier-not-offroute`, `bad-fix-breaks-streak`, `rejoin-hysteresis`, `rejoin-confirmed`, `arrival-hysteresis`, `arrival-confirmed`, `destination-shortcut-blocked`, `replay-deterministic`, `replay-ui-step`, `replay-ui-play-pause`, `replay-ui-invalidation`, `replay-ui-mobile`.

기존406개를 유지하고 위32개를 추가해438개를 요구합니다. 독립 기대 결과는 자체 선언한 실제 경로 위치·오차·시간·회전 경계에서 만들며 진행 구현 자체를 정답 생성기로 쓰지 않습니다. 주변 도로·경로 재방문 사례는 같은 실행의 실제 서울 지형에서 찾고 원 자료를 보존합니다. 화면은 실제 엔진 응답·실제 재생 결과와 대조합니다.

Acceptance sequence: focused tests, actual development run, clean-source fresh full438 simulation, independent original-output and copied-SQLite inspection, IAB manual review, refreshed actual bilingual video/media, dated bilingual report, descriptive branch push, exact-head hosted CI artifact inspection and a normal protected PR merge. Preserve failures, main protection and unrelated worktrees. Verify the merged commit/tree and remote main after merging; no deployment is included.

집중 검사·실제 개발 실행·깨끗한 새 전체438개·원문/SQLite 독립 감사·내장 화면·새 한영 녹화·날짜별 기록·푸시·정확한 원격 검사와 원문·정상 보호 PR 병합까지 수행합니다. 병합 커밋/내용과 원격 main을 확인하며 배포는 포함하지 않습니다.


## NAV-02 local acceptance2026-10-25 / NAV-02 로컬 수용

Main Sol directly implemented contract37. Clean7078d6f/runtime6d853cf2 passed fresh438/438 and Node22 full320; independent progress190states/168positions/max authored error2.23m, actual IAB EN/KO390px and full42.7s recording passed. Existing406 checks remain. [Dated report](../research/pilot/2026-10-25-nav02/report.md). The user authorized branch push and normal protected PR merge; exact-head hosted results are recorded separately. No deployment. Next NAV-06 destination search/confirmation; independent100/100 road review and device GPS accuracy remain open.

메인 Sol이 계약37을 구현하고 깨끗한 소스의 새438개·전체320개·독립 진행190상태/168위치/자체 거리 최대2.23m·실제 한영390픽셀·42.7초 녹화를 직접 확인했습니다. 기존406개를 유지하며 사용자 승인에 따라 작업 브랜치 푸시·정상 보호 PR 병합까지 진행합니다. 원격 결과는 별도 기록하고 배포하지 않습니다. 다음은 NAV-06 목적지 검색/확인이며 독립100/100·단말 정확도는 남습니다.
