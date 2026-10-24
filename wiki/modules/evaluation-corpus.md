# 경로와 지도 매칭 시험자료 검사

English-first/Korean CLI update, 2026-10-24: help and project validation errors are bilingual; existing report keys and English `blockers` stay stable, with `blockers_ko` added. Focused tests: 13 passed in one run by the Sol implementation agent. Standard library errors retain their original detail and receive Korean recovery guidance. This is still the geographic-input validator, not the P01 synthetic scenario runner.

2026-10-24 영어 우선·한국어 CLI 변경: 도움말과 자체 검사 오류에 두 언어를 제공하고 기존 키·영문 `blockers`를 유지하며 `blockers_ko`를 추가했습니다. Sol 구현 에이전트가 집중 테스트를 한 번 실행해 13개가 통과했습니다. 표준 라이브러리 오류 세부사항은 원문을 보존하고 한국어 해결 안내를 덧붙입니다. 이 도구는 실제 지역 입력 검사기이며 P01 합성 시나리오 실행기가 아닙니다.

상태: **RM-001a 구현·로컬 검증 완료**. RM-001 전체는 진행 중입니다. 이 도구는 시험자료를 검사하며 경로 엔진을 호출하거나 도로의 실제 통행 가능 여부를 판정하지 않습니다.

## 왜 먼저 만들었는가

M0에서는 경로 100개와 지도 매칭 사례 100개로 엔진을 평가할 계획입니다. 합성 예제·검토하지 않은 자료·중복 입력을 그 수에 넣으면 엔진 품질을 과장하게 됩니다. 원본 출처와 기대 결과의 근거를 먼저 정리할 수 있는 작은 도구를 만들었습니다.

코드: [tools/evaluation_corpus.ts](../../tools/evaluation_corpus.ts). 검증: [tests/evaluation_corpus.test.ts](../../tests/evaluation_corpus.test.ts). 전체 위치: [로드맵](../../docs/05-roadmap.md).

## 실행

Use Node.js 22/24: `npm ci && npm run build`. See the [migration contract](../../docs/14-typescript-migration.md). Earlier Python evidence below is historical.

Node.js 22/24에서 설치·빌드 후 실행합니다. [전환 계약](../../docs/14-typescript-migration.md)을 참고하며 아래 기존 Python 검증 결과는 과거 기록입니다.

```bash
npm run --silent corpus -- fixtures/evaluation/synthetic-seoul.json
npm run --silent corpus -- fixtures/evaluation/synthetic-seoul.json --require-ready
npm test
```

첫 명령은 형식 검사 성공으로 종료코드 0입니다. 두 번째는 실제 검토 자료가 부족하므로 종료코드 1입니다. 잘못된 JSON·잘못된 좌표 등 입력 오류는 종료코드 2이며 오류 위치를 표준 오류 출력으로 알려줍니다. 결과 파일은 표준 출력을 원하는 경로로 저장할 수 있습니다. 도구 자체는 파일을 수정하지 않습니다.

## 입력 0.1 계약

[합성 예제](../../fixtures/evaluation/synthetic-seoul.json)를 참고합니다. 알 수 없는 필드는 오타를 숨기지 않도록 거부합니다. 제품 API 초안과는 독립된 개발용 계약입니다.

| 필드 | 의미와 검사 |
| --- | --- |
| `schema_version` | 현재 `0.1`만 지원 |
| `region.id` | 소문자·숫자·밑줄·하이픈, 최대 80자 |
| `region.bbox` | `[서쪽 경도, 남쪽 위도, 동쪽 경도, 북쪽 위도]`; 날짜 변경선 횡단 제외 |
| `sources` | 고유 ID, `synthetic/open_data`, 원본 참조, 라이선스, 재배포 `allowed/unresolved` 선언 |
| `cases` | 고유 ID, `route/match`, 출처 ID, `draft/reviewed/uncertain`, 종류별 입력 |
| `review` | `reviewed`일 때만 필수. 기대 결과 설명과 그 근거 참조 |

경로 입력은 서로 다른 출발·도착 좌표입니다. 매칭 입력은 최소 2개 GPS 점이며 각 점에 `latitude`, `longitude`, `elapsed_s`, `accuracy_m`을 둡니다. 경과시간은 0~86,400초 범위에서 엄격히 증가하고 위치 오차는 0.01~10,000m입니다. 이 범위는 입력 계약이며 매칭 품질의 합격 기준이 아닙니다. 정지 상태의 연속 좌표도 허용하여 신호대기를 잘못 제거하지 않습니다.

좌표는 지리적 범위와 선언한 지역 안에 있어야 합니다. bool·문자열·NaN·Infinity는 좌표나 측정값으로 받지 않습니다. JSON의 같은 키 반복도 거부합니다.

같은 ID 또는 완전히 같은 경로/매칭 입력을 다른 ID로 반복하는 것을 거부합니다. int와 float로 표기만 다른 수는 동일 입력으로 봅니다. 가까운 좌표를 조금씩 바꾼 자료까지 자동으로 중복 판정하는 도구는 아니며 사례 다양성은 사람이 검토합니다.

## 준비 상태의 의미

종류별 `reviewed_open_data`가 100개 이상이고 사용한 출처의 재배포 상태가 모두 `allowed`일 때 `ready_for_m0_measurement=true`가 됩니다. 합성 자료와 불확실·미검토 사례는 이 수에 포함되지 않습니다. 불확실·미검토 수는 별도 보고합니다. 추후 엔진 평가에서는 검토 사례만 정확도 분모에 넣고 제외율도 함께 공개해야 합니다.

라이선스 문자열이나 검토 근거가 존재한다고 권리·정답을 검증한 것은 아닙니다. URL을 자동 방문하지 않고, 실제 도로 품질·표본 다양성·개인정보 포함 여부를 보증하지 않습니다. `true`도 RM-001 전체 완료나 M0 엔진 합격을 의미하지 않습니다.

## 확인한 결과와 다음 작업

2026-10-24 집중 테스트 10개 통과. 합성 경로 1개·매칭 1개는 형식 유효, 실제 검토 사례는 각각 0개이며 `ready=false`입니다. [저장된 결과](../../research/evaluation-corpus/2026-10-24-synthetic-report.json)의 SHA-256은 검사한 입력 파일 바이트에 해당합니다.

For this geographic-input module, RM-001b still supplies reviewed real-road sources. P01/P14a and P02 on the [local pilot track](../../docs/11-local-pilot.md) are verified; P03 follows. Do not generate arbitrary coordinates and label them reviewed. Machine-checkable route expectations and graph-edge references will be added when the engine interface is fixed.

이 실제 지역 입력 모듈에는 RM-001b의 검토된 도로 자료가 여전히 필요합니다. [로컬 파일럿 경로](../../docs/11-local-pilot.md)의 P01/P14a·P02는 검증됐고 다음은 P03입니다. 임의의 좌표를 만들어 검토 자료로 표시하지 않습니다. 기계 판정 가능한 기대 경로와 그래프 구간 참조는 엔진 인터페이스가 정해질 때 추가합니다.
