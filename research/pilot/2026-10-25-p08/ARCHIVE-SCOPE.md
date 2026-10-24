# Archive scope / 압축 보존 범위

`evidence.tar.gz` contains the original clean local run plus the main agent's independent verification records. Extract it into a new directory; its root contains `report.html`, so `npm run report:serve -- EXTRACTED_DIRECTORY` can serve the complete relative evidence links.

압축에는 깨끗한 로컬 원 실행과 메인의 독립 검사 기록을 담았습니다. 새 폴더에 풀면 최상위에 `report.html`이 있으며 보고서 서버로 전체 상대 증거 링크를 열 수 있습니다.

Only regenerable map binaries are excluded: 24 `.gph`/`.osm.pbf` files across the real Seoul graph and tiny regression copies, plus two P08 `graph.tar` extracts. All 26 paths, original lengths and locally verified hashes are [listed](omitted-files.json). The exact traffic archives—including the deliberately truncated/corrupt cache and hidden precommit staging files—remain included. An archived omitted hash does not mean the omitted bytes were verified by a future downloader.

다시 만들 수 있는 지도 바이너리만 제외했습니다. 서울·작은 회귀와 그 복사본의 지도파일 24개, P08 그래프 묶음 2개이며 총26경로·크기·로컬 검증 해시를 명시합니다. 정확한 교통파일은 의도적으로 자르거나 손상한 캐시와 숨김 임시 파일까지 모두 보존합니다. 제외한 해시가 기록되어 있다는 사실을 내려받은 사람이 제외 바이트까지 검증한 것으로 보지 않습니다.

The report directory also contains 215 selected linked files for convenient browsing. The archive is the complete evidence source within the stated omission boundary. Private runtime configuration and signing keys were removed during owned cleanup and are not included. All vehicle/observation records are authored synthetic data. OSM-derived geometry remains subject to ODbL1.0; project code and prose use Apache-2.0.

보고서 폴더에는 편하게 열어 볼 수 있도록 링크 대상 215개를 별도로 복사했습니다. 명시한 제외 범위 안의 전체 근거는 압축을 사용합니다. 비공개 실행 설정·서명 키는 소유 자원 정리에서 제거해 포함하지 않았고, 차량·관측은 모두 직접 만든 합성입니다. OSM 파생 지형에는 ODbL1.0, 프로젝트 코드·설명에는 Apache-2.0을 적용합니다.
