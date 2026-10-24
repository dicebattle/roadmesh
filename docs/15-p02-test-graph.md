# P02 test graph contract / P02 시험 그래프 계약

Design owner: main agent; implementation owner: Sol. P02 builds an original synthetic OSM fixture with the real Valhalla engine and proves road legality. It does not implement GPS generation, traffic updates, a service cluster or the geographic 100/100 gate.

설계는 메인, 구현은 Sol이 담당합니다. 자체 합성 OSM 시험자료를 실제 Valhalla로 생성하고 도로 통행 규칙을 검증합니다. GPS 생성·교통정보 갱신·서버 집합·실제 지역 100/100 조건은 포함하지 않습니다.

## Tool boundary / 도구 경계

Project orchestration, validation and tests are TypeScript. Reuse upstream Osmium for XML→PBF and Valhalla for config generation, graph building, locating and routing. Upstream executables may internally use Python/C++; this does not introduce a second project implementation language. No hand-written PBF encoder or routing algorithm.

프로젝트 실행 관리·검사·테스트는 TypeScript입니다. XML→PBF는 Osmium, 설정·그래프 생성·구간 조회·경로 계산은 Valhalla를 재사용합니다. 외부 실행 파일 내부의 Python/C++는 프로젝트의 별도 구현 언어가 아닙니다. PBF 인코더나 경로 알고리즘을 직접 만들지 않습니다.

Use official Valhalla 3.9.1 OCI index `sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de`; observed platform manifests are arm64 `sha256:abd5743085e7ba902cbce443e788ac76830252ae63f8cff2f6f7c63c31b912e4` and amd64 `sha256:18cb42988e03c70dc4bc4ca095a259ec4db5e5df928be65956fc1c64c280b47a`. A small derived Docker image adds Ubuntu's `osmium-tool=1.16.0-1build1`. Record the actual derived image ID, platform, base digest, Dockerfile SHA and executable versions. Package mirrors and transitive packages mean the derived image is not claimed byte-reproducible. Network is allowed for initial image/package preparation only.

공식 3.9.1 이미지와 플랫폼별 식별값을 위와 같이 확인했습니다. 작은 파생 Docker 이미지에 정확 버전의 Osmium을 설치하고 실제 파생 이미지 ID·플랫폼·기반 해시·Dockerfile 해시·도구 버전을 기록합니다. 패키지 저장소와 전이 의존성 때문에 파생 이미지의 바이트 단위 재생성을 보장하지 않습니다. 최초 이미지·패키지 준비 때만 네트워크를 사용합니다.

Run graph operations with `--network none`, at most two CPUs and 2 GiB RAM, unique owned container names, no published ports and only a new output directory mounted writable. Use one-shot `valhalla_service CONFIG ACTION JSON_REQUEST`. Time-bound subprocesses; cleanup owned containers in finally and verify removal. Existing output directories and symlinks are refused; never delete user-owned containers or prior evidence. The final completion manifest is written only after output verification and successful cleanup.

그래프 작업은 네트워크 차단·최대 CPU 2개/메모리 2GiB·고유 컨테이너 이름·외부 포트 없음으로 실행합니다. 새 출력 폴더만 쓰기 가능하게 연결하고 단일 요청 실행 모드를 사용합니다. 프로세스 제한시간·종료 시 정리·실제 삭제 확인을 적용합니다. 기존 폴더·심볼릭 링크는 거부하고 다른 컨테이너·과거 증거는 지우지 않습니다. 출력 검증과 정리 성공 후에만 완료 목록을 기록합니다.

## Fixture and independent expectations / 시험자료와 독립 기대값

Author `fixtures/graph/tiny-city.osm.xml` and a corresponding JSON fixture contract. Coordinates describe a fictional equatorial network, not public road observations. Include two legal alternatives, an explicit via-node turn restriction, a separate one-way segment, a disconnected component and a close parallel road. Keep OSM node/way IDs and stable fixture labels in source. Every routable way is a simple unsplit segment so direction mapping can be checked unambiguously.

`fixtures/graph/tiny-city.osm.xml`과 JSON 계약을 직접 작성합니다. 좌표는 가상의 적도 도로망이며 실제 관측이 아닙니다. 합법 대안 두 개·경유 노드 회전 금지·별도 일방통행 구간·분리된 도로·가까운 평행도로를 포함합니다. 원본에 노드/도로 ID와 고정 이름표를 두고, 방향 대응을 명확히 검사할 수 있도록 각 도로는 단순한 분할 없는 구간으로 만듭니다.

Main geometry decision: A(0,0), B(.002,0), C(.004,0), D(0,.002), E(.002,.002), F(.004,.002), G(.002,-.002), written as (longitude, latitude). Main ways are AB, BC, AD, DE, EF, FC, EB, BG. AB→BG via B is prohibited, while AB→BC is legal. Equal road classes/speeds make A→C prefer AB+BC. A legal upper alternative is AD+DE+EF+FC. Add isolated one-way and disconnected segments at longitude .010–.012; add a parallel segment near AB separated by approximately 11 metres. Sample route endpoints within segments, away from intersections; use small location search cutoffs and minimum reachability zero to prevent endpoint snapping from hiding no-path failures.

메인 지형 결정은 위 좌표이며 경도·위도 순서입니다. AB→BG 회전을 금지하고 AB→BC는 허용합니다. 같은 도로 등급·속도로 A→C의 기본 경로는 AB+BC, 합법 상단 대안은 AD+DE+EF+FC입니다. 분리된 일방통행·도로는 경도 .010~.012, AB 근처 평행도로는 약 11m 간격에 둡니다. 경로 시작·끝은 교차점에서 떨어진 구간 내부로 잡고 작은 탐색 범위·도달 노드 최솟값 0으로 경로 없음 검사가 다른 도로로 붙어 통과하지 않게 합니다.

Use real locate/trace responses to map each fixture label to actual directed graph IDs and OSM way IDs. Check geometry/direction, expected way identity, uniqueness and allowed car access; never manufacture edge IDs. Preserve read-back responses. Route evidence must include ordered way IDs/geometry sufficient to detect forbidden transitions, not just a successful response. If deriving the route's edge sequence with trace_attributes, use exact route geometry/edge_walk and validate correspondence; do not present this as noisy GPS matching proof.

실제 locate/trace 응답에서 이름표를 방향별 그래프 ID·OSM 도로 ID에 대응시키고 지형·방향·도로 식별·중복·자동차 접근 허용을 검사합니다. ID를 임의 생성하지 않으며 원본 응답을 보존합니다. 경로 증거는 성공 응답뿐 아니라 금지 전환을 판정할 순서별 도로 ID·지형을 포함해야 합니다. trace_attributes로 구간 순서를 읽을 경우 정확한 경로 지형과 edge_walk를 사용하고 대응을 확인하며 GPS 잡음 매칭 검증으로 표현하지 않습니다.

## Outputs and acceptance / 출력과 통과 조건

CLI: `npm run graph:check -- --output NEW_DIRECTORY` after install/build. Output: original XML copy, PBF, effective config, tiles, edge map, raw command/response evidence, assertions and bilingual summary, then `manifest.json`. Manifest includes source commit/dirty state, fixture/config/PBF/tile hashes, engine/image versions, graph identity, resource limits, actual elapsed time and cleanup status. A graph identity binds inputs/config/engine **and the produced tile hashes** so different graph artifacts cannot accidentally share an edge namespace; do not promise equal tile bytes across platforms without measuring them. Artifacts remain in ignored data; commit compact inspected evidence.

설치·빌드 후 위 명령으로 실행합니다. 출력은 XML 복사본·PBF·실효 설정·타일·구간 대응·원본 명령/응답·판정·이중 언어 요약·최종 목록입니다. 목록에는 커밋/미커밋·파일 해시·엔진/이미지·그래프 식별·자원 한도·실제 시간·정리 상태를 기록합니다. 그래프 식별은 입력·설정·엔진과 **생성 타일 해시**에 결합해 다른 그래프 산출물이 같은 구간 네임스페이스를 쓰지 않게 하며, 측정 없이 플랫폼 간 타일 바이트 일치를 보장하지 않습니다. 생성 자료는 Git 제외 경로, 검사한 핵심 증거는 커밋합니다.

Required checks: baseline preferred way sequence; forced legal alternative through upper roads; forbidden AB→BG transition absent with a valid detour; forward one-way success and reverse refusal; disconnected no-path; complete verified edge mapping; cleanup success. Invalid/pre-existing output and injected command failures must fail without a completed manifest. Exit 0 means all assertions and cleanup passed; 1 means failed engine/behavior checks; 2 means invalid CLI/input/environment or output error. Unsupported/missing evidence is never PASS.

필수 검사는 기본 경로·상단 경유 합법 대안·금지 전환 없는 정상 우회·일방통행 정방향 성공/역방향 거부·분리 도로 경로 없음·전체 구간 대응·정리 성공입니다. 기존 출력·잘못된 입력·주입한 명령 실패는 완료 목록 없이 실패해야 합니다. 종료코드 0은 모든 판정·정리 통과, 1은 엔진/행동 검사 실패, 2는 인자·입력·환경·출력 오류입니다. 미지원·증거 누락은 통과가 아닙니다.

P14a stays fast and engine-free. P02 has focused unit tests plus a direct Docker integration command, independently executed by main on a clean commit. Hosted engine jobs and the two-node scenario remain P14b/P09. Continue P03 only after inspecting P02's actual graph and route evidence.

P14a는 엔진 없는 빠른 검사로 유지합니다. P02는 집중 단위 검사와 Docker 직접 통합 명령을 제공하고 메인이 깨끗한 커밋에서 독립 실행합니다. 원격 엔진 검사·두 노드 시나리오는 P14b/P09에 남습니다. P02 그래프·경로 증거를 검사한 다음 P03으로 진행합니다.

## Review refinements / 검토 보정

Use `edge_id` strings for directed engine IDs, consistent with the product protocol. `graph_id` identifies the complete graph bundle, never one edge. Check the engine's numeric ID is safe before converting it. Separate `engine_forward` (relative to stored engine shape) from `forward` (relative to original fixture from/to nodes); derive fixture direction from geometry rather than assuming both conventions match.

제품 계약대로 엔진 구간 ID는 `edge_id` 문자열로 기록합니다. `graph_id`는 전체 그래프 묶음이며 개별 구간 번호가 아닙니다. 엔진 숫자 ID의 정밀도 안전성을 확인한 뒤 변환합니다. 저장 지형 기준 `engine_forward`와 원본 시험 도로 기준 `forward`를 분리하고, 같은 방향 규칙이라고 가정하지 않고 지형에서 원본 방향을 계산합니다.

Reject missing/duplicate route expectations before engine execution. Same-OD upper-route expectations are `[101,103,104,105,106,102]`, including partial start/end roads. Valhalla one-shot no-path responses return process exit 1 plus error 442; require both and the expected response structure. Executable version output is `3.9.1` without an obligatory name prefix. These were checked against upstream source/actual executables, not inferred from process success alone.

엔진 실행 전에 경로 기대값 누락·중복을 거부합니다. 같은 출발/도착 상단 경로는 일부 시작·끝 도로를 포함한 위 순서입니다. Valhalla 단일 요청의 경로 없음은 프로세스 종료코드 1·오류 442와 정해진 응답 구조를 함께 검사합니다. 버전 출력은 이름 접두사가 필수가 아닌 `3.9.1`입니다. 공식 소스·실행 파일에서 확인한 내용이며 종료 성공만으로 추정하지 않았습니다.
