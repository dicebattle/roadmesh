# Expressway numeric snapshot / 도로공사 수치 스냅샷

Provider: **Korea Expressway Corporation / 한국도로공사**. Dataset: **실시간 소통 데이터**, official API `0405`. Source [service description](https://data.ex.co.kr/openapi/basicinfo/openApiInfoM?apiId=0405&pn=-1) and [public-data catalog](https://www.data.go.kr/data/15076684/openapi.do), checked 2026-10-26. The catalog states unrestricted reuse for this numeric dataset. Attribution is retained here; RouteLens's code license does not relicense the agency's data or imply rights to every website asset.

한국도로공사 공식 0405 실시간 소통 수치 자료입니다. 2026-10-26 확인한 공공데이터포털의 해당 수치 자료는 이용허락 제한 없음을 안내하며 출처를 위와 같이 유지합니다. RouteLens 코드 라이선스를 기관 자료에 새로 적용하거나 전체 웹사이트 자산의 이용 허가로 확대하지 않습니다.

- [Complete saved JSON document](document.json): 2,231,871 UTF8 bytes, 8,270 VDS rows, original minute **2026-10-26 12:17 KST**. SHA256 `82d2db703fd5bf46d0ba8c6893bf752afd203b24406cb5eed8d7dec7645c5857`. / 전체 JSON·검지기 8,270행·원 관측 분 시각 보존.
- [Receipt](document.receipt.json): retrieved **12:21 KST** through ordinary in-app browser document text. This is not an HTTP wire capture; the first truncated bridge read was corrected by reading the complete static document in chunks. / 내장 브라우저 문서 텍스트이며 처음 도구 전달 잘림 뒤 전체 문서를 조각으로 읽었습니다.
- Access used the official example's unchanged **public `test` default**. It is not a user secret or production credential. No new key was requested; no quota or continuous collection is guaranteed. CLI HTTP400 remains a separate transport limitation. [Key issuance](../../../../docs/39-public-traffic-api-keys.md). / 공식 공개 시험값을 사용했으며 비밀키·운영키·상시 한도 보장이 아닙니다. CLI 차단과 정식 발급 절차는 별개입니다.

The snapshot is now historical. Positive values, negative/zero sentinels, VDS and conzone IDs are preserved as received. Do not treat no-speed as a closure or all 8,270 rows as distinct road segments. The [parser](../ex-document.ts) produces explicit PUBLIC_AGENCY/demo/time labels and never grants routing eligibility. [Independent original audit](../evidence/campaign-verification.json).

이 파일은 당시 관측 스냅샷입니다. 원 양수·음수/0 표식·검지기·콘존 식별자를 보존하며 누락을 통제로, 전체 행을 고유 도로 구간으로 해석하지 않습니다. 파서는 공공 출처·공개 시험 접근·원시각을 구분하고 경로 적용을 승인하지 않습니다.
