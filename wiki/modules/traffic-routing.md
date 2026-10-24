# Accepted traffic routing / 수용 교통정보 경로 반영

P08 connects durable P07 acceptance to actual Valhalla routing. The [contract](../../docs/27-p08-traffic-activation.md) is authoritative; [development evidence](../../research/pilot/2026-10-25-p08/development/README.md) records 32 passing real-process cases and two earlier failures. Fresh whole-system and hosted delivery are pending at this entry.

P08은 영속 P07 수용을 실제 Valhalla 경로 계산에 연결합니다. 기준은 설계 문서이며, 개발 근거에 실제 프로세스 검사 32개 통과와 앞선 두 실패를 함께 기록했습니다. 이 기록 시점 새 전체 실행·원격 반영은 아직 남아 있습니다.

The adapter validates the upstream traffic archive, compiles only accepted LIVE speeds into an immutable graph-specific generation and invokes the actual engine with the original two-point request. It checks accepted state before selection and after the response. Exact event-clock expiry selects default speeds on the next request; results crossing expiry or replacement are refused rather than relabeled.

연결기는 상위 교통파일 형식을 검사하고 수용한 LIVE 속도만 그래프별 불변 파일로 변환한 뒤, 원래 두 좌표 요청으로 실제 엔진을 실행합니다. 선택 전과 응답 뒤에 수용 상태를 확인합니다. 정확한 관측시계 만료 뒤 다음 요청은 기본 속도를 사용하며, 계산 중 만료·교체된 결과는 상태 이름만 바꾸지 않고 거부합니다.

| File / 파일 | Responsibility / 책임 |
| --- | --- |
| [traffic_bundle.ts](../../tools/traffic_bundle.ts) | Upstream preparation and strict archive/graph validation / 상위 생성·엄격한 파일/지도 검증 |
| [traffic_compiler.ts](../../tools/traffic_compiler.ts) | Positive speed encoding, deterministic immutable files and atomic publication / 양수 속도 변환·결정적 불변 파일·원자 게시 |
| [traffic_controller.ts](../../tools/traffic_controller.ts) | Current durable authorization and public provenance / 현재 영속 승인·공개 출처정보 |
| [traffic_runtime.ts](../../tools/traffic_runtime.ts) | Owned real engine, original route/trace and cleanup / 소유 실제 엔진·원 경로/통과 구간·정리 |
| [traffic_scenario.ts](../../tools/traffic_scenario.ts) | Fifteen authored trips on actual Teheran-ro geometry / 실제 테헤란로 지형의 합성 15여행 |
| [traffic_checks.ts](../../tools/traffic_checks.ts) | Actual HTTP/DB/engine lifecycle, faults and recorded evidence / 실제 HTTP/DB/엔진 수명주기·장애·기록 근거 |

Direct development command / 개발 직접 실행 명령:

```sh
npm run build
npm run traffic:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY
```

The graph must already be verified; the output must not exist. The full `simulation:check` command builds a fresh Seoul graph and includes P08 after all previous 206 cases. Required P08 case IDs are defined once, producing 238 current whole-system cases.

그래프는 미리 검증되어 있어야 하고 출력 폴더는 새 경로여야 합니다. 전체 명령은 서울 그래프를 새로 생성하고 기존 206개 검사 뒤에 P08을 실행합니다. P08 필수 사례는 한 곳에서 정의하며 현재 전체는 238개입니다.

P08 uses a bounded engine process per request. Persistent node activation/draining is P09; gateway/failover is P10. The viewer plays recorded evidence, and the synthetic success does not prove independent real-driving accuracy, production traffic quality or availability.

P08은 요청마다 제한된 엔진 프로세스를 사용합니다. 장기 실행 노드의 교체·기존 요청 마무리는 P09, 중계·장애 전환은 P10입니다. 화면은 기록된 증거를 재생하며 합성 성공으로 독립 실주행 정확도·운영 교통 품질·가용성을 증명하지 않습니다.
