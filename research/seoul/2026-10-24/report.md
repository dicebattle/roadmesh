# Actual Seoul road simulation proof / 실제 서울 도로 시뮬레이션 증거

Local result: **PASS — 48 tiny regression checks plus 29 Seoul checks**, from clean source `7cca509948e69286a572f3c87e74bea3db683df4`. Main designed and independently inspected the work; Sol implemented the TypeScript changes. Hosted verification is pending at this publication step.

로컬 결과: 깨끗한 소스에서 **tiny 회귀 48개와 서울 검사 29개 통과**입니다. 메인이 설계·독립 검증하고 Sol이 TypeScript 변경을 구현했습니다. 이 기록 단계에서 원격 검증은 아직 전입니다.

## Actual capture / 실제 캡처

[![Actual Seoul replay / 실제 서울 재생](../../../docs/media/demo.gif)](../../../docs/media/demo.mp4)

[MP4](../../../docs/media/demo.mp4) · [English capture / 영어 화면](../../../docs/media/report-en.png) · [한국어 화면](../../../docs/media/report-ko.png) · [Assertion capture / 검사 화면](../../../docs/media/report-checks.png) · [Media provenance / 미디어 출처](media-manifest.json)

The 17.25-second video is actual Chrome report playback, 1280×720, encoded at 20 fps, with English/Korean route selection. MP4 and GIF contain the full recording. This is capture configuration, not a renderer performance claim. Main inspected desktop/mobile replay, labels, controls, source attribution and 390 px mobile overflow. JavaScript error inspection was empty; the separate capture browser had only a missing favicon 404. A later stale capture reference failed after the video was already saved; the browser closed via its trap, and the assertion screenshot was captured in-app. All temporary tabs, recording daemon/browser and the owned report server are cleaned up at delivery.

17.25초 영상은 Chrome의 실제 보고서 재생이며 1280×720·20fps 인코딩으로 한영 경로 선택을 담았습니다. MP4·GIF는 녹화 전체이며 인코딩 설정을 화면 성능으로 주장하지 않습니다. 메인이 데스크톱·모바일 재생, 라벨·조작·출처·390px 화면 넘침을 확인했습니다. 확인한 JavaScript 오류는 없었고 별도 녹화 브라우저에는 favicon 404만 있었습니다. 영상 저장 후 추가 캡처의 오래된 참조가 실패해 trap으로 브라우저를 닫았으며 검사 화면은 내장 브라우저로 촬영했습니다. 결과 전달 시 임시 탭·녹화 프로세스·보고서 서버를 정리합니다.

## Inputs and result / 입력과 결과

- Source: Geofabrik South Korea, **2026-10-23**, 289,916,859 bytes; SHA-256 `282d012b7629c643695f286d4424d7f6d88548d99edb5577ca5b678906f13c17`. Original MD5 matched the official sidecar. [Source record](graph/source-verification.json).
  원본은 Geofabrik 한국 자료이며 날짜·크기·해시를 고정했고 공식 MD5도 대조했습니다.
- Envelope: west/south/east/north **126.7, 37.4, 127.25, 37.75**. It includes adjacent boundary roads and complete referenced ways/restrictions, not exactly Seoul's administrative boundary. Export: 149,857 geometry records, 1,268 context geometries shown; these are not car-road counts. Selected scenes have **79 directed edges, including 24 curved polylines**.
  서울과 인접 경계·완전한 참조 도로/회전제약을 포함한 범위이며 행정경계와 다릅니다. 전체 지형 내보내기·표시용 부분집합·선택 시나리오 구간 수는 서로 다른 수치입니다.
- Teheran-ro, downtown Seoul and Mapo Bridge each have clean, 3 m bounded-noise, and noise-plus-gap vehicles: **9 vehicles**. Seed 7, 500 ms samples, initial 5 s wait, then 10 m/s, up to 300 s. Gaps use [30 s, 40 s).
  세 경로에 정상·최대 3m 잡음·잡음과 누락 차량을 각각 배치합니다. 시드 7·500ms 표본·초기 5초 정지 뒤 10m/s·최대 300초·30초 이상 40초 미만 누락입니다.
- **3,264 truth samples = 3,204 observations + 60 omissions**; 3,190 points matched, 14 excluded. **237 true traversals → 215 accepted, 22 missed**. **28 engine candidates excluded**: this denominator differs because engine candidates include extra/partial traversals. Accepted false directed occurrences and accepted gap bridges are both zero.
  정답 표본은 관측과 예정 누락으로 정확히 나뉩니다. 정답 통과의 미회수 22개와 엔진 후보 제외 28개는 분모가 다르며 서로 대체하지 않습니다. 수용한 잘못된 방향 통과와 누락을 가로지른 수용 통과는 모두 0개입니다.

| Vehicle / 차량 | Matched/input / 매칭률 | Correct/matched / 매칭점 정확도 | Accepted/truth / 수용·정답 | Missed / 미회수 | Max boundary error ms / 최대 경계 오차 |
| --- | --- | --- | --- | --- | --- |
| teheran-clean | 99.76% | 100.00% | 35/37 | 2 | 100 |
| teheran-noise | 99.05% | 99.05% | 35/37 | 2 | 336 |
| teheran-gap | 98.76% | 98.74% | 32/37 | 5 | 317 |
| downtown-clean | 100.00% | 100.00% | 24/24 | 0 | 100 |
| downtown-noise | 100.00% | 99.19% | 23/24 | 1 | 204 |
| downtown-gap | 100.00% | 93.36% | 19/24 | 5 | 368 |
| mapo-bridge-clean | 100.00% | 100.00% | 18/18 | 0 | 97 |
| mapo-bridge-noise | 99.05% | 98.31% | 16/18 | 2 | 384 |
| mapo-bridge-gap | 100.00% | 99.25% | 13/18 | 5 | 392 |

Point correctness includes only the defined actual shared-endpoint equivalence within 1 m. A point match is not a complete traversal. Noisy downtown-gap point precision is **93.36%**, even though accepted complete traversals have no false directed occurrence; do not claim every point is correct. Clean thresholds were fixed before coding: ≥98% precision, ≥90% point coverage, ≥70% traversal coverage and ≤100 ms accepted boundary error. Noisy accepted traversals require zero false occurrences, nonzero coverage per route and ≤1,000 ms error. Actual maximum accepted error is **392 ms**.

표본 정확도는 실제 공유 끝점 1m 이내의 명시한 동등성만 포함합니다. 표본 매칭과 완전 통과는 다릅니다. 도심 잡음/누락 표본 정확도는 **93.36%**이며 수용한 통과에 잘못된 방향 순번이 없다고 모든 표본이 맞는 것은 아닙니다. 정상 기준은 구현 전 정확도 98%·매칭률 90%·통과 범위 70% 이상과 오차 100ms 이하로 고정했습니다. 잡음 수용 통과는 잘못된 방향 순번 0개·경로별 0보다 큰 범위·오차 1,000ms 이하이며 실제 최대는 **392ms**입니다.

## Independent inspection and corrected failure / 독립 검사와 수정한 실패

Main checked **816 matching-file hashes**, actual full/split-only/overlap result byte equality within the verified graph, source/graph identities, omissions and owned-container cleanup. An independent local-tangent distance calculation reproduced truth boundary milliseconds exactly and found maximum noise **2.998987 m**. [Main inspection](main-verification.json), [numeric reference](numeric-reference-verification.json), [full evaluation](workload/evaluation.json).

메인이 매칭 파일 해시 816개·같은 그래프의 실제 전체/분할/중첩 결과 바이트·원본/그래프 식별·누락·컨테이너 정리를 확인했습니다. 독립 국소 거리 계산으로 정답 경계 밀리초가 정확히 일치했고 잡음 최대는 2.998987m였습니다.

The first clean run failed: the downtown noisy/gapped vehicle's initial 5 s stop was assigned to a preceding edge endpoint, producing a false timing acceptance. [Failure evidence](failed-first-run/README.md) is retained. The observations-only `seoul-observed-v2` policy now excludes timing when a shared-endpoint uncertainty cluster lasts ≥1,000 ms before the transition. It preserves the estimated time and observed cluster evidence. Truth is never supplied to matching, and thresholds were not relaxed.

최초 깨끗한 실행은 도심 잡음/누락 차량의 초기 5초 정지가 앞 구간 끝점에 붙어 잘못된 시간을 수용하면서 실패했습니다. 실패 증거를 보존하고 전환 전 공유 끝점의 불확실 관측이 1,000ms 이상 이어지면 시간을 제외하도록 수정했습니다. 원래 추정 시간·관측 군집을 보존하며 정답을 매칭에 넣거나 기준을 완화하지 않았습니다.

Graph identity: `ad3dc3ebcef69b287c7fbe2a76ff3f3a343c24942f265e6cafa3235c4792ed9c`. Fresh GPH tile bytes can differ between builds, so graph and derived traversal IDs also differ. Main linked the final run to independently inspected numeric files only after byte-comparing edge geometry, truth, observations, omissions and evaluation, plus matching values excluding graph-bound IDs. This does not claim reproducible graph bytes. Recorded local stage durations: tiny 9.18 s, graph 37.59 s, workload 27.52 s; source/image already available, not a general performance benchmark.

새 GPH 타일 바이트와 그에 연결된 그래프·통과 식별자는 생성마다 달라질 수 있습니다. 최종 실행의 지형·정답·관측·누락·평가 바이트와 그래프 식별자만 제외한 매칭 값을 직접 대조한 뒤 독립 수치 근거를 연결했습니다. 그래프 바이트 재현을 보장하지 않습니다. 로컬 단계별 시간은 tiny 9.18초·그래프 37.59초·실행 27.52초이며 원본/이미지가 이미 준비된 이번 실행의 측정값입니다.

## Reproduce and license / 재현과 라이선스

[Module commands](../../../wiki/modules/seoul-simulation.md) · [Design](../../../docs/21-seoul-road-simulation.md) · [Offline report](report.html) · [Run manifest](manifest.json) · [Assertions](assertions.json).

[Evidence archive](evidence.tar.gz), **26,576,376 bytes**, SHA-256 `25bda67dbb0bcda2ce06d8eb77cfb8f91e42cdbc7f9f22da6a035b556f1cdf96`, contains original JSON/text/HTML/TSV requests, responses, cases and manifests. Extract into a new directory to browse all relative evidence links. [Scope](ARCHIVE-SCOPE.md): country/Seoul PBF, graph tiles and duplicated tampered graph bundles are omitted; their recorded hashes remain. Rebuild omitted binary artifacts from the pinned source; do not expect identical graph bytes.

증거 묶음은 원본 JSON·텍스트·HTML·TSV 요청/응답·사례·목록을 보존합니다. 새 폴더에 풀면 상대 증거 링크를 볼 수 있습니다. 국가/서울 PBF·타일·중복 변조 그래프는 제외하고 해시를 보존합니다. 생략한 바이너리는 고정 원본으로 다시 생성하되 그래프 바이트 동일성을 전제하지 않습니다.

Map and derived geometry: **© OpenStreetMap contributors, ODbL 1.0**, via Geofabrik. [Data license](DATA-LICENSE.md) / [NOTICE](../../../NOTICE). Code: Apache-2.0. Vehicles/GPS/speeds are synthetic. Same-engine engineering evidence is not independent real driving accuracy, nationwide coverage, live congestion or the reviewed 100/100 corpus. P05–P14 remain incomplete.

지도·파생 지형은 OpenStreetMap 기여자의 ODbL 1.0이며 코드의 Apache-2.0과 구분합니다. 차량·GPS·속도는 합성입니다. 같은 엔진의 공학적 검증으로 독립 실주행 정확도·전국 범위·실시간 혼잡·검토한 100/100 자료를 주장하지 않습니다. P05~P14 전체는 미완료입니다.
