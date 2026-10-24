# P08 upstream reconnaissance / P08 상위 프로젝트 사전 조사

Read2026-10-25 while P07 hosted execution was running. This is source inspection only; no P08 implementation or live-engine result is claimed.

P07 원격 실행 중인2026-10-25에 읽었습니다. 소스 조사만 했으며 P08 구현·실제 엔진 결과를 주장하지 않습니다.

The pinned Valhalla3.9.1 [traffic structure](https://github.com/valhalla/valhalla/blob/3.9.1/valhalla/baldr/traffictile.h) has static size assertions for a32-byte header and8-byte speed record. Its nearby24-byte/2-byte prose is inconsistent with those assertions. Seven-bit speed values have2km/h resolution; the reserved raw127 means unknown. Zero with a nonzero breakpoint means closure. A valid positive P07 speed must not accidentally quantize to closure. Verify actual ABI/endianness against the pinned image before fixing a TypeScript encoder contract.

고정 버전의 정적 크기 검사는 헤더32바이트·속도8바이트인데 인접 설명은24/2바이트로 달라 코드와 실제 바이너리를 기준으로 해야 합니다. 속도는2km/h 간격의7비트이고127은 미확인, 유효한 경계와0속도는 폐쇄입니다. 양수 P07속도를 변환하다 폐쇄로 만들면 안 되며 TypeScript 인코더 계약 전에 실제 이미지의 배치·바이트 순서를 검증해야 합니다.

The upstream [BasicUpdates test](https://github.com/valhalla/valhalla/blob/3.9.1/test/gurka/test_traffic.cc) uses `mjolnir.traffic_extract` and current-time routing to exercise changed speeds, a directed closure, cost changes and reverse-direction behavior; missing current-time input does not use those live updates. Its small authored map is upstream behavior evidence only. RouteLens must prove legal baseline/alternative paths and expiry rollback on its actual Seoul graph, using P07 accepted bytes and independent predeclared expectations.

상위 검사는 교통정보 파일·현재시각 요청으로 속도 변경·방향별 폐쇄·비용 변화·반대 방향을 검사하고 현재시각이 없는 요청에서는 같은 실시간 갱신을 사용하지 않습니다. 상위의 작은 가상 지도는 상위 동작 근거일 뿐입니다. RouteLens는 P07수용 바이트와 사전에 정한 독립 기대값으로 실제 서울 그래프의 합법 기본/대안 경로·만료 복구를 증명해야 합니다.

[Installed-image probe](../../research/pilot/2026-10-25-p08-preparation/README.md): the actual pilot image has the upstream traffic skeleton tool and header but no compiler. Actual C++ layout execution remains unverified. / 실제파일럿이미지에 상위생성도구·헤더가있지만컴파일러가없어 실제구조실행검증은미확인입니다.
