# P08 endpoint representation correction / P08 끝점 표현 정정

The initial P08 local238 proof and34.7s recording remain in [the original report](../2026-10-25-p08/report.md). Hosted push [40120363512](https://github.com/dicebattle/routelens/actions/runs/40120363512) and PR [40120412439](https://github.com/dicebattle/routelens/actions/runs/40120412439) failed at P08 source selection, so main withheld merge. All prior206 cases passed; the source SHA256, source lock, Dockerfile and engine version match the local run.

최초 P08의 로컬238개·34.7초 녹화는 원래 보고서에 보존합니다. 원격 push와 PR 실행이 P08 원본 선택에서 실패해 메인은 병합을 보류했습니다. 기존206개는 통과했고 원본 해시·잠금·Dockerfile·엔진 버전은 로컬과 같습니다.

Main compared the original edge maps: the west start longitude is127.036993 locally and127.036994 on the AMD64 runner. All target OSM way identities, directed connections and car access remain the same. This is one polyline6 grid unit (about0.088m), while the old selector used a narrower1e-7-degree comparison. The exact underlying arithmetic cause is not established. [Original comparison](failed-hosted/main-comparison.json) · [Failed downloaded evidence](failed-hosted/evidence.tar.gz) · [Push log](failed-hosted/failed-console.txt) · [PR log](failed-hosted/pr-failed-console.txt).

메인이 원 구간 목록을 비교한 결과 서쪽 시작 경도가 로컬127.036993, AMD64 실행127.036994였습니다. 대상 OSM도로·방향 연결·자동차 접근은 같습니다. 소수6자리 지형의 한 칸인 약0.088m 차이를 더 좁은 옛1e-7도 비교가 거부했습니다. 정확한 하부 산술 원인은 확정하지 않았습니다.

Main fixed the [revised selection contract](../../../docs/27-p08-traffic-activation.md): permit at most one integer microdegree per axis, still require a unique candidate on the same OSM way and connected route, and preserve the original graph coordinates for every calculation. Two-unit drift, duplicate candidates and reversed geometry remain rejected. Contributor counts, median/timing limits, real detour and exact expiry gates are unchanged.

메인은 축별 정수 마이크로도 한 칸까지만 허용하고 같은 OSM도로·연결 경로의 고유 후보를 요구하며, 모든 계산에 원래 그래프 좌표를 보존하도록 계약을 정정했습니다. 두 칸 차이·중복 후보·역방향은 거부합니다. 기여자·중앙값/시간 한계·실제 우회·정확 만료 기준은 유지합니다.

Sol changed only the source selector and its focused regressions. Strict build and final3/3 source cases passed. An initial test fixture added floating-point values then compared them to a decimal literal with strict equality; that fixture-only error and one corrected retry are preserved. A separate source-only command using the actual downloaded hosted metadata produced15 trips/45 truth traversals without changing geometry; maximum authored duration error was0.478ms. It did not execute an engine or verify omitted graph binaries. [Focused/source evidence](source-verification.tar.gz) · [Hashes](preparation-hashes.json).

Sol은 원본 선택과 해당 집중 회귀만 수정했습니다. 엄격 빌드·최종3개 검사를 통과했습니다. 최초 검사에서 부동소수점 덧셈 결과를 소수 리터럴과 엄격 비교한 시험자료 오류가 나왔으며, 그 원문과 한 번의 수정 재검사를 보존합니다. 실제 내려받은 원격 메타데이터로 원지형 변경 없이15여행·정답통과45개를 생성했고 평균통과시간 오차는 최대0.478ms였습니다. 이 명령은 엔진 실행이나 제외된 지도 바이너리 검증이 아닙니다.

A fresh clean whole238 run, updated independent audit, recording, hosted checks and protected merge are required before calling the correction complete.

정정 완료를 위해 새 깨끗한 전체238개·갱신된 독립 검사·녹화·원격검사·보호병합을 다시 확인해야 합니다.
