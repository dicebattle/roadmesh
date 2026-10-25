# Actual route client / 실제 경로 클라이언트

[Fixed design](../../docs/30-p11-route-client.md). The TypeScript client uses local MapLibre assets and original Seoul road geometry, an owned same-origin loopback server and the actual gateway/native nodes. It offers authored presets and in-bounds coordinates, EN/KO labels, request cancellation, monotonic authoritative event time, exact-expiry removal and explicit unavailable/timeout states. Gateway credentials stay server-side; the local session is not production authentication.

[고정 설계](../../docs/30-p11-route-client.md)에 따라 TypeScript 화면이 로컬 MapLibre·원래 서울 도로·소유 같은 출처 서버·실제 중계와 엔진을 사용합니다. 합성 좌표 선택과 범위 안 입력·한영 안내·요청 취소·단조 승인 시각·정확한 만료 제거·사용 불가/시간 초과 상태를 제공합니다. 중계 인증값은 서버에 두며 로컬 세션을 운영 인증으로 보지 않습니다.

Historical development checkpoint / 이전 개발 단계: focused core26 and integration21 passed; actual development32 passed with independently inspected originals and startup SIGTERM cleanup. [Development proof](../../research/pilot/2026-10-25-p11/development/README.md). Clean whole334, IAB verification, final recording/README, branch push, hosted originals and protected merge are still required. P10's final-hosted concurrency failure is being corrected separately before integration.

이전 개발 단계에서는 코어 집중26개·통합 집중21개와 실제 개발32개·독립 원문·준비 중 SIGTERM 정리를 확인했습니다. [개발 근거](../../research/pilot/2026-10-25-p11/development/README.md)를 보존하며 깨끗한 전체334개·내장 브라우저·최종 영상/README·푸시·원격 원문·보호 병합은 남았습니다. P10 최종 원격 동시 요청 실패를 별도로 수정한 뒤 연결합니다.

## Clean whole-system verification / 깨끗한 전체 검증

Clean c63c556 passed whole334 and unit285; main checked12,225 hashes,27 native pairs/12 browser bindings and cleanup. Manual390px IAB and an actual102.8s client recording passed. [Report](../../research/pilot/2026-10-25-p11/report.md). P10 protected ancestry is included; P11 hosted delivery remains.

깨끗한 소스에서 전체334개·단위285개를 통과하고 원문·엔진/브라우저 연결·정리를 독립 확인했습니다. 내장 브라우저390픽셀과 실제102.8초 화면 녹화도 통과했습니다. P10 보호 병합 이력을 포함했으며 P11 원격 반영이 남았습니다.

P11 hosted334/285 and protected PR12 now passed. [Hosted originals](../../research/pilot/2026-10-25-p11/hosted/README.md) include12,054 independently checked hashes.

P11 원격334/285개와 PR12 보호 병합을 완료하고 독립 해시12,054개의 근거를 보존했습니다.

## NAV-01 instructions / NAV-01 안내

Current client requests its native EN/KO locale, displays an ordered maneuver list and invalidates route/instructions on language changes. Existing input/failure/authority fencing remains. [Module](turn-guidance.md), [406-case evidence](../../research/pilot/2026-10-25-nav01/report.md). Earlier P11 checkpoints above are historical.

현재 화면은 한영 엔진 안내를 요청해 순서 목록으로 표시하고 언어 변경 때 경로·안내를 지웁니다. 기존 입력·실패·승인 경계를 유지하며 위 P11 중간 기록은 과거 상태로 보존합니다.
