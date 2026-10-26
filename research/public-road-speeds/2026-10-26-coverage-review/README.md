# Actual feed and metropolitan coverage / 실제 자료와 수도권 적용 범위

Review date:2026-10-26 KST. Read source9247efc and recounted the preserved actual public batch from2026-10-26 01:27:18 KST. No new live numeric call, new provider, code change or metropolitan acquisition was performed. The previous local runtime was stopped after acceptance; no continuously hosted collector is claimed. [Machine-readable recount](snapshot-recount.json) · [accepted source report and reconstructable originals](../../pilot/2026-10-26-public-speeds/report.md).

2026-10-26 기준 브랜치 소스와 같은 날01:27:18에 보존한 실제 응답을 다시 집계했습니다. 새 실시간 조회·제공자 추가·코드 변경·수도권 광역 수집은 하지 않았습니다. 이전 수용 후 로컬 실행을 종료했으며 상시 운영 수집기가 있다고 주장하지 않습니다.

## What is actually connected / 실제 연결한 자료

| Data / 자료 | Purpose and implementation / 용도·구현 |
| --- | --- |
| [MOLIT ITS traffic](https://www.data.go.kr/data/15040463/openapi.do) | The single implemented actual numeric provider: directed link/start/end IDs, road name, average speed, travel time and original Korean collection time. The operator supplies a private key.120s polling and original-time600s expiry are RouteLens policies, not an agency update guarantee. / 실제 속도 제공자는 국토교통부 ITS 하나이며 방향 구간·도로명·속도·통행시간·원 관측 시각을 수집합니다.120초/600초는 프로젝트 정책입니다. |
| Official national node/link files and ITS WMS geometry | Static geometry/identity matching, not another speed source. Downloaded2025/2026 files differ from numeric junction IDs; the actual accepted mapping uses bounded agreement of advertised T_COB_MOCT_LINK_M and N_LEVEL_15. / 속도 추가 출처가 아닌 정적 지형·식별자 대응입니다. 수치 노드와 맞는 공식 두 지도 레이어를 대조합니다. |
| Seoul OpenStreetMap / 서울 OSM | Native route network and map presentation; it does not supply current congestion. / 경로 계산용 도로망·지도이며 현재 정체 자료가 아닙니다. |
| [Seoul TOPIS](https://data.seoul.go.kr/dataList/OA-13291/A/1/datasetView.do), [Gyeonggi](https://openapigits.gg.go.kr/api/jsp/manual_getRoadLinkTrafficInfoList.jsp), expressways, UTIC | Investigated candidates only. Seoul numeric HTTPS access timed out during prior investigation; Gyeonggi/expressway/UTIC numeric access and ingestion were not verified or implemented. Official catalog availability is not successful collection. / 조사한 추가 후보입니다. 서울 API는 기존 조사에서 시간 초과였고 경기·도로공사·UTIC 수치의 실제 접근/수집 연결은 미구현입니다. |

The official ITS portal declares nationwide scope and describes highway/national-road speeds. Our saved response also contains urban arterials. Neither statement proves complete metropolitan coverage. The current Seoul catalog still advertises per-link speed/travel time; Gyeonggi's official API describes road/direction/link/time/speed/travel-time fields, but these are not additional connected providers. [Source inventory and access evidence](../../../wiki/sources/public-road-speeds.md).

ITS 공식 범위는 전국·고속도로/국도 중심이고 실제 응답에는 도시 간선도 포함됐습니다. 어느 쪽도 수도권 전체 빠짐없는 제공을 보장하지 않습니다. 서울·경기 공식 명세가 존재해도 현재 연결된 추가 제공자로 세지 않습니다.

## Raw acquisition is broader than routing acceptance / 수집 범위와 경로 적용의 차이

The preserved request bounds were longitude126.98–127.10, latitude37.46–37.56. It returned4,064 distinct link IDs; all were valid positive observations at retrieval under the current policy. There were530 distinct road-name strings, not530 complete roads. These observations are now historical, not currently valid speeds. The following counts are returned directed link IDs under that one request; they are not kilometres or whole-corridor completion percentages.

요청 범위는 경도126.98~127.10·위도37.46~37.56이며 고유 링크4064개가 조회 당시 유효 양수였습니다. 도로명 문자열530종을 도로530개의 전 구간으로 해석하지 않습니다. 현재는 과거 관측이며 다음 숫자는 한 요청의 방향 구간 개수로, 거리나 해당 도로 전체 적용률이 아닙니다.

| Returned road name / 응답 도로명 | Distinct directed links / 방향 구간 |
| --- | ---: |
| 강변북로 |136|
| 올림픽대로 |120|
| 남부순환로 |99|
| 양재대로 |92|
| 강남대로 |71|
| 경부고속도로 |52|
| 동부간선도로 |51|
| 테헤란로 |44|

Only11 provider links were accepted into31 native test-catalog edges, all on Teheran-ro. The catalog has79 edges across three selected corridors: Teheran37(31mapped), downtown24(0mapped), Mapo Bridge18(0mapped). Thus39.24% is only a selected catalog's edge-count fraction. Downtown and Mapo trial corridors lie outside the chosen numeric request bounds; their zero mapping does not establish absent provider coverage. Unmapped edges can result from chosen scope, unsupported geometry or conservative mapping rejection, not only missing speed.

실제 엔진에 연결한 기관11링크·엔진31구간은 전부 테헤란로입니다. 시험 목록은 테헤란37개 중31개, 도심24개/마포대교18개 중0개로 총79개입니다.39.24%도 이 시험 목록의 구간 수 비율일 뿐입니다. 도심/마포 시험 구간은 수치 요청 범위 밖이므로0을 제공자 미제공으로 판단하면 안 됩니다. 범위·지원 지형·대응 거부도 원인입니다.

The demonstrated2,119m route used1,784m public-speed-covered returned partial lengths out of2,116m native rounded partial lengths:84.31%. This is the particular route's distance-weighted ratio, not Seoul/metropolitan coverage and not a speed/ETA accuracy score. [Independent actual-route audit](../../pilot/2026-10-26-public-speeds/audits/public-final-actual-verification.json).

2119m 시연 경로의 엔진 반올림 부분 길이2116m 중1784m가 적용되어84.31%였습니다. 해당 경로의 거리 비율이며 서울/수도권 적용률이나 속도/도착시간 정확도가 아닙니다.

## Metropolitan answer and next measurement / 수도권 답변과 다음 측정

**There is no measured metropolitan arterial coverage percentage yet.** We have not built a complete directed arterial denominator for Seoul/Incheon/Gyeonggi, acquired that whole area repeatedly, or audited its routing mappings. Expressways/national roads are the officially declared first-source scope; returned Seoul urban arterial values demonstrate additional availability locally. Availability in all of Gyeonggi/Incheon and complete named highway/urban-expressway corridors remains unmeasured. Do not infer80–90% or universal coverage from a source advertised as nationwide.

**수도권 간선망 전체 적용률은 아직 측정하지 않았습니다.** 서울·인천·경기의 전체 방향별 간선도로 분모·반복 광역 수집·엔진 대응 검사가 없습니다. 고속도로/국도가 공식 첫 출처 범위이고 서울 도시 간선의 일부 실값을 확인했으나 경기·인천 전체나 각 도로 전 구간을 검증하지 않았습니다. 전국 제공이라는 설명을80~90% 또는 전 구간 적용으로 바꾸지 않습니다.

Prioritize a coverage audit before multiplying providers: define Seoul/Incheon/Gyeonggi boundaries and directional highway/urban-expressway/national/main-arterial denominator including ramps; separately inventory bounded regional numeric acquisition, fresh valid observed link length, verified mapped length and usable route length. Expand graph/catalog/mapping beyond the current pilot limits before claiming regional navigation. Repeat weekday morning/evening and off-peak observations, publishing per-corridor/direction missing/stale/unmatched reasons. Add TOPIS/Gyeonggi/expressway adapters only where the measured gaps justify them, respecting keys, quotas, terms and possible upstream overlap. These are next steps, not implemented results.

다음은 제공자 수 늘리기 전에 수도권 범위와 램프 포함 방향별 간선 분모를 정하고, 제한 분할 수집→유효 원 관측 길이→검증된 엔진 대응 길이→실제 경로 적용 길이를 나눠 측정하는 일입니다. 현재 시험 입력/대응 한도를 광역 지원으로 간주하지 않고 확장 후 검증합니다. 평일 출퇴근/비혼잡 반복에서 도로·방향별 누락/오래됨/대응 실패를 공개하고 실제 빈 곳에 TOPIS·경기·도로공사를 추가합니다. 기관 간 같은 원자료의 중복도 구분합니다. 이는 후속 계획입니다.
