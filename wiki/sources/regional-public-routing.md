# Timestamped regional source geometry / 원시각 지역 자료의 지형

Checked2026-10-26; original captured documents remain local with exact receipts. [Contract](../../docs/40-regional-public-routing.md) · [measured result](../../research/public-road-speeds/2026-10-26-regional-routing/report.md).

2026-10-26 기관 문서를 직접 확인하고 원문·해시를 로컬에 보존했습니다. 출처 확인과 경로 영향 측정·운영 승인·실측 정확도는 구분합니다.

| Official source / 공식 출처 | Verified use and confidence / 사용·확신 범위 |
| --- | --- |
| [Gyeonggi public website](https://gits.gg.go.kr/) | Service IDs, `PROC_DATE` epoch milliseconds, SPD and names/length. High confidence in captured bytes; website access is not an operated API approval. / 보존 수치·원시각 확인, 운영 승인과 구분. |
| [Official Gyeonggi map server](https://gitsmap.gg.go.kr/cgi-bin/mapserv.exe?map=/ms4w/mapserver/mapfile/ATTRLV10.map&SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities) | Advertised `ATTRLV10` WFS/WMS layers;4510 selected features, paired23 reviewed curves. Payload EPSG5181 label conflicts with degree coordinates; scoped ordered WMS/WFS agreement and source-length checks are required. High confidence in the captured contradiction, no nationwide CRS claim. / 공식 두 응답·좌표 표기 모순·한정 호환을 확인. |
| [EX VDS installations0404](https://data.ex.co.kr/openapi/basicinfo/openApiInfoM?apiId=0404) | Exact VDS, route/direction, conzone, mainline flags, GRS80 coordinates and zone chainage.8458 unique installation rows in86 pages;5831 pass mainline structure filtering. S direction zone endpoints decrease. / 설치 전체와 본선·담당 이정을 검토. |
| [EX dataset metadata](https://www.data.go.kr/data/15076691/openapi.do) | Official installation-dataset context and reuse metadata. GRS80 is an ellipsoid, not a complete projection declaration. The reviewed local projection requires independent road corroboration for each accepted point. / 타원체 명칭만으로 EPSG를 주장하지 않고 점별 곡선 대조. |
| [EX actual traffic0405](https://data.ex.co.kr/openapi/basicinfo/openApiInfoM?apiId=0405&pn=-1) | `stdDate/stdHour` source minute, VDS speed/route/direction/conzone. Public default example document, not a private production key or wire capture. First run8270 rows, final8252 rows; do not invent completeness from a fixed old count. / 공개 예제 문서·원 분시각·변하는 행 수를 유지. |
| [Valhalla date/time contract](https://valhalla.github.io/valhalla/api/route/api-reference/) | Fixed departure for same-request comparisons. The pinned local graph has no timezone DB, so a current native probe explicitly confirms its UTC clock. Actual observation expiry still uses UTC wall time. / 고정 출발 비교·현재 엔진 UTC 확인·실제 원시각 만료. |

EX point-supported influence was accepted on only two native edges after same-route/direction neighbours, official curves, containing native geometry and declared zone checks. These are scoped engineering matches, not independently surveyed detector locations or evidence that point speed represents a whole corridor. Gyeonggi paired curves share one agency, so agreement is cross-interface consistency rather than an independent geographic survey. Do not relax12m whole-edge geometry/20degree direction or repair disputed source lengths just to increase coverage.

도로공사는 두 구간만 포함 점·방향·이정·공식 곡선을 대조했습니다. 측량 검증·도로 전체 대표성은 아닙니다. 경기 두 응답도 같은 기관이므로 독립 실측이 아닌 인터페이스 정합성이며 적용률을 높이려고 기준·원 길이를 바꾸지 않습니다.
