# Route coverage length semantics / 경로 적용률의 길이 의미

Accessed2026-10-25. Primary sources, high confidence for the pinned3.9.1 implementation; this is not real-driving validation.

2026-10-25 확인. 고정3.9.1 구현의 일차 출처를 확인했으며 실주행 검증은 아닙니다.

- [Official API reference](https://valhalla.github.io/valhalla/api/map-matching/api-reference/): trace edge length is the matched portion, including a partial first/last edge. / trace 구간 길이는 첫·마지막 부분 구간을 포함한 실제 대응 부분의 길이입니다.
- [Pinned trip builder](https://github.com/valhalla/valhalla/blob/3.9.1/src/thor/triplegbuilder.cc#L2036): edge length is scaled by the difference between end/start trim fractions before conversion to kilometres. / 시작·끝 비율 차이를 곱한 길이를 킬로미터로 저장합니다.
- [Pinned serializer](https://github.com/valhalla/valhalla/blob/3.9.1/src/tyr/trace_serializer.cc#L253): outputs that length and partial-edge fractions separately. / 그 길이와 부분 구간 비율을 별도로 출력합니다.

P10 therefore sums the returned matched lengths in route order, including repeated edges, and intersects them with the verified generation's live edge IDs. Do not multiply by partial-edge fractions again. Preserve units and explain serialization-rounding tolerance when checking the sum against route distance. A snapshot containing live edges elsewhere does not make this route LIVE_MIXED: the actual traversed live length must be positive. The existing long detour and a separately authored interior35%→65% request test zero and positive coverage respectively. Coordinates must be fixed from the source graph before route execution.

P10은 경로 순서대로 대응 길이를 합산하며 반복 구간도 포함하고, 검증된 세대의 유효 교통 구간과 교집합을 구합니다. 부분 비율을 다시 곱하지 않습니다. 단위를 유지하고 경로 거리와 합계를 비교할 때 직렬화 반올림 오차를 설명합니다. 다른 곳에 유효 교통 구간이 있어도 현재 경로의 적용 길이가 양수가 아니면 LIVE_MIXED로 표시하지 않습니다. 기존 장거리 우회와 별도 내부35%~65% 요청으로0/양수 적용률을 검사하며 입력 좌표는 실행 전에 원그래프에서 고정합니다.
