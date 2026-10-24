# P05 concurrency correction during P07 delivery / P07 반영 중 P05 경쟁 수정

The [original P07 report](../2026-10-25-p07/report.md) records passed local/hosted206 checks. A later final-head PR execution exposed an intermittent P05 claim-selection defect and blocks protected merge. The earlier successes remain valid observations, but do not prove this interleaving correct. [Main correction contract](../../../docs/26-p05-claim-race.md).

원래 P07 보고서는 로컬·원격206개 성공을 기록합니다. 이후 최종 문서 커밋의 PR 실행이 간헐적인 P05 작업 선택 결함을 드러내 보호 병합을 보류했습니다. 앞선 성공은 관측 사실로 유지하되 이번 실행 순서의 정확성을 증명하지 않습니다.

- [Failed CI](failed-ci/evidence.tar.gz): original downloaded artifact, including failure, process results, read-backs and successful owned cleanup. CI already omitted graph binaries; no missing file is claimed rehashed.
- [Controlled reproduction](reproduction/summary.md): PostgreSQL18.6, actual production competing claim and a verified advisory barrier; [original results](reproduction/results.json), [full probe](reproduction/evidence.tar.gz).

실패 CI 원문에는 실패·처리자 결과·DB조회·정리 성공을 보존합니다. CI가 원래 제외한 그래프 바이너리를 재검사했다고 주장하지 않습니다. 통제된 재현은 실제 생산 claim·검증한 잠금 지점을 사용하며 원문과 실행자료를 보존합니다.

No real-person traces or private runtime credentials are included. OSM-derived evidence retains © OpenStreetMap contributors and ODbL1.0. Corrected whole-run proof and a current recording are still pending at this entry.

실제 개인 이력·실행 인증정보는 포함하지 않습니다. OSM 파생 근거는 기여자·ODbL1.0을 유지합니다. 이 기록 시점에는 수정한 전체 실행과 최신 녹화가 남아 있습니다.
