# P05 development evidence / P05 개발 증거

These are incomplete development runs using the previously built Seoul graph. They are not the final clean-source, fresh whole-system proof.

기존 서울 그래프를 재사용한 미완료 개발 실행입니다. 깨끗한 소스에서 그래프부터 새로 만든 최종 전체 증거가 아닙니다.

- 01: nine trips reached READY; duplicate/conflict checks passed. A malformed wrong-graph fixture failed before worker startup. Corrected to another valid64-hex graph ID without relaxing production validation.
- 02: Unix-socket readiness observed the image's temporary initialization server; settings query lost connection. Corrected to TCP readiness and actual settings/version read-back.
- 03:18 checks passed, including actual process recovery and215 stored baseline traversals. The3002nd sample correctly returned429, while the harness expected422. Store retained exactly3001 samples. Corrected the expectation; the remaining API/DB-restart and retention matrix had not run.

- 01:여행9개 READY·중복/충돌 검사는 통과했고 잘못된형식의 지도ID 시험이 처리자 시작 전에 거부됐습니다. 제품 검증을 유지하고 형식이 유효한 다른 해시로 고쳤습니다.
- 02:초기화용 임시 서버를 준비 완료로 오인해 설정조회 연결이 끊겼습니다. TCP 준비와 실제 설정/버전 조회로 고쳤습니다.
- 03:실제 프로세스 복구·기본 통과215개를 포함한18검사가 통과했습니다.3002번째표본은정확히429로거부됐지만시험이422를예상했습니다. 저장소는3001개를유지했고기대값을고쳤습니다. API/DB재시작·보관/철회후반은미실행입니다.

[Independent partial inspection](main-development03-verification.json) and [live PostgreSQL read-only observation](main-live-development03.json) distinguish proven results from unfinished scope. Failed attempts, cleanup and actual image/settings are retained under01/02/03. Complete raw development outputs remain ignored under data/; these compact records contain only synthetic/metadata evidence.

독립 부분검사·실행중DB조회는 확인한 결과와 미완료 범위를 구분합니다.01/02/03의 실패·정리·실제 이미지/설정을 보존하며 전체 개발 원문은 data/에 남깁니다. 이 작은 기록에는 합성·메타데이터만 포함합니다.
