# Route gateway / 경로 중계

[Fixed contract](../../docs/29-p10-route-gateway.md). Main owns design/review and direct execution; existing Sol core/integration agents implement separate files. Local actual development32, clean whole302, current media and hosted302/252 passed with independently inspected originals; final protected delivery remains pending. [Development proof](../../research/pilot/2026-10-25-p10/development/README.md).

메인이설계·검토·직접실행하고기존Sol코어/통합담당자가파일을나누어구현합니다. 실제 개발32개·깨끗한 전체302개·최신 미디어·원격302/252개와 독립 원문 검사를 통과했으며 최종 보호 반영이 남았습니다.

The authenticated loopback API accepts strict car/prefer_live requests and selects from two configured P09 nodes. An independent P07 consumer controls target identity; P08 supplies immutable generation bytes. Match exact graph/generation/snapshot/costing/image before dispatch, retry once on the other matching node, and recheck authoritative state before returning. Version changes fail explicitly.12s shared deadline,4s per attempt,8 admissions and bounded serial DB operations prevent unbounded work. The narrow P09 remaining-deadline header preserves its old30s default when absent.

인증로컬API는엄격한자동차/prefer_live요청을받아설정한두P09노드를선택합니다. 독립P07수신자가대상을정하고P08불변세대를재사용합니다. 정확한지도/세대/교통/비용/엔진을대조하고같은대상의다른노드에한번만재시도하며반환직전권위상태를재검사합니다. 버전변경은명시실패합니다. 전체12초·시도별4초·접수8개·제한된직렬DB작업을사용하고P09기한헤더가없으면기존30초를유지합니다.

Public responses contain only allowed route/version fields and bilingual warnings. Live coverage uses ordered matched partial edge lengths intersecting accepted live records, including repeated edges; a detour can have coverage0 despite a live snapshot. The broader product draft's explicit base_only policy is currently rejected as unsupported. Arbitrary URLs, redirects, oversized node responses, mismatched request/geometry/provenance and stale results are rejected. Node enrollment, response signatures, public-peer honesty and production deployment remain outside this local module.

공개응답은허용경로/버전필드·한영경고만포함합니다. 실제부분구간길이와수용구간의교집합으로반복구간까지적용률을계산하므로LIVE자료가있어도우회경로의적용률은0일수있습니다. 제품초안의명시적base_only는현재미지원으로거부합니다. 임의주소·리다이렉트·과대응답·요청/지형/출처불일치·낡은결과를거부합니다. 공개노드등록·응답서명·노드정직성·운영배포는범위밖입니다.

## Clean whole result / 깨끗한 전체 결과

Clean2056521 passed252 unit tests and the fresh whole302. Main independently inspected9,838 listed hashes and all module originals; the current59.75s recording and EN/KO390px viewer passed review. [Current report](../../research/pilot/2026-10-25-p10/report.md). [P10 hosted inspection](../../research/pilot/2026-10-25-p10/hosted/README.md) passed9,691 hashes; protected delivery is pending; P09 protected ancestry has been incorporated without runtime changes.

깨끗한2056521에서 단위252개·새 전체302개를 통과했습니다. 메인이 목록 해시9,838개·모든 모듈 원문·현재59.75초 녹화·한영390픽셀 화면을 확인했습니다. P10 원격 해시9,691개 검사를 통과했고 보호 반영은 대기 중이며, P09의 보호 병합 이력은 실행 코드 변경 없이 연결했습니다.
