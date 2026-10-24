# Standard JWS reuse / 표준 JWS 재사용

Checked2026-10-25 for P07. The official [jose6.2.13 README](https://github.com/panva/jose/blob/v6.2.13/README.md) documents ESM, no dependencies and Web-interoperable runtimes. [CompactSign](https://github.com/panva/jose/blob/v6.2.13/docs/jws/compact/sign/classes/CompactSign.md) signs supplied payload bytes; [compactVerify](https://github.com/panva/jose/blob/v6.2.13/docs/jws/compact/verify/functions/compactVerify.md) verifies the standard compact form. [importJWK](https://github.com/panva/jose/blob/v6.2.13/docs/key/import/functions/importJWK.md) imports keys with algorithm/usage handling. Registry lookup returned6.2.13 and package integrity `sha512-7TIg10ZE1x82YediN+lcrPNvGMKge9yFHQD+Qho/b8y2adfugU3AsvvHfxV0fzyFllT6l9xCjf4RWY9g/Z9PJQ==`; the implementation must lock the exact dependency.

P07을 위해 공식 문서에서 ESM·외부 의존성 없음·여러 실행 환경과 바이트 기반 표준JWS 생성/검증·JWK 가져오기를 확인했습니다. 레지스트리가 반환한 버전·무결성은 위 값이며 정확한 의존성을 잠급니다.

Decision: reuse this implementation, not custom crypto. RouteLens still has to validate namespace/publisher/graph permissions, time, exact artifact hash/length and durable sequence. The library does not establish those application guarantees. Public keys are provisioned locally; no dynamic key URL is trusted. See [P07 contract](../../docs/25-p07-publication-contract.md). Direct runtime and fault checks passed locally; see the [P07 report](../../research/pilot/2026-10-25-p07/report.md).

암호 구현은 재사용하되 시험영역·발급자·지도권한·시각·내용해시/크기·영속순번은 RouteLens의 책임입니다. 라이브러리만으로 해당 보장이 생기지 않습니다. 공개키는 로컬에 사전 설정하며 원격 키URL을 자동 신뢰하지 않습니다. 실제 실행·장애 검사는 로컬에서 통과했으며 P07 보고서에 원문 근거를 기록합니다.
