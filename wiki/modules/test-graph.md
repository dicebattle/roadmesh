# P02 synthetic graph / P02 합성 그래프

Status: implementation in progress; final clean-source evidence is required before completion. [Contract](../../docs/15-p02-test-graph.md). Main designs and verifies; Sol implements.

상태: 구현 중이며 완료 전에 깨끗한 소스의 최종 증거가 필요합니다. 위 계약에 따라 메인이 설계·검증하고 Sol이 구현합니다.

## Purpose and reuse / 목적과 재사용

P01 proves deterministic scheduling. P02 supplies a real, bounded routing graph for later GPS simulation and traffic tests. The project owns the fictional fixture, TypeScript orchestration, assertions and evidence. Osmium converts XML to PBF; Valhalla builds tiles and answers route/locate/trace requests. No routing core is forked.

P01이 결정적 일정을 증명한다면 P02는 후속 GPS 생성·교통 검사에 실제 작은 경로 그래프를 제공합니다. 자체 작성 범위는 가상 시험자료·TypeScript 실행 관리·판정·증거입니다. XML→PBF는 Osmium, 타일 생성·경로/구간/속성 조회는 Valhalla가 담당하며 경로 엔진 핵심을 포크하지 않습니다.

The fixture contains 11 ways: a main grid, forbidden AB→BG turn, a separate one-way road, disconnected road and a close parallel road. Baseline and forced upper alternative use the same origin/destination. Expected OSM way sequences are authored from the fixture geometry before querying the engine. Directed Valhalla IDs are discovered at runtime; they are not portable between graph builds.

시험자료는 기본 격자·AB→BG 회전 금지·별도 일방통행·분리 도로·가까운 평행도로의 11개 도로입니다. 기본·상단 우회는 출발/도착지를 공유합니다. 예상 OSM 도로 순서는 엔진 조회 전에 자체 지형에서 작성하고 Valhalla 방향별 ID는 실행 중 읽습니다. 이 ID는 다른 그래프 빌드에 그대로 옮길 수 없습니다.

## Run / 실행

Prerequisites: Node 22/24, npm, Docker with Linux containers and initial network access for image preparation. Build/run commands:

Node 22/24·npm·Linux 컨테이너를 실행할 Docker가 필요하며 최초 이미지 준비에는 네트워크를 사용합니다.

```sh
npm ci
npm run build
npm run graph:check -- --output data/p02-example
```

Use a new output path. Image preparation is separate from graph execution: graph build and queries run with network disabled, no published port, two CPU/2 GiB limits and a unique owned container. A failed/no-path response is inspected, never treated as success merely because the process failed. Reports describe upstream diagnostic text with English/Korean context.

새 출력 경로를 사용합니다. 이미지 준비 이후 그래프·조회 실행은 통신 차단·외부 포트 없음·CPU 2개/2GiB 한도·고유 소유 컨테이너를 사용합니다. 경로 없음 응답은 실제 내용을 검사하며 프로세스가 실패했다는 이유만으로 통과시키지 않습니다. 외부 진단 원문에는 영어·한국어 설명을 제공합니다.

## Evidence boundary / 증거 경계

Graph, image and output identity are recorded with actual source commit/dirty state. Complete manifests require successful owned-resource cleanup. Large generated PBF/tiles/raw logs stay in ignored data; compact inspected evidence is committed. Do not overwrite an existing report directory.

실제 커밋/미커밋 상태에 그래프·이미지·출력 식별을 연결합니다. 자신이 만든 자원을 정리한 뒤 완료 목록을 기록합니다. 생성 PBF·타일·원본 로그는 Git 제외 경로, 검사한 핵심 증거는 커밋에 보존합니다. 기존 보고서 폴더를 덮어쓰지 않습니다.

This proves the synthetic graph's routing/access behavior with Valhalla. It does not prove noisy GPS matching, live traffic changes, two-node failover, Korean road accuracy, hosted engine CI or actual driver behavior. A resource limit is not a peak-memory measurement. Next: [P03 vehicle/GPS design](../../docs/16-p03-vehicle-simulation.md).

이는 Valhalla의 합성 그래프 경로·접근 규칙을 검증합니다. 잡음 GPS 매칭·실시간 교통 변화·두 노드 장애 전환·한국 도로 정확도·원격 엔진 CI·실제 운전자 행동은 검증하지 않습니다. 자원 한도는 최대 메모리 실측값이 아닙니다. 다음은 위 P03 차량·GPS 생성 설계입니다.

Cleanup coverage is normal completion and handled command/validation failures. Killing the supervising Node process with an uncatchable signal is not a verified recovery scenario here; P12 must add whole-process interruption/recovery proof. P02's container command is time-bounded, and the final test checks that no owned container remains.

정리 검증 범위는 정상 완료·처리된 명령/검증 실패입니다. 감독 Node 프로세스를 처리할 수 없는 신호로 강제 종료하는 복구 시나리오는 여기서 검증하지 않았으며 P12의 전체 프로세스 중단·복구 검사에 남깁니다. P02 컨테이너 명령은 시간 제한을 두고 최종 실행 후 소유 컨테이너가 남지 않았는지 확인합니다.
