# Public road-speed acceptance / 공공 도로 속도 수용

Actual Korean public road speeds now reach the local RouteLens browser through directed mapping, signed immutable traffic and native Valhalla routing. Fresh full integration passed **462/462**, preserving the previous438 checks and adding24 public-runtime cases. Node.js22 tests passed **369/369**. This is local implementation and verification; no hosted service or new main merge was performed.

국내 실제 공공 도로 속도를 방향 대응·서명 불변 교통자료·실제 Valhalla 경로를 거쳐 로컬 RouteLens 화면에 연결했습니다. 기존438개에 공공 실행24개를 더한 새 전체462개와 Node.js22 전체369개를 통과했습니다. 로컬 구현·검증이며 외부 서비스 배포나 새 main 병합은 수행하지 않았습니다.

- Design, implementation and review: main Sol. / 설계·구현·직접 검토: 메인 Sol.
- Clean accepted source: `8e153bde900f64ab719ac9c10bb12965a41ae3f0`.
- Runtime SHA256: `84395cf3393b71677b2268d1ed1dcfbb57f653703fd3c273fb060501b8921f3d`.
- Fresh Seoul graph: `3d897cd5570af3a31a161e915c0dd8ae27bc03985f585fd94ea2b313fbc22e42`.
- [Contract](../../../docs/38-public-road-speeds.md) · [source inventory](../../../wiki/sources/public-road-speeds.md) · [module and commands](../../../wiki/modules/public-road-speeds.md).

## Actual acquisition and routing / 실제 수집·경로

The source is [MOLIT ITS traffic information](https://www.data.go.kr/data/15040463/openapi.do), accessed with an existing privately configured credential. Source investigation also covers Seoul TOPIS, official geometry/crosswalks, UTIC, expressways, Gyeonggi, Daegu and historical baselines. Catalog availability, successful reads and unverified approvals remain distinct. No new account, permission grant, paid service or key registration was performed.

기존 비공개 ITS 키로 실제 수치를 읽었습니다. 서울 TOPIS·공식 지형/대응표·UTIC·고속도로·경기·대구·이력 자료도 조사했고, 자료 명세와 실제 접근·미확인 승인을 구분했습니다. 새 계정·권한·유료 서비스·키 발급은 하지 않았습니다.

The current numeric API uses different node IDs from the downloadable national geometry. Do not truncate IDs or relax geometric thresholds. Two advertised official WMS layers independently supply link identity, F/T nodes and complete directed geometry. Their agreement permits the existing whole-edge mapper to accept31 of79 catalog edges. They represent11 distinct provider links; this is a measured pilot subset, not nationwide completeness. Government geometry remains local under separate reuse terms. [Pinned mapping](actual-public-mapping.json) · [development discoveries/failures](../../public-road-speeds/2026-10-26-development/README.md).

수치 API와 전국 다운로드 지형의 노드 차이를 식별자 자르기나 기준 완화로 덮지 않았습니다. 공식 지도 두 레이어의 링크·방향 노드·전체 곡선을 대조한 뒤 기존 전체 구간 대응으로79개 중31개를 수용했습니다. 실제 공급 링크는11개이며 전국 적용률로 확대하지 않습니다. 정부 지형은 별도 이용 조건에 따라 로컬에 유지합니다.

| Actual capture / 실제 캡처 | Result / 결과 |
| --- | --- |
| Native route distance / 엔진 경로 거리 | 2,119m |
| Rounded native partial-length sum / 반올림된 엔진 부분 길이 합 | 2,116m |
| Covered partial length / 공공 속도 적용 길이 | 1,784m |
| Independently computed coverage / 독립 계산 적용률 | 84.3100189% |
| Recorded route duration / 녹화 경로 계산 시간 | 275.026s |
| Original observation / 원 관측 UTC | 2026-10-25T16:25:00.000Z |
| Captured route check / 캡처 경로 확인 UTC | 2026-10-25T16:27:51.599Z |
| Original expiry / 원 관측 만료 UTC | 2026-10-25T16:35:00.000Z |

Independent inspection checked3 actual signed publications,93 source entries and Korean→UTC timestamps,124 exact8-byte native records across4 actual EN/KO routes, source/node identity and original partial lengths. Values are historical observations valid at capture. New later observations changed the displayed duration; publication/retrieval never renewed an observation's lifetime. Route lengths in the native trace are already trimmed and rounded; endpoint fractions must not be applied twice. [Actual-source audit](audits/public-final-actual-verification.json) · [original-time audit](audits/public-final-actual-timestamps.json).

실제 서명 게시3건·원 항목93개/한국→UTC시각·실제 한영 경로4건의 불변 레코드124개·방향 노드·부분 길이를 독립 확인했습니다. 캡처 당시 유효했던 과거 관측이며 새 관측에서 표시 시간이 달라졌습니다. 조회/게시로 관측 수명을 늘리지 않았고 이미 잘린 엔진 길이에 끝점 비율을 다시 곱하지 않았습니다.

## Refresh, expiry and recovery / 갱신·만료·복구

The collector uses bounded HTTPS, credential-safe diagnostics, a120s minimum interval,10s request deadline and8MiB/50,000-row limits. Each positive speed expires600s after its original Korean observation time;0/missing/invalid is unknown, never closure. A provider failure preserves only still-valid observations. The runtime selects remaining entries at partial expiry and actual baseline routing at full expiry. New all-unknown data durably withdraws the old positive version without resetting sequence; restart cannot resurrect it. Public agency data uses its own signed contract and does not invent five contributors or a synthetic namespace.

제한 HTTPS·키 보호·최소120초 간격·10초 요청 기한·8MiB/5만 행을 적용합니다. 원 한국 시각600초 뒤 만료시키고0/누락/오류는 미확인으로 처리합니다. 장애 때 유효한 옛 관측만 유지하고 부분 만료 때 남은 구간, 전체 만료 때 실제 기본 경로로 복귀합니다. 최신 전체 미확인은 이전 양수를 영속 철회하며 순서를 유지하고 재시작으로 되살리지 않습니다. 공공 자료에 기여자5명이나 합성 출처를 만들지 않습니다.

The24 deterministic public-runtime cases run on the freshly rebuilt actual graph with explicitly **authored provider-protocol responses and a controlled clock**. These are fault tests, not additional real agency observations. Independent Node crypto inspection verified3 signatures,5 exact native records, copied SQLite integrity/high-water3/withdrawal, original expiry/recovery and current absence of owned HTTP ports/containers. [Public-runtime audit](audits/public-whole01-public-runtime-independent.json).

새 지도 위 통제 시계·자체 제공자 응답의24개 장애 검사를 실제 공공 관측과 구분합니다. 표준 서명3건·엔진 레코드5개·복사 SQLite 무결성/최고순번3/철회·원 기한/복구·소유 서버/컨테이너 부재를 독립 확인했습니다.

## Whole system and actual browser / 전체 시스템·실제 화면

[Whole report](report.html), [assertions](assertions.json) and [manifest](manifest.json) preserve462 passed cases. Whole inspection checked17,063 original hashes; progress inspection checked191 states/168 confirmed positions; the Cloudflare comparison checked11 complete PostgreSQL/Worker pairs and21 copied SQLite databases. Earlier failed development probes, fixture mistakes, an incorrect exact-speed comparison and their corrections remain preserved. No product policy was weakened to turn those failures green. [Audit commands](audits/public-whole01-audit-commands.json) · [whole audit](audits/public-whole01-whole-independent.json).

전체462개·원문 해시17063개·진행191상태/확정168위치·PostgreSQL/Worker11쌍과SQLite21개를 확인했습니다. 개발 실패·검사 자료/정리 검사기 오류·잘못된 속도 완전 일치 비교와 수정도 보존했고 제품 기준을 완화하지 않았습니다.

Actual IAB review verified EN/KO source/time/coverage, native guidance and authored GPS progress. Mobile width and scroll width were both390px. A real automatic refresh invalidated the old route while a manual step was pending; the disabled step was preserved, then recalculation restored current guidance. [Refresh invalidation](iab/actual-refresh-invalidation.json) · [mobile DOM](iab/mobile-dom.json). Large full-page screenshots produced a MapLibre canvas warning; the separate recording browser logged a favicon404. Neither was hidden or counted as a successful route. No application exception or GPS collection was observed. All owned tabs,9 recording processes and3 final actual native containers were closed and independently checked.

내장 한영 화면의 출처/시각/적용률·엔진 안내·합성 GPS를 확인했고390픽셀에서 넘침이 없었습니다. 실제 자동 갱신 때 이전 경로의 표본 버튼이 비활성화된 상황도 보존하고 재계산으로 복구했습니다. 큰 전체 캡처의 지도 경고와 녹화 브라우저의 favicon404를 명시하며 성공 경로로 세지 않았습니다. 애플리케이션 예외·실제 GPS 수집은 없었고 소유 탭·녹화9프로세스·마지막 실제 엔진3개를 정리했습니다.

[![Public-speed walkthrough](https://raw.githubusercontent.com/dicebattle/routelens/54866b77fe176e80045db57051f7d103b27c1b99/docs/media/demo-poster.ko.png)](https://raw.githubusercontent.com/dicebattle/routelens/54866b77fe176e80045db57051f7d103b27c1b99/docs/media/demo.ko.gif)

[English GIF](https://raw.githubusercontent.com/dicebattle/routelens/54866b77fe176e80045db57051f7d103b27c1b99/docs/media/demo.gif) · [한국어 GIF](https://raw.githubusercontent.com/dicebattle/routelens/54866b77fe176e80045db57051f7d103b27c1b99/docs/media/demo.ko.gif) · [MP4](https://raw.githubusercontent.com/dicebattle/routelens/54866b77fe176e80045db57051f7d103b27c1b99/docs/media/demo.ko.mp4) · [original46.95s](capture-original.webm) · [video provenance](published-video.json).

## Originals and reproduction / 원문·재현

[Whole archives](originals/whole/archive-verification.json) retain17,409 originals; [actual-public archives](originals/actual-public/archive-verification.json) retain253 originals. Independent fresh extraction verified every retained size/hash. Only32 exact manifest-declared whole map binaries are omitted and were verified locally before omission. XML, signed bytes, traffic archives and SQLite/WAL/SHM are retained. The actual-public archive has no map omissions; it contains numeric observations and OSM display data, not the government geometry download or private signing state. [Restoration](audits/public-final-restoration-verification.json). Join each archive's parts in lexical order, verify its combined SHA256, then extract to a new folder and check `original-files.json.gz`. Never fabricate omitted bytes.

전체17409개와 실제 공공253개 원문을 보존하고 새 복원에서 크기/해시를 모두 대조했습니다. 전체 실행의 명시 지도 바이너리32개만 제외하며 제외 전 로컬 해시를 확인했습니다. XML·서명·교통 묶음·SQLite를 유지하고 정부 지형/서명 비밀 상태는 포함하지 않습니다. 분할 파일은 이름순 연결·합친 해시·새 폴더 복원·원문 목록 순으로 확인합니다.

```sh
npm test
npm run simulation:check -- --output data/your-fresh-public-run
npm run media:check
npm run cloudflare:types -- --check
```

Run actual collection/mapping/serving with the module's documented commands and your own private ITS credential. Static geometry retrieval requires no invented node-ID conversion. Future work includes wider reviewed road coverage, destination search/confirmation, real device behavior, voice/rerouting, measured field accuracy, provider diversity and production operation. These remain separate from this local public-speed implementation. Feature-branch push and remote SHA verification are the authorized delivery; no new main merge or deployment is inferred.

실제 수집/대응/실행은 모듈 문서와 운영자 비공개 키로 재현합니다. 더 넓은 도로 검토·목적지 검색·단말·음성/재탐색·현장 정확도·제공자 다양화·운영은 후속입니다. 승인된 전달은 작업 브랜치 푸시·원격 SHA 확인이며 새 main 병합·배포로 확대하지 않습니다.

## Publication checks / 공개 전 검사

All17,662 archived originals (3,234,802,521 bytes) passed an exact configured-credential/PEM/private-JWK pattern scan. The first scan flagged the negative trust fixture because the inspector expected `invalid-private-marker`, while the source deliberately writes `invalid-private-field`. The exact source line and original JSON confirmed this is a non-key sentinel; only that exact value and path were allowed in the corrected scan. Both the [first finding](privacy-first-scan.json) and [corrected result](privacy-verification.json) remain retained. This bounded scan is not a universal secret detector. Government geometry and private signer state remain outside the published archive.

원문17,662개·3,234,802,521바이트에서 지정 자격정보·PEM·비밀 JWK 패턴을 검사했습니다. 첫 검사기는 무효 표식을 잘못 예상해 거부 입력을 탐지했습니다. 소스와 원 JSON을 확인하고 정확한 경로·값만 예외로 지정했으며 최초 결과와 수정 결과를 함께 보존합니다. 모든 비밀 탐지를 보장하는 검사는 아니며 정부 지형과 서명 비밀 상태는 공개 묶음 밖에 유지합니다.

| Required outcome / 필수 결과 | Inspected evidence / 확인 근거 |
| --- | --- |
| Official source survey / 공식 자료 조사 | [Source inventory and access distinctions](../../../wiki/sources/public-road-speeds.md) |
| Actual bounded acquisition / 실제 제한 수집 | [93 original observations and timestamps](audits/public-final-actual-timestamps.json) |
| Directed graph mapping / 방향 지도 대응 | [31/79 catalog edges,11 source links](actual-public-mapping.json) |
| Signed traffic, expiry and restart / 서명·만료·재시작 | [Independent24-case runtime audit](audits/public-whole01-public-runtime-independent.json) |
| Native route and actual browser / 엔진·실제 화면 | [Four actual routes](audits/public-final-actual-verification.json), [mobile review](iab/mobile-dom.json), [recording provenance](published-video.json) |
| Fresh whole test and original restoration / 새 전체·원문 복원 | [462 assertions](assertions.json), [restoration audit](audits/public-final-restoration-verification.json), [full video frame audit](video-frames-verification.json) |
| Public delivery / 공개 전달 | Descriptive bilingual commits and verified feature-branch remote SHA; protected main unchanged by this increment. / 이중 언어 커밋·작업 브랜치 원격 SHA 확인으로 전달하며 이번 구현에서 보호 main은 변경하지 않습니다. |


Delivery: implementation/evidence commit `24db094` was pushed and its identical remote feature-branch SHA read back; main remained `b4b4eeb`. [Remote receipt](remote-delivery.json) · [indexed-file/link inspection](delivery-verification.json). This documentation-only follow-up retains the exact accepted runtime and media; its own latest remote SHA is checked after push.

전달: 구현·증거24db094의 푸시와 원격 일치·main=b4b4eeb 유지를 확인했습니다. 이 후속 문서도 같은 실행/영상 지문을 유지하고 푸시 후 최신 원격 커밋을 확인합니다.
