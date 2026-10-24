# Worker preparation measurement / 작업 스레드 준비 측정

The final P10 hosted concurrency failures exposed repeated synchronous full-bundle preparation. Main retained [both failed runs](../../2026-10-25-p10/hosted-failures/README.md), fixed the correction contract and reviewed Sol's implementation. All29 focused tests passed; a subsequent cleanup-metadata compatibility refinement was built without repeating healthy tests. Exact commands, order and file hashes are in [focused originals](focused-verification.tar.gz).

P10 최종 원격 동시 요청 실패에서 반복 동기 지도 준비가 드러났습니다. 메인이 두 실패를 보존하고 수정 계약을 확정해 Sol 구현을 검토했습니다. 집중29개를 통과한 뒤 정리 기록 호환 보완은 정상 검사를 반복하지 않고 빌드로 확인했습니다. 정확한 명령·순서·파일 해시는 집중 원문에 있습니다.

Using the unchanged actual Seoul bundle, main directly measured8 concurrent preparations: one in-flight job, eight separate byte verifications,654.749ms preparation and a10ms parent timer firing after10.123ms. All returned the same independently hashed baseline generation. The worker was terminated and cleanup verified. The [prior synchronous measurement](before.json) took4,434.674ms for eight bundle loads and blocked the10ms timer until4,435.080ms. These local measurements establish responsive preparation, not remote throughput or whole302 success.

같은 실제 서울 지도 묶음에서 메인이 동시 준비8개를 직접 측정했습니다. 진행 중 작업1개·별도 바이트 검사8개를 수행했고 준비는654.749밀리초,10밀리초 부모 타이머는10.123밀리초였습니다. 모두 독립 해시 확인한 같은 기본 세대를 반환했으며 스레드 종료도 확인했습니다. 이전 동기 측정은 지도 읽기8회에4,434.674밀리초가 걸려 타이머가4,435.080밀리초 뒤 실행됐습니다. 로컬 준비 응답의 근거이며 원격 처리량·전체302개 성공은 아닙니다.

[Main proof](main-verification.json), [measurement script](measure.mjs), [original worker records/generation](originals.tar.gz), [archive hashes](archive-hashes.json). Source5a6d7d7 was dirty, runtime0b37b365f8ffc8636f7455d5ac64f0c7734d94ba09497813f015150d7badc521. Clean whole302, independent inspection, new actual recording and protected hosted delivery remain required.

메인 근거·측정 스크립트·원래 작업 기록/세대·압축 해시를 보존합니다. 미커밋 소스와 실행 지문을 기록하며 깨끗한 전체302개·독립 검사·새 실제 녹화·원격 보호 반영은 남아 있습니다.
