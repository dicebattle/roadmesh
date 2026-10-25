# P12 corrected hosted acceptance / P12 수정 원격 수용

Source e393d1fd6271053748afe079526577ffce259e64, runtime45f3b1315195c5374ae89dd9e6b8a3ee3357ae77ceb2475b9b505d06fc81d12d. Push40150705384 and PR40150709172 both passed358 and Node22/24 each296. The workflow now preserves the missing original XML. The first run remains rejected separately; no local XML was inserted into downloaded originals.

소스·실행지문은 위와 같습니다. 푸시·PR 모두358개·Node각296개를 통과했고 작업 흐름이 빠졌던 XML 원문을 보존합니다. 첫 실행은 별도 거부 기록으로 유지하며 내려받은 원문에 로컬 XML을 넣지 않았습니다.

Main independently checked15,975 unique inventoried hashes, the same-run354-input/15-row matrix, domain3,289 hashes with native171/442 and real TCP reset/stall, client2,484 hashes and original browser/native bindings, gateway2,783 hashes, node/traffic proof and standard Ed25519 signatures/durable state. Exactly26 declared map binary omissions are recorded by the whole audit; these bytes were not verified from hosted downloads. Original hosted cleanup is checked from its diagnostics; local PIDs/ports are not queried as remote proof.

메인은 독립 원문 해시15,975개·같은 실행354입력/15행 행렬·업무 장애3,289해시와 실제171/442/TCP 중단·무응답·클라이언트2,484해시/엔진 연결·중계2,783해시·노드/교통·표준서명·영속 상태를 확인했습니다. 전체 감사의 선언한 지도 바이너리 제외26개는 원격 다운로드에서 바이트를 확인하지 않은 범위입니다. 원격 정리는 원래 진단으로 확인하며 로컬 프로세스를 원격 증거로 세지 않습니다.

The first corrected-run whole-audit invocation incorrectly required an output inventory inside the small scenario runtime seal. Preserve its failed log. That seal has an assertions hash, not its own inventory; its exact bytes are inventoried by the parent. The auditor now checks the parent-bound seal identity/cleanup separately, then passed without product or original changes. Final domain/matrix audits separately check exact original assertion bindings. This correction does not excuse missing evidence.

수정 실행의 첫 전체 감사는 작은 실행 봉인 파일에도 출력 목록을 요구하는 감사기 오류로 실패했으며 로그를 보존합니다. 봉인은 별도 목록 대신 판정 해시를 가지며 부모 목록이 정확한 바이트를 검사합니다. 부모에 연결한 식별·정리를 별도로 검사하도록 수정한 뒤 제품·원문 변경 없이 통과했습니다. 업무·행렬 감사가 원 판정 연결을 따로 확인하며 이 정정으로 없는 증거를 허용하지 않습니다.

PR13 merged the exact checked e393d1f as1f1f1a082dbf33a578ddd0545d9a2613374f9542 at2026-10-25T01:54:29Z. Strict Required checks bound to GitHub App15368, enforced administrators, and no force pushes/deletion remain enabled. No bypass or admin merge was used. See before/after protection and merge read-backs.

PR13의 검사한 커밋을 위 병합 커밋으로 정상 반영했습니다. GitHub 앱15368에 연결한 엄격 필수 검사·관리자 포함·강제 푸시/삭제 금지를 유지했고 우회·관리자 강제 병합을 쓰지 않았습니다. 전후 보호·병합 재조회 원문을 포함합니다.

Ordered archive parts retain every present downloaded original. Reconstruct them with `cat originals.tar.gz.part* > originals.tar.gz`, verify archive SHA-256 from archive-verification.json, then extract into a new directory. original-files.json.gz lists exact file hashes. Archive integrity and product acceptance are distinct records.

순서대로 조각을 합친 뒤 묶음 확인 파일의 해시와 대조하고 새 폴더에 풉니다. 압축 목록은 정확한 파일 해시를 담고 있으며 묶음 무결성과 제품 수용은 구분합니다.
