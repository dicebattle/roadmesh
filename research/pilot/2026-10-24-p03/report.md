# P03 integrated simulation report / P03 통합 시뮬레이션 보고서

**Local result: PASS — five fresh stages, 30/30 assertions.** Main executed and independently inspected clean source [`5422399dcfbce746990600fbdda7ab2cca183f09`](https://github.com/dicebattle/routelens/commit/5422399dcfbce746990600fbdda7ab2cca183f09). The run used Node 22.23.4 on macOS arm64 and real Valhalla 3.9.1/Osmium 1.16.0 in a Linux arm64 Docker container. This report covers all currently implemented processing modules, not the complete P01–P14 project.

**로컬 결과: 통과 — 새 실행 5단계, 30/30판정.** 메인이 위 깨끗한 커밋을 직접 실행·독립 검사했습니다. macOS arm64·Node22.23.4에서 실행을 관리하고 Linux arm64 Docker의 실제 Valhalla·Osmium을 사용했습니다. 현재 구현된 처리 모듈 전체를 검증했으며 P01~P14 전체 프로젝트 완료는 아닙니다.

[Recorded demo / 실제 녹화](https://github.com/dicebattle/routelens/blob/fe1990de7f69834338f0c0619674d6cab1b52048/docs/media/demo.mp4) · [Offline HTML / 오프라인 HTML](report.html) · [Run manifest / 실행 목록](manifest.json) · [Main inspection / 메인 독립 검사](main-verification.json) · [Media hashes / 미디어 해시](media-manifest.json)

## Actual execution / 실제 실행

```sh
npm ci
npm run build
npm run simulation:check -- --output data/new-p03-run
npm run report:serve -- data/new-p03-run
```

The published run's local directory was `data/p03-main-20261024`. Graph identity: `c1d06ace33d8e9184749e7b09c946f632489cdca5064672396e970d9c299aa0a`. Implementation fingerprint: `d7bedeb54be6ca1c15f27603fd6094e817416c9b64f83b0cd93850906f192324`. The source was clean before execution. Captures/documentation were added afterward without modifying the tested runtime.

공개한 실행의 로컬 폴더와 그래프/구현 식별은 위와 같습니다. 실행 전에 소스가 깨끗했고 검사한 실행 코드를 바꾸지 않은 채 이후 캡처·문서를 추가했습니다.

| Stage / 단계 | Directly observed / 직접 확인 | Wall time / 실제 시간 |
| --- | --- | --- |
| Corpus / 자료 검사 | Valid synthetic inputs; strict readiness exit 1 and zero reviewed-road quota / 합성 입력 유효·엄격 준비 판정1·실제 도로0 | 0.581 s |
| P01 | Fresh replay, expected FAIL/SKIPPED and invalid-input behavior / 새 재생·예정된 실패/생략·잘못된 입력 처리 | 0.331 s |
| P02 | New graph build, 22 directed mappings, six real route cases, container removal / 새 그래프·22방향 대응·6실제 경로·컨테이너 삭제 | 3.521 s |
| P03 | Independent trajectories, waiting, bounded noise and omissions / 독립 궤적·대기·잡음 범위·누락 | 0.081 s |
| Replay / 재생 | Fresh same-seed/reordered/clean/other-seed runs, invalid path and tampered bundle rejected / 같은 시드·순서 변경·깨끗한/다른 시드 재실행·잘못된 경로/변조 거부 | 0.397 s |

Images/layers were already available. These timings include orchestration and are not a production throughput benchmark. The 120-second scenario is simulated event time; the recording uses 10× playback. Resource settings (CPU 2, memory 2 GiB, network disabled) are limits, not peak-usage measurements.

이미지 계층이 준비된 상태이며 위 시간은 실행 관리를 포함하고 운영 처리량 벤치마크가 아닙니다. 시나리오120초는 가상 관측시간이고 영상은10배속 재생입니다. CPU2개·메모리2GiB·통신 차단은 설정 한도이며 최대 사용량 실측이 아닙니다.

## Independent expectations / 독립 기대값

| Quantity / 항목 | Expected / 예상 | Actual / 실제 |
| --- | --- | --- |
| Vehicles / 차량 | 3 | 3 |
| Truth samples / 정답 표본 | 187 | 187 |
| Observations / 관측 | 177 | 177 |
| Explicit omissions / 명시적 누락 | 10 | 10 |
| Directed traversals / 방향별 통과 | 8 | 8 |
| Baseline AB exit / 기본 AB 진출 | 22240 ms | 22240 ms |
| Baseline arrival / 기본 도착 | 44479 ms | 44479 ms |
| Upper-route exits after initial wait / 초기 대기 후 상단 진출 | 27240, 49479, 71718, 93957 ms | Identical / 일치 |
| Noise radius / 잡음 반경 | ≤3 m (+0.001 m rounding tolerance / 반올림 허용오차) | max 2.8690967303 m |

Missing observations occur at 15000..24000 ms in one-second steps; 25000 ms is observed. The upper vehicle stays at its starting position through 5000 ms. Main independently recomputed raw output and graph tile hashes, checked exact traversal times, verified the observation/omission partition and confirmed that clean/other-seed/reordered variants preserve truth. Same-seed observations match exactly; changing the seed changes observations. Observations are marked SYNTHETIC and contain no ground-truth edge IDs.

누락은15~24초의1초 간격이고25초 관측은 존재합니다. 상단 차량은5초까지 출발 위치에 정지합니다. 메인이 원본 출력·타일 해시·정확한 통과 시각·관측/누락 분할·정답 불변성을 다시 확인했습니다. 같은 시드의 관측은 동일하고 시드 변경은 관측만 바꿉니다. 관측은 합성으로 표시하고 정답 구간 ID는 포함하지 않습니다.

Invalid authored paths and a modified graph configuration returned exit 2 with no completion manifest. Reusing the integrated output directory also returned 2 and preserved the existing manifest. All child source identities matched the clean parent. No owned engine container remained. The recording browser was closed and its named session reported no running browser; the loopback server terminated under its bounded lifetime and its port was no longer listening.

잘못된 경로·변조 그래프는 종료코드2·완료 목록 없음으로 거부했습니다. 기존 통합 출력도2로 거부하며 목록을 보존했습니다. 하위 실행 소스는 모두 깨끗한 부모와 일치했고 잔여 엔진 컨테이너는 없었습니다. 녹화 브라우저를 닫고 세션 목록의 종료 상태를 확인했으며, 로컬 서버도 제한 수명 내 종료되고 포트가 더 이상 열려 있지 않았습니다.

## Captures / 화면 캡처

The images below come from the actual report bound to the clean source above. The map is an authored fictional fixture. They are not mockups or real road/location observations.

아래 이미지는 위 깨끗한 소스에 연결된 실제 보고서를 캡처한 것입니다. 자체 가상 시험망이며 목업이나 실제 도로·위치 관측이 아닙니다.

![English simulation replay / 영문 시뮬레이션 재생](https://github.com/dicebattle/routelens/blob/fe1990de7f69834338f0c0619674d6cab1b52048/docs/media/report-en.png)

![Korean simulation replay / 국문 시뮬레이션 재생](https://github.com/dicebattle/routelens/blob/fe1990de7f69834338f0c0619674d6cab1b52048/docs/media/report-ko.png)

![Expanded expected and actual crossing times / 펼친 예상·실제 통과 시각](https://github.com/dicebattle/routelens/blob/fe1990de7f69834338f0c0619674d6cab1b52048/docs/media/report-checks.png)

The MP4 is a 31-second H.264 recording at 1280×720, 20 fps. It is trimmed from seconds 7–38 of the actual Chrome recording; the GIF preview uses recorded seconds 9.5–23.5. Main inspected representative frames and decoded the final MP4 without errors. No generated motion replaced the recorded playback. An initial Chrome-for-Testing launch failed because that version was absent; the final recording used an isolated installed Chrome profile. The only browser console error was the optional favicon request returning 404.

MP4는1280×720·20fps·31초 H.264이며 실제 Chrome 녹화의7~38초 구간입니다. GIF는9.5~23.5초입니다. 메인이 대표 프레임과 최종 MP4 디코딩을 확인했고 실제 재생을 생성 애니메이션으로 대체하지 않았습니다. 최초 Chrome-for-Testing 시작은 해당 버전 부재로 실패했고 최종 녹화는 설치된 Chrome의 격리 프로필을 사용했습니다. 콘솔 오류는 선택적 favicon 요청의404뿐이었습니다.

## Verification scope / 검증 범위

New core focused tests: 18/18 passed. Viewer/media focused checks covered provenance, script escaping, safe local serving, missing/stale/modified media and README references. Desktop controls and a 390-pixel mobile layout were directly inspected. Full Node 22/24 and hosted Docker integration results are recorded below after the branch is pushed; they are not inferred from this local run.

신규 코어 집중 검사18개가 통과했습니다. 화면/미디어는 출처·스크립트 삽입·로컬 경로·자료 누락/오래됨/변조·README 참조를 검사했습니다. 실제 데스크톱 조작과390px 모바일 배치도 확인했습니다. 전체 Node 두 버전·원격 Docker 결과는 푸시 후 별도로 기록하며 이 로컬 실행에서 추정하지 않습니다.

P04 matching, P05–P10 traffic/distributed nodes, full P11/P12, P13 and the complete P14b fault matrix remain unfinished. This is not evidence of real-road accuracy, public-node trust, actual mobile operation or production readiness. See the [full goal audit](../../../docs/18-goal-progress.md).

P04 매칭·P05~P10 교통/분산 노드·P11/P12 전체·P13·P14b 전체 장애 행렬은 미완료입니다. 실제 도로 정확도·공개 노드 신뢰·실제 모바일·운영 준비의 증거가 아닙니다. 전체 목표 판정표를 참고하세요.

## Hosted verification / 원격 검증

[Actions run 40080824622](https://github.com/dicebattle/routelens/actions/runs/40080824622) passed on `3f735adc6c6ad2b5b9e6a1ba101d81504a1b78f5`: Node 22 **71/71**, Node 24 **71/71**, current-media checks, a **fresh real Docker integration with 30/30 assertions**, and Required checks. Main downloaded the artifacts and independently checked root/P03 file hashes, clean source identity, 187/177/10/8 counts, exact upper crossings, replay truth hashes and cleanup state. [Hosted proof](hosted-verification.json).

위 커밋의 원격 실행에서 Node22·24 각각71/71, 미디어 검사, **새 실제 Docker 통합30/30**, 종합 검사가 통과했습니다. 메인이 결과물을 내려받아 원본 해시·깨끗한 출처·독립 개수/시각·재생 정답 해시·정리를 확인했습니다.

The hosted engine ran on Linux amd64, while local evidence used Linux arm64 containers. Their graph IDs intentionally differ because the image identity is bound into the graph ID. Each run's P02 and P03 preserve the same exact graph ID internally. The implementation fingerprint matches the recording on both platforms; no cross-platform graph-byte identity is claimed.

원격 엔진은Linux amd64, 로컬 컨테이너는Linux arm64입니다. 이미지 식별을 그래프 식별에 결합하므로 그래프 ID가 의도적으로 다르며 실행 내부 P02·P03은 각각 같은 정확한 ID를 유지합니다. 구현 지문은 녹화와 같지만 플랫폼 간 그래프 바이트 일치를 주장하지 않습니다.

Historical media links are pinned to the P03 merge commit; `media-manifest.json` preserves the original metadata bytes. Report results and raw evidence are unchanged. / 과거 미디어는 P03 병합 커밋에 고정하고 원래 메타데이터 바이트를 보존했습니다. 보고 결과·원본 증거는 바꾸지 않았습니다.
