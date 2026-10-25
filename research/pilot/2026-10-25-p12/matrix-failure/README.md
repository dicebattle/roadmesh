# Rejected first clean P12 matrix / 첫 깨끗한 P12 행렬 거부

Status: **REJECTED**, despite the original internal358 PASS. Main's independent audit could not reproduce the persisted matrix assertion hash. This directory preserves the original result, not a successful P12 delivery. Source `8821c4d10a219f94ea1f2dd97fa6444c597d1efd`, dirty=false; runtime `728dc58f818a20b055e6a3128616e55f387638ab410e660d3d73efda21cf3888`; freshly built Seoul graph `4bbd483ce6f41b82bde5c082f9f315ef2a7c9751c368b6ee919fced75923993c`.

상태는 **거부**입니다. 원 내부358개 통과와 달리 메인의 독립 검사는 저장 행렬 판정 해시를 재현하지 못했습니다. 원 결과를 보존할 뿐 P12 성공 반영으로 세지 않습니다. 깨끗한 소스·실행 지문·새 서울 지도를 위에 명시합니다.

## Confirmed cause / 확인한 원인

The old matrix recorded `e8fba21822d114cee1f8bb35f85e12e6944992f431f163833b73055fc46f4813`, while the saved JSON recomputed to `ace98afd85b73430c08272e86f6dc93f00b17328f9cb352f1269bd3c35f67a76`. Three raw `pg` timestamp Date objects in `p06-late-just-before`, `p06-late-exact` and `p06-late-after` were treated as empty objects by in-memory canonicalization, but stored as ISO strings by JSON.stringify. Reviving exactly these three dates reproduces the original hash. The S06 individual `p06-late-exact` reference also differed. [Exact diagnosis](date-diagnosis.json), [initial read-only diagnosis](initial-diagnosis.json).

원 행렬은 위 첫 해시를 기록했지만 저장 JSON을 다시 계산하면 두 번째 해시가 나왔습니다. P06 지연 완료 세 경우의 `pg` Date 객체를 메모리 정규화는 빈 객체로, JSON 저장은 ISO 문자열로 표현했습니다. 정확히 세 날짜를 복원하면 원 해시가 재현되며 S06의 개별 참조도 불일치했습니다. 초기에는 Buffer 가능성을 원인처럼 설명했으나 직렬화된 Buffer 값은 없었고, 위 확정 진단으로 정정합니다.

The correction materializes strict persisted JSON before matrix hashes and verification. It does not change global canonicalization, JWS, existing request hashes, engine policy or the original evidence. Date/Buffer/typed-array round trips are covered. Focused matrix2/2 and complete296/296 passed after correction. [Unit output](matrix-fix-all-unit.log.gz), [copied-input regression](matrix-fix-regression.json). The corrected validator rejects the old matrix, while a derived copy matches saved input bytes. This regression does not rehabilitate the old whole run; a new clean358 and independent audit remain mandatory.

보정은 행렬 해시·검증 전에 저장될 엄격 JSON 표현을 확정합니다. 전체 정규화 함수·서명·기존 요청 해시·엔진 정책·원 근거는 바꾸지 않습니다. 날짜/Buffer/타입 배열 왕복을 검사했고 집중2개·전체296개를 통과했습니다. 보정 검증기는 원 행렬을 계속 거부하고 별도 파생 복사본만 저장 입력과 일치시킵니다. 이전 실행을 다시 성공 처리하지 않으며 새 깨끗한358개·독립 감사를 요구합니다.

## Preserved originals / 보존 원문

[Archive verification](archive-verification.json):16,223 original files, exactly32 map omissions with [original hashes](omitted-map-files.json),83,684,898 compressed bytes in four ordered20MiB-or-smaller parts. Archive SHA256 `893befb236521d6a100338281df820017d176b4319d200d4c2e7b60b33565795`; exact listing and concatenated reconstruction passed. [Original file inventory](original-files.json.gz). Extract the parts together into a new empty directory to inspect the complete original report with its relative evidence. The separate `original-report.html` retains original bytes and is not the current demonstration.

원문16,223개를 네 조각으로 보존하고 지도32개만 원 해시와 함께 제외했습니다. 압축 크기·묶음 해시·정확한 목록·합쳐서 복원한 결과를 검사했습니다. 조각을 합쳐 새 빈 폴더에 풀면 상대 근거가 연결된 원 보고서를 볼 수 있습니다. 별도 원 HTML은 바이트를 보존한 것이며 최신 시연이 아닙니다.

[Failed independent audit](independent-failure.log.gz), [audit source](inspect-p12-whole.mjs), [original internal manifest](original-manifest.json), [original358 assertions](original-assertions.json.gz), [domain originals](domain-originals.json). The domain inspection checked3,294 listed hashes and native171/442/request/identity bindings; that partial success does not repair the matrix failure. The actual stall was4,004.929ms for A and5,658.665ms total via B. [Live read-only SQL](live-read-only-sql.json) separately observed15 traversals, one publication and all three consumers at the same sequence1/snapshot.

감사 실패·검사 코드·원 내부 목록·358개 판정·업무 오류 원문을 보존합니다. 업무 검사의 해시3,294개·엔진171/442/요청/식별 연결은 부분 근거이며 행렬 실패를 고치지 못합니다. 실제 A 무응답은 약4.005초, B를 통한 전체는 약5.659초였습니다. 별도 읽기 전용 실제 SQL에서 통과15개·게시1개·세 수신자의 같은 순번1/자료를 관찰했습니다.

A fresh demo fixture was prepared, then explicitly stopped before recording when the independent failure was discovered. [Shutdown receipt](demo-preparation-stop.json) confirms exit0 and owned cleanup; no video or demo success is claimed. The original whole-run process log is [retained](whole-process.log.gz).

새 데모 준비는 독립 실패를 발견한 뒤 녹화 전에 명시적으로 중단했습니다. 종료0·소유 정리 영수증을 보존하고 영상·데모 성공을 주장하지 않습니다. 원 전체 실행 로그도 남깁니다.
