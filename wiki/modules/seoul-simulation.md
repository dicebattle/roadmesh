# Seoul road simulation / 서울 도로 시뮬레이션

The primary simulation now uses real Seoul OSM roads. Main fixed the design and acceptance criteria; Sol implemented the TypeScript modules. [Design](../../docs/21-seoul-road-simulation.md) · [Inspected evidence](../../research/seoul/2026-10-24/report.md) · [Source and license](../sources/seoul-osm.md).

주요 시뮬레이션은 실제 서울 OSM 도로를 사용합니다. 메인이 설계·수용 기준을 정하고 Sol이 TypeScript 모듈을 구현했습니다. 위 링크에서 설계·직접 확인한 증거·출처와 라이선스를 확인할 수 있습니다.

## Run / 실행

Use Node.js 22 or 24, npm, curl and Docker. After `npm ci` and `npm run build`:

Node.js 22 또는 24, npm, curl, Docker를 준비하고 `npm ci`, `npm run build` 후 실행합니다.

```sh
npm run simulation:check -- --output data/seoul-example
npm run report:serve -- data/seoul-example
```

The runner first executes the complete tiny-city regression, then verifies the pinned source, builds a fresh regional graph and runs three routes with clean/noisy/gapped vehicles. It performs actual full/split/overlap Valhalla calls. Matching receives observations only; truth is used afterward for evaluation. The source cache avoids repeated downloads, never graph construction. Add `--source /path/to/south-korea-261023.osm.pbf` for already downloaded, hash-identical bytes. A missing/changed source fails the run. Use a new output directory each time.

실행기는 tiny-city 전체 회귀를 먼저 수행하고 고정 원본을 검사한 뒤 지역 그래프를 새로 만들고 세 경로의 정상·잡음·누락 차량을 실행합니다. 전체·분할·중첩 Valhalla 호출도 실제로 수행합니다. 매칭에는 관측만 제공하고 정답은 나중에 평가에 사용합니다. 캐시는 원본 다운로드만 줄이며 그래프는 매번 생성합니다. 이미 받은 동일 해시 원본은 `--source /path/to/south-korea-261023.osm.pbf`로 지정합니다. 원본 누락·변경은 실패이며 매번 새 출력 폴더를 사용합니다.

## Components / 구성

| Module / 모듈 | Responsibility / 책임 |
| --- | --- |
| `seoul_graph.ts`, `seoul_bundle.ts` | Source hash/size, Osmium extraction, Valhalla build, route/trace/locate evidence, portable validation / 원본 해시·크기, 지역 추출·그래프 생성·경로와 구간 근거·이동 가능한 검증 |
| `geodesy.ts` | Full curved polyline interpolation, metre noise and projection / 곡선을 유지한 보간·미터 단위 잡음·투영 |
| `seoul_simulation.ts` | Nine vehicles and actual observed-only matching, fixed evaluation / 차량 9대·관측만 사용하는 실제 매칭·고정 기준 평가 |
| `seoul_checks.ts` | Tiny regression plus Seoul execution, ownership/cleanup, report provenance / 작은 회귀와 서울 통합·소유 자원 정리·보고서 출처 |
| `simulation_report.ts` | Offline real-road replay, route selection, bilingual attribution/exclusions / 외부 연결 없는 실제 도로 재생·경로 선택·한영 출처와 제외 사유 |

`seoul-observed-v2` withholds timing when a sustained observed uncertainty cluster at a shared endpoint prevents assigning a stop to a road. Original estimates and the actual sample/distance/time evidence remain available. It does not repair estimates from truth or weaken error thresholds. Tiny-city keeps its original numeric behavior.

`seoul-observed-v2`는 공유 끝점의 지속된 관측 불확실성 때문에 정지를 특정 도로에 배정할 수 없으면 시간을 제외합니다. 원래 추정값·실제 표본·거리·시간 근거를 보존합니다. 정답으로 추정값을 보정하거나 허용 오차를 완화하지 않으며 tiny-city의 기존 수치 동작은 유지합니다.

Roads use ODbL; vehicle observations are synthetic. Three selected corridors do not simulate every vehicle or every road in Seoul. Fresh graph tile bytes and graph-scoped identifiers can differ across builds; matching parity is asserted within one verified graph. Independent real-driving accuracy, traffic updates, P05–P14 completion and reviewed geographic 100/100 remain separate work.

도로 자료는 ODbL이며 차량 관측은 합성입니다. 선택한 세 구간의 검증은 서울 모든 도로·차량의 시뮬레이션이 아닙니다. 새 그래프 타일 바이트와 그래프별 식별자는 생성마다 달라질 수 있으며 배치 동일성은 같은 검증 그래프 안에서 확인합니다. 독립 실주행 정확도·교통 갱신·P05~P14 전체·검토한 지역 100/100은 별도 작업입니다.
