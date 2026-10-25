# P14b complete implemented-pilot CI / P14b 구현 파일럿 전체 CI

Current acceptance / 현재 수용 (2026-10-25): P01–P14 local-pilot runtime acceptance is complete locally and on GitHub Actions: whole 390, Node.js 22/24 each 303. Main independently checked 16,236 hosted original hashes, 11 complete PostgreSQL/Worker pairs and 21 SQLite copies across 14 actors. The runtime fingerprint matches the accepted local run and actual recordings. Protected integration and the latest checked head are tracked by [PR #14](https://github.com/dicebattle/routelens/pull/14). Geographic 100/100, real driving, live traffic and production deployment remain separate.

P01~P14 로컬 파일럿의 실행 검증을 로컬과 GitHub Actions에서 마쳤습니다. 전체 390개와 Node.js 22·24 각각 303개를 통과했고, 메인이 원격 원문 해시 16,236개·집계 전체 11쌍·객체 14개의 SQLite 복사본 21개를 독립 확인했습니다. 실행 지문은 수용한 로컬 실행·실제 녹화와 같습니다. 보호 병합과 최신 검사 커밋은 [PR #14](https://github.com/dicebattle/routelens/pull/14)에서 확인합니다. 실제 지역 100/100·실주행·실시간 교통·운영 배포는 별도입니다.

Earlier checkpoint / 이전 중간 기록:

Status: implemented gate with clean local390 acceptance; final hosted/protected acceptance remains. See the [actual report](../research/pilot/2026-10-25-p13/report.md). Keep protected main and the existing GitHub-App-bound strict `Required checks`. Both Node22/24 unit suites, media provenance and generated Worker bindings must pass. The actual-engine job rebuilds pinned Seoul roads, starts every implemented P01–P13 module and requires all390 assertions, including32 P13 and the unchanged P12 S01–S15 matrix.

상태: 조건을 구현하고 깨끗한 로컬390개를 수용했으며 최종 원격·보호 반영은 남습니다. main 보호와 기존 GitHub 앱에 연결한 엄격 필수 검사를 유지합니다. Node22/24 단위·미디어 출처·생성 Worker 바인딩을 요구하고 실제 엔진 작업이 고정 서울 지도를 새로 만들어 P01~P13 전체·390개·P13의32개·기존 P12 행렬을 검사합니다.

Preserve original XML in addition to JSON/text/SQL/HTML, native logs/process identities/traffic archives, browser PNG/WebM and the complete local Cloudflare SQLite/WAL/SHM set. Exact declared map binary omissions remain explicit. Missing required original evidence is incomplete even if the test count is green. Temporary local processes and private configuration must be cleaned before a manifest can pass; diagnostics stay available after failure.

기존 원문에 XML과 Cloudflare SQLite/WAL/SHM 전체를 추가 보존합니다. 엔진 진단·프로세스 식별·교통 파일·화면 PNG/WebM도 유지하고 정확한 지도 바이너리 제외는 명시합니다. 검사 수가 통과해도 필수 원문 누락은 미완료이며 임시 프로세스·비공개 설정 정리를 통과한 뒤에만 목록을 성공으로 만듭니다. 실패 진단은 보존합니다.

The first P12 hosted simulation job took1468s of its1500s budget, with no assertion failure. P13 adds actual workerd startup, queue retry and three restarts. Set only the whole-job timeout to35min to include the measured workload plus this added module. Per-request4s/12s deadlines, contributor thresholds, expiry and all acceptance assertions remain unchanged. This is not a faster-latency claim.

첫 P12 원격 작업은 실패 없이1500초 중1468초를 사용했습니다. P13의 실제 workerd 시작·큐 재시도·재시작 세 번이 더해지므로 전체 작업 제한만35분으로 정합니다. 요청4초/12초·기여자 기준·만료·판정은 그대로이며 더 빠른 지연을 주장하지 않습니다.

Before completion: clean local390, direct original/SQLite/signature/native/browser inspection, actual recording and bilingual report, versioned-file link/privacy/media checks, branch push/read-back, hosted390 and303+ unit results inspected at the exact SHA, then normal protected PR merge. Geographic100/100, real mobile driving, live traffic, public peers and production Cloudflare deployment remain separate projects/gates. Pilot completion must never imply them.

완료 전 깨끗한 로컬390개·원문/SQLite/서명/엔진/브라우저 직접 검사·실제 녹화·한영 보고·버전 관리 링크/개인정보/미디어·푸시 재조회·정확한 커밋의 원격390개/303개 이상 단위·보호 PR 병합을 요구합니다. 실제 지역100/100·모바일 주행·실시간 교통·공개 노드·Cloudflare 운영 배포는 별도이며 파일럿 완료와 구분합니다.
