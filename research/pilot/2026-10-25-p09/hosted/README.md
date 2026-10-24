# Hosted P09 evidence / P09 원격 근거

[Run40130640754](https://github.com/dicebattle/routelens/actions/runs/40130640754) passed the fresh whole270 and Node22/24 each235. Its PR head is `e1b5932c2487746d62813176a7a429c56efdc451`; the actual checked-out merge-test source is `f84050c692e11f5e3f6881c5e7094f5cbdc42922`. Runtime fingerprint `d95a3627c0711e8df618e31ceb34c25bc17c7518ac06d0260eed358437152798` matches the locally verified recording.

위 원격 실행에서 새 전체270개·Node22/24 각각235개를 통과했습니다. PR원커밋과 실제 병합시험 커밋을 구분해 기록했고, 실행 지문은 로컬 검증 영상과 같습니다.

Main downloaded the selected original artifact and independently checked6,988 present listed hashes; all270 assertions, original state, previous aggregation/publication/traffic and P09 native/lifecycle evidence passed. P09 includes44 native route/trace pairs tied to21 successful API responses. The deadline response was30.010s and original DRAINING→RETIRED28.430s (observer28.405s). The inspectors require an explicitly supplied source SHA from GitHub metadata and the verified implementation fingerprint; they do not require different local/hosted commits to be identical.

메인이 원격 선별 결과물을 내려받아 존재하는 목록 해시6,988개·전체270판정·원상태·이전 집계/게시/교통·P09 엔진/수명주기를 독립 확인했습니다. 실제 경로/추적44쌍과 성공API21건을 대조했고 요청30.010초·원문정리28.430초(관찰28.405초)를 확인했습니다. 검사기는GitHub정보의 명시적 소스SHA와 같은실행지문을 요구하며 서로다른 로컬/원격커밋의동일성을잘못요구하지않습니다.

- [Whole inspection](whole-verification.json): exact18 allowed map omissions; no broad prefix skip. / 전체 검사: 정확한 지도18개 제외 허용·접두사 일괄 생략 없음.
- [Node inspection](node-verification.json): exact16 map omissions in its narrower scope; standard signatures and original native response checks retained. / 노드 검사: 더 좁은 범위의 지도16개 제외·표준서명·원엔진응답 검사 유지.
- [Traffic](traffic-verification.json), [aggregation](aggregation-verification.json), [publication signatures](publication-signature-verification.json), [durable publication state](publication-state-verification.json). / 이전 모듈 독립 검사.
- [Original selected files](originals.tar.gz), [run log](run.log.gz), [archive hashes](archive-sha256.json), [run metadata](run.json), [PR/source metadata](pr-source.json). Inspector-created files are outside the originals archive. / 선별 원문·실행 로그·압축 해시·실행/소스 정보. 검사기가 만든 파일은 원문 압축 밖에 둡니다.
- [Public README/media](public-media-verification.json): actual IAB GIF loaded800×450; downloaded MP4 matched the recorded hash. Owned tab closed. / 내장브라우저 공개GIF로딩·MP4해시 일치·소유탭종료.

Only recorded hosted cleanup is inspected; this local host cannot prove present remote PID/container/volume/port absence. Missing map bytes are explicitly listed, not byte-verified. Uninventoried tiny-city original binaries are outside this inspection claim. Private revoked-root config bytes were removed, so their exact loaded contents cannot be independently reconstructed. These limits are retained in the reports. Synthetic inputs on actual roads remain distinct from real-driving accuracy, public-peer honesty and production availability. Final-head required checks and protected merge follow.

원격 자원 정리는 보존된 기록만 검사하며 현재 원격 프로세스·컨테이너·볼륨·포트 부재를 이 로컬호스트에서 확인한 것으로 주장하지 않습니다. 누락지도는 정확히열거하고바이트검증을주장하지않으며목록밖tiny원본도검사범위밖입니다. 정리된키철회비공개설정의실제로딩바이트는독립복원할수없습니다. 실제도로위합성입력은실주행정확도·공개노드정직성·운영가용성과구분합니다. 최종커밋필수검사·보호병합을이어갑니다.
