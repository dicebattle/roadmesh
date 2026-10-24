# Simulation fixtures / 시뮬레이션 시험자료

`demo.json` is an integration template. Its `graph_id=BIND_FRESH_GRAPH` is deliberately invalid as a direct simulation input. `npm run simulation:check -- --output NEW_DIRECTORY` builds a fresh P02 graph and writes `simulation-spec.json` with that actual graph identity. For an individual rerun, use that generated spec and the corresponding graph directory.

`demo.json`은 통합 실행용 틀입니다. `graph_id=BIND_FRESH_GRAPH`는 개별 실행의 유효한 입력이 아닙니다. 통합 명령은 P02 그래프를 새로 생성하고 실제 식별자가 들어간 `simulation-spec.json`을 저장합니다. 개별 재실행에는 생성된 규격과 대응 그래프 폴더를 사용합니다.

`p02-reference.json` preserves a previous real-engine P02 bundle as base64-encoded files for engine-free integrity unit tests. It is not current integration evidence and the integration runner never reads it. All geometry is the repository's original fictional equatorial fixture, not personal location history.

`p02-reference.json`은 엔진 없는 무결성 단위 검사를 위해 과거 실제 P02 묶음을 base64 파일로 보존합니다. 현재 통합 증거가 아니며 통합 실행기는 읽지 않습니다. 지형은 직접 만든 가상의 적도 시험망이고 개인 위치 이력이 아닙니다.

Distance policy supports `tiny-city-v1` only, longitude [-0.001,0.013] and latitude [-0.003,0.004] degrees. It uses the declared equatorial plane, not a geodesic accuracy guarantee outside this controlled fixture.

거리 정책은 `tiny-city-v1`, 경도 [-0.001,0.013]·위도 [-0.003,0.004]도만 지원합니다. 선언한 적도 평면을 사용하며 통제된 시험망 밖의 측지 정확도를 보장하지 않습니다.
