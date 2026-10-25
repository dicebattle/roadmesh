# Valhalla native guidance / Valhalla 엔진 안내

Accessed 2026-10-25; primary pinned 3.9.1 source, high confidence for wire behavior, not road accuracy. / 2026-10-25 접근·고정 버전 공식 소스·전송 동작 근거이며 도로 정확도 근거는 아닙니다.

- [Directions enum](https://github.com/valhalla/valhalla/blob/3.9.1/proto/descriptors/directions.proto): numeric maneuver types and path indexes. / 안내 숫자 종류·경로 인덱스.
- [Native serializer](https://github.com/valhalla/valhalla/blob/3.9.1/src/tyr/route_serializer_valhalla.cc): trip locale/units, per-maneuver instruction/time/length/shape indexes; 0.001 km and 0.001 s rounding. / 구간 언어·단위·안내·시간·거리·지형 인덱스와 반올림.
- [Korean locale](https://github.com/valhalla/valhalla/blob/3.9.1/locales/ko-KR.json): reuse upstream Korean instructions. Some upstream phrases remain English; do not promise complete translation or invent replacements. / 상위 한국어 안내 재사용·일부 영어 문장은 남아 있으므로 완전 번역을 주장하거나 임의 번역하지 않습니다.

Decision: [ADR-031](../../docs/09-decisions.md), [contract36](../../docs/36-nav01-turn-guidance.md). Actual direct native evidence remains required; reading source is not runtime proof. / 결정은 연결 문서에 기록하며 소스 조회와 실제 실행 검증을 구분합니다.
