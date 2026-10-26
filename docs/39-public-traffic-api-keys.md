# Traffic API keys and current public access / 교통 API 키 발급과 현재 공개 접근

Checked 2026-10-26 KST. The user requested public data first and issuance instructions, not application submission. No new key, account, terms acceptance, email or IP registration was performed. [Actual acquisition and limitations](../research/public-road-speeds/2026-10-26-additional-sources/README.md).

2026-10-26 실제 화면·공식 명세를 확인했습니다. 공개 자료부터 수집하고 발급 방법만 설명하는 요청이며 계정 생성·약관 동의·이메일 전송·신청/IP 등록은 수행하지 않았습니다.

## Gyeonggi Traffic Information Center / 경기도 교통정보센터

1. Open the official [public-key application](https://openapigits.gg.go.kr/api/jsp/apiKey_requestInfo.jsp).
2. Review its terms and choose the appropriate applicant type: personal user or CP information provider. For an openly distributed navigation service, describe actual service/cache/redistribution use rather than presenting it as personal-only use. Fill only the fields required by the official form and retain the issued provider key.
3. Validate the key against the documented [road list](https://openapigits.gg.go.kr/api/jsp/manual_getRoadInfoList.jsp) and [all-road traffic](https://openapigits.gg.go.kr/api/jsp/manual_getRoadTrafficInfoList.jsp). Requests use `serviceKey`; per-road requests also use the agency's `routeId`.
4. Confirm permitted cache/redistribution and production request limits with the issued service conditions. The site key is separate from a general data.go.kr service key. Issuance timing was not tested.

공식 공개키 신청에서 약관을 읽고 개인사용자/CP 정보제공자 중 실제 용도에 맞는 유형을 고릅니다. 오픈소스 내비게이션의 서비스·캐시·자료 재배포 목적을 실제대로 설명하고 요구된 신청정보를 작성합니다. 발급된 기관 전용 키는 도로 목록·전체 소통 조회로 검증하며 공공데이터포털 공통 키와 혼동하지 않습니다. 발급 소요시간은 확인하지 않았고 운영 호출량·캐시/재배포 조건은 승인 조건으로 확인합니다.

Current public capture: the ordinary website's 122 listed routes yielded 2,744 service-link records with `PROC_DATE`. This is research acquisition through the website, not proof of a registered OpenAPI key or a production SLA.

현재 공개 화면의122노선에서 원 처리시각 포함2744개를 확보했지만 정식 OpenAPI 승인·운영 신뢰성을 의미하지는 않습니다.

## Korea Expressway Corporation / 한국도로공사

1. Open [authentication-key issuance](https://data.ex.co.kr/openapi/apikey/requestKey).
2. The currently visible form asks for email, birth year, gender, job, region and education. Enter these directly on the official site. The page says issuance is sent immediately to the specified email; no submission was performed to verify delivery timing.
3. In [OpenAPI list](https://data.ex.co.kr/openapi/intro/introduce02), select **실시간 소통 데이터** (`apiId=0405`). The current [service description](https://data.ex.co.kr/openapi/basicinfo/openApiInfoM?apiId=0405&pn=-1) declares HTTPS GET `https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime`, parameters `key` and `type=json`/`xml`.
4. Use your issued key for operated collection. Do not assume a data.go.kr key is the same credential.

공식 인증키 발급 화면에 이메일·출생년도·성별·직업·지역·학력을 직접 입력합니다. 페이지는 즉시 이메일 발송을 안내하지만 실제 발급/도착 시간은 시험하지 않았습니다. API 목록의 실시간 소통 데이터0405를 골라 기관 전용 `key`와 응답 형식을 사용합니다. 공공데이터포털 키로 대체하지 않습니다.

The official example modal actually initializes `key=test`. We used that unchanged public default in the ordinary in-app browser and saved the full 8,270-record JSON document. This is **public demo access**, not possession of a private production key or guaranteed ongoing permission/quota. Command-line HTTPS requests returned 400/Request Blocked in this environment while the ordinary browser succeeded. Issuing a key alone is not proof that this transport issue is solved. The collector for the other sites does not silently use browser cookies or this demo key.

공식 예제의 초기값 `test`를 바꾸지 않고 내장 브라우저에서8270개 전체 JSON을 확보했습니다. 개인 운영키·지속 이용/한도 보장은 아니며 운영 수집은 별도 발급키를 사용해야 합니다. 같은 환경의 CLI는400 차단, 일반 브라우저는 성공했으므로 발급만으로 전송 문제가 해결됐다고 보지 않습니다. 다른 사이트 수집기는 브라우저 쿠키·시험키를 몰래 재사용하지 않습니다.

## UTIC / 도시교통정보센터

1. Read the [traffic-data reference](https://www.utic.go.kr/guide/utisRefTraffic.do), then open [data application](https://www.utic.go.kr/guide/newUtisDataWrite.do).
2. Select your applicant category and enter affiliation, email, **requesting public IP**, purpose and requested data. Choose **소통정보 데이터** for speed acquisition; CCTV is a separate choice and is not required for this task.
3. Use the operated collector's actual public egress IP. An address that changes requires the provider's IP-update procedure. Browser/mobile clients should not expose the private issued key.
4. Review purpose restrictions and attribution. The page states one-year effectiveness with annual extension absent another indication. Retain the approved URL/key/IP scope; the public reference describes a map-based service and does not prove that an unrestricted bulk numeric API will be supplied.

공식 소통 자료 설명을 읽고 개방데이터 신청에서 소속 유형·소속·이메일·신청 공인IP·목적·신청자료를 작성합니다. 속도용은 소통정보를 선택하며 CCTV 신청은 필요하지 않습니다. 실제 수집 서버의 출발 공인IP를 등록하고 주소가 바뀌면 변경 절차를 따릅니다. 목적 외 이용 제한·출처 표기·1년 효력/연장 조건을 확인하고 승인된 URL/키/IP 범위를 유지합니다. 지도 기반 제공이라는 안내를 무제한 수치 API 보장으로 해석하지 않습니다.

Current public capture: all 66 listed highway detail pages plus a Teheran-ro example produced 1,781 link records. The 2,525-name nationwide urban-road list was also downloaded, but its complete numeric details were not acquired; selected urban detail responses were empty and regional-list probes returned 500. No original observation timestamp was exposed in the acquired numeric page rows, so retrieval time was not substituted as observation time.

공개 고속도로66개 상세와 테헤란로 예시에서1781개를 확보했습니다. 전국 주요도로 명칭2525개 목록도 보존했지만 전체 수치 상세까지 확보한 것은 아닙니다. 일부 도시 상세는 비어 있고 지역 목록은500이었으며 수치 행에 원 관측시각이 없어 조회시각으로 대체하지 않았습니다.

## Seoul TOPIS / 서울 TOPIS

Use the ordinary **general** Seoul Open Data key, not the separately issued realtime subway key. [Official FAQ](https://data.seoul.go.kr/together/notice/faqList.do) describes Seoul account login → [key management/application](https://data.seoul.go.kr/together/mypage/actkeyMain.do) → general key issuance → the [road traffic dataset](https://data.seoul.go.kr/dataList/OA-13291/A/1/datasetView.do). Existing local configuration contained a general Seoul key, but no new key was issued or used for this anonymous capture. Earlier HTTPS API attempts timed out; successful website reads do not prove that API transport or service authorization works. Keep credentials on a verified HTTPS server path and never copy a credential-bearing request URL into Git or chat.

지하철 실시간 전용키와 구분한 서울 열린데이터광장 일반 인증키를 사용합니다. 서울시 계정 로그인→인증키 관리/신청→일반키 발급→도로 소통 서비스 명세 확인 순서입니다. 기존 로컬에 일반키 설정은 있었으나 이번 익명 수집에 사용하거나 새로 발급하지 않았습니다. 이전 API의 HTTPS 시간 초과와 현재 웹 수집 성공은 별개이며 검증된 HTTPS 서버 경로에만 키를 전달하고 키 포함 URL을 기록하지 않습니다.

Current website rows include 6,082 distinct link IDs but no original observation time; 21,170 returned rows overlap across road axes. Therefore the current navigation runtime still uses only the previously accepted ITS source. The returned-row count is 21,170, not 21,170 distinct roads; axis direction is not universally interchangeable with directed-link identity.

현재 웹 행에는 고유 링크6082개가 있으나 원 관측시각이 없고 도로 축 간 중복된 응답21170행을 도로21170개로 세지 않습니다. 축 기준 방향과 링크 방향도 그대로 같다고 볼 수 없습니다. 현재 내비게이션 실행의 수용 출처는 기존 ITS만 유지합니다.

## Daegu and key storage / 대구와 키 보관

Daegu's [official dataset](https://www.data.go.kr/data/15126266/openapi.do) uses data.go.kr application/service-key approval, independently of a merely configured shared key. The inspected catalog lists development automatic approval, production reviewed approval and 5,000 development requests. Verify service approval and a supported HTTPS endpoint before using credentials; the catalog's underlying operation URL was HTTP. This task instead acquired 42 public website road groups/345 detail records without a private key.

대구 정식 자료는 공공데이터포털 활용신청·서비스 승인 여부를 확인해야 하며 공통 키 설정만으로 해당 서비스 권한을 입증하지 않습니다. 현재 명세는 개발 자동·운영 심의·개발5000회를 안내합니다. 원 명세가 HTTP URL을 적고 있어 키 전달 전에 지원 HTTPS 주소를 확인해야 합니다. 이번에는 키 없이 공개 웹42개 도로/345개 상세를 확보했습니다.

Suggested private environment names for future registered adapters are `ROUTELENS_GITS_API_KEY`, `ROUTELENS_EX_API_KEY`, `ROUTELENS_UTIC_API_KEY` and `ROUTELENS_SEOUL_OPEN_DATA_KEY`. **These names are storage recommendations, not implemented configuration switches in this anonymous research collector.** The existing ITS runtime consumes `ROUTELENS_ITS_API_KEY`. Store secrets in a local ignored `.env` or an operator secret store; do not put them in README, commit messages, chat or browser frontend code. Preserve the open-source license separately from each dataset's terms; a key does not grant blanket raw-data redistribution rights.

향후 정식 연결기용 비공개 환경변수 이름을 위처럼 권장하지만 이번 익명 조사 수집기가 이미 이 설정을 읽는다는 뜻은 아닙니다. 기존 ITS 실행은 `ROUTELENS_ITS_API_KEY`를 사용합니다. 키는 Git에서 제외된 로컬.env 또는 비밀 저장소에 보관하고 기록물·대화·프런트엔드에는 넣지 않습니다. 코드와 자료의 이용 조건은 별개이며 키 발급을 원 자료 전체 재배포 허가로 보지 않습니다.
