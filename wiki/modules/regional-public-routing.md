# Regional public traffic routing / 지역 공공 교통 경로 계산

[Fixed design](../../docs/40-regional-public-routing.md) · [dated result](../../research/public-road-speeds/2026-10-26-regional-routing/report.md) · [key guide](../../docs/39-public-traffic-api-keys.md).

Gyeonggi original-time service-link speeds and EX original-time detector speeds now enter a separate regional0.2 signed authority and the existing native traffic compiler. Mapping uses exact graph identity and complete directed geometry. EX priority over compatible Gyeonggi values is a spatial-resolution rule, not a measured accuracy ranking. Missing, invalid, ambiguous and expired values use the next verified candidate or base speeds. The old ITS and synthetic modes remain separate.

경기 서비스 링크와 도로공사 검지기 수치를 원 관측시각 그대로 별도 지역 승인·서명·기존 엔진 변환에 연결합니다. 지도 식별·전체 방향 지형을 검증하고 도로공사 다음 경기 후보를 선택하되 정확도 우위로 주장하지 않습니다. 무효·모호·만료는 다음 유효 후보 또는 기본 속도를 사용하며 기존 ITS·합성 모드는 분리합니다.

## Reproduction / 재현

Build with Node22.13+/24 and Docker. First run the fresh whole simulation. Use a new directory for every output. `graph` reuses exact validated tiles, adds the twelve pinned native regional trials and revalidates all old/new inventory. The original government files remain operator-controlled; neither an old EX capture nor rereading it supplies current authority.

Node22.13+/24·Docker로 빌드한 뒤 새 전체 통합을 수행합니다. 출력은 매번 새 폴더이며 graph는 고정 타일을 재사용하고 열두 지역 엔진 시험과 전체 목록을 재검증합니다. 기관 원문은 운영자가 관리하고 오래된 도로공사 파일의 재독으로 현재성을 만들지 않습니다.

```sh
npm run build
npm run simulation:check -- --output data/new-whole
npm run public:regional -- graph --base data/new-whole/seoul/graph --output data/new-regional-graph
npm run public:regional -- geometry --bounds 126.7,37.4,127.25,37.75 --output data/new-regional-geometry
npm run public:regional -- map --graph data/new-regional-graph --wfs data/new-regional-geometry/gits-wfs-region.body --hits data/new-regional-geometry/gits-wfs-region-hits.body --wms data/new-regional-geometry/wms --vds data/operator-vds-installations --output data/new-regional-mapping
npm run public:regional -- collect --mapping data/new-regional-mapping/mapping.json --inputs data/operator-regional-input.json --bounds 126.7,37.4,127.25,37.75 --output data/new-regional-observations
```

The operator input schema is:

운영자 입력은 다음 형식입니다.

```json
{
  "schema_version": "regional-collector-0.1",
  "gits_route_ids": ["1010000011", "1010001001", "1020000881", "1020000701", "1020000611"],
  "expressway_document": "operator-capture/document.json",
  "expressway_receipt": "operator-capture/document.receipt.json"
}
```

Paths resolve relative to the input file. Set **both** EX paths to `null` for Gyeonggi-only operation. EX accepts a complete explicitly retained public-demo browser document and receipt only: exact documented URL, original document hash/byte count/row count, acquisition UTC and access method. Acquire through the ordinary official browser page; no cookie extraction or transport bypass. The installation endpoint is `https://data.ex.co.kr/openapi/vdsinfo/vdsList?key=test&type=json&numOfRows=99&pageNo=1`; advance `pageNo` and save complete browser documents as `ex-vds-page001.json` through the final advertised page. VDS installation pages must cover every advertised row exactly; preserve all86 pages from this dated acquisition. Production keys and reliable direct transport are separate work.

경로는 입력 파일 기준이며 도로공사 두 항목 모두 null이면 경기만 사용합니다. 도로공사는 문서 전체와 URL·해시·바이트·행 수·수집 UTC·접근 방법 근거를 요구합니다. 공식 브라우저에서 명시 보존하며 쿠키 추출·차단 우회는 하지 않습니다. 설치 목록도 전체 행·쪽을 검증하고 이번86쪽 원문을 로컬에 유지합니다. 운영 키·안정된 직접 전송은 후속입니다.

Prepare a traffic bundle for the **extended** graph; a bundle for the original three scenes cannot authorize the enlarged catalog. Then use:

확장 지도 전용 엔진 변환 묶음을 준비합니다. 기존 세 장면용 묶음으로 확장 목록을 승인할 수 없습니다.

```sh
node --input-type=module -e 'import {prepareTrafficBundle} from "./dist/tools/traffic_bundle.js"; await prepareTrafficBundle("data/new-regional-graph", "data/new-regional-bundle");'
npm run public:regional -- compare --graph data/new-regional-graph --bundle data/new-regional-bundle --mapping data/new-regional-mapping/mapping.json --response data/new-regional-observations/response.json --batch data/new-regional-observations/batch.json --output data/new-regional-comparison
npm run public:speeds -- serve --source kr-regional --regional-input data/operator-regional-input.json --graph data/new-regional-graph --bundle data/new-regional-bundle --mapping data/new-regional-mapping/mapping.json --state data/private-regional-state --output data/new-regional-client --bounds 126.7,37.4,127.25,37.75 --capture-evidence true
```

The server refreshes Gyeonggi every120s; EX remains an explicitly operator-captured source. Each value expires600s after its original time. Source loss never renews validity. Signer private state stays outside commits. Routing remains local and does not establish ETA accuracy or metropolitan completeness. The regional expanded display context currently exceeds GPS replay's5000-road/100000-vertex admission bounds; the new regional video demonstrates routing only. Use the standard pilot for the separately accepted authored GPS replay; spatially bounded regional context is pending.

서버는 경기 수치를120초마다 갱신하고 도로공사는 운영자 보존 자료로 유지합니다. 값은 원시각600초 뒤 만료되며 비밀 서명 상태는 커밋하지 않습니다. 로컬 경로 영향과 도착시간 정확도·수도권 완전성은 구분합니다. 확장 표시 문맥이 GPS 재생 상한을 넘어 새 지역 영상은 경로만 시연하며 지역 공간 제한은 후속입니다.
