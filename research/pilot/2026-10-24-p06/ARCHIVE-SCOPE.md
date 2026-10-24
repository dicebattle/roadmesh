# Archive scope and data license / 보존 범위와 자료 라이선스

`evidence.tar.gz` preserves the final clean local run's JSON, text, SQL, TSV, HTML and other non-graph-binary outputs with original relative paths. It omits all `.pbf` files, `tiles/` directories and the intentionally duplicated `tampered-graph/` fixture. Original manifests and hashes are unchanged, so verifying the extracted archive must explicitly report these omissions rather than treating the files as checked. The source PBF is independently pinned and available upstream; rebuilding can produce different graph bytes/IDs.

압축은 최종 깨끗한 로컬 실행의 JSON·텍스트·SQL·TSV·HTML 등 결과를 원래 상대경로로 보존합니다. 모든 PBF·tiles 폴더·중복된 변조그래프 시험자료는 제외합니다. 원래 명세·해시는 바꾸지 않았으므로 압축 검사 때 제외를 명시하고 검사한 것으로 세면 안 됩니다. 원본은 별도 고정·제공되지만 재생성 그래프의 바이트·식별자는 달라질 수 있습니다.

Extract into a new directory and serve it locally to follow all retained report links. Root `main-verification.json` and `aggregation/main-verification.json` are independent post-run inspection records, not original runner inventory members. Readable copies beside this archive are intentionally incomplete; the archive contains the underlying requests, engine responses, database read-backs, command diagnostics and recovery attempts.

새 폴더에 풀어 로컬에서 열면 보존한 원문 링크를 확인할 수 있습니다. 메인 전체·집계 검증 파일은 실행 이후 독립 검사이며 원래 실행기 목록에 없음을 구분합니다. 압축 옆 복사본은 주요 자료만 포함하고 압축 안에는 요청·엔진 응답·DB 재조회·명령 진단·복구 시도 원문이 있습니다.

All vehicle positions and contributor identifiers are authored SYNTHETIC fixtures. OSM-derived coordinates, geometry and graph metadata retain © OpenStreetMap contributors and [ODbL1.0](https://www.openstreetmap.org/copyright); source is [Geofabrik](https://download.geofabrik.de/asia/south-korea.html),2026-10-23. RouteLens code and authored documentation remain Apache-2.0. No private credentials, raw real-person traces, or runtime private configuration files belong in this archive.

모든 차량 위치·기여자 식별자는 자체 합성 시험자료입니다. OSM 좌표·지형·그래프 정보는 OSM 기여자 표시와 ODbL1.0을 유지하고2026-10-23 Geofabrik 원본을 사용합니다. 코드·자체 문서는 Apache-2.0입니다. 인증정보·실제 개인 이동·실행 비공개 설정파일은 보존 대상이 아닙니다.

Archive SHA256: `4d45f93691ece8d01e321f804bd40dba79b2bc6ea3e12e627b8cc169a368d1d6`. / 압축 SHA256은 앞의 값입니다.
