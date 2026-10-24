# Failed P06 design probe / P06 설계조사 실패

This is one design probe using the existing compiled P05-era matcher and an already verified Seoul graph, during ongoing uncommitted P06 implementation. It is **not** a clean-source P06 execution or final integration proof. The scenario's expected geometry/schedule values were fixed before running the real engine. Five target traversals and150ms error were required: only four were accepted and one accepted value exceeded the time bound. No success threshold or expected value was changed afterward.

진행 중인 P06 작업 폴더에서 기존에 컴파일한 P05 시기의 매칭기와 검증된 서울 그래프를 사용한 설계조사 한 번입니다. **깨끗한 P06 소스 실행·최종 통합 증거가 아닙니다.** 실제 엔진 실행 전에 지형·주행일정 기대값을 정했습니다. 대상5개·150ms를 요구했으나4개만채택됐고 그중1개가시각기준을넘었습니다. 실행뒤성공기준·기대값을바꾸지않았습니다.

- [Expected values before matching / 매칭 전 기대값](expected.json)
- [Observed failure / 실제 실패](summary.json)
- [Raw-evidence diagnosis / 원문 진단](analysis.json)
- [Execution / 실행](execution.json), [independent cleanup / 독립 정리](independent-cleanup.json)
- [Preserved original probe files / 원래 조사 파일 보존](raw-evidence.tar.gz)
- [Main correction design / 메인의 보정 설계](../../../../docs/24-observed-projection-policy.md)

Archive SHA256: `73f368785c76dd194b1a4c63beb0743f02a80d5fa33f4c979a7e14762e63f7a2`.
압축 원문 해시는 위 값입니다.

All vehicle observations are authored SYNTHETIC data. OSM-derived geometry retains © OpenStreetMap contributors, [ODbL1.0](https://www.openstreetmap.org/copyright), through Geofabrik's2026-10-23 South Korea source. Extract the archive into a fresh directory. It includes source observations, truth, expected values, engine requests/responses and diagnostics; truth was used to evaluate results, not supplied to the engine/adapter. Existing execution metadata reflects the design workspace at probe time and must not be mistaken for a final clean implementation fingerprint.

모든차량관측은자체합성이고OSM지형은기여자표시·ODbL1.0·Geofabrik원본출처를유지합니다. 새폴더에압축을풀면관측·정답·기대값·엔진요청/응답·진단을볼수있습니다. 정답은평가에만사용하고엔진/연결기에전달하지않았습니다. 실행메타데이터는조사당시작업폴더기준이며최종깨끗한구현지문으로해석하지않습니다.
