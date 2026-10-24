# RouteLens 작업 기록

새 항목은 아래에 추가합니다. 기존 기록의 잘못된 주장은 새 정정 항목에서 해당 기록을 가리킵니다. 날짜는 Asia/Seoul 기준입니다.

## 2026-10-24 최초 설계 기준

- 상태: 설계 문서·라이선스·공개 저장소 생성. 당시 실행 모듈은 없었음.
- 기준 커밋: `88faf078e2dffad7ec72679f090e7411b6fb3e09`.
- 결정: [설계 결정 ADR-001~010](../docs/09-decisions.md), [개발 순서](../docs/05-roadmap.md).
- 증거: [공개 오픈소스 조회 결과](../research/upstream-snapshot.json). 엔진 성능·실제 운영비는 미측정.

## 2026-10-24 이름 확정과 기록 체계 적용

- 요청: Metro Lens에서 파생된 프로젝트 이름을 RouteLens로 확정하고 GitHub 저장소·로컬 폴더·문서에 적용. 향후 계획·구현도 저장소에 기록.
- 결과: `dicebattle/routelens`, 로컬 폴더명 `routelens`, 문서의 현재 제품명 RouteLens로 통일. 기존 커밋 이력과 공개 조사 스냅샷은 보존.
- 결정: [ADR-011~013](../docs/09-decisions.md). 기존 RM 작업 번호는 추적 가능성을 위해 유지.
- 기록 규칙: [사용자가 지정한 글의 적용 판단](sources/llm-wiki.md), [AGENTS.md](../AGENTS.md), [인덱스](index.md).
- 경계: 개인 대화 원문을 공개 위키에 복사하지 않음. 이번 작업은 이름 변경·로컬 구현·저장소 기록이며 서비스 배포는 없음.

## 2026-10-24 RM-001a 시험자료 검사 도구 구현

- 선택 이유: 경로 엔진을 평가하기 전에 입력의 출처와 검토 상태를 구분해야 함. [전체 계획](../docs/05-roadmap.md)의 첫 작업을 작은 하위 작업으로 분리.
- 구현: [검사 도구](../tools/evaluation_corpus.py), [합성 입력](../fixtures/evaluation/synthetic-seoul.json), [집중 테스트](../tests/test_evaluation_corpus.py).
- 동작: 형식·좌표·GPS 순서·중복·참조·검토 근거 검사. 합성·불확실·미검토 자료를 실제 검토 사례 100개 기준에서 제외. 구조 유효와 자료 준비 완료를 다른 종료코드로 구분.
- 검증 환경: Python 3.13.7, 로컬 실행.
- 검증 명령: `python3 -m unittest discover -s tests -p 'test_evaluation_corpus.py' -v` — 10개 통과, 한 번 실행.
- 실행 명령: `python3 -m tools.evaluation_corpus fixtures/evaluation/synthetic-seoul.json` — 형식 유효, 실제 검토 사례 경로 0/100·매칭 0/100, 미준비 판정.
- 종료코드: 기본 모드 0, `--require-ready` 1, 잘못된 입력 2를 집중 테스트에서 확인.
- 산출 근거: [모듈 문서](modules/evaluation-corpus.md), [입력 해시가 포함된 결과](../research/evaluation-corpus/2026-10-24-synthetic-report.json).
- 문서 검증: 내부 링크·코드 블록·JSON·이름 통일·결과 파일과 입력 해시 일치 검사 및 `git diff --check` 통과. 실제 GitHub 저장소 이름과 원격 주소도 `dicebattle/routelens`로 확인.
- 한계: 출처의 실제 이용 권리와 기대 결과의 사실성을 자동 확인하지 않음. 합성 자료의 서울 범위는 실제 시험 지역 확정이 아님. 경로 엔진 호출·지도 생성·실주행 검증은 미수행.
- 다음: RM-001b의 실제 지역·공개 원본·소수 검토 사례 선정, 이후 RM-001c 자료 확보와 RM-002 지도 생성으로 진행.
