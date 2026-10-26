# Gyeonggi and EX speeds in native routing / 경기·도로공사 속도의 실제 경로 반영

2026-10-26 local acceptance. Main Sol designed, implemented and directly inspected this increment. Actual agency acquisition and native influence are separate from authored fault tests, real driving, measured ETA accuracy and production operation. Fresh whole486/486 and the independent17,377-original-hash audit passed: [whole manifest](whole/manifest.json), [whole audit](audits/whole-independent.json); delivery is a feature-branch push, with no new main merge or deployment.

메인 Sol이 설계·구현·직접 검토했습니다. 실제 공공 수집·엔진 영향과 합성 장애·실주행·도착시간 정확도·운영을 구분하며 새 main 병합·배포는 없습니다. 최종 전체486개와 원문17,377개 해시 독립 검사를 통과했으며 연결한 원문에서 확인합니다.

## What changed / 구현 내용

The local server accepts original-time Gyeonggi service-link observations and explicitly operator-captured EX detector observations through a separate regional0.2 contract. It reuses signing, persistent acceptance/withdrawal, expiry and Valhalla traffic encoding. Exact geometry admits56 unique native edges:56 Gyeonggi alternatives and two EX alternatives on already counted edges. Prefer the reviewed detector value, then valid Gyeonggi, then base speeds. Original time+600s remains the expiry; publication, rereading an EX document and source failure cannot renew it. Both sources stay PUBLIC_AGENCY.

원시각 경기·명시 보존 도로공사 수치를 별도 규격으로 기존 서명·영속 승인/철회·만료·엔진 변환에 연결했습니다. 고유56개 구간에 경기56개·도로공사2개 대안을 두며58개 구간으로 합산하지 않습니다. 검지기 다음 경기 다음 기본 속도를 사용하고 원시각600초를 유지합니다.

[Fixed design](../../../docs/40-regional-public-routing.md) · [module and commands](../../../wiki/modules/regional-public-routing.md) · [official sources](../../../wiki/sources/regional-public-routing.md) · [current video metadata](../../../docs/media/latest.json).

## Road and source scope / 도로·자료 범위

Regional graph **a859e9adaf913b14bf6b47a161247ec1c3b6c6c59b6e8d6334a9466646cb2079**, manifest **be0127608e37527a3d76fb2129443d18aba2d288739fc9b180881f97979af842**. Reuses exact validated tiles built2026-10-25 from pinned Geofabrik Korea2026-10-23 OSM bytes (SHA256282d012b7629c643695f286d4424d7f6d88548d99edb5577ca5b678906f13c17,289916859bytes); the region is126.7,37.4,127.25,37.75. It contains Seoul and portions of neighbouring metropolitan roads, not all Gyeonggi/Incheon. Additional actual native route/trace/locate evidence extended the original three scenes to fifteen; the12 regional trial endpoints are fixed in [fixture](../../../fixtures/seoul/regional-scenes.json). The fresh whole run rebuilds its own graph from the same source and records its separate graph identity.

정확히 검증한 기존 타일과 고정 OSM 원본을 재사용해 실제 엔진 원문으로 열두 지역 시험을 추가했습니다. 서울·인접 수도권 일부이며 경기·인천 전체가 아닙니다. 새 전체 통합에서 다시 만든 지도는 별도 식별자로 보존하고 두 지도를 같은 바이트라고 주장하지 않습니다.

The **trial catalog**, not the whole extracted network, has244 directed edges /57.409km. Geometry mapping accepts56 edges /17.853km (22.95% by count,31.10% by length). It uses17 Gyeonggi service references and two EX detectors. Two detector-containing native edges total about380m in the returned routes. The five numeric road requests cover Gyeongbu, Ring, Olympic, Gangbyeon and Dongbu roads in both service directions. No percentage here estimates metropolitan network completeness.

시험 목록244개·57.409km 중 지형 대응56개·17.853km이며 전체 추출 도로망이나 수도권의 비율이 아닙니다. 경기 서비스17개·도로공사 점2개를 사용하고 실제 반환 경로의 도로공사 적용 길이는 약380m입니다. 선택한 다섯 노선 수치는 양방향을 포함합니다.

Source geometry: WFS4510 features,4509 single curves plus one explicitly excluded multipart;36 predeclared WMS checks,23 reviewed curves and13 source-length disagreements. Do not repair conflicting lengths or loosen12m/20degree whole-edge tests to improve the percentage. WFS/WMS falsely label degree tuples EPSG5181; scoped degree interpretation is retained with both interfaces and length checks. EX installation capture:86 pages,8458 unique IDs,5831 structurally usable mainline rows; reviewed GRS80 projection, exact route/direction/conzone, neighbours and declared zone restrict acceptance to the containing complete native edge. These are conservative engineering matches, not independent geographic surveys.

공식 두 지형 응답·길이·방향을 대조하고 좌표 표기의 실제 모순과 제외를 보존했습니다. 설치 전체·본선 조건·검토 투영·이웃·담당 이정으로 도로공사 적용을 제한하며 독립 측량 정확도로 주장하지 않습니다.

Final acquisition:8252 EX rows plus235 Gyeonggi rows in six receipts;19 compatible live references before candidate priority. Gyeonggi and EX original times remain2026-10-26 14:06–14:08KST. EX is the official unchanged public example in an ordinary browser, not a private production key or packet capture. [EX receipt hash inventory](local-inventories/ex-capture04.json.gz); complete agency originals remain local under the source-specific publication policy.

최종 수집8487행은 도로공사8252행·경기235행이며 원시각·공개 예제 접근을 유지합니다. 원문·운영 인증·전송 원문을 혼동하지 않으며 기관 원문 전체는 로컬입니다.

## Same-departure native comparison / 동일 출발시각 엔진 비교

Clean source **82acad0f5452fb5a72ae20b7fb7b219dae853359**, implementation SHA256 **718e323a745280e2893f536e8360095e1ef6e9463a45458d935a9358ca57af17**. Four modes × twelve fixed routes =48 actual native results. All modes share exact endpoints, graph, captured batch and native departure **2026-10-26T05:09**. The graph has no timezone DB; a current native probe verifies its UTC clock. UTC wall time verifies every publication before and after each route. The observations were still valid during all48 results. This is routing influence, not observed arrival accuracy; all compared geometries stayed identical and no rerouting improvement is claimed.

깨끗한 동일 소스·지도·수집 묶음·출발점·엔진 출발 분으로48회 계산했습니다. 시간대 DB 없는 엔진의 UTC를 현재 조회로 확인하고 요청 전후 실제 UTC로 관측 유효성을 검증했습니다. 경로 지형은 모두 같았으며 시간 변화만 입증하고 재탐색 품질·실제 도착 정확도는 주장하지 않습니다.

| Route / 경로 | Returned m / 반환m | Live length / 적용률 | Gyeonggi / EX m / 경기·도로공사m | Base s / 기본초 | Combined s / 결합초 | Change s / 변화초 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Olympic-daero westbound / 올림픽대로 서쪽 | 2115 | 46.07% | 974 / 0 | 104.409 | 225.954 | +121.545 |
| Olympic-daero eastbound / 올림픽대로 동쪽 | 2115 | 32.86% | 695 / 0 | 95.249 | 100.768 | +5.519 |
| Gangbyeonbuk-ro eastbound / 강변북로 동쪽 | 2251 | 10.26% | 231 / 0 | 101.364 | 112.867 | +11.503 |
| Gangbyeonbuk-ro westbound / 강변북로 서쪽 | 2258 | 7.00% | 158 / 0 | 101.622 | 114.881 | +13.259 |
| Dongbu Expressway northbound / 동부간선 북쪽 | 6053 | 26.15% | 1583 / 0 | 364.972 | 414.142 | +49.170 |
| Dongbu Expressway southbound / 동부간선 남쪽 | 2560 | 51.82% | 1326 / 0 | 126.319 | 146.614 | +20.295 |
| Gyeongbu southbound, Seoul to Seongnam / 경부 서울에서 성남 방향 | 4074 | 7.58% | 0 / 309 | 133.382 | 136.843 | +3.461 |
| Gyeongbu northbound, Seongnam to Seoul / 경부 성남에서 서울 방향 | 5244 | 14.09% | 739 / 0 | 179.606 | 232.774 | +53.168 |
| Ring road, Namyangju to Guri / 수도권제1순환 남양주에서 구리 | 3277 | 34.16% | 1119 / 0 | 118.048 | 128.852 | +10.804 |
| Ring road, Guri to Namyangju / 수도권제1순환 구리에서 남양주 | 3326 | 32.30% | 1003 / 71 | 134.805 | 143.593 | +8.788 |
| Ring road, Tongillo to Goyang / 수도권제1순환 통일로에서 고양 | 5175 | 56.85% | 2941 / 0 | 186.343 | 195.550 | +9.207 |
| Ring road, Goyang to Tongillo / 수도권제1순환 고양에서 통일로 | 5177 | 56.88% | 2944 / 0 | 186.437 | 198.213 | +11.776 |

Gyeongbu southbound isolates the provider effect:

경부 서울→성남 고정 경로에서 출처별 영향을 분리했습니다.

| Mode / 조건 | Native seconds / 엔진초 | Gyeonggi / EX metres / 경기·도로공사m |
| --- | ---: | ---: |
| baseline | 133.382 | 0 / 0 |
| gits | 135.635 | 309 / 0 |
| ex | 136.843 | 0 / 309 |
| combined | 136.843 | 0 / 309 |

EX has zero coverage on ten of the twelve trial routes; those zero rows remain in [all48 outcomes](actual-comparison/outcomes.json). Do not spread point observations across an entire road to hide the gap. Coverage uses the actual already-trimmed native trace lengths, with no second multiplication by endpoint fractions. Summary/trace distances have native rounding differences. Speeds use the existing native2km/h encoding; returned ETA also includes engine costs, so it is not a simple distance/speed sum.

도로공사만 적용하면 열 경로의 적용률은0이며 전체 결과에 남겼습니다. 검지점 수치를 도로 전체로 확산하지 않고 실제 부분 추적 길이로 적용률을 계산합니다. 거리 반올림·기존2km/h 속도 인코딩·엔진 비용을 유지하며 단순 거리/속도 합산으로 시간을 대신하지 않습니다.

[Independent comparison audit](audits/actual-comparison-independent.json):521 original hashes, three standard Node crypto Ed25519 signatures,114 exact binary speed records,48 original native responses and all source times/values/partial lengths checked independently. Four owned native containers were absent after cleanup. Actual source/signed/traffic bytes are local; public native outputs, JWS/public keys and their inventories are a selected evidence package, not full restoration of agency originals.

원문·표준 서명·바이너리 속도·시각·부분 길이·소유 정리를 독립 확인했습니다. 공개 선별 근거와 로컬 기관 원문 전체를 구분하며 공개 해시로 원문 전체를 복원할 수 있다고 주장하지 않습니다.

## Browser, expiry and current recording / 화면·만료·현재 녹화

The final actual client was checked directly in the in-app browser in English and Korean. The recorded automation additionally checked390px without horizontal overflow. The new recording retains the complete29.95s at1× with bilingual captions outside the original1280×720 frame. It shows actual regional source attribution, original timestamps, calculation and partial coverage; it contains no GPS replay or real user location. [Original recording](capture-original.webm), [frames](frames/route-ko.png), [IAB evidence](iab/final-iab-ko.json).

내장 브라우저의 실제 한영 결과와 녹화 자동화의390픽셀을 확인했습니다. 전체29.95초 원속도를 보존하고 원 화면 밖에 한영 자막을 붙였습니다. 실제 출처·원시각·계산·부분 적용을 보여주며 GPS 재생·실제 사용자 위치는 포함하지 않습니다.

Real wall-clock expiry was observed without changing source time: EX original13:57KST expired14:07KST, selected EX edges2→0 and Gyeonggi54→56. The browser removed the former route, then recalculation used the new generation with unchanged7.58% coverage. The old expiry text incorrectly promised defaults; the final source explains currently usable speeds instead. On final source, the new EX14:06KST capture expired14:16KST and switched the same preserved batch185ms later, before another fetch: [expiry audit](audits/expiry-independent.json). A prior real refresh had already invalidated that browser route, so this final check does not claim the expiry was its first UI invalidation or exercised the corrected expiry-copy branch.

원시각을 바꾸지 않고 실제600초 만료·도로공사 제거·경기 대체·옛 경로 삭제·재계산을 확인했습니다. 기존 기본 속도 확정 문구를 현재 적용 가능한 속도 확인으로 고쳤고 최종 소스에서도 새 관측 만료185ms 뒤 같은 묶음의 자동 전환을 확인했습니다. 최종 화면은 앞선 갱신으로 이미 무효화돼 만료를 첫 화면 무효화·수정 문구 실행으로 주장하지 않습니다.

The expanded context has7204 roads/102208 vertices, exceeding existing GPS admission limits5000/100000. Its attempted replay was rejected and is preserved as a failure, not advertised as accepted regional GPS. Standard Seoul authored GPS regressions remain in the fresh whole run. Next work should select complete competing-road context spatially without blindly lifting bounds.

확장 문맥의 GPS 재생은 상한 초과로 거부됐고 실패를 보존합니다. 기존 서울 합성 GPS 회귀는 새 전체 통합에 유지하지만 지역 재생 수용으로 표현하지 않습니다. 다음은 경쟁 도로를 누락시키지 않는 공간 범위 제한입니다.

## Verification, failures and preservation / 검증·실패·보존

Node22.23.4 full suite393/393 passed again on the final clean source82acad0; preset/expiry copy corrections also passed strict builds and native/browser checks. Fresh committed whole integration includes all prior462 cases plus24 regional authority/runtime cases, with the exact final outcome in [whole assertions](whole/assertions.json.gz) and independent audits. Authored regional faults are explicitly controlled-clock protocol data, not extra actual agency samples.

최종 깨끗한 소스82acad0에서 전체393개·엄격 빌드·실제 엔진/화면을 확인했습니다. 최종 새 통합은 기존462개와 지역24개이며 원 판정·독립 감사로 확인합니다. 통제 장애를 실제 기관 관측으로 세지 않습니다.

First failures remain: the final expiry-display assertion initially expected EXPIRED although a prior real refresh had already cleared the route (retained as an expectation failure, then the distinct automatic fallback was verified); initial TS diagnostics; multipart/empty-page handling; two interior-only regional inventory failures; historical Mapo endpoint beyond100m; an ad-hoc module flag inherited by a worker; first replay timeout from context admission; whole01/02 deliberately interrupted with verified cleanup when manual inspection required copy fixes. No failure is rewritten as success. A separate regional full-native-edge policy resolves the inventory issue with complete locate geometry and ordered partial subcurve proof≤1m; legacy thresholds stay unchanged.

초기 컴파일·지형/쪽 처리·목록2회·마포 끝점·작업 스레드 인수·재생 실패·문구 수정에 따른 통합 중단과 정리를 보존합니다. 결과를 성공으로 바꾸지 않으며 별도 전체 지형/부분 곡선 증명으로 지역 목록을 해결했습니다.

[Preservation policy](preservation.json) and compressed local hash inventories identify excluded originals. Publish source code, authored inputs, selected native outputs, copied controlled SQLite, public keys/JWS, reports and actual media. Do not commit raw agency WFS/WMS/website envelopes, actual agency traffic binaries or private signing state. Open-source code licensing does not grant blanket agency-data redistribution rights. Public operating credentials, reliable EX direct collection, broader reviewed geometry, timezone data, device GPS, spoken guidance and measured ETA accuracy remain future work.

보존 목록·로컬 해시·선별 공개 범위를 명시하고 비밀 상태·기관 원문 전체를 코드 라이선스로 재배포하지 않습니다. 운영 인증·도로공사 직접 수집·넓은 검토 지형·시간대 DB·단말 GPS·음성·정확도 측정은 후속입니다.

## Selected portable evidence / 선별 이동 가능 근거

[ITS authored archive](controlled-archives/its/archive-verification.json) and [regional authored archive](controlled-archives/regional/archive-verification.json) retain785 original files. Fresh extraction independently checked every size/hash ([restoration](audits/controlled-restoration-independent.json)). Join each archive part in lexical order, verify the combined hash, extract into a new directory and compare its `original-files.json.gz`. The full17,756-file whole-system inventory is local and hash-indexed only; do not interpret the selected archives as full-system or agency-source restoration.

자체 실행 원문785개를 두 묶음으로 보존하고 새 폴더 복원 뒤 전 크기·해시를 확인했습니다. 전체 통합17,756파일은 로컬·공개 해시 목록으로 구분하며 선별 묶음을 기관 원문·전체 통합 복원으로 표현하지 않습니다.

Large selected JSON originals are stored losslessly as gzip; [compression inventory](compressed-originals.json) binds each original path, size/hash and gzip file. Decompress into a new directory to recover exact original paths before an audit; the local full run stays unchanged. / 큰 선별 JSON은 무손실 gzip이며 목록에서 원 경로·크기·해시·압축 파일을 연결합니다. 새 폴더에 원 경로로 해제한 뒤 검사하고 로컬 전체 실행은 유지합니다.

Delivery: implementation/evidence payload `ebd163f` was pushed to `feat/public-road-speeds` and its identical remote SHA read back. [Remote receipt](remote-delivery.json). This documentation-only receipt preserves the accepted runtime/media fingerprint; its latest remote SHA is checked after push. / 구현·증거를 작업 브랜치에 푸시하고 원격 일치를 확인했습니다. 이 문서 후속은 수용한 실행·미디어 지문을 유지하며 푸시 뒤 최신 원격 SHA도 확인합니다.
