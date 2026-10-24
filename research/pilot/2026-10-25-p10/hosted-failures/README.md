# Final-head concurrency failures / 최종 커밋 동시 요청 실패

Protected delivery stopped when the final head5a6d7d7cbf318022432adc2508c2cbe575b7de0a failed both hosted whole runs. Node22/24 unit tests passed, but the required aggregate check correctly failed. Earlier ecc8c9e hosted successes remain historical evidence and do not override these failures.

최종 커밋의 원격 전체 실행 두 건이 실패해 보호 반영을 중단했습니다. Node22/24 단위 검사는 통과했지만 전체 필수 검사는 정상적으로 실패했습니다. 앞선 커밋의 성공은 과거 근거로 보존하며 이번 실패를 덮지 않습니다.

| Run / 실행 | Actual executed source / 실제 실행 소스 | Observed failure / 관측 실패 |
| --- | --- | --- |
| [PR40135410268](https://github.com/dicebattle/routelens/actions/runs/40135410268) | dcdf6aee47e6cb1715c8af2a8f2e2d687c0f040a (merge test / 병합 시험) | All eight selection phases confirmed; status showed8 admitted and ninth429. Six requests returned504 with no native attempt; two returned200. / 선택 단계8개·접수8개·아홉째429 확인. 엔진 시도 없이6개504·2개200. |
| [Push40135406234](https://github.com/dicebattle/routelens/actions/runs/40135406234) | 5a6d7d7cbf318022432adc2508c2cbe575b7de0a | Only admission-0 reached selection. Six504 and two STORE_UNAVAILABLE503 responses; the supervisor later timed out waiting for missing phases. / 선택 단계1개만 도착.504 여섯 건·저장소 불가503 두 건 뒤 없는 단계 대기의 통신 시간 초과. |

Both actual sources have runtime fingerprint bebae7f5f5e7c8efed69627735ef82a2749570d1bba66937c3507dfe990dc538. Cleanup is marked verified in the preserved remote records; this is not a live query of the former remote host. Main inspected original HTTP responses, gateway attempts/results/status and child phase messages. The complete downloaded failed gateway stages, root failure and original source/graph manifests are preserved in the two archives below; unrelated earlier-stage raw bytes remain in the full local downloads. No whole-run success or full independent hash audit is claimed for a failed run.

두 실제 소스의 실행 지문은 같습니다. 보존한 원격 정리 기록은 성공이며 이전 원격 호스트를 지금 직접 조회한 것은 아닙니다. 메인은 원래 HTTP 응답·중계 시도/결과/상태·자식 단계 메시지를 검사했습니다. 실패 중계 단계 전체와 루트 실패·원래 소스/지도 목록은 아래 두 압축에 보존하며 앞선 다른 단계의 원문은 전체 로컬 다운로드에 남깁니다. 실패 실행에 전체 성공이나 전체 독립 해시 감사를 주장하지 않습니다.

- PR: [diagnostic extraction](pr-40135410268/main-failure-summary.json), [original gateway archive](pr-40135410268/gateway-originals.tar.gz), [exact archive inventory proof](pr-40135410268/archive-verification.json), [failed job log](pr-40135410268/failed-job.log.gz), [checks](pr-40135410268/run.json).
- Push: [diagnostic extraction](push-40135406234/main-failure-summary.json), [original gateway archive](push-40135406234/gateway-originals.tar.gz), [exact archive inventory proof](push-40135406234/archive-verification.json), [failed job log](push-40135406234/failed-job.log.gz), [checks](push-40135406234/run.json).

Source review found full-bundle loading and compilation repeated synchronously on the gateway HTTP event loop. Main's [local read-only timing](local-preparation-timing.json) measured eight loadTrafficBundle calls at4,434.674ms total; a10ms timer fired after4,435.080ms. This directly proves local event-loop blocking, not a remote CPU profile. The evidence supports moving the unchanged byte verification off the HTTP loop and sharing only exact in-flight preparation. [Correction contract](../../../../docs/29-p10-route-gateway.md). The12s overall/4s node deadlines and existing eight-success criterion remain unchanged. Correction validation, fresh whole302 and a new recording are required before merging.

소스는 전체 지도 검증·세대 생성을 HTTP 이벤트 루프에서 반복 동기 실행하고 있었습니다. 메인의 로컬 읽기 전용 측정에서 지도 검증8회는 총4,434.674밀리초,10밀리초 타이머는4,435.080밀리초 뒤 실행됐습니다. 이는 로컬 이벤트 루프 차단의 직접 근거이며 원격 CPU 분석은 아닙니다. 기존 바이트 검증을 유지한 채 HTTP 루프 밖으로 옮기고 정확히 같은 진행 중 준비만 공유하는 수정을 뒷받침합니다. 전체12초·노드4초·기존8개 성공 기준은 그대로 두며 수정 검증·새 전체302개·새 녹화 전에는 병합하지 않습니다.
