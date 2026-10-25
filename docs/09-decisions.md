# 설계 결정과 미결정 항목

상태는 구현 완료 여부가 아니라 계획에서의 선택을 뜻합니다. 변경할 때는 근거·영향·검증 계획을 같은 항목에 기록합니다.

| 번호 | 결정 | 이유 | 다시 검토할 조건 |
| --- | --- | --- | --- |
| ADR-001 | 수집은 운영자 관리, 경로 계산은 승인 노드에 분산 | 작은 참여망에서 신뢰와 운영 책임을 명확히 함 | 독립 운영자들이 같은 계약으로 운영 가능할 때 |
| ADR-002 | Valhalla 우선, 엔진 핵심 포크 없음 | 경로·매칭·교통 파일을 재사용 | M0 품질·지연·메모리 목표 미달 |
| ADR-003 | 휴대폰 전국 그래프 다운로드 제외 | 설치 크기·첫 사용 지연 감소 | 오프라인 사용 수요와 지역 그래프 실측 확보 |
| ADR-004 | 초기 노드는 같은 지역 전체를 복제 | 지역 경계 경로 조합의 복잡성 방지 | 전국 자료가 노드 자원 한도를 넘을 때 |
| ADR-005 | Cloudflare 운영 구성 + 일반 서버 설치 구성 | 익숙한 운영 환경과 오픈소스 독립성 양립 | 유지관리 비용이 실제로 과도한 경우 |
| ADR-006 | 실시간 핵심 기준 상태에 KV 사용하지 않음 | 늦은 전파로 만료·폐기 처리가 지연될 수 있음 | 명시적인 지연 허용 데이터에만 활용 |
| ADR-007 | 원시 GPS는 신뢰 영역에서만 처리 | 공개망의 복제·재식별 위험 제한 | 단말 매칭 또는 검증된 보안 집계가 준비됐을 때 |
| ADR-008 | P2P 전송은 후속, HTTP 계약 먼저 | 경로·교통정보 품질이 우선 병목 | 독립성 또는 배포 비용 이득이 측정될 때 |
| ADR-009 | 앱 코드·문서는 Apache-2.0 | 재사용·기여·특허 허여를 명시 | 공개 후 라이선스 변경은 기여자 권리 검토 필요 |
| ADR-010 | 버스 제품은 별도 범위 | 배차·권한·도착예측은 다른 제품 문제 | 별도 사용자가 확정되고 자동차 핵심과 일정 분리 가능 |
| ADR-011 | 제품명 RouteLens, 저장소·폴더 routelens | 사용자가 경로 탐색 의미와 Metro Lens 계열 이름을 선택 | 사용자가 이름 변경을 요청할 때 |
| ADR-012 | 설계 문서 + 프로젝트 위키 + 출처·누적 기록 | 계획·구현 근거가 대화에만 남지 않도록 함 | 중복·낡은 정보는 페이지 통합과 교차 참조로 해결 |
| ADR-013 | 첫 모듈은 RM-001 시험자료 검사 | 엔진 성능을 판단하기 전에 평가 입력과 근거를 구분해야 함 | 실제 도로 사례 확보 후 RM-002 착수 |
| ADR-014 | Separate local simulation from geographic evidence / 로컬 합성 검증과 실제 지역 증거 분리 | Exercise the complete pipeline without pretending synthetic cases are reviewed roads / 합성을 검토된 실제 도로로 꾸미지 않고 전체 흐름 검증 | Geographic evaluation still requires reviewed inputs / 실제 지역 평가는 검토 자료 필요 |
| ADR-015 | Protect main; finish with branch pushes / main 보호·작업 브랜치 푸시로 마무리 | Preserve a review boundary and remote handoff / 검토 경계와 원격 결과 보존 | Add required checks after P14a succeeds / P14a 성공 후 필수 검사 추가 |
| ADR-016 | English first with Korean messages / 영어 우선·한국어 병기 | Human and agent readability across interfaces and commits / 인터페이스·커밋을 사람과 에이전트가 이해 | Keep machine identifiers and historical evidence intact / 규격 식별자·과거 증거 유지 |
| ADR-017 | P01 schedules fixture-label events only / P01은 도로 이름표 이벤트 일정만 생성 | Build truthful replay and evidence before GPS or engine integration / GPS·엔진 연결 전에 정직한 재현·증거 기반 마련 | Extend at P02/P03 without presenting P01 as real routing / P02/P03에서 확장하고 P01을 실제 경로 계산으로 표현하지 않음 |
| ADR-018 | Korean chat, bilingual project artifacts / 대화는 한국어·프로젝트 기록물은 이중 언어 | User clarified the scope of the language rule / 사용자가 언어 규칙의 범위를 정정 | Follow explicit user language requests / 명시적인 사용자 언어 요청을 따름 |

| ADR-019 | TypeScript for verification and production coordination / 검증과 운영 조정에 TypeScript 통일 | User-requested shared toolchain and future type reuse; preserve P01 replay parity / 사용자 요청에 따른 도구 통일·후속 타입 공유, P01 재생 동등성 유지 | Revisit only with measured requirements; see [migration](14-typescript-migration.md) / 실측 요구에 따라 재검토 |

## 아직 확정하지 않은 것

1. 시험 지역·원본 확보 방법·실제 운전자 모집 규모.
2. 한국 도로에서의 경로 엔진 성능과 지도 품질.
3. Valhalla live traffic 바이너리 변환의 정확한 구현, 매우 낮은 속도 처리, 변경분 교체 방식.
4. TUF 배포 구성과 운영 키 보관은 미결정입니다. 로컬 P07의 JWS는 ADR-025와 고정 jose6.2.13·매 실행 비밀 키·로컬 공개 신뢰 설정으로 구체화했습니다. 암호 기능은 재사용합니다.
5. 지도 표시 데이터의 생성 도구·서체·스타일과 재배포 조건.
6. 운영 호스팅 공급자, 실제 월 예산과 노드 최소 사양.
7. 공개 참여에서 익명성·중복 계정·관측 신뢰도를 함께 다룰 정책. 초대 시험은 해결책의 검증 범위가 제한됨.
8. 제품명은 RouteLens로 확정. 도메인·상표 등록 여부는 미검토이며 이름 확정과 구분.

## 이전 논의를 구체화한 방향

서버를 자원봉사자에게 나누고 검증된 자료를 배포한다는 목적은 유지합니다. 다만 경로를 여러 노드의 조각으로 합치는 것, 휴대폰을 필수 계산 서버로 삼는 것, 원본 관측을 공개 P2P로 전파하는 것은 첫 버전에서 제외합니다.

서버리스 수집이 가능하다는 것과 지도 매칭까지 일반 Worker 하나에서 처리된다는 것은 다릅니다. 코드 공개와 위치 데이터 공개도 다릅니다. 이 두 구분이 전체 설계의 경계입니다.

## ADR-020: Conservative observed-time matching / 보수적인 관측시간 매칭

Use pinned Valhalla map snapping behind a TypeScript adapter; do not fork its matcher. The P04 adapter accepts only supported synthetic observations on a verified graph, keeps ambiguous/gapped/partial evidence explicit, and derives complete traversal times from observation timestamps rather than engine ETA. A bounded session finalizes once after all batches; no streaming or durable queue claim. [Contract and fixed checks](19-p04-matching-design.md). Revisit thresholds only with documented new evidence; real-road matching quality remains unmeasured.

고정 Valhalla 매칭을 TypeScript 연결기로 재사용하며 엔진 매칭기를 포크하지 않습니다. 검증 그래프의 지원 합성 관측만 받고 모호·누락·일부 증거를 명시하며 예상 주행시간 대신 원래 관측시각으로 완전 통과시간을 만듭니다. 크기가 제한된 세션이 모든 배치 후 한 번 확정하며 실시간·영속 큐로 주장하지 않습니다. 새 근거를 기록한 뒤에만 기준을 재검토하며 실제 도로 매칭 품질은 아직 측정하지 않았습니다.

## ADR-021: Actual Seoul roads for the main pilot / 주요 파일럿에 실제 서울 도로 사용

The user requires actual Seoul roads rather than a simplified invented network. Keep tiny-city as regression coverage and make a pinned OSM Seoul-envelope graph the primary integration/demo. Add explicit latitude-aware curved-polyline geometry, independent synthetic movement and observations-only matching. Preserve source/ODbL attribution and full-denominator evaluation. This transition now precedes P05; prior tiny-city evidence remains valid only within its original scope. [Contract](21-seoul-road-simulation.md).

사용자가 단순 가상망 대신 실제 서울 도로를 요구했습니다. tiny-city는 회귀용으로 유지하고 고정 OSM 서울 범위 그래프를 주요 통합·데모로 사용합니다. 위도를 반영한 곡선 계산·독립 합성 이동·관측 전용 매칭을 추가하고 출처/ODbL·전체 분모 평가를 보존합니다. P05보다 먼저 전환하며 과거 tiny-city 증거는 원래 범위 안에서만 유효합니다.

## ADR-022: PostgreSQL durable ingestion / PostgreSQL 영속 수집

Use PostgreSQL transactions and row locks for the local P05 queue, with explicit trip finalization, bounded raw retention and fencing. Separate accepted storage, repeated computation and once-only committed effects. Use existing Seoul observations and real process termination to prove recovery. [Executable contract](22-p05-executable-contract.md).

로컬 P05 큐는 PostgreSQL 트랜잭션·행 잠금을 사용하며 여행 완료·제한된 원문 보관·소유 세대 검사를 명시합니다. 저장 접수·계산 반복·한 번만 반영된 저장 효과를 구분하고 서울 관측과 실제 프로세스 종료로 복구를 증명합니다.

## ADR-023: Closed event windows and durable aggregate invalidation / 마감 관측 창과 영속 집계 무효화

P06 uses exit-time60s windows and persisted matching availability strictly before end+30s, one earliest eligible contribution per contributor/edge/window and median traversal duration. Do not backdate long-trip matching into LIVE traffic. Add short actual-Seoul trips and explicit TRAVEL/PARKED state; never infer parking from zero speed. Store unsigned candidate bytes atomically and invalidate them within the source traversal's deletion transaction. [Fixed contract](23-p06-aggregation-contract.md), [database sources](../wiki/sources/postgresql-aggregation.md). This is a planned implementation until direct evidence passes.

P06은진출기준60초창·창끝30초미만의영속매칭완료시각·기여자/구간/창별최초적격1건·통과시간중앙값을사용합니다. 긴여행의늦은매칭을옛LIVE로만들지않고짧은실제서울여행·명시주행/주차상태를추가합니다. 0속도로주차를추론하지않으며서명전후보를원자저장하고원본통과삭제와같은트랜잭션에서무효화합니다. 직접증거통과전에는구현완료가아닙니다.

## ADR-024: Version observed progress correction / 관측 진행 보정을 새 정책으로 구분

The P06 design probe exposed endpoint rounding and snapped-fraction timing errors in v2. Adopt [observed projection v3](24-observed-projection-policy.md) using original observations and only the engine-selected connected path. Preserve all distance/gap/ambiguity checks, original five-contributor/timing criteria and explicit legacy v2 interpretation. Do not change upstream Valhalla or use generated truth as matcher input. New P06 requires v3; P05 workers must execute the exact stored policy.

P06 설계조사에서 v2의 끝점 반올림·진행 비율에 따른 시간 오차가 드러났습니다. 원관측과 엔진이 선택한 연결 경로만 사용하는 투영 v3를 채택합니다. 거리·누락·모호성 검사와 원래의 5명·시간 기준, 명시적인 과거 v2 해석을 유지합니다. 엔진을 수정하거나 생성 정답을 매칭 입력으로 쓰지 않습니다. 새 P06은 v3를 요구하고 P05 처리자는 저장된 정확한 정책을 실행합니다.

## ADR-025: Standard signed bytes and durable publication order / 표준 서명 바이트·영속 게시 순서

Use pinned jose compact JWS with explicit local scoped public keys, immutable PostgreSQL artifact bytes and transactional publisher/consumer sequence state. Require actual loopback HTTP transfer and independent consumer processes. Preserve the P06 authoritative candidate boundary and same-transaction current-pointer invalidation; never imply recall of already downloaded artifacts or P08 engine activation. [Fixed P07 contract](25-p07-publication-contract.md), [upstream source](../wiki/sources/jose-publication.md).

고정 jose 표준JWS·범위를 명시한 로컬 공개키·불변DB내용·트랜잭션 발급/수신 순번을 사용합니다. 실제로컬HTTP·독립수신프로세스를 검증하고 P06후보와 동일트랜잭션 현재참조무효화를 유지합니다. 이미받은파일회수·P08엔진반영을 주장하지 않습니다.

## ADR-026: Immutable traffic generation from durable acceptance / 영속 수용에서 불변 속도 파일 생성

Reuse the pinned engine traffic skeleton and patch validated8-byte speed records in TypeScript. Bind each immutable generation to the graph, skeleton and exact P07 snapshot; recheck accepted state before engine use and response. Unknown/expired data selects a labeled baseline, never zero-speed closures. Preserve native current-time costing, prove fresh Seoul15-trip aggregation→signing→acceptance→detour→automatic expiry, and defer persistent two-node activation to P09. [Fixed contract](27-p08-traffic-activation.md).

고정엔진뼈대를재사용하고검증한속도8바이트를TypeScript로반영합니다. 세대마다지도/뼈대/정확한P07자료를묶고엔진사용/응답전에수용상태를다시확인합니다. 미확인/만료를폐쇄0속도가아닌표시된기본값으로처리합니다. 현재시각비용을유지하고서울15여행의집계/서명/수용/우회/자동만료를증명하며영속두노드는P09입니다.

## ADR-027: Independent gateway authority / 독립 중계 승인 기준

P10 selects a target from its own durable P07 consumer and verified P08 generation, never from a peer's freshness claim alone. Allow one same-version retry across two approved local P09 nodes, preserve a shared deadline and reject changed authorization before return. Derive public live coverage from actual route partial lengths; do not equate a live snapshot with live coverage on every route. [Contract](29-p10-route-gateway.md), [verified local proof](../research/pilot/2026-10-25-p10/report.md). Public enrollment and response signatures remain future scope.

P10은 노드의 최신 버전 주장만 믿지 않고 자체 P07 영속 수신자와 검증된 P08 세대로 대상을 정합니다. 승인된 로컬 P09 노드 두 개 사이에서 같은 버전으로 한 번만 재시도하고 전체 기한을 유지하며 반환 전 승인 변경을 거부합니다. 실제 부분 경로 길이로 공개 적용률을 계산하고 LIVE 자료가 있다고 모든 경로에 적용됐다고 표시하지 않습니다. 공개 노드 등록·응답 서명은 후속 범위입니다.

## ADR-028: Keep graph verification off the gateway HTTP loop / 중계 HTTP 루프와 지도 검증 분리

The final P10 hosted concurrency failures and local timer measurement showed that repeated synchronous full-bundle checks can consume admission deadlines before native dispatch. Reuse the unchanged P08 verifier/compiler inside one owned bounded Node worker. Share only identical in-flight preparations, never settled authorization; await every per-request generation check and close the worker explicitly. Keep existing request limits and acceptance criteria. [Contract](29-p10-route-gateway.md), [failures](../research/pilot/2026-10-25-p10/hosted-failures/README.md), [fresh correction proof](../research/pilot/2026-10-25-p10-worker/report.md).

최종 원격 동시 요청 실패와 로컬 타이머 측정에서 반복 동기 지도 검증이 엔진 전달 전에 요청 기한을 소진할 수 있음을 확인했습니다. 기존 P08 검증·변환을 소유·기한 제한 Node 작업 스레드에서 재사용합니다. 같은 진행 중 준비만 공유하고 완료된 승인은 재사용하지 않으며 요청별 세대 검사를 기다리고 스레드를 명시적으로 종료합니다. 기존 요청 한도와 통과 기준은 유지합니다.

## ADR-029: Bound native domain errors to final authority / 최종 승인에 엔진 업무 오류 연결

P12 reuses pinned Valhalla3.9.1's100m search option and original route400 codes170/171/442. It does not fork routing or silently change legacy defaults. Strict bounded error parsing and private request/native hashes preserve the selected generation and instance; both node and gateway recheck accepted state before returning the four-field public error. Unknown upstream failures remain unavailable. Trusted CAR admission and administrative node exclusion stay outside public request claims. [Fixed design](32-p12-whole-scenarios.md); final clean integration remains pending.

P12는 고정 엔진의 탐색 옵션과 원래 경로 오류를 재사용하며 엔진을 포크하거나 기존 기본값을 바꾸지 않습니다. 제한된 엄격 해석·비공개 요청/엔진 해시로 선택한 세대·실행을 연결하고 노드·중계 모두 최종 수용 상태를 검사한 뒤 네 필드 공개 오류를 반환합니다. 미확인 엔진 실패는 사용 불가로 유지하며 자동차 접수·관리 노드 제외는 공개 요청의 주장에 맡기지 않습니다. 최종 깨끗한 통합 판정은 남아 있습니다.

## ADR-030: Same-core local post-matching parity / 같은 규칙의 로컬 매칭 후 비교

P13 reuses the unchanged aggregation core behind actual local Worker/Queue/SQLite DO adapters and compares exact same-run PostgreSQL input/result originals. Persist receipt/outbox and deduplicated effects transactionally; do not assume queue exactly-once or cross-service atomicity. Keep native matching/routing and P07 publication outside ordinary Workers. [Contract](33-p13-local-cloudflare-parity.md), [CI gate](34-p14b-final-integration.md). This is a candidate until clean390 and hosted evidence pass.

P13은 같은 실행의 PostgreSQL 원 입력/결과와 실제 로컬 Worker·큐·SQLite DO를 비교하고 기존 집계 규칙을 재사용합니다. 접수/발신 대기·중복 제거 효과를 트랜잭션으로 저장하며 큐의 정확히 한 번·서비스 간 원자성을 가정하지 않습니다. 엔진 매칭/경로·서명 게시의 기존 경계를 유지하고 깨끗한390개·원격 근거 전까지 후보로 둡니다.

### Current acceptance note / 현재 수용 기록

P12's fixed contract is locally/hosted verified and protected-merged. P13's supported local post-matching contract passed clean390/32 with11 full PostgreSQL/Worker pairs; hosted acceptance remains. Initial undecided items above are historical; ADR026–030 and their linked reports supersede the local traffic, map/client and adapter implementation questions. Production identity, real-world accuracy and deployment remain unresolved.

P12고정 계약은 로컬/원격 검증·보호 병합했고 P13의 지원 로컬 매칭 후 계약은 깨끗한390/32개·집계11쌍을 통과했으며 원격 수용은 남습니다. 초기 미결정 목록의 로컬 교통·지도/화면·연결기 구현 사항은 ADR026~030과 보고서로 구체화됐고 운영 신원·실환경 정확도·배포는 남습니다.

## ADR-031: Native guidance before device tracking / 단말 추적 전에 엔진 안내 연결

The accepted P01–P14 pilot is the baseline. Continue toward usable navigation in [roadmap35](35-usable-navigation-roadmap.md), beginning with [NAV-01](36-nav01-turn-guidance.md). Reuse pinned Valhalla narrative locales and maneuver geometry indexes; add a narrow optional contract, not another routing/narrative engine. Preserve legacy unguided wire behavior and all freshness checks. Geographic RM-001 remains a release gate with independent reviewed expectations; local interface implementation may proceed with explicitly synthetic acceptance. This clarifies the old milestone order without counting synthetic routes as real-road acceptance. Main Sol owns design, implementation and review. This task ends at a verified feature-branch push.

수용한 P01~P14를 기준으로 실사용 계획과 NAV-01을 진행합니다. 고정 Valhalla의 언어·안내·지형 인덱스를 재사용하고 선택형 계약만 추가합니다. 기존 안내 없는 전송·신선도 검사를 유지합니다. 실제 지역 검토는 독립 기대 결과를 갖춘 실사용 전 조건으로 남기고 합성임을 명시한 로컬 인터페이스 검증을 진행합니다. 기존 순서를 구체화하되 합성 경로를 실도로 수용에 포함하지 않습니다. 메인 Sol이 설계·구현·검토하고 이번 작업은 작업 브랜치 푸시까지입니다.

## ADR-032: Route-bound conservative progress / 경로에 연결한 보수적 진행

NAV-02 reuses spherical geodesy and native maneuver indexes on the exact validated route. Separate reported fixes, confirmed projection and ambiguous/off-route states; bad GPS cannot fabricate progress, a turn or arrival. Use deterministic authored replay on the actual Seoul road context first, with no device permission or upload. Traffic authority still invalidates the entire route/replay. [Fixed contract](37-nav02-route-progress.md). Main Sol designs, implements and directly reviews; the requested finish includes protected main merge.

NAV-02는 검증한 원 경로·회전 인덱스·구면 계산을 재사용합니다. 원 위치·확정 투영·모호함/이탈을 구분하고 잘못된 위치로 진행·회전·도착을 만들지 않습니다. 실제 서울 주변 도로에서 합성 재생부터 검증하며 단말 권한·업로드는 후속입니다. 교통 승인 변경은 경로·재생 전체를 무효화합니다. 메인 Sol이 설계·구현·검토하고 보호 main 병합까지 수행합니다.

## ADR-033: Public agency observations before crowd scale / 사용자 규모 확보 전 공공 관측

Bootstrap actual traffic from the verified ITS HTTPS numeric feed under an explicit PUBLIC_AGENCY contract, not synthetic labels or fabricated crowd contributors. Preserve provider-local collection time, strict units, bounded polling and original-time expiry. Use official directed link/node geometry and the actual projection definition with upstream shapefile/proj4; bind mappings to exact source/graph hashes and reject ambiguous geometry. Reuse traffic encoding, signatures and native routing through a distinct public-source authority path without weakening P01–NAV02. [Full objective and fixed contract](38-public-road-speeds.md). Main Sol owns design, implementation and evidence review. Completion requires actual acquisition→mapping→routing/client proof, not research/API success alone.

실제 확인한 ITS 수치를 별도 공공 계약으로 도입하고 합성 표시·제보자 수를 위조하지 않습니다. 기관 관측시각·단위·수집 제한·원시각 만료, 공식 방향 지형·좌표계·해시를 유지하며 모호한 대응을 거부합니다. 기존 변환·서명·엔진을 별도 승인 경로로 재사용하고 이전 검증을 약화하지 않습니다. 메인 Sol이 담당하며 실제 수집부터 경로·화면까지 입증해야 완료입니다.
