# RouteLens

Open-source traffic aggregation and federated routing, built around existing routing engines.

RouteLens is derived from Metro Lens. Implemented tools: the evaluation-corpus validator and P01's deterministic event runner with English/Korean evidence. P14a adds fast automated checks; verification is recorded in the work log. P02 also builds a real synthetic Valhalla graph and verifies road legality. The full navigation pilot is not implemented. Start with the [P01/P14a module](wiki/modules/pilot-runner.md) and [development workflow](docs/12-development-workflow.md). Work is pushed to feature branches; `main` is protected.

RouteLens는 Metro Lens에서 파생됐습니다. 시험자료 검사 도구와 영어·한국어 증거를 남기는 P01 결정적 이벤트 실행기를 구현했고 P14a 빠른 자동 검사를 추가했습니다. 검증 결과는 작업 기록에 남깁니다. P02는 실제 Valhalla 합성 그래프 생성·통행 규칙도 검증합니다. 전체 내비게이션 파일럿은 아직 미구현입니다. [P01/P14a 모듈](wiki/modules/pilot-runner.md)과 [개발 작업 절차](docs/12-development-workflow.md)를 참고하세요. 작업 결과는 작업 브랜치로 푸시하고 main은 보호합니다.

RouteLens는 운전자가 제공한 주행 관측을 검증해 도로별 교통정보로 만들고, 독립적으로 운영되는 서버들이 같은 지도와 교통정보를 사용해 자동차 경로를 계산하도록 하는 프로젝트입니다.

**Status: M0 input validation, P01 event scheduling and P02 synthetic graph checks exist; navigation, traffic collection and deployment do not.** Performance/accuracy targets in the plan are not measured achievements.

**현재 상태: M0 입력 검사·P01 이벤트 일정·P02 합성 그래프 검사는 구현됐으며 내비게이션·교통 수집·배포는 미구현입니다.** 계획의 성능·정확도 수치는 실측 달성 결과가 아닙니다.

현재 상태와 근거는 [프로젝트 위키](wiki/index.md), 누적 변경은 [작업 기록](wiki/log.md)에서 확인합니다. 이후 계획·구현·검증도 코드와 함께 저장소에 기록합니다.

## 시작하는 구조

- 휴대폰은 위치 측정, 지도 표시, 경로 안내를 담당합니다. 전국 경로 계산용 데이터를 필수로 다운로드하지 않습니다.
- Cloudflare Workers, Queues, Durable Objects가 수집과 집계를 담당하는 운영 구성을 우선 설계합니다.
- 별도의 Valhalla 서버가 GPS를 실제 도로에 대응시키고 경로를 계산합니다. 처음에는 운영자가 관리하는 서버, 다음에는 승인된 자원봉사자 서버를 연결합니다.
- 검증·서명한 지도와 교통정보만 서버 사이에 배포합니다. 공개 P2P에는 원시 위치기록을 보내지 않습니다.
- PostgreSQL/PostGIS와 HTTP를 사용하는 독립 설치 경로도 함께 제공합니다. Cloudflare 계정은 공개 규격의 필수 조건이 아닙니다.

## 직접 만드는 부분과 재사용하는 부분

| 직접 개발 | 기존 오픈소스 활용 |
| --- | --- |
| 교통정보 집계·품질 판단·만료 규칙 | Valhalla: 경로 계산, 도로 매칭, 안내 정보 생성 |
| 지도·교통정보 버전 계약과 변환기 | OpenStreetMap: 도로 원본 데이터 |
| 노드 등록·선택·장애 시 전환 | MapLibre: 웹·모바일 지도 표시 |
| 안전한 관측 수집과 기여 정책 | PMTiles: 지도 화면용 타일 배포 |
| 호환성 시험, 재현 가능한 평가, 설치 패키지 | TUF 구현체: 지도·소프트웨어 업데이트 검증 |
| 내비게이션 상태와 사용자 동의 흐름 | 후속 단계의 Kubo/libp2p: 파일·메시지 P2P 전송 |

## 문서 읽는 순서

1. [제품 목표와 첫 출시 범위](docs/01-product-scope.md)
2. [구성요소와 데이터 흐름](docs/02-architecture.md)
3. [오픈소스 비교와 선택 근거](docs/03-build-or-reuse.md)
4. [공개 데이터·인터페이스 계약 초안](docs/04-protocol.md)
5. [개발 순서와 통과 기준](docs/05-roadmap.md)
6. [처리량·운영비 산정](docs/06-capacity-and-cost.md)
7. [위치정보 보호와 위협 모델](docs/07-privacy-and-trust.md)
8. [버스 관리 제품으로의 확장](docs/08-transit-extension.md)
9. [설계 결정과 미결정 항목](docs/09-decisions.md)
10. [공식 출처와 조사 기록](docs/10-sources.md)
11. [Local pilot modules / 로컬 파일럿 모듈](docs/11-local-pilot.md)
12. [Development workflow / 개발 작업 절차](docs/12-development-workflow.md)
13. [P01/P14a contract / P01·P14a 계약](docs/13-p01-p14a-contract.md)

설계 기준일은 2026-10-24입니다. 의존성의 개발 활동은 [조회 결과](research/upstream-snapshot.json)에 보관합니다. 최신 커밋이 있다는 사실만으로 운영 품질을 보증하지 않습니다.

## 지금 실행할 수 있는 모듈

Use Node.js 22 or 24 and npm from the repository root. Install the locked dependencies and build before running tools. No API key is needed.

저장소 루트에서 Node.js 22 또는 24와 npm을 사용합니다. 고정 의존성 설치·빌드 후 실행하며 API 키는 필요하지 않습니다.

```bash
npm ci
npm run build
npm run --silent corpus -- fixtures/evaluation/synthetic-seoul.json
npm test
```

[시험자료 검사 모듈](wiki/modules/evaluation-corpus.md)은 좌표·관측 순서·중복·출처·검토 상태를 검사합니다. 포함된 합성 예제는 형식 검사를 통과하지만 실제 도로 검증 자료 100개 기준에는 포함되지 않습니다. `--require-ready`를 붙이면 이 예제는 미준비 상태로 종료합니다.

Run P01 or its direct checks using a new output directory. Existing paths are refused. The tools now share the TypeScript/Node.js toolchain.

새 출력 폴더로 P01 또는 직접 검사를 실행합니다. 기존 경로는 거부하며 도구는 TypeScript/Node.js 체계를 공유합니다.

```bash
mkdir -p data
npm run --silent pilot -- fixtures/pilot/success.json --output data/p01-example
npm run --silent pilot:checks -- --output data/p01-checks
```

## Real graph verification / 실제 그래프 검증

[P02](wiki/modules/test-graph.md) uses Docker, Osmium and pinned Valhalla. Initial image preparation needs network; graph execution disables network. Use a new output directory:

[P02](wiki/modules/test-graph.md)는 Docker·Osmium·고정 Valhalla를 사용합니다. 최초 이미지 준비는 네트워크가 필요하고 그래프 실행은 통신을 차단합니다. 새 출력 폴더로 실행하세요.

```sh
npm run graph:check -- --output data/p02-example
```

## Next implementation / 다음 구현

P01/P14a TypeScript migration and P02 real synthetic graph checks are verified. Next is [P03 vehicle/GPS simulation](docs/16-p03-vehicle-simulation.md), followed by P04 real map matching. Real-road RM-001 remains a separate 100/100 evaluation gate; synthetic inputs do not satisfy it.

P01/P14a TypeScript 전환과 P02 실제 합성 그래프 검증을 마쳤습니다. 다음은 [P03 차량·GPS 생성](docs/16-p03-vehicle-simulation.md), 이후 P04 실제 도로 매칭입니다. 실제 도로 RM-001의 100/100 평가 조건은 별도로 유지합니다.

## 오픈소스 원칙

프로젝트가 새로 작성하는 코드·문서는 [Apache-2.0](LICENSE)으로 공개합니다. 외부 코드와 지도 데이터는 각자의 라이선스를 유지합니다. 특히 OSM 기반 데이터의 ODbL 조건은 애플리케이션 코드 라이선스와 별도로 적용됩니다. [기여 방법](CONTRIBUTING.md), [운영 원칙](GOVERNANCE.md), [보안 안내](SECURITY.md)를 참고하세요.

실제 주행 궤적, 개인 식별자, 운영 비밀정보는 이 저장소에 넣지 않습니다.
