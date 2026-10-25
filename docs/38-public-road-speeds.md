# Public road speeds before crowd scale / 사용자 규모 확보 전 공공 도로 속도

Status: collection→signed/native routing→actual browser connected in development; fresh whole462 and final broader-source evidence remain pending. / 상태: 개발에서 수집→서명/엔진→실제 화면을 연결했으며 새 전체462개·넓어진 출처의 최종 근거는 진행 전입니다.

## Objective / 목표

Acquire useful actual road-speed information from Korean public sources while RouteLens has too few users for crowd aggregation, and use it in actual navigation routing with honest source, freshness and coverage. Preserve the existing synthetic pilot and its438 checks. Source inventory and actual access observations: [research](../wiki/sources/public-road-speeds.md).

사용자가 적어 자체 집계가 어려운 초기에도 국내 공공 속도를 받아 실제 경로 계산에 사용하고 출처·신선도·적용 범위를 보여줍니다. 기존 합성 파일럿과438개 검사는 유지합니다.

## Work required for completion / 완료에 필요한 작업

1. Survey official national, Seoul, highway, regional and historical feeds: scope, units, timestamp, key/approval/quota, reuse and link geometry. Record actual availability separately from catalog entries. / 전국·서울·고속도로·지역·이력의 범위·단위·시각·신청/한도·이용 조건·지형과 실제 접근을 구분합니다.
2. Implement a bounded, secret-safe collector and strict normalizer for the verified usable numeric source(s), with reproducible offline fixtures and live-call proof. / 제한 수집·키 보호·엄격 정규화·오프라인 재현·실호출 증명.
3. Import versioned official geometry and establish directed graph-bound mapping. Reject wrong directions, ambiguous parallel roads, stale link revisions and unproven mappings; retain actual coverage/omissions. / 공식 지형과 방향 대응·평행도로/버전 모호함 거부·실제 적용률.
4. Define an explicit public-agency speed contract and source selection, distinct from five-person crowd aggregation. Bind provider observations/mapping to signed immutable engine traffic bytes, wall-clock expiry and baseline fallback. / 공공 계약·출처 선택·서명 불변 파일·실제 시계 만료·기본값 복귀.
5. Connect collection/refresh and actual routes to the client. Display public source/time/coverage and honest missing/expired states. No user location collection is needed for bootstrap. / 수집/갱신·실제 경로·화면 출처/시각/적용률/누락/만료 연결.
6. Test errors/time/units/direction/mapping/provider outage/expiry, fresh whole integration and actual native/browser use; inspect originals. Refresh bilingual docs/report/video and push the feature branch with remote SHA verification. / 오류·시각·단위·방향·대응·장애·만료·새 전체·실제 화면/엔진·원문·한영 기록/영상·푸시.

Do not declare success after an API200, a parser, a small synthetic fixture or a static map overlay alone. Unavailable credentials/provider approvals may remain documented per source, but the usable-source path must actually acquire speeds and influence real routes. Deployments, paid resources and new external account actions require their own authorization. This goal does not infer a new main merge authorization from the previous NAV-02 task.

응답200·파서·작은 합성 자료·정적 지도만으로 완료하지 않습니다. 제공자별 접근 미확인은 구분하되 실제 사용 가능한 자료의 수집부터 경로 반영까지 증명합니다. 배포·비용·신규 계정 작업은 별도 승인이며 지난 NAV-02의 병합 승인을 이번 새 작업으로 확대하지 않습니다.

## Fixed first-source contract / 첫 출처 고정 계약

Use `kr-its-v1`, source class `PUBLIC_AGENCY`, separate from synthetic/crowd publication. A bounded HTTPS request covers at most0.25° by0.25° within Korea; no redirect,10s deadline,8MiB body and50,000 rows. Poll no faster than120s per collector, without overlapping calls. The credential comes from `ROUTELENS_ITS_API_KEY`, never public request parameters, persisted URLs or diagnostics. Provider failures do not refresh old observations.

`kr-its-v1`·`PUBLIC_AGENCY`를 합성/제보 게시와 구분합니다. 국내0.25도 사각형·리다이렉트 금지·10초·8MiB·5만 행·최소120초/중복 없는 수집을 적용합니다. 키는 서버 환경변수로만 받고 공개 요청·저장 URL·진단에서 제외합니다. 수집 실패로 옛 관측의 수명을 연장하지 않습니다.

Parse the provider's14-digit local collection time as Asia/Seoul(UTC+9), with a calendar round-trip. Preserve observed and retrieved times independently. Speeds are km/h→m/s;0/missing/invalid is UNKNOWN, never closure. Require0<speed≤252km/h and reject future collection times beyond30s. Each speed expires600s after its original observed time; this is our conservative bootstrap policy, not an official SLA. Latest conflicting records for a link are UNKNOWN; an invalid latest record cannot resurrect an older positive speed. Keep the response hash and actual omission counts.

14자리 수집 시각은 한국 표준시로 해석하고 달력 역검사로 확인합니다. 관측·검색 시각을 따로 보존하며 시속을 초속으로 바꿉니다. 0/누락/오류는 미확인이며 폐쇄가 아닙니다. 양수~시속252km·미래30초·원 관측600초 만료를 고정하되 기관 보장 주기로 주장하지 않습니다. 최신 중복 충돌은 미확인으로 만들고 최신 오류 뒤 옛 양수 속도를 되살리지 않습니다.

Import the downloaded2026-10-14 official MOCT_LINK/MOCT_NODE SHP/DBF/PRJ with pinned input hashes, `shapefile` and `proj4`. Read the actual PRJ rather than assuming Seoul's older TM parameters. Confirm start/end geometry against official F_NODE/T_NODE coordinates before directed mapping. The official service crosswalk groups multiple standard links and cannot supply exact component geometry, so it is not used as a substitute. Reject unsupported/missing geometry and carry version, source hashes and measured coverage through mapping. Keep large source files local; do not relicense government geometry as Apache-2.0 or publish it wholesale while general-site and dataset-specific reuse terms remain distinct.

공식2026-10-14 SHP/DBF/PRJ를 해시 고정·상위 GIS 라이브러리로 읽고 실제 좌표계를 사용합니다. 공식 노드로 양 끝·방향을 확인하며 여러 표준 구간을 합친 서비스 대응표로 세부 지형을 대신하지 않습니다. 버전·해시·실측 적용률을 유지하고 큰 원본은 로컬에 남깁니다. 정부 자료를 코드 라이선스로 재표시하거나 이용 조건 구분 없이 전체 공개하지 않습니다.

### Publication and authority / 게시·승인

Use a distinct `public-traffic-0.1` canonical artifact and Ed25519 compact JWS over its manifest. Pin publisher/kid/public key, provider, graph and mapping hash in local trust configuration. Include exact original-response/mapping/geometry hashes and collection/publication times. LIVE entries retain provider link, direction nodes, original observation time and its600s expiry. The generation's expiry is the earliest included entry expiry; rebuilding from the same batch may remove expired entries but cannot extend their lives. Publish no snapshot when no live mapped entry remains. Preserve counts for every mapped omission and all unmapped graph edges; there is no contributor count.

별도 공공 자료 형식·정규 바이트·Ed25519 서명에서 발급자/키·기관·지도·대응표 해시를 로컬 신뢰 설정에 고정합니다. 원 응답·대응표·지형·시각과 각 적용 구간의 기관 링크/방향/원 관측600초를 보존합니다. 파일 전체 만료는 포함한 구간 중 가장 이른 만료이며 같은 원본을 다시 처리해 수명을 늘리지 않습니다. 유효 대응이 없으면 기본값을 선택하고 모든 누락·미대응 분모를 보존합니다. 제보자 수는 없습니다.

An actual source mismatch prevents generic node-ID equality: the current ITS numeric response retains different junction IDs from the2026-10-14 geometry. Do not truncate IDs to assume equality. An explicit per-link compatibility binding may be added only after comparing that exact ID/road name against independently retrieved official ITS map geometry, ordered endpoints≤8m, both complete shapes≤8m apart and length difference≤max(10m,5%). Persist both endpoint tuples and source/geometry/proof hashes; a later tuple change requires fresh evidence. This is a scoped compatibility attestation, not proof that the two node IDs are universally interchangeable. Most tested links failed these criteria and remain excluded.

실제 ITS 수치 응답과 최신 지형의 노드 번호가 달라 일반적인 동일 비교를 통과하지 못했습니다. 번호를 잘라 동등성을 가정하지 않습니다. 같은 링크·도로명의 별도 공식 지도 지형에서 방향 양 끝8m·전체 양방향 거리8m·길이 차이10m/5% 이내를 모두 확인한 링크만 명시 대응을 추가합니다. 두 노드 쌍과 출처/지형/검토 원문 해시를 보존하며 노드가 바뀌면 다시 확인합니다. 전체 노드 번호가 서로 같다는 주장이 아니고 검토한 대부분은 기준 미달로 보류합니다.

Reuse the existing immutable traffic compiler through a discriminated public input, preserving exact legacy synthetic bytes/generation IDs. The public consumer validates signature, scope, catalog direction, mapping binding, sequence and wall-clock validity; recheck selection before/after native routes. Public source ingestion is locally operated at this stage; it is not a claim that a government API digitally signed our artifact or that RouteLens has deployed a public traffic service.

출처가 구분된 입력으로 기존 불변 파일 변환기를 재사용하고 이전 합성 파일·식별자는 유지합니다. 수신자는 서명·범위·방향·대응표·순서·실제 시계 만료를 검사하고 엔진 요청 전후 선택 상태를 재확인합니다. 로컬 운영 수집이며 기관이 RouteLens 자료를 서명했다거나 공개 서비스를 배포했다고 주장하지 않습니다.

Persist the public consumer high-water mark and exact accepted signed bytes in a dedicated SQLite WAL database using Node's built-in SQLite(Node22.13+ for this command), synchronous=FULL and a conditional transaction. Verify historical signed state on restart even if its speed is now expired; never reset order on expiry. Concurrent processes must not overwrite a higher sequence with a lower one. Use independent signature verification outside the brief write transaction, then compare the original state inside it. Keep this local operator adapter separate from ordinary Cloudflare Workers and preserve existing PostgreSQL synthetic acceptance.

별도 SQLite WAL에 수신 최고 순번·정확한 서명 바이트를 완전 동기·조건부 트랜잭션으로 저장합니다. 이 명령은 Node22.13 이상 내장 SQLite를 사용합니다. 재시작 때 만료된 과거 서명도 확인해 순서를 유지하고 동시 프로세스의 낮은 순번 덮어쓰기를 막습니다. 서명을 먼저 검사하고 짧은 저장 트랜잭션 안에서 원 상태가 같은지 확인합니다. 로컬 운영 연결기이며 기존 PostgreSQL 합성 승인·일반 Worker 경계는 유지합니다.

If a newer successful response invalidates all mapped speeds, the local producer durably withdraws the prior acceptance without resetting its sequence. This denial-only local flag retains the new raw-response hash; it is not a newly signed agency speed or a remote withdrawal protocol. Replayed identical publications cannot undo it; only a newer valid signed sequence can restore positive authority. / 새 성공 응답이 대응 속도를 모두 무효화하면 원 응답 해시와 로컬 철회 표시를 영속 저장합니다. 순서를 초기화하거나 속도·원격 철회 규격을 만들지 않으며 같은 게시를 다시 받아도 복구하지 않습니다. 높은 순번의 유효 서명만 속도 사용을 복구합니다.

### Runtime/client integration design / 실행·화면 연결 설계

Reuse the existing same-origin session client, map, guidance/progress and native route-result validation. Public mode uses source_classPUBLIC_AGENCY, clock_basisWALL_CLOCK_UTC and context/bootstrap schema `public-route-0.1`; never accept mismatched source/clock pairs. The legacy synthetic wire stays unchanged. Public context/route includes strict `public_traffic`: providerkr-its, source_stateCURRENT/EXPIRED/UNAVAILABLE/NO_MAPPED_SPEEDS, refresh_stateOK/FAILED/WAITING, nullable retrieved_at/observed_from/observed_until and graph_edges/mapped_edges/live_edges. CURRENT requires an active, unexpired accepted snapshot. Route coverage remains actual partial native edge length, not the graph-wide edge count.

기존 세션·지도·안내/진행·엔진 결과 검사를 재사용합니다. 공공 출처/실제 시계/별도 문맥 형식을 짝으로 검사하고 기존 합성 전송은 유지합니다. 공공 문맥에는 기관·현재/만료/사용 불가/대응 없음·갱신 성공/실패/대기·조회/관측 시각·전체/대응/유효 구간 수를 엄격히 포함합니다. 현재 상태에는 실제 유효 수용 자료가 필요하고 경로 적용률은 전체 구간 수가 아닌 실제 부분 경로 길이로 계산합니다.

Operate one bounded local public source runtime, using the existing owned compiler thread and native daemon. It polls at120s, preserves old valid observations on provider failure, reselects at original expiry and falls back to the baseline when no mapped speed is valid. Persist the original response/time for restart; credentials stay in the server environment. Recheck accepted state before/after every native request and withhold changed/expired results. Use a serialized refresh, drain only owned old engines, bound lifetime/admission/deadlines and provide exact cleanup receipts. This first locally operated public source adapter does not claim distributed public-source failover, cloud deployment or a full production service.

제한된 로컬 공공 실행에서 기존 소유 변환 스레드·지속 엔진을 사용합니다. 120초 수집·실패 시 유효한 옛 관측 유지·원시각 만료 재선택·기본값 복귀와 원 응답/시각 영속화를 구현합니다. 키는 서버에만 두며 요청 전후 상태가 변하면 결과를 보류합니다. 갱신을 직렬화하고 소유 엔진만 정리하며 수명·동시 요청·기한·정리 증거를 제한합니다. 첫 로컬 공공 연결기이며 분산 공공 출처 장애 전환·클라우드·운영 서비스를 완료했다고 주장하지 않습니다.

The browser labels actual public traffic separately from authored GPS replay. Show agency attribution, original observation age, retrieval time, source state and route coverage; do not use publication time as observation age. Synthetic clock behavior stays event-based. In public mode browser wall time may veto expired output but cannot extend server validity. Freshness failure, source/clock change, authority change or expiry invalidates guidance/replay. No GPS permission, location upload or new external credentials flow is added.

실제 공공 교통과 자체 GPS 재생을 구분하고 기관 출처·원 관측 나이·조회 시각·상태·경로 적용률을 표시합니다. 게시 시각을 관측 나이로 대신하지 않습니다. 합성 시계 동작은 유지하고 공공 화면의 실제 시계는 만료 거부에만 사용합니다. 조회 실패·출처/시계 변경·승인 변경·만료는 안내/재생을 무효화하며 위치 권한·업로드·새 인증키 입력 흐름은 추가하지 않습니다.

### Compatible official map geometry / 제공자와 호환되는 공식 지도 지형

Development discovery2026-10-26: the advertised WMS layer `ntic:T_COB_MOCT_LINK_M` returns exact `T_COB_MOCT_LINK_M.<10-digit link>` feature IDs, `F_NODE`/`T_NODE`, road name and ordered EPSG:4326 LineString. The current API's node tuple matches this layer, while the2025/2026 downloadable geometry does not. A historical2025-10-14 download has identical pilot geometry and does not resolve the mismatch. Do not relax the previous compatibility thresholds.

2026-10-26 개발 조사에서 공식 WMS의 위 레이어가 링크 번호·출발/도착 노드·도로명·방향 곡선을 함께 반환하고 실제 수치 API의 노드와 일치함을 확인했습니다. 2025년 원본도 파일럿 지형이 같아 해결되지 않았습니다. 기존 대응 검토의 거리 기준을 완화하지 않습니다.

Add a distinct versioned provider-map import, retaining retrieval time, exact layer/URLs/raw hashes and bounds rather than claiming an unknown national revision. Read bounded GetFeatureInfo at existing pilot-edge midpoints from this advertised layer and `ntic:N_LEVEL_15`. A usable link requires one unambiguous feature in each layer, exact ID/name/API F/T tuple, a complete ordered curve and bidirectional shape agreement≤1m; reject reversed, malformed, duplicate, truncated, out-of-bounds or conflicting features. The standard-layer declared length must agree within max(10m,5%). Only those verified provider lines become candidates for the existing unchanged whole-directed-edge mapping (12m envelope, monotonic progression,20° local direction, unique candidate). Preserve exclusions and source revision identities. One source's link-average speed is not a per-lane or independently measured ground truth.

알 수 없는 전국 원본 버전을 주장하지 않는 별도 제공자 지도 가져오기를 추가합니다. 조회 시각·두 공식 레이어·정확한 URL·원 응답 해시·범위를 유지합니다. 기존 파일럿 구간의 중점에서 제한 조회하고 두 레이어의 단일 후보·같은 링크/도로명·API 노드 쌍·전체 방향 곡선·양방향 지형 거리1m 이내를 요구합니다. 역방향·중복·잘림·범위 밖·충돌을 거부하고 선언 길이 차이는10m/5% 이내로 고정합니다. 검증된 선만 기존의 전체 방향 구간 대응으로 넘겨12m·단조 진행·국소20도·유일 후보 기준을 유지합니다. 도로 평균 속도를 차로별 실측 정확도로 해석하지 않습니다.

### Fresh public-runtime acceptance / 새 공공 실행 수용

Preserve438 previous assertions and add24 fixed public-runtime cases (462 total): public bootstrap/current/source identity/full denominator; session/origin/malformed input; actual native speed and Korean guidance; slow refresh/context responsiveness; outage/original expiry; partial expiry and route-specific zero coverage; exact full expiry and actual baseline routing; higher-sequence recovery and changed native duration; zero-speed durable withdrawal; restart sequence/baseline; deadline/input-scope rejection; independently verified signed originals and owned cleanup. These deterministic fault tests use clearly labeled authored provider-protocol responses with a controlled clock on a freshly rebuilt actual Seoul graph. They are not evidence of an agency's actual speed. Separately acquire actual numeric data and verified official geometry, drive native routes and inspect the real browser before claiming the public-source path works.

기존438개에 위24개를 더해462개를 요구합니다. 새 서울 그래프 위 통제 시계·자체 제공자 규격 응답으로 갱신 지연/장애·부분/전체 만료·기본 경로·재수집·0속도 철회·재시작·기한/입력·원문 서명·정리를 검사합니다. 장애 검사는 실제 기관 속도 수치의 근거로 세지 않습니다. 실제 수치·공식 지형·엔진 경로·화면 검증을 별도로 수행해야 공공 자료의 연결을 주장할 수 있습니다.
