# First Seoul integrated attempt / 첫 서울 전체 실행

Clean source `a7988deda8be7d06a87435b0a5898d4d044e8b1e`, Node22.23.4. `node dist/tools/seoul_checks.js --output data/seoul-main-20261024 --source data/seoul-source-20261023/south-korea-261023.osm.pbf` exited1. Tiny48 and the actual Seoul graph passed. The full workload, including three actual batch variants, executed; only `downtown-gap-accepted-precision` failed. Original evidence is preserved rather than relabeled as success.

깨끗한 소스·Node22.23.4의 위 명령은 종료1이었습니다. tiny48·실제 서울그래프는 통과했고 실제 배치세종류를 포함한 차량실행도 끝났지만 도심누락차량의 수용시간기준 하나가 실패했습니다. 원래 증거를 성공으로 바꾸지 않고 보존합니다.

Observed cause:from0–5000ms the noisy stationary observations were assigned to the preceding edge's end. At5500ms the engine assigned the next edge; the adapter accepted its entry at5000ms, losing the initial5s from a true traversal that began at0. Truth was used only to expose the evaluation error, not supplied to matching. The v2 policy will withhold ambiguous boundary-stop traversals based on original observed positions/time instead of assigning the stop to either edge. Timing and coverage acceptance thresholds stay unchanged.

원인:0~5000ms의 정지 잡음 관측이 이전 구간 끝에 대응됐습니다. 5500ms에 다음 구간으로 대응되자 연결기가 진입5000ms를 수용해 정답의 초기5초를 빠뜨렸습니다. 정답은 평가 오류 확인에만 썼고 매칭에 넣지 않았습니다. v2는 원관측 위치·시간에 근거해 경계 정지의 시간배분이 불명확한 통과를 보류합니다. 허용시간·범위기준은 유지합니다.

Derived map geometry:© OpenStreetMap contributors, ODbL1.0; vehicle activity is synthetic. / 파생지도는OSM·ODbL이며 차량은합성입니다.
https://www.openstreetmap.org/copyright
