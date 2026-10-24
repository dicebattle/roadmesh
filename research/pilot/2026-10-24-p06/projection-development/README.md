# Preserved-input projection development check / 보존 입력 투영 개발 검사

The authorized second probe used the failed first probe's five input/expectation files byte-for-byte. v3 accepted all5 target traversals and15 overall. Each target duration error was below0.49ms; median-speed relative error was0.002742%, against unchanged150ms/2% criteria. [Summary](summary.json), [input identity](preserved-input-hashes.json), [execution metadata](execution.json), [cleanup](independent-cleanup.json), [raw archive](raw-evidence.tar.gz).

승인한 두 번째 조사는 실패한 첫 조사의 입력·기대값 5개 파일을 바이트 그대로 사용했습니다. v3는 대상 5개·전체 15개를 채택했고, 개별 시간오차 0.49ms 미만·중앙값속도 오차 0.002742%로 원래 150ms·2% 기준을 통과했습니다. 위 파일에 원문과 실행·정리를 보존합니다.

This is a development execution during ongoing implementation, not final clean-source P06 integration. The [subsequent flag guard](flag-guard.json) preserves upstream discontinuity on its original occurrence even when projection changes the point's associated occurrence. Only its newly affected regression was executed afterward; the final whole run must include the updated source.

진행 중인 개발 실행이며 최종 깨끗한 P06 통합 증거는 아닙니다. 이후 단절 표시 보강은 투영으로 구간이 바뀌어도 원래 구간에 엔진 단절 사유를 남깁니다. 해당 새 회귀검사만 별도 실행했으며 최종 전체 실행은 수정된 소스로 해야 합니다.

Vehicles and GPS are authored SYNTHETIC data. Geometry remains © OpenStreetMap contributors, ODbL1.0, via Geofabrik2026-10-23. Extract the archive into a fresh directory. The earlier failed probe remains preserved separately and is not relabeled as successful.

차량·GPS는 자체 합성이며 지형은 OSM 기여자·ODbL1.0·Geofabrik 출처를 유지합니다. 새 폴더에 압축을 풀어 확인하고, 이전 실패는 별도로 보존하며 성공으로 바꾸지 않습니다.
