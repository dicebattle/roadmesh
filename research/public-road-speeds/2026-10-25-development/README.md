# Actual public-speed development proof / 실제 공공 속도 개발 증거

Status: **development increment, full objective incomplete**. Main Sol designed, implemented and inspected this work. [Full requirements](../../../docs/38-public-road-speeds.md). No new PR, main merge or deployment. The earlier NAV-02 media remains historical until the public runtime is integrated and freshly recorded.

상태: **개발 단계이며 전체 목표는 미완료**입니다. 메인 Sol이 설계·구현·검토했고 새 PR·main 병합·배포는 없습니다. 공공 실행 통합·새 녹화 전까지 이전 영상은 과거 근거입니다.

## Observed result / 직접 확인한 결과

- Official ITS HTTPS source returned4,064 records using an existing local credential, with no key in saved output. The actual importer streamed1,564,022 official link records and1,184,340 nodes, retained11,273 Seoul-envelope links and excluded6 unsupported geometry records. Actual projection, original file hashes and counts: [receipt](development-receipt.json). The271,402,628-byte ZIP remains local under its own government terms; it is not redistributed under the code license.
- The79-edge pilot catalog yielded22 complete directed geometry matches and57 omissions. Every returned numeric node tuple differed from the latest official geometry. Independent official map geometry validated2 of9 examined link bindings under the fixed8m/length criteria, covering3 engine edges. The7 failed proofs remain preserved; no threshold was weakened. [Original map responses](provider-shape-proofs/proofs.json), [URLs/times](provider-shape-proofs/receipts.json), [decisions](provider-shape-proofs/verification.json), [bound mapping](mapping-reviewed-v1.json).
- A fresh actual API response then passed normalization→explicit PUBLIC_AGENCY snapshot→Ed25519 signing/verification→existing immutable traffic encoding→actual pinned Valhalla3.9.1 routing. On the same115m Teheran-ro path, native speed changed57→36km/h and calculated time7.315→11.583s. This is native use of a real timestamped public observation, not measured trip time. [Report](native-development-01/report.json), [raw source](native-development-01/response.json), [baseline](native-development-01/baseline.json), [public route](native-development-01/public.json), [signed bytes](native-development-01/artifact.json), [manifest](native-development-01/manifest.json), [JWS](native-development-01/manifest.jws), [local public trust key](native-development-01/trust-public.json). The signing private key was ephemeral and was not saved. Both owned native containers reported cleanup_verified=true; no unrelated containers were stopped.

공식 HTTPS에서 실제4064개를 수집했고 전국 원본 링크156만개·노드118만개를 읽어 서울 범위11273개를 가져왔습니다. 원본 해시·좌표계·누락은 영수증에 있고 큰 ZIP은 로컬에 남깁니다. 파일럿79구간 중 지형22개가 대응했지만 노드가 달라 별도 공식 지도까지 확인했습니다. 검토9링크 중2개만 통과해 엔진3구간에 적용했으며 실패7건도 남깁니다. 새 API 수치의 서명·변환·엔진까지 직접 실행해 같은115m 경로의 계산 시간이7.315초에서11.583초로 바뀌었습니다. 이는 실주행 시간 측정이 아니고 원 관측시각의 실제 자료 반영 근거입니다. 비밀 서명키는 저장하지 않았고 소유 엔진 두 개의 정리도 확인했습니다.

## Focused verification / 집중 검증

Node22 strict TypeScript/browser/Worker builds passed. Source normalization/transport11 tests passed; after adding independent node binding and durable SQLite authority, geometry9+publication7+authority6=22 tests passed. [Actual TAP](public-focused-02.tap) includes concurrency, signature/byte/scope corruption, original-time expiry, restart high-water preservation, revocation and closed-handle behavior. This is not the new complete438+public-source integration gate.

Node22 엄격 빌드·수집11개·지형9개/서명7개/영속 수신6개를 통과했습니다. 실제 TAP에 동시 연결·위조·원시각 만료·재시작 순서·철회·종료 검사를 보존합니다. 새 전체 통합 통과로 대신하지 않습니다.

After extracting the unchanged native result validator and widening the existing owned compiler worker input,29 legacy traffic/gateway/compiler cases passed. [TAP](legacy-compiler-focused.tap). Independent Docker inspection confirmed both exact owned engine containers absent: [receipt](native-development-01/cleanup-independent.json). [Known-credential scan](secret-scan.json) passed before retaining these report files.

기존 엔진 결과 검사기를 그대로 추출하고 기존 소유 변환 스레드 입력을 확장한 뒤 이전 교통/중계/변환29개를 통과했습니다. 소유한 정확한 엔진 컨테이너 두 개의 부재도 독립 확인했고 보존 파일의 기존 인증키 패턴 검사를 통과했습니다.

2026-10-26 follow-up: strict build and18 public-context/client core/server/state cases passed after the explicit public client contract and rendering changes. [TAP](public-client-focused-01.tap). This verifies validators and existing client behavior; no actual connected public browser or complete runtime acceptance is claimed. / 10월26일 공공 문맥·화면 변경 뒤 빌드·집중18개를 통과했으며 실제 공공 서버/브라우저·전체 수용으로 대신하지 않습니다.

```sh
npm run build
node --test dist/tests/public_speed_source.test.js
node --test dist/tests/public_speed_authority.test.js dist/tests/public_speed_geometry.test.js dist/tests/public_speed_publication.test.js
npm run public:speeds -- collect --bounds 126.98,37.46,127.10,37.56 --output data/new-public-capture
```

The collection command reads `ROUTELENS_ITS_API_KEY` from the operator environment. It does not scan another repository or write credentials. [Original local native probe](native-development-proof.mjs) is a preserved development script, run from `data/public-road-research/` with the existing host's private environment file and previously verified graph/bundle; it is not a portable public runtime or a complete reproduction command. New runtime/acceptance commands must use explicit paths and the environment key. [File hashes](files.json) retain these exact originals.

제품 수집 명령은 운영자 환경변수만 사용합니다. 보존한 엔진 개발 스크립트는 당시 로컬 data 경로·기존 비공개 환경·검증한 지도 묶음을 쓴 원문이며 범용 실행 명령으로 주장하지 않습니다. 이후 실행·수용 명령은 명시 경로와 환경변수를 사용해야 합니다.

## Remaining acceptance / 남은 수용 작업

Connect the collector, persisted authority, native engine lifecycle and existing browser; prove automatic refresh, outages and exact expiry→baseline; report actual route coverage/source/collection time. Expand useful matching coverage without assuming equal IDs. Add reproducible offline public-source integration, run the whole fresh pilot, inspect originals and actual browser behavior, refresh bilingual media/README, then commit/push and verify the feature head. Do not mark the broad public-speed goal complete from this narrow115m probe.

자동 갱신·장애·정확 만료/기본값 복귀·지속 엔진·기존 화면·출처/시각/경로 적용률을 연결해야 합니다. 식별자 추정 없이 적용 범위도 넓히고 오프라인 재현·새 전체·원문·실제 화면·한영 영상/README·커밋/푸시까지 남습니다. 좁은115m 개발 성공으로 전체 공공 속도 목표를 완료하지 않습니다.
