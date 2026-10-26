# Additional public traffic acquisition / 추가 공공 교통 자료 수집

Captured and inspected on **2026-10-26 KST**, starting from `b427ecc44d27b3166a77f46f3c389bf756f24bb7` on `feat/public-road-speeds`. Main Sol designed, implemented and directly reviewed this research increment. The user confirmed no separate Gyeonggi/Expressway/UTIC keys and requested public data first plus issuance instructions. [Scope decided before coding](plan.md) · [API key guide](../../../docs/39-public-traffic-api-keys.md).

2026-10-26에 기존 공공 속도 브랜치를 이어 메인 Sol이 설계·수집 도구 구현·원문 검토를 수행했습니다. 별도 키가 없다는 답변에 따라 공개 자료를 먼저 확보하고 발급 안내를 작성했습니다. 이번 결과는 자료 수집이며 새 출처의 내비게이션 적용·상시 운영·main 병합·배포는 포함하지 않습니다.

## Acquired data / 실제 확보 자료

| Source / 출처 | Acquired scope and count / 확보 범위·개수 | Original time and limit / 원시각·한계 |
| --- | --- | --- |
| Seoul TOPIS website / 서울 TOPIS 웹 | 776 road-axis detail responses; 21,170 returned rows, **6,082 distinct link IDs**; 20,886 positive-speed rows / 도로 축 776개 상세·21,170행·고유 링크 6,082개 | No observation time in acquired rows. Overlapping axes produce duplicates; 36 detail responses empty / 원 관측시각 없음·축 중복·빈 상세 36개 |
| Gyeonggi website / 경기도 웹 | 122 listed routes; **2,744 distinct service-link IDs**, all positive / 122노선·고유 서비스 링크 2,744개·양수 속도 | `PROC_DATE` epoch preserved; original 12:06–12:13 KST. All within 600s **at capture**, not indefinitely current / 원 처리시각 보존·수집 당시 조건 통과 |
| UTIC website / UTIC 웹 | **1,781 distinct link records** from 66 listed highway pages plus Teheran-ro / 고속도로 66개와 테헤란로의 링크 1,781개 | No observation time. A separate 2,525-name urban list was obtained, but its complete numeric details were **not** / 원시각 없음·도시도로 2,525개 명칭 목록과 전체 수치 확보는 별개 |
| Korea Expressway official demo / 한국도로공사 공식 예제 | **8,270 distinct VDS records**, 1,577 conzone IDs; 6,781 positive, 1,489 no-speed / 검지기 8,270개·콘존 1,577개·유효 양수 6,781개 | Original minute 12:17 KST. Official example's default `test`, not a private operating key; ordinary browser worked, CLI blocked / 원시각 분 단위·공식 공개 시험키·브라우저 성공/CLI 차단 |
| Daegu website / 대구 웹 | 42 road groups; **345 distinct internal link IDs**, 287 positive and 58 no-speed / 42개 도로·내부 링크 345개 | No observation time. Daegu is outside the metropolitan area / 원시각 없음·수도권 외 자료 |
| Seoul September history / 서울 9월 이력 | **152,151 data rows**, 30 dates, 24 hourly columns; 34,497,477-byte XLSX / 152,151행·30일·시간대 24열 | September 1–30, 2026; historical baseline only / 2026년 9월 이력이며 현재 정체로 대체하지 않음 |

These are captured snapshots. Provider IDs, VDS devices, conzones and road axes are different units; do not add them into a unique road total or a metropolitan coverage percentage. The previous runtime still accepts **ITS only**, with its previously reviewed directed mapping. Every newly normalized observation has `routing_eligible:false`. No new source was supplied to the native route engine or browser demo.

모두 당시 스냅샷입니다. 출처별 링크·검지기·콘존·도로 축은 단위가 달라 합계로 고유 도로 수나 수도권 적용률을 만들 수 없습니다. 기존 실행의 ITS 출처와 방향 지형 대응은 유지하며 새 정규화 자료는 모두 경로 적용 불가로 기록합니다. 새 자료가 실제 경로 계산·기존 데모에 들어갔다고 주장하지 않습니다.

TOPIS has 7,715 distinct ID/axis-direction pairs and 13,455 repeated pair rows. For 3,055 pairs, different captured speeds exist. Overlapping axes, relative directions and staggered reads require resolution before integration; an arbitrary last-row winner would hide disagreement. Gyeonggi IDs may be alphanumeric, such as `2850050A00`, and are not automatically standard-link or Valhalla IDs. EX VDS values must not be blindly averaged into a conzone. [Duplicate review](evidence/duplicate-review.json).

TOPIS 동일 ID/축 방향 쌍은 7,715개이고 반복 행은 13,455개이며 3,055쌍에서 서로 다른 속도가 관찰됐습니다. 마지막 행만 남겨 불일치를 숨기지 않습니다. 경기 서비스 식별자는 영숫자가 섞일 수 있고 표준링크·엔진 ID로 바로 해석하지 않습니다. 도로공사 검지기 여러 개를 콘존 하나로 단순 평균하는 연결도 구현하지 않았습니다.

The captured Gyeonggi records include 수도권제1순환 78, 영동 48, 강변북로 44, 경부 42, 올림픽대로 40, 동부간선 31, 자유로 30 and 제2경인 18 rows, plus 인천대교/인천김포/제3경인. TOPIS includes Gangbyeonbuk-ro 140 and Olympic-daero 122 returned rows, with axis overlap. These demonstrate the presence of those names in returned data, not complete corridor coverage. Full per-name counts are in the [original audit](evidence/campaign-verification.json).

경기 응답에는 위 주요 수도권 간선이 실제 포함됩니다. 다만 조회된 명칭별 행 수이며 특정 도로 전 구간을 확보했다는 의미는 아닙니다. TOPIS 명칭별 행 수도 축 중복이 있어 고유 구간 수와 다릅니다. 수도권 도로 길이 전체를 분모로 한 비율은 아직 측정하지 않았습니다.

## Acquisition methods / 수집 방법

The TypeScript [collector](collector.ts) reads anonymous HTTPS endpoints used by each official website. It needs no new npm dependency and does not consume private API keys. Requests use verified TLS, allowlisted hosts, 16 MiB response limits, 8s connection/20s total timeouts and at most two sequential requests per second **per provider**. Four providers run independently. It retains receipts/body bytes, never overwrites an output directory, stops on 403/429 or five consecutive failures, and performs no automatic retry. Structured receipt failure is not numeric success. UTIC scripts are parsed only as a fixed literal grammar; no downloaded code is executed.

TypeScript 수집기는 공식 웹 화면이 호출하는 익명 HTTPS 주소만 읽고 추가 의존성·비공개 키를 요구하지 않습니다. TLS 검증·허용 호스트·응답 크기·시간·기관별 초당 최대 2회 제한을 두며 403/429나 연속 5실패에서 중단합니다. 원문·근거를 새 디렉터리에 보존하고 자동 재시도하지 않습니다. UTIC는 고정 자료 리터럴만 해석하고 받은 스크립트를 실행하지 않습니다.

| Provider / 기관 | Declared website read / 웹 조회 주소·필드 |
| --- | --- |
| TOPIS | POST `https://topis.seoul.go.kr/map/trafficMap/selectRoadList.do`; then `selectRoadDetailList.do` with listed `axisCd`; retains both returned directions / 목록의 축 ID로 양방향 상세 보존 |
| Gyeonggi | GET `https://gits.gg.go.kr/web/map/webMapApi.do?API=V_API2_ROADRANK_API&ROUTE_ID=`; then `API=V_API2_SPD_API&ROUTE_ID=<listed ID>` / 기관의 노선 ID 사용 |
| UTIC | GET `https://www.utic.go.kr/traffic/trafficRoad.do?list=highway&msg=highway`; POST `traffichighway.do` with listed roadName/roadrank; one `traffic.do` Teheran-ro detail / 고속도로 목록 상세·테헤란로 예시 |
| Daegu | POST `https://car.daegu.go.kr/map/ajax/getTrafficInfoForRoadForMap`; then `getTrafficInfoForRoadForMapLv2` with listed `fac_sn` / 도로 그룹 ID 상세 |

For EX, the ordinary in-app browser opened the official API 0405 description and its example modal. Its unchanged default URL `https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=test&type=json` returned `SUCCESS` with 8,270 rows. The first tool-bridge read truncated at 200,011 characters and failed JSON parsing. The same static document was then read in bounded 50,000-character pieces, joined and parsed as complete JSON. Saved bytes are **rendered document text**, not an independently captured HTTP wire response. Their [receipt](expressway/document.receipt.json) preserves that distinction. No login, private key, cookie extraction, proxy or application submission was involved. The exact public demo URL still returned HTTP400/Request Blocked via CLI.

도로공사는 내장 브라우저에서 공식 0405 명세·예제를 열어 기본값 `test`로 전체 8,270건을 확보했습니다. 최초 도구 전달이 잘려 JSON 파싱이 실패한 사실을 보존하고 같은 문서를 작은 조각으로 끝까지 읽어 재구성했습니다. 저장한 바이트는 화면의 JSON 문서 텍스트이며 전송 계층 원문 캡처로 표현하지 않습니다. 로그인·쿠키 추출·우회·신청 없이 확보했으며 CLI의 400 차단도 함께 기록합니다. 운영 수집에는 개인 발급키·허용량·전송 방식 확인이 필요합니다.

The history file came from the TOPIS public reference list (`blbdDivCd=06`, year 2026, September entry `bdwrSeq=6204`) and `downloadFileRefRoom.do`. Initial acquisition correctly hit the 16 MiB limit (curl exit63). After verifying the declared 34,497,477-byte size, a separate file-specific 64 MiB download succeeded; the general collector limit was unchanged. ZIP CRC and the complete 185,380,161-byte worksheet XML were inspected without formula execution. A UTF8 streaming-decoder refinement was checked against the original result: hashes, date counts and headers are identical. [Sanitized history audit](evidence/seoul-history-summary.json).

9월 이력은 TOPIS 공개 자료실의 실제 게시물에서 내려받았습니다. 최초 16 MiB 제한 중단을 성공으로 세지 않았고 파일 크기 확인 후 해당 파일만 64 MiB 한도로 받아 일반 수집기의 제한은 유지했습니다. 전체 ZIP CRC·시트 XML을 수식 실행 없이 검사했고 스트림의 한글 분리 방지 보완 후에도 해시·날짜별 행 수·머리글이 원 결과와 일치했습니다.

## Evidence, storage and reuse / 검증·보존·이용 조건

- [Original audit](evidence/campaign-verification.json): **1,011 HTTP response hashes**, **26,040 normalized website rows** and **8,270 EX rows** checked against saved originals, separately from collector normalization. [Local inventory](evidence/local-originals-inventory.json) lists retained paths/bytes/hashes at audit time; later files are outside that inventory. / 수집 정규화 함수를 재사용하지 않고 원문·값·개수·해시를 직접 대조했으며 로컬 목록은 해당 검사 시점의 파일 범위입니다.
- [Timezone audit](evidence/ex-original-time-independent.json): all 8,270 EX times reverse-checked through `Intl.DateTimeFormat` for Asia/Seoul; minute precision retained. Unknown website observation time stays null; zero/null/invalid speed is no-speed, not road closure. / 시간대 라이브러리로 원 일자·분 시각 전체를 역검사하고 원시각 누락·속도 누락을 실제처럼 보충하지 않습니다.
- [12 collector tests](evidence/collector-tests.tap) and [4 repaired EX tests](evidence/ex-document-tests-repaired.tap) passed; all seven new TypeScript files strict-compiled. Failures and repaired checks are [preserved](evidence/checks.json). Existing `media:check` passed because runtime/media code was unchanged. No new whole-navigation acceptance or new recording is claimed. / 집중 16개·조사 파일 전체 엄격 빌드·기존 영상 지문을 확인했으며 전체 내비게이션 재수용 결과로 확대하지 않습니다.
- The exact [EX JSON](expressway/document.json) is published with its receipt and [attribution/terms](expressway/README.md). Large historical files, anonymous website HTML/JSON and incidental public CCTV metadata remain **local** because website/API reuse terms need separate review. No CCTV stream was downloaded. Source-site content is not relicensed under RouteLens's code license. / 도로공사 수치 JSON은 별도 출처·조건과 함께 게시하고 나머지 원문·큰 이력·CCTV 메타데이터는 로컬에 유지합니다. 영상은 받지 않았으며 코드 라이선스를 기관 자료에 덮어씌우지 않습니다.

Local root: `data/additional-public-sources-20261026/`; website originals/normalized files are under `campaign01/{topis,gyeonggi,utic,daegu}`. EX originals: `ex-browser-document.json`, `ex-normalized.json`; history: `seoul-speeds-202609.xlsx`. This is local storage, not a hosted feed. Source hashes and proof paths are in [provenance](evidence/provenance.json); published files have a [separate checksum manifest](evidence/published-checksums.json).

위 상대 경로는 이 저장소 체크아웃 기준 로컬 보존 위치입니다. Git에는 선별한 수치 자료·집계·근거만 넣으며 외부 상시 수집 서비스를 새로 운영하지 않습니다.

## Reproduce without a private key / 비공개 키 없이 재현

Run from the repository root with Node 22 and existing dependencies installed. Choose fresh output paths; these commands must not overwrite accepted evidence. Public websites can change or refuse requests. A repeated capture is a new dated observation, not byte-identical reproduction of the old traffic.

저장소 루트·Node 22·기존 의존성에서 실행합니다. 출력 경로를 새로 고르고 과거 근거를 덮어쓰지 않습니다. 웹사이트 변경·차단이 가능하며 다시 받은 교통은 새 관측입니다.

```sh
npx tsc research/public-road-speeds/2026-10-26-additional-sources/*.ts --outDir data/public-research-build --target ES2022 --module NodeNext --strict --noUncheckedIndexedAccess --skipLibCheck
node --test data/public-research-build/collector.test.js data/public-research-build/ex-document.test.js
node data/public-research-build/collector.js data/new-public-campaign
node data/public-research-build/ex-document.js research/public-road-speeds/2026-10-26-additional-sources/expressway/document.json research/public-road-speeds/2026-10-26-additional-sources/expressway/document.receipt.json data/new-ex-normalized.json
node data/public-research-build/inspect-history.js data/additional-public-sources-20261026/seoul-speeds-202609.xlsx data/new-history-inspection.json
```

The anonymous collector covers four websites; it does not automate the EX browser flow or historical download. The EX parser above reproduces the **published captured snapshot**. The history command needs the local original file. `inspect-campaign.js ROOT OUTPUT` and `inspect-duplicates.js ROOT OUTPUT` inspect a retained root with `campaign01`, EX originals/normalized and `seoul-history-verification.json` as described above; published derived reports alone are insufficient to rerun original-byte inspection. They were directly executed against the retained local originals. [Probe failures and acquisition bounds](evidence/probes.json).

익명 수집기는 네 웹사이트용이고 도로공사 브라우저·이력 다운로드 자동화까지 구현한 것은 아닙니다. 도로공사 파서는 게시한 당시 JSON을 재검사하며 이력 검사는 로컬 원본이 필요합니다. 전체 원문 감사는 위 구조의 실제 보존 루트에서 실행했고 집계만으로 원문 대조를 재현할 수 있다고 안내하지 않습니다.

## Next useful integration / 다음 연결 작업

Register Gyeonggi/EX/UTIC keys through the [official issuance steps](../../../docs/39-public-traffic-api-keys.md). First validate a timestamped approved numeric feed, then obtain compatible directed geometry and measure source-to-native mapping against the pinned graph. Resolve duplicate/disagreeing rows and source precedence before enabling new public authority. Require an actual native route/client test, independent inspection and refreshed evidence when runtime behavior changes. TOPIS/UTIC/Daegu website rows without original time stay excluded from live routing until a verifiable timestamped feed exists.

경기·도로공사·UTIC 정식 키를 발급받아 원시각 포함 수치와 승인 범위를 먼저 검증합니다. 호환 방향 지형·고정 엔진 지도 대응·출처 간 중복/우선순위를 확인한 뒤 실제 경로·화면 시험을 거쳐 반영합니다. 원 관측시각 없는 웹 응답을 조회시각으로 메워 실시간 경로에 적용하지 않습니다.
