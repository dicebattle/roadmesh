# P13/P14b hosted acceptance / P13·P14b 원격 수용

Push [40155530440](https://github.com/dicebattle/routelens/actions/runs/40155530440) and PR [40155546456](https://github.com/dicebattle/routelens/actions/runs/40155546456) passed at clean source 5c4f098b476bffa9a950441cf4bc006d90b1d4e0: whole 390 and Node.js 22/24 each 303, media provenance and generated Worker bindings. Runtime ba9395ec5ba3ac6dc5d1e296a9334b0bbebd72053b46674692f1c58a84556bfa matches the accepted local run and actual recording. No Cloudflare account or remote deployment was used.

깨끗한 소스에서 푸시·PR 양쪽 모두 전체 390개·Node.js 22/24 각각 303개·미디어 출처·생성 타입을 통과했습니다. 실행 지문은 로컬 수용·실제 녹화와 같으며 Cloudflare 계정·원격 배포는 사용하지 않았습니다.

Main independently checked **16,236 unique original hashes**, all 390 assertions, the exact 354-input/15-row P12 matrix, actual native errors 171/442 and TCP faults, 27 client native pairs/12 browser bindings, 38 gateway native pairs, 44 node native requests and standard Ed25519 signatures/durable state. P13 checked 185 original hashes, **11 complete PostgreSQL/Worker result pairs**, 14 actor databases and 21 SQLite files including preserved WAL. Originals still match their hashes after read-only copied-database inspection. [Audit commands](p13-first-hosted-audit-commands.json), [whole](p13-first-hosted-whole.json), [SQLite/parity](p13-first-hosted-cloudflare.json).

메인이 독립 원문 해시 16,236개·전체 판정 390개·같은 실행의 입력 354개/행렬 15행·실제 엔진 오류와 TCP 장애·클라이언트/중계/노드 원문 연결·표준 서명·저장 상태를 확인했습니다. P13 원문 185개·전체 집계 11쌍·객체 DB 14개/SQLite 21개를 검사했고 복사본을 읽은 뒤에도 원문 해시가 일치했습니다.

Exactly **26 manifest-declared map binaries** were omitted by hosted artifact projection. These absent bytes are not byte-verified. All present files, including original XML, native logs, traffic archives, PNG/WebM and SQLite/WAL/SHM, remain unchanged. Hosted cleanup uses original recorded diagnostics, not queries to local PIDs/ports. [Recorded omission list](p13-first-hosted-whole.json).

원격 업로드에서 정확히 선언한 지도 바이너리 26개가 제외됐으며 없는 바이트를 검증했다고 주장하지 않습니다. 존재하는 XML·엔진 진단·교통 파일·화면·SQLite/WAL/SHM 전체를 그대로 보존합니다. 원격 정리는 원래 기록만 확인하며 로컬 프로세스 질의를 사용하지 않습니다.

All **16,603 downloaded original files** are retained in five ordered archive parts (85,290,480 bytes). Concatenate with `cat originals.tar.gz.part* > originals.tar.gz`, compare SHA-256 with [the archive receipt](archive-verification.json), then extract into a new directory. [Inventory](original-files.json.gz) lists every original hash. Main separately extracted and rehashed all files: [extraction proof](extracted-originals-verification.json). Supplemental audits and Actions logs are outside the immutable original archive.

내려받은 원문 16,603개를 다섯 조각으로 보존합니다. 순서대로 합친 뒤 묶음 영수증의 해시와 대조하고 새 폴더에 풉니다. 메인은 별도 폴더에서 모든 파일 길이·해시를 다시 확인했습니다. 추가 감사·Actions 로그는 불변 원문 묶음 밖에 둡니다.

The auditors bind to the versioned accepted local manifest, exact hosted source and runtime. Only reference locations/output labels changed from earlier independent tools; no runtime criterion was relaxed. Protected integration is tracked by [PR #14](https://github.com/dicebattle/routelens/pull/14). Its final documentation head must pass required checks before a normal merge. Actual Cloudflare hosted concurrency, geographic 100/100 review, real mobile driving and live traffic remain separate gates.

감사기는 버전 관리된 로컬 수용 목록·정확한 원격 소스·실행 지문에 연결합니다. 과거 도구의 참조 위치·출력 이름만 바꿨고 판정은 완화하지 않았습니다. 최종 문서 커밋도 필수 검사를 통과한 뒤 PR #14를 정상 보호 병합합니다. Cloudflare 원격 소비자 동시성·실제 지역 100/100·모바일 주행·실시간 교통은 별도입니다.
