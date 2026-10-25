# Public road-speed bootstrap / 공공 도로 속도 확보

Development status: actual collection, official geometry import, dual-layer provider geometry, signed artifacts, durable public acceptance, automatic refresh/native lifecycle and browser routing are implemented. [First actual115m engine proof](../../research/public-road-speeds/2026-10-25-development/README.md). Actual IAB EN/KO/390px and24 controlled native-runtime cases passed in development. Compatible geometry increases verified candidates from3 to31 of79 graph edges. Fresh clean whole462 integration, actual broader coverage routes, current bilingual media/report and branch push remain required. Do not call this a completed public navigation service.

개발 상태: 실제 수집·공식 지형/호환 지도·서명·영속 수신·자동 갱신/엔진 수명·화면 경로 연결을 구현했습니다. 실제 내장 한영390픽셀과 통제 엔진24개를 확인했고 지형 대응 후보는3개에서31/79로 늘었습니다. 새 깨끗한462개·넓어진 실제 자료 경로·현재 한영 영상/보고서·푸시가 남아 있으며 완성된 공공 내비게이션으로 표현하지 않습니다.

- [Contract and full acceptance](../../docs/38-public-road-speeds.md) · [official sources](../sources/public-road-speeds.md).
- [Bounded collector/normalizer](../../tools/public_speed_source.ts): HTTPS only, key from environment,120s coalesced polling,10s/8MiB/50k rows, Korean time, km/h→m/s and original-time600s expiry. Failures cannot renew old source time.
- [Official geometry/mapping](../../tools/public_speed_geometry.ts): upstream shapefile/proj4, original PRJ/file hashes, official F/T endpoint validation, complete directed geometry and conservative ambiguity rejection. Different provider nodes require an explicit exact-link independent-map proof; failed proofs remain excluded.
- [Public JWS/artifact](../../tools/public_speed_publication.ts): PUBLIC_AGENCY and kr-its-v1 are separate from five-contributor synthetic aggregation. Scope binds publisher/key/graph/mapping; no fabricated contributor count.
- [Durable consumer](../../tools/public_speed_authority.ts): dedicated built-in SQLite WAL(Node22.13+), full sync, conditional transaction, signature-backed sequence and restart/expiry/revocation handling. Must close the owned handle. Ordinary Worker/legacy PostgreSQL acceptance is unchanged.
- [Browser-safe source contract](../../tools/public_traffic_context.ts): explicit public/wall-clock pairing, strict source/time/coverage metadata and no false source switching. Public display uses original observation age rather than publication age. GPS replay remains authored.
- [Provider-compatible map](../../tools/public_speed_map.ts): bounded dual official WMS layers, exact link/node/name/ordered-curve agreement; no node-ID trimming or national revision invention. / 공식 두 지도 레이어의 정확한 링크·노드·도로명·방향 곡선을 대조합니다.
- [Owned runtime](../../tools/public_speed_runtime.ts) and [whole acceptance](../../tools/public_speed_checks.ts): persistent source/signing state, automatic expiry/fallback/refresh and exact owned cleanup. / 공공 실행·전체 수용은 영속 출처/서명·자동 만료/복귀/갱신·소유 정리를 확인합니다.

위 연결기는 실제 기관 수치와 원 관측 시각을 유지하고 제보 수·합성 출처를 만들지 않습니다. 지형/버전이 모호하면 적용하지 않으며 SQLite 소유 핸들을 종료해야 합니다. 화면도 게시 나이가 아닌 원 관측 나이를 사용하고 GPS 재생은 합성으로 유지합니다.

## Local commands / 로컬 명령

Set `ROUTELENS_ITS_API_KEY` privately in the operator environment; do not put it in shell history, arguments, committed files or browser fields. Commands refuse existing output files/directories. Use the extracted official MOCT_LINK/MOCT_NODE SHP/DBF/PRJ, preserving their source revision and hashes. Import/mapping output is not permission to redistribute the original dataset.

운영자 환경변수로 키를 설정하고 명령 인수·셸 기록·커밋·화면 입력에 넣지 않습니다. 기존 출력은 덮어쓰지 않으며 공식 원본·버전·해시와 이용 조건을 유지합니다.

```sh
npm run build
npm run public:speeds -- collect --bounds 126.98,37.46,127.10,37.56 --output data/new-public-capture
npm run public:speeds -- import --directory data/official-nodelink --revision 2026-10-14 --bounds 126.98,37.46,127.10,37.56 --output data/official-geometry.json
npm run public:speeds -- map --geometry data/official-geometry.json --graph data/verified-seoul-graph --output data/new-public-mapping.json
npm run public:speeds -- bind-nodes --geometry data/official-geometry.json --mapping data/new-public-mapping.json --batch data/new-public-capture/batch.json --proofs data/reviewed-provider-map-proofs.json --output data/new-public-reviewed-mapping.json
npm run public:speeds -- provider-map --graph data/verified-seoul-graph --batch data/new-public-capture/batch.json --output data/new-provider-map
npm run public:speeds -- map --geometry data/new-provider-map/geometry.json --graph data/verified-seoul-graph --output data/new-provider-mapping.json
npm run public:speeds -- serve --graph data/verified-seoul-graph --bundle data/verified-traffic-bundle --mapping data/new-provider-mapping.json --state data/private-public-state --output data/new-public-runtime --bounds 126.98,37.46,127.10,37.56
npm run public:check -- --graph data/verified-seoul-graph --bundle data/verified-traffic-bundle --output data/new-public-checks
```

`bind-nodes` requires independently obtained official map proofs and fails on unsupported proofs; it does not trim IDs. Prefer the distinct provider-map path when current provider nodes differ from the downloadable national revision. The server lifetime defaults to15min; capture of authored acceptance requests is opt-in (`--capture-evidence true`). The private state contains the operator's local signing key and must stay outside published evidence. Numeric source requests are server-only. The broad goal remains open until the full evidence gates pass.

bind-nodes는 별도 공식 근거를 요구합니다. 최신 전국 지형과 제공자 노드가 다르면 별도 provider-map 경로로 확인합니다. 서버 기본 수명은15분이고 자체 수용 요청 캡처는 명시 선택입니다. 서명 비밀키가 있는 상태 폴더는 공개 증거 밖에 두고 수치 조회는 서버에서만 수행합니다. 전체 근거 조건까지 목표는 진행 중입니다.
