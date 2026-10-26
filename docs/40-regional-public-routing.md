# Timestamped regional traffic routing / 원시각 포함 지역 교통 경로 계산

Status: locally accepted on2026-10-26: actual48 native comparisons, fresh whole486/486, Node22 suite393/393, original-time expiry and actual EN/KO/390px routing capture. [Measured result](../research/public-road-speeds/2026-10-26-regional-routing/report.md). Main Sol owns design, implementation and original-evidence review. [Work record](../research/public-road-speeds/2026-10-26-regional-routing/plan.md).

상태: 실제48회·새 전체486개·전체393개·원시각 만료·한영390픽셀 경로 녹화를 로컬 수용했습니다. 메인 Sol이 설계·구현·원문 검토를 맡았고 아래 설계는 구현 전 확정한 기준입니다. 지역 GPS 문맥·운영·정확도는 별도입니다.

## Source and geometry / 출처와 지형

Use a distinct `public-source-0.2` batch (`provider:kr-regional`, `policy:kr-regional-v1`) and `public-traffic-0.2` signed artifact. Preserve the existing ITS `0.1` contract and exact synthetic bytes. Namespaced observation references `gits:<service ID>` and `ex:<VDS ID>` cannot collide. Derived `geometry:<sha256>:start/end` anchors bind the reviewed geometry; these are explicitly **RouteLens geometry anchors**, not government junction IDs. New policy/version pairs are strict; never relax the old ten-digit ITS identifier parser.

별도 지역 출처/게시 버전을 추가해 기존 ITS·합성 규격을 유지합니다. 출처별 식별자와 검토 지형 해시에서 만든 앵커를 구분하며 앵커를 기관 노드 번호로 주장하지 않습니다. 기존 ITS의 숫자 식별자 검사를 완화하지 않습니다.

Gyeonggi: parse timestamped public website `SVC_LINK_ID`, `PROC_DATE`, SPD and source length; use the official map server's advertised WFS `ATTRLV10` full directed curves, exact service IDs and endpoint names. Compare selected WFS curves against the website's WMS click response. Discovery exposed a real CRS-label mismatch: payloads declare EPSG5181 while the actual coordinate tuples are degrees, and the official website's own renderer transforms them from EPSG4326. Preserve both label and scoped degree-interpretation evidence; never silently transform these degree values as projected metres. Require independent WMS/WFS ordered-curve agreement and reasonable geodesic/source-length agreement before enabling an affected reference. Do not distribute the agency geometry wholesale under the code license.

경기는 원시각 포함 수치와 같은 서비스 ID의 공식 전체 방향 곡선을 연결합니다. 실제 지형 응답의 EPSG5181 표기와 도 단위 수치가 모순되고 공식 화면 코드도 위경도로 해석하므로, 두 응답의 곡선·방향·길이를 대조한 한정 호환 근거를 남깁니다. 표기를 몰래 고치거나 숫자를 미터로 바꾸지 않고 기관 지형 대량 재배포도 하지 않습니다.

Expressway: join each timestamped VDS speed to its exact installation ID, route number/direction, conzone and zone start/end chainage. Retain negative/zero/missing as unknown. Never average all detectors into a conzone or spread a point speed across a whole corridor. Review the GRS80 projection explicitly against independent official road curves; the ellipsoid name alone is not an EPSG declaration. A detector can supply speed only to a complete native edge containing the reviewed detector point, aligned with its route/direction and fully inside its declared zone extent on a corroborating official curve. Reject opposite carriageways, ambiguous points, inconsistent neighbours, unreviewed projection and unsupported zone boundaries. This conservative point-supported coverage may be much smaller than Gyeonggi coverage.

도로공사는 속도와 설치 ID·노선·방향·콘존·담당 이정을 정확히 결합합니다. GRS80이라는 타원체 이름을 좌표계 전체 명세로 보지 않고 별도 공식 곡선으로 검토합니다. 검지점을 포함하고 방향과 담당 범위가 확인되는 엔진 구간 전체에만 적용하며 콘존 평균·도로 전체 확산은 하지 않습니다. 모호한 반대 차도·이정/이웃 불일치·미검토 좌표계는 제외합니다.

## Selection, provenance and validity / 선택·근거·유효성

The regional mapping binds exact graph/edge inventory and geometry hashes and retains ordered alternatives per native edge. Prefer the verified EX point-supported observation, then a verified Gyeonggi service-link observation. This is an explicit spatial-resolution policy, not an accuracy ranking. Same-provider latest-time conflicting rows become unknown; an invalid latest row cannot resurrect an older speed. A missing original time or one beyond the existing30s clock-skew allowance is invalid. Validity ends exactly600s after original observation; acquisition or publication cannot renew it. A failed source refresh retains only previously unexpired original bytes/times. Recompute alternatives on original expiry, sign immutable bytes, and keep restart-safe sequence/withdrawal handling. Existing compiler, signature/trust checks, SQLite WAL authority, engine lifecycle and before/after-request revalidation are reused.

고정 지도·구간 목록·지형 해시와 순서 있는 출처 후보를 묶습니다. 확인한 검지점 관측 다음에 경기 서비스 링크 평균을 선택하되 정확도 순위로 표현하지 않습니다. 같은 출처의 최신 충돌·최신 무효·기존30초 허용치를 넘는 미래/누락 시각을 거부하고 원 관측600초를 유지합니다. 갱신 실패·재게시로 수명을 늘리지 않으며 기존 서명·영속 순번/철회·변환·엔진 수명·요청 전후 재검증을 재사용합니다.

Public evidence must retain original source access method. EX's public example is not a private production credential, and browser document text is not an independently captured wire response. Operator-supplied captured EX files may be consumed only with exact hash/count/time receipts; rereading them never refreshes observation time. No hidden browser-cookie extraction or background browser daemon is added. Source-specific operating keys/approval and transport reliability remain production work.

도로공사 공개 시험 접근·브라우저 문서 텍스트를 운영 인증·전송 원문으로 표현하지 않습니다. 운영자가 보존한 파일은 정확한 해시·개수·시각을 확인해 읽고 재독으로 시간을 갱신하지 않습니다. 숨은 쿠키 수집·브라우저 상시 작업은 추가하지 않습니다.

## Real-road validation / 실제 도로 검증

Reuse the pinned2026-10-23 Korea OSM bytes and exact Seoul extract/tile graph. Add a separately pinned route inventory including Seoul urban arterials and metropolitan expressway portions **inside that extract**; do not claim all Gyeonggi/Incheon coverage. Extend the scene catalog only through saved actual native route/trace/locate responses, rederive the complete catalog and bind every added file in the manifest. Preserve old graph bundles. Whole-edge geometry tolerance stays12m, local direction20degrees, monotone projection and existing length checks; ambiguity stays excluded.

고정 OSM·서울 추출 지도 안의 서울 간선과 수도권 고속도로 일부를 명시 시험 목록으로 추가합니다. 실제 경로·추적·조회 원문에서 목록을 재구성하고 과거 지도는 보존합니다. 전체 지형12m·방향20도·단조 투영·길이 기준을 유지하며 모호함을 허용하지 않습니다.

Measure graph-catalog directed edges and length, separately per provider, and actual returned-route partial-edge length. Compare baseline/traffic with identical request/departure time and source batch. Separate unchanged-shape ETA changes from rerouting; report zero-coverage routes too. These are routing influence tests, not measured ETA accuracy. Historical snapshot replay uses a visible fixed observation clock; it must not be served as current wall-clock traffic. Fresh wall-clock browser acceptance and current media are required for changed runtime behavior. Retain failures and raw/native/signature/traffic-byte evidence, run focused faults and fresh implemented-module integration, record bilingual results, commit/push and read back remote SHA.

목록의 방향 구간/길이·출처별 적용과 실제 반환 경로의 부분 길이를 따로 측정합니다. 동일 요청·출발시각으로 기본값과 비교하고 경로 변경·같은 지형 시간 변화·적용0도 모두 기록합니다. 이는 경로 영향 시험이며 도착시간 정확도 측정이 아닙니다. 과거 시계 재생과 실제 현재 화면 수용을 구분하고 실패·원문·서명·엔진 바이트·새 전체 통합·한영 기록·푸시를 확인합니다.

## Endpoint policy and comparison scope / 끝점 규칙과 비교 범위

The first two regional inventory attempts exposed routes consisting only of partial endpoint edges. Under the legacy interior-only policy those are correctly excluded. The separate `regional-native-full-edges-v1` policy obtains each complete directed native edge through `locate`, then proves that the observed partial trace is its ordered subcurve within1m. It keeps car accessibility, way identity and direction checks. It does not enable traffic on an unverified partial shape or change the legacy catalog policy. Twelve predeclared regional corridors use this policy; the three historical scenes remain in whole integration.

첫 두 지역 목록 시도는 부분 끝점 구간만 남아 기존 규칙상 제외됐습니다. 별도 지역 규칙은 엔진의 완전한 방향 구간을 조회하고 부분 추적이1m 이내 순서 있는 부분 곡선인지 검증합니다. 기존 자동차 접근·도로 식별·방향 검사를 유지하며 과거 목록 규칙은 바꾸지 않습니다. 지역 열두 간선과 기존 도심 세 시험을 구분합니다.

Comparison uses the twelve predeclared regional trials, four modes and one identical fixed native departure minute. The pinned graph lacks a timezone database; a current native probe verifies its UTC clock rather than claiming a Korea-local departure time. Each signed observation is checked against actual UTC before and after routing. The first development comparison additionally tried a historical Mapo endpoint outside the public client's100m acceptance boundary and stopped; its originals remain preserved. Do not loosen that boundary or count it as a regional success. This controlled comparison command does not add clock or departure overrides to the public gateway.

비교는 사전 고정한 열두 지역 시험·네 조건·동일 엔진 출발 분을 사용합니다. 고정 지도에 시간대 데이터가 없어 현재 엔진 조회로 UTC 기준을 확인하고 한국 현지 출발로 표현하지 않습니다. 요청 전후 실제 UTC로 관측 유효성을 확인합니다. 첫 개발 비교에서 추가 시도한 기존 마포 끝점은 공개 화면의100m 기준 밖이라 중단됐고 원문을 보존합니다. 기준 완화·지역 성공 편입·공개 시계 변경은 하지 않습니다.
