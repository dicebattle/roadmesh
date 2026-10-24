# Seoul durable ingestion proof / 서울 영속 수집 검증

**Local result: PASS, 111/111 assertions = tiny regression48 + Seoul29 + P0534.** The final run completed at `2026-10-24T12:37:00.257Z` from clean source `0c7036af545c1f454ab2749cd29b17ce3c78811c`. Main designed and independently inspected the result; Sol (`gpt-6.1-sol`, core and integration agents) implemented the code and tests. Hosted Linux verification also passed; see the independently inspected evidence below.

**로컬 결과: 전체111/111 통과 = 작은 회귀48 + 서울29 + P0534.** 위 깨끗한 커밋으로 최종 실행을 완료했습니다. 메인이 설계·독립 검사를, Sol의 코어·통합 담당이 구현·테스트를 맡았습니다. 원격 Linux 검증도 통과했으며 아래 독립 검사 근거를 기록합니다.

[Recorded playback / 실제 녹화](https://raw.githubusercontent.com/dicebattle/routelens/920d48d74f5557b60a877a1515ce7cd6e442c21c/docs/media/demo.mp4) · [Interactive report / 재생 보고서](report.html) · [Main inspection / 메인 독립 검사](main-verification.json) · [Root manifest / 전체 명세](manifest.json) · [P05 assertions / P05 검사](ingestion/assertions.json) · [Module guide / 모듈 안내](../../../wiki/modules/durable-ingestion.md)

![Actual Seoul playback / 실제 서울 재생](https://raw.githubusercontent.com/dicebattle/routelens/920d48d74f5557b60a877a1515ce7cd6e442c21c/docs/media/report-en.png)

## What ran / 실행한 구성

The command built a fresh actual-Seoul Valhalla graph from a pinned OSM source, generated nine synthetic vehicle/GPS streams, ran real map matching, then started a real loopback HTTP service, PostgreSQL18.6 with a dedicated persistent volume and separate Node workers. The primary map is actual Seoul; tiny-city is regression-only. No mocked database, queue or engine replaces these processes.

고정 OSM 원본으로 실제 서울 Valhalla 그래프를 새로 만들고 차량·GPS9개 흐름 생성과 실제 경로 매칭을 실행했습니다. 이어 로컬 HTTP·영속 볼륨이 있는 PostgreSQL18.6·별도 Node 처리자를 띄웠습니다. 실제 서울이 주요 지도이고 작은 도로망은 회귀용이며 DB·큐·엔진을 모형으로 대체하지 않았습니다.

```sh
npm ci
npm run build
npm run simulation:check -- --output data/new-p05-run \
  --source data/seoul-source-20261023/south-korea-261023.osm.pbf
npm run report:serve -- data/new-p05-run
```

Use Node22 or24, Docker and a new output directory. Omit `--source` to download/cache the pinned source. The actual final local execution used Node22; the source commit and graph identity are recorded rather than inferred from the later documentation commit.

Node22·24와 Docker를 사용하고 출력 폴더를 새로 지정합니다. `--source`를 생략하면 고정 원본을 내려받아 캐시합니다. 최종 로컬 실행은 Node22였으며 실행 소스·그래프 식별자를 이후 문서 커밋과 구분해 기록합니다.

| Stage / 단계 | Assertions / 검사 | Measured time / 실측 |
| --- | --- | --- |
| Tiny regression / 작은 회귀 | 48 | 8.35s |
| Fresh Seoul graph / 새 서울 그래프 | Part of Seoul29 / 서울29에 포함 | 36.57s |
| Seoul vehicles and matching / 서울 차량·매칭 | Seoul total29 / 서울 전체29 | 28.06s |
| Durable HTTP/PostgreSQL / 영속 HTTP·PostgreSQL | 34 | 76.81s |

These are one local run with cached source/images, not throughput or production benchmarks. The top-level report displays63 current Seoul/P05 assertions; its nested tiny regression contributes48, making111 total.

원본·이미지가 캐시된 로컬 한 번의 실측이며 처리량·운영 성능 수치가 아닙니다. 상위 화면의63개는 서울·P05이며 별도 작은 회귀48개를 합쳐111개입니다.

## Results inspected beyond PASS / 통과 표시 외에 확인한 결과

- Baseline: nine durable trips,61 input batches and3,204 distinct observations produced215 unique stored traversals. Every stored edge, direction and entry/exit timestamp equals the fresh P04 reference. All successful raw observation payloads were deleted. [DB read-back](ingestion/readbacks/baseline-succeeded.json).
  기본 입력은 여행9개·배치61개·서로 다른 관측3,204개이며 고유 통과215개를 저장했습니다. 모든 구간·방향·진입/진출시각을 새 P04 결과와 대조했고 성공 후 원시 관측을 삭제했습니다.
- Main independently checked1,860 unique artifact hashes, recomputed traversal geometry lengths and durations, and checked boundary timing against generated ground truth. Maximum length difference was `5.18e-10 m`; maximum boundary error was392ms. All accepted clean traces meet100ms and other accepted traces1s. [Inspection](main-verification.json).
  메인이 서로 다른 파일해시1,860개·통과 거리/시간을 독립 계산하고 생성 정답의 경계시각과 비교했습니다. 최대 거리 차이는 위 값이고 최대 시각오차는392ms이며 채택한 정상 관측100ms·그 외1초 기준을 만족했습니다.
- The truth denominator is237 traversals:215 accepted and22 missed truth traversals. The28 excluded engine candidates use a different denominator and must not be substituted for22. There were3,264 truth samples,60 scheduled omissions,3,190 matched and14 excluded GPS points. This is same-engine synthetic round-trip evidence, not independently measured real-driving accuracy.
  정답 통과237개 중215개를 채택했고22개를 놓쳤습니다. 제외된 엔진 후보28개는 분모가 다르므로22개와 혼용하지 않습니다. 정답표본3,264개·예약누락60개·매칭GPS3,190개·제외14개이며 독립 실주행 정확도 측정은 아닙니다.
- The harness issued185 HTTP requests including fault, validation, status and consent cases, with4 duplicate responses. This is not185 normal ingestion batches. Concurrent duplicate/conflicting content, sequence gaps, immutable finalization, request limits and wrong-graph workers leave the intended durable state. [Assertions](ingestion/assertions.json).
  장애·입력 검사·상태 조회·동의 사례를 포함한 HTTP185회와 중복 응답4회를 기록했습니다. 정상 수집배치185개라는 뜻은 아닙니다. 동시 중복·내용 충돌·순서 누락·종료 고정·요청 제한·다른 그래프 처리자의 저장 상태를 확인했습니다.
- Three actual worker SIGKILL recoveries cover after lease, after matching and after uncommitted insertion. Stale owners cannot commit. Interrupted AFTER_MATCH/AFTER_INSERT result bytes exactly match replacement-worker results. Two separate workers safely divide remaining jobs. [Attempt links](ingestion/attempt-links.json), [process evidence](ingestion/process-events.json).
  실제 처리자 강제 종료3개 지점은 임대 후·매칭 후·미커밋 삽입 후입니다. 옛 소유자의 커밋을 거부하고 매칭/삽입 후 중단 결과가 새 처리자의 결과와 바이트까지 같으며 두 처리자의 작업 분담을 확인했습니다.
- The API was terminated after committed acceptance but before responding. The same PostgreSQL container/volume was restarted; both accepted samples survived. Docker changed the loopback port32781→32782, which the harness rediscovered before reconnecting. [Restart](ingestion/runtime/database-restart.json), [durable rows](ingestion/readbacks/api-durable-restart.json).
  저장 커밋 후 응답 전에 API를 종료하고 같은 DB 컨테이너·볼륨을 재시작해 접수표본2개 보존을 확인했습니다. Docker가 로컬 포트를 바꿨으며 새 포트를 조회해 재연결했습니다.
- Three actual engine failures exhaust retries, set FAILED and remove raw data. Advancing only the persisted event clock prevents an old worker from completing even before the deletion sweep. Expiry and consent revocation remove raw data and stored traversals; after24h, trips/batches/samples/traversals/events/raw payloads are allzero. The22 contributor registry rows remain. [Before sweep](ingestion/readbacks/pending-expiry-before-sweep.json), [24h read-back](ingestion/readbacks/retention-24h.json).
  실제 엔진3회실패 후 FAILED·원문삭제를 확인했습니다. DB 관측시계만 진행해도 삭제 작업 전 옛 처리자의 완료를 막습니다. 만료·동의 철회 후 원문·통과를 지우며24시간 뒤 여행/배치/표본/통과/이벤트/원문은0개이고 기여자 등록22행은 남습니다.
- The abort probe verified an actual `valhalla_service locate` process, stopped it in stateT, paused its exact container and killed its worker. The known orphan container was removed, with explicit NoSuch absence. Main also independently confirmed26 recorded child PIDs absent. [Stopped engine](ingestion/engine-abort-stopped-process.json), [before cleanup](ingestion/engine-abort-before-cleanup.json), [after cleanup](ingestion/engine-abort-after-cleanup.json), [PID check](main-process-cleanup.json).
  실제 locate 프로세스를 확인해 정지상태T로 멈추고 해당 컨테이너를 일시정지한 뒤 처리자를 종료했습니다. 확인한 잔여 컨테이너를 제거하고 명시적 부재를 확인했으며 메인도 기록된 자식 PID26개 부재를 독립 확인했습니다.

![Recovery details / 복구 상세](https://raw.githubusercontent.com/dicebattle/routelens/920d48d74f5557b60a877a1515ce7cd6e442c21c/docs/media/report-recovery-en.png)

## Failed attempts retained / 실패 기록 보존

Earlier runs honestly failed on an invalid test graph identifier, temporary PostgreSQL readiness, a capacity status expectation, a changed Docker port and a race observing a short-lived engine process. The corrected harness keeps production validation strict; it introduces no skip/partial-success mode. The first complete run also exposed an outdated P05–P14 limitation in UI review; that copy was corrected and the final whole run regenerated from clean source.

앞선 실행은 잘못된 시험 그래프 식별자·임시 DB 준비 상태·용량 응답 기대값·Docker 포트 변경·짧은 엔진 프로세스 관찰 경쟁 때문에 실패했습니다. 제품 검증을 완화하거나 생략·부분성공 모드를 추가하지 않고 고쳤습니다. 첫 전체 통과 후 화면 검토에서 남아 있던 P05~P14 미구현 문구를 수정하고 최종 깨끗한 소스로 전체 실행을 새로 했습니다.

[Development partial evidence / 개발 부분 증거](development/README.md) · [First clean failure / 첫 깨끗한 실행 실패](failed-first-clean/README.md) · [Second clean failure / 두 번째 실패](failed-second-clean/README.md) · [Prepublication complete proof / 게시 전 전체 증거](prepublication-verification.json).

Focused implementation checks passed8 core +1 clock +4 integration contract +1 absence predicate +1 missing-source CLI tests, with strict TypeScript compilation. Healthy focused suites were not repeated merely for output. Hosted all-suite results are recorded separately after execution.

집중 검사는 코어8·시계1·통합계약4·부재판정1·원본인자1개와 엄격 TypeScript 빌드를 통과했습니다. 출력만 바꾸려 정상 검사군을 반복하지 않았으며 원격 전체 검사 결과는 실행 후 별도 기록합니다.

## Provenance, media and archive / 출처·미디어·보존

- Source commit: `0c7036af545c1f454ab2749cd29b17ce3c78811c`; implementation SHA256: `4bc4113c39fa8377452d45ae03dbf340e77a5fb9fc0aa98f3a8b123ba9b52463`.
- Local graph: `0d06e16c146155e7a798af8aaa0de298e68190be3480fb0fac632b565ef58acd`.
- OSM source: [Geofabrik dated South Korea PBF](https://download.geofabrik.de/asia/south-korea-261023.osm.pbf),289,916,859bytes; SHA256 `282d012b7629c643695f286d4424d7f6d88548d99edb5577ca5b678906f13c17`.
- Actual PostgreSQL version/image/durability: [database record](ingestion/runtime/database.json); fsync, synchronous_commit and full_page_writes enabled. Graph build2CPU/4GiB; DB1CPU/512MiB. Raw engine attempts are bounded and independently cleaned.
- Actual19.35s,1280×720,20fps browser recording; full H.264/GIF conversion, successful full MP4 decode and inspected screenshots/frame. [Media hashes](media-manifest.json). The in-app desktop/mobile inspection covered both languages, replay and expanded recovery,390px without horizontal overflow and no captured JavaScript errors. Capture browser and report server were closed.

위 항목에 소스·구현·그래프·원본 해시와 실제 DB 내구성·자원 제한을 기록했습니다. 실제19.35초 녹화 전체를 변환하고 디코딩·화면을 확인했으며 내장 브라우저의 한영 재생·복구 상세·390px 넘침 없음·확인된 JavaScript 오류 없음도 검사했습니다. 촬영 브라우저·보고서 서버는 종료했습니다.

[Full text evidence archive / 전체 원문 증거 압축](evidence.tar.gz), SHA256 `6ab0db43176c9891b19b81de77a7029fc76e66e3794e2c9c7aa9c4c2bfd6ee66`. [Archive scope and license / 보존 범위·라이선스](ARCHIVE-SCOPE.md). Extract into a fresh folder to resolve every raw report link; the repository keeps selected readable summaries alongside the archive. Graph binaries are deliberately omitted and retain their original hashes; graph byte reproducibility is not claimed.

새 폴더에 압축을 풀면 원문 보고서의 링크를 확인할 수 있습니다. 저장소에는 읽기 쉬운 주요 파일도 별도로 두었습니다. 그래프 바이너리는 제외하되 원래 해시를 보존하며 그래프 바이트의 재현성은 주장하지 않습니다.

Road geometry is © OpenStreetMap contributors, ODbL1.0, through Geofabrik. The rectangular envelope includes Seoul and adjacent roads, not an administrative polygon. Vehicle trajectories are authored SYNTHETIC fixtures. No real person location trace or private credential is published.

도로 지형은 OSM 기여자·ODbL1.0·Geofabrik 출처입니다. 범위는 서울과 인접 도로를 포함하는 사각형이며 행정구역 폴리곤이 아닙니다. 차량 이동은 자체 합성 자료이고 실제 개인 이동·인증정보는 공개하지 않습니다.

## Hosted Linux verification / 원격 Linux 검증

[Run40095704921](https://github.com/dicebattle/routelens/actions/runs/40095704921) on clean push head `168f16a4eb963954ca17b724380e6a500f1b1a06` passed Node22/24 each137/137, the real Docker pipeline111/111 and Required checks. [CI record](hosted/ci.json), [independent artifact inspection](hosted-verification.json).

깨끗한 푸시 커밋의 원격 실행에서 Node22·24각각137개·실제 Docker통합111개·필수검사를 통과했습니다. CI기록과 독립 결과물 검사 파일에 연결합니다.

Main downloaded the artifact and checked1,883 unique available file hashes,215 stored/reference traversals, independent geometry/timing, byte-identical full/split/overlap results and interrupted-worker recovery, API response loss followed by same-volume DB restart(port32768→32769), terminal engine failure, expiry before sweep, revocation/24h deletion and recorded orphan cleanup. All passed on Linux/amd64. The15 omitted graph binaries are listed and were not rehashed; remote cleanup is proven by the run's original diagnostics, not by a later live process query. Local and hosted graph bytes/IDs differ as expected; invariants are checked within each graph.

메인이 내려받은 결과물의 가능한 고유해시1,883개·저장/기준215통과·독립거리/시각·전체/분할/중첩 및 중단복구바이트·응답유실/같은볼륨DB재시작·최종엔진실패·정리전만료·철회/24시간삭제·잔여엔진정리를 검사해 모두 통과했습니다. 제외된 그래프바이너리15개는 목록으로 구분했고 재해시하지 않았습니다. 원격 정리는 원래 진단 근거이며 뒤늦은 실시간 조회로 주장하지 않습니다. 로컬·원격 그래프바이트/ID는 다르며 각 그래프 안에서 불변조건을 검사합니다.

Selected original hosted manifests and DB/process read-backs are retained under [hosted/](hosted/manifest.json); the complete downloaded artifact is linked from the run and subject to its retention period. Main verified the published GitHub README GIF visually and downloaded the public MP4 with the exact local SHA256. Runtime source and media fingerprint did not change in this hosted-evidence documentation update. The final documentation head must pass required checks before protected merge.

주요 원격 명세·DB/프로세스 재조회는 hosted폴더에 보존했고 전체 다운로드 묶음은 실행 링크에서 보관기간 내 확인할 수 있습니다. GitHub README의 GIF를 직접 보고 공개 MP4를 내려받아 로컬과 같은 해시도 확인했습니다. 이번 원격 증거 문서 갱신은 실행소스·녹화지문을 바꾸지 않으며 최종 문서 커밋의 필수검사 후 보호병합합니다.

## Remaining boundary / 남은 범위

P05 proves bounded synthetic local ingestion and committed effects. It does not provide production authentication, continuous real GPS collection, traffic aggregation, signed publication, two-node failover, independent real-road accuracy or physical erasure of WAL/backups. The next module is P06 aggregation on these persisted accepted traversals and actual Seoul corridors. P06–P14 and the separate reviewed100/100 geographic corpus remain incomplete.

P05는 제한된 합성 로컬 수집·저장 효과를 증명합니다. 운영 인증·연속 실GPS·집계·서명 게시·두 노드 장애 전환·독립 실도로 정확도·WAL/백업 물리삭제는 제공하지 않습니다. 다음 P06은 저장된 채택 통과와 실제 서울 구간의 집계이며 P06~P14와 별도 실제 자료100/100 검토는 미완료입니다.
