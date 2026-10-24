# P12 scenario gap review draft / P12 시나리오 공백 검토 초안

Historical gap draft, not an implementation contract. The subsequent [fixed P12 design](32-p12-whole-scenarios.md) governs implementation. Main reviewed docs11 S01–S15 against all302 existing assertion IDs while the P10 worker-correction whole run executes in the separate checkout. P11 development32 adds the actual browser path. Existing stage evidence must be linked by exact assertion IDs and same-run hashes; a new summary must not invent an end-to-end result from unrelated historical runs.

이전 공백 초안이며 확정 구현 계약이 아닙니다. 후속 P12 확정 설계가 구현 기준입니다. 메인은 별도 폴더의 P10 전체 실행 중 docs11의15시나리오와 기존302개 판정 ID를 대조했습니다. P11 개발32개는 실제 브라우저 경로를 추가합니다. 기존 단계를 정확한 ID·같은 실행 해시로 연결해야 하며 서로 다른 과거 결과를 합쳐 새 종단 간 성공을 꾸며서는 안 됩니다.

Already represented: S01 baseline(P08/P09/P10/P11); S02 five contributors and two-node detour(P06 count5/P08/P09); S03 zero/one/four and duplicates(P06/P05); S04 signal wait and explicit PARKED exclusion(P06); S05 Seoul noise/gap and separately labeled tiny parallel ambiguity(P04); S06 duplicate/sequence-gap/delay bounds(P05/P06); S07 actual pre/post-commit kill and fencing(P05/P06/P07); S08 expiry and actual publisher service outage(P07), with P09/P10 HTTP502 explicitly not packet loss; S09 standard signatures, sequence/graph/scope rejection(P07/P08); S10 snapshot replacement and old-result rejection(P08/P09/P10/P11); S11 actual node kill, deadlines, both unavailable(P09/P10/P11); S14 store deletion read-back(P05/P06/P07); S15 normal cleanup plus owned startup SIGTERM(P11), broader supervisor interruption still needs review.

이미 근거가 있는 항목은 기본 경로,5명 집계와 두 노드 우회, 표본 부족·중복, 신호대기·명시 주차 제외, 서울 오차·누락과 별도 작은 평행도로, 순서·지연·중단 복구, 만료·게시 장애, 서명/순번/지도 거부, 교통 버전 교체, 노드 종료·기한, 삭제 재조회, 정상 정리·준비 중 종료입니다. HTTP502는 패킷 손실로 부르지 않으며 전체 감독 실행 중단은 추가 검토해야 합니다.

Potential gaps requiring concrete design after P11 delivery:
- Actual transport interruption/drop/blackhole between approved components, with original byte/timing evidence and unchanged request deadlines. Reuse Node HTTP/TCP and current private controls; do not add a public fault API or claim arbitrary Internet loss behavior.
- S12 distinct out-of-coverage versus genuine no-path behavior. Current UI bounds rejects input, but gateway/native errors must be inspected before defining new public reasons. A genuine no-path input needs an independently selected actual graph component or clearly labeled tiny regression; do not manufacture a native error as ordinary engine proof.
- S12 administratively revoked approved node while its process remains healthy. Current static approval is not dynamic public enrollment. Consider an explicit local trusted-config exclusion with restarted gateway and unchanged independent consumer, only if protocol/design supports it. Do not invent public-peer revocation consensus.
- S13 actual non-CAR rejection and isolation: inspect existing ingestion schema/aggregation input policy and prove rejection leaves persisted CAR rows/candidates unchanged. A broad synthetic namespace check alone may not demonstrate BUS contamination exclusion.
- S10 graph replacement scope: current pilot pins a graph; rejecting a different offered graph proves compatibility, not serving two graph versions during live graph migration. Record the exact supported scope rather than silently declaring migration implemented.
- S15 run-level failure/interrupt after services and browser are live: exact PID/start/container/volume/port cleanup, retained failure artifacts and nonzero exit, without stopping user services.
- A strict same-run S01–S15 evidence matrix must fail on missing/duplicate/skipped assertions, source/graph mismatch, absent raw evidence or cleanup failure. New cases should cover gaps rather than just duplicate current302/334.

P11 반영 뒤 확정할 공백 후보는 실제 통신 차단, 범위 밖과 진짜 경로 없음의 오류 구분, 살아 있지만 관리상 폐기한 승인 노드 배제, 자동차 외 자료 혼입 거부의 저장소 근거, 지도 교체 지원 범위, 서비스·브라우저 실행 중 전체 중단 정리입니다. 같은 실행의15시나리오 표는 누락·중복·생략·소스/지도 불일치·원문 부재·정리 실패를 실패로 처리하고, 기존 검사 숫자를 늘리기 위한 반복은 피합니다.

## Follow-up source inspection / 후속 소스 확인

The current gateway accepts only `profile:"car"`; ingestion authenticates vehicle identity but has no explicit vehicle-class contract in its principal. Native non-200 route replies currently collapse to `ENGINE_HTTP_ERROR` in `node_engine.ts`, so no-path and outside-coverage are not distinct end-to-end public outcomes yet. P12 must define those changes before calling S12/S13 complete. A road-map miss must not be confused with a failed/slow node. Current P10 approval is exactly two private static node entries; administrative removal needs an explicit supported configuration transition, not a new public enrollment claim.

현재 중계는 자동차 profile만 받지만 수집 인증 주체에는 차량 종류 계약이 없습니다. 엔진의 비정상 HTTP 응답도 일반 엔진 오류로 합쳐져 범위 밖·경로 없음이 종단 간 공개 오류로 구분되지 않습니다. 따라서 P12에서 S12/S13 완료 전에 이 변경을 설계해야 합니다. 지도상 경로 부재를 노드 장애·지연과 혼동하면 안 됩니다. 노드 승인은 두 개의 비공개 정적 설정이므로 관리상 제거도 명시적인 설정 전환 범위로 설계해야 합니다.

## Actual candidate probe / 실제 후보 조사

[Main's21-input probe](../research/pilot/2026-10-25-p12-planning/README.md) found20 actual successful Seoul routes and one pre-native coordinate rejection. It did not find a true no-path case. [Pinned3.9.1 definitions](../wiki/sources/valhalla391-route-errors.md) distinguish170/171/442. Keep the contract draft until supported failures and their public provenance are fixed; do not manufacture a native failure to satisfy the matrix.

실제21입력 조사에서는 서울 경로20개 성공과 엔진 전 좌표 거부1개를 확인했으며 진짜 경로 없음은 찾지 못했습니다. 고정 버전 오류를 구분해 조사하고 지원할 실패·공개 출처가 확정될 때까지 계약을 초안으로 유지합니다. 행렬을 채우기 위해 엔진 실패를 꾸며 넣지 않습니다.

A later all-vertex candidate pass found actual171/442 outcomes under explicit bounded100m snapping; legacy defaults still route the same points. The [follow-up proof](../research/pilot/2026-10-25-p12-planning/README.md) supersedes only the earlier statement that no native fixture was found. The first results remain valid for their original inputs/options. Fix an opt-in policy and request/version-bound domain errors before implementation.

후속 모든 점 연결 조사에서 명시적인100m 대응 옵션의 실제171/442를 찾았지만 기존 기본 옵션은 같은 좌표를 경로로 처리했습니다. 앞선 입력·옵션의 결과를 지우지 않고, 네이티브 시험 입력을 아직 못 찾았다는 상태만 갱신합니다. 구현 전에 선택형 정책과 요청/버전에 연결된 오류 계약을 고정합니다.
