# P09 development evidence / P09 개발 검증 근거

Main designed and reviewed the contract; Sol subagents implemented the core and integration in separate owned files. Main directly executed all four actual development runs against the previously verified actual Seoul graph `bae9f30609e49d87f496dd92380894800262b55a8f927f0cc1c3805c6692e384`. These runs have uncommitted-source provenance and are development evidence, not final clean whole-pipeline proof.

메인이 계약을 설계·검토하고 Sol 하위 에이전트가 코어와 통합의 파일을 나누어 구현했습니다. 메인이 기존 검증된 실제 서울 그래프로 네 차례 개발 실행을 직접 수행했습니다. 미커밋 코드의 개발 근거이며 최종 커밋에서 새 그래프를 만든 전체 검증과 구분합니다.

| Run / 실행 | Observed result / 확인 결과 | Correction / 수정 |
| --- | --- | --- |
| [01](development01.tar.gz) | First P05 worker returned RETRY before native matching; no P09 assertions completed. / 첫 P05 작업자가 매칭 전 RETRY, P09 통과 없음 | Change source/engines to source/synthetic-engines to satisfy the existing synthetic-output guard; preserve the guard. Save failed worker/state before cleanup. / 기존 합성 출력 보호조건에 맞게 경로만 수정하고 실패 작업자·DB 상태 저장 |
| [02](development02.tar.gz) | 19 cases passed; corrupt-generation RECONCILE acknowledgement timed out after its original180s limit. / 19개 통과 뒤 손상 세대 조정 응답이 원래180초 제한에 도달 | Actual642–675ms failed preparation was slower than the500ms polling interval. Skip periodic ticks while reconciliation runs; keep explicit requests coalesced. / 느린 실패 도중 주기 호출만 건너뛰고 명시 갱신은 병합 유지 |
| [03](development03.tar.gz) | 24 cases passed, then strict drain ceiling failed: request30.023s, observed drain30.250s; original events span30.347s. / 24개 통과 뒤 요청 제한은 정상이나 정리30초 초과 | Remove native1s+1s grace stacked after RouteLens lease draining. Retain verified TERM/process/owned-container cleanup; do not relax the30s ceiling. / RouteLens 요청 마무리 뒤 엔진의 중복 대기만 제거·30초 기준 유지 |
| [04](development04.tar.gz) | **32/32 passed**, request30.028s, observed drain28.974s; exact expiry restores baseline on both nodes. / **32개 통과**, 두 노드의 정확한 만료·기본 경로 복구 | Main inspected2,938 original hashes, nine standard signatures, original route responses and current resource absence. / 메인이 원문해시2,938개·표준서명9개·원경로·현재 자원 부재 확인 |

All failed runs retained their original results and cleanup records. Main separately checked exact process/container/volume absence after each failure: run01 two processes/two resources, run02 twenty-seven processes/twelve resources, run03 thirty processes/sixteen resources. Run04 has32 absent processes,19 absent containers and one absent volume. No existing resources were broadly terminated.

실패를 성공으로 덮어쓰지 않았으며 원문과 정리 결과를 보존합니다. 메인은 실패01의 프로세스2개·자원2개, 실패02의27개·12개, 실패03의30개·16개 부재를 별도로 확인했습니다. 성공04에서는 프로세스32개·컨테이너19개·볼륨1개 부재를 확인했습니다. 다른 작업의 자원을 한꺼번에 종료하지 않았습니다.

[Archive identities and exact map omissions](archives.json) · [Main run04 inspection](development04-main-review.json) · [Focused checks and compile records](focused-verification.tar.gz).

Each archive omits only its explicitly hashed bundle/graph.tar; all other original files, including native request/response bodies, process commands, source observations and failed state, remain. The omitted graph bytes were hashed locally, not verified for a future downloader. Source movements are authored synthetic data over public OSM roads, not actual drivers or live Seoul traffic.

압축마다 명시한 지도 묶음 하나만 해시와 함께 제외하고 나머지 원문·실제 요청/응답·프로세스 명령·합성 관측·실패 상태를 보존합니다. 제외 지도 바이트는 로컬에서만 확인했으며 다운로드한 사람의 검증을 주장하지 않습니다. 실제 OSM 도로 위의 자체 합성 이동이며 실주행·현재 서울 교통을 측정한 것은 아닙니다.

Core focused checks passed13/13 initially and14/14 after the scheduling regression was added. Integration and affected P07/P08 focused checks passed15/15. The path and native-grace corrections each compiled once and were then tested through actual execution. Final clean whole270, fresh recording, hosted execution and protected delivery remain required.

코어 집중 검사는 최초13개, 조정 반복 회귀를 추가한 뒤14개가 통과했습니다. 통합과 영향받는 P07/P08 집중 검사15개도 통과했습니다. 경로와 종료 대기 수정은 각각 한 번 컴파일한 뒤 실제 실행으로 확인했습니다. 커밋된 코드의 새 전체270개·최신 녹화·원격 실행·보호 반영은 계속 필요합니다.
