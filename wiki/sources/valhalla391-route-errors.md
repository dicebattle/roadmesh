# Valhalla3.9.1 route outcomes / Valhalla3.9.1 경로 결과

Accessed2026-10-25. Primary sources are the pinned upstream [error definitions](https://github.com/valhalla/valhalla/blob/3.9.1/src/exceptions.cc), [Loki route correlation](https://github.com/valhalla/valhalla/blob/3.9.1/src/loki/route_action.cc) and [current route API reference](https://valhalla.github.io/valhalla/api/route/api-reference/). The pinned source takes precedence over current documentation for this pilot.

2026-10-25 확인했습니다. 고정 버전의 오류 정의·위치 대응 코드와 현재 공식 문서가 출처이며, 이 파일럿에서는 현재 문서보다 고정 소스를 우선합니다.

Pinned code170 denotes disconnected location regions;171 denotes no suitable nearby edges;442 denotes no route found. These are HTTP400 outcomes, distinct from internal or service failure. Code441 concerns a matrix element and is not automatically a route outcome. Loki's correlation and connectivity checks show that source geometry components alone do not establish automotive routing failure.

고정 코드170은 위치 영역 단절,171은 적합한 주변 구간 부재,442는 경로 부재를 뜻하며 HTTP400으로 내부·서비스 장애와 구분됩니다.441은 행렬 원소 관련이므로 자동으로 일반 경로 결과에 포함하지 않습니다. 위치 대응과 연결 검사를 보면 지형의 끝점 연결만으로 자동차 경로 실패를 확정할 수 없습니다.

RouteLens currently collapses native non-200 to ENGINE_HTTP_ERROR, and its lower traffic adapter also enforces a hardcoded coordinate envelope before native requests. P12 needs an explicit domain-outcome contract, exact request/version binding, bounded error parsing and actual fixtures before changing public error behavior. Confidence is high for pinned definitions; an actual Seoul no-path input remains unverified. No production claim follows.

현재 RouteLens는 엔진의 비정상 응답을 일반 오류로 합치고, 하위 연결기에서 네이티브 호출 전에 고정 좌표 범위도 검사합니다. P12는 공개 오류를 바꾸기 전에 업무 결과 계약·요청/버전 연결·제한된 오류 해석·실제 시험 입력을 확정해야 합니다. 고정 정의는 확인했지만 실제 서울 경로 없음 입력은 아직 검증하지 못했으며 운영 근거가 아닙니다.
