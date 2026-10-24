# Pilot client upstream choices / 파일럿 클라이언트 상위 선택

Accessed2026-10-25. Official documentation and live npm package metadata were read before design. /2026-10-25에 공식 문서와 npm 공개 메타데이터를 확인했습니다.

| Component / 구성 | Pinned choice / 고정 선택 | Reason / 이유 |
| --- | --- | --- |
| MapLibre GL JS |6.15.0, BSD-3-Clause; Node>=16.14 | Reuse map interaction and GeoJSON sources instead of building a map renderer / 지도 조작·GeoJSON을 재사용 |
| esbuild |0.28.2, MIT; Node>=18 | Bundle a small TypeScript browser client and local map worker / 작은 TypeScript 화면·로컬 지도 작업자 묶음 |
| Playwright |1.64.1, Apache-2.0; Node>=20 | Actual automated browser regression in the whole runner and CI / 전체 실행기·CI의 실제 브라우저 회귀 |

[MapLibre introduction](https://maplibre.org/maplibre-gl-js/docs/), [GeoJSON line example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-geojson-line/), [esbuild setup](https://esbuild.github.io/getting-started/). Official examples may use remote demo tiles; P11 instead uses verified same-origin Seoul GeoJSON, locally bundled assets and attribution. No external tile service or API key is implied. Version metadata is a dated observation, not a promise about future latest releases.

공식 예제에 외부 타일이 있어도 P11은 같은 출처의 검증된 서울 GeoJSON과 로컬 묶음·출처 표시를 사용합니다. 외부 타일 서비스나 API 키를 요구하지 않습니다. 버전 정보는 확인한 날짜의 관찰이며 앞으로의 최신 버전 보장이 아닙니다.
