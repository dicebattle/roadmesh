# P08 fixed140m corridor probe / P08 고정140m구간 조사

## English

**The fixed corridor experiment observed a traffic-induced detour.** Patching exactly the three predeclared consecutive directed edges to2km/h changed the original request's route shape. A single actual trace_attributes call confirms all three targets are absent from the new path. Restoring the empty skeleton restores the baseline shape and time exactly (predeclared tolerance1e-6 seconds).

Targets were fixed by the parent from the earlier baseline/alternative comparison, not searched or substituted here: `1338083662224`24m, `1338687642000`41m and central `1338754750864`75m. `prepare.mjs` verifies they occur consecutively in the existing baseline trace with those lengths, and writes `expected.json` before engine execution. This is140m total. The original route request retains its OD/options and date_time.type0, with no exclude_locations, waypoints or artificial cost weight.

| Variant | Time seconds | Distance km | Cost | Baseline shape |
| --- | ---: | ---: | ---: | --- |
| Empty skeleton baseline | 147.404 | 2.119 | 289.959 | same |
| Three edges2km/h | 184.731 | 2.412 | 416.986 | different |
| Empty skeleton restored | 147.404 | 2.119 | 289.959 | same |

All three routes have trip.status0. Actual traffic trace contains none of the three target IDs, including the required central75m edge. The observed traffic shape equals the prior probe2 exclusion-alternative shape. That earlier alternative is an engine observation used for design context, not a copied independent expected route or independently proven optimal path.

The same actual manifest image `sha256:34fcb41045d960a181f44583484b7a4372355d4b276f6f78c603e884e706d5c2` and graph `7f4fd63e63aae5e5b961fc26d36ecae0fe30128c5508d4e184109ef16d59a4be` were used. Original graph and prior extracts were mounted readonly; network none,2CPUs,4GiB. The Node22 script clones the existing upstream skeleton, encodes overall=s1=1 and breakpoint1=255 with remaining fields0, and verifies every changed byte is inside the exact three selected eight-byte speed records. `patch.json` preserves offsets/before/after bytes/original+derived SHA256; no fake C++ ABI claim is made.

Exactly three route calls and one trace call were executed once. Exact Docker/engine arguments are in `commands.json`; requests, raw logs, parsed responses and comparisons are preserved. `container-inspect.json` captures isolation and readonly mounts; `cleanup.json` confirms an empty final owned-container inventory. No production source, documentation, tests or Git changes were made. No repeat or further target search was performed.

This is a direct binary/engine development probe only. It has not implemented or tested15 short contributor trips, P05 ingestion, P06 honest same-window aggregation, P07 current signed acceptance or automatic traffic expiry. The proposed follow-up would use five distinct short trips per edge (15total), staggered to complete in one60-second window, so the whole140m corridor can qualify in one snapshot. That is future scenario design, not a result of this probe.

Commands / 명령:

```
PATH=/Users/dice/.local/share/mise/installs/node/22.23.2/bin:$PATH node data/p08-corridor-design-probe/prepare.mjs
PATH=/Users/dice/.local/share/mise/installs/node/22.23.2/bin:$PATH node data/p08-corridor-design-probe/execute.mjs
```

## 한국어

**고정된 연속140m구간 실험에서 교통정보에 따른 우회를 관찰했습니다.** 미리 지정한 세 방향 구간만2km/h로 패치한 원래 요청이 다른 경로 지형을 반환했습니다. 실제 trace_attributes 한 번으로 세 ID가 모두 새 경로에 없음을 확인했습니다. 빈 skeleton 복구는 기본 지형·시간과 정확히 일치했습니다.

대상은 지정된24m·41m·75m 세 구간이며 바꾸거나 다시 찾지 않았습니다. 기존 baseline trace에서 실제 연속 구간과 길이를 검사하고 실행 전 expected.json에 기대를 저장했습니다. 교통정보 요청에는 제외위치·경유지·인위적 비용 가중치를 넣지 않았습니다.

기본147.404초·2.119km·비용289.959에서 교통정보 적용184.731초·2.412km·비용416.986으로 바뀌었습니다. 복구는 기본값과 같았습니다. 실제 trace에서 필수 중앙75m 구간을 포함한 세 대상이 모두 빠졌습니다. 새 지형은 앞선 probe2에서 관찰한 제외위치 대안과 같지만, 그 결과를 독립 정답 경로로 복제하지 않습니다.

원본 그래프·기존 extract를 읽기 전용으로 재사용하고 동일한 이미지·격리·자원 제한을 유지했습니다. 세 속도 기록 각각8바이트 범위 밖에는 바이트 변경이 없음을 확인했습니다. 정확히 경로3회·trace1회만 실행했고 소유 컨테이너를 정리했습니다. 생산 파일·문서·검사·Git은 변경하지 않았습니다.

이 결과는 바이너리와 실제 엔진의 직접 연결 조사입니다. 구간별5명씩 총15명의 짧은 여행을 같은60초창에 끝내는 실제 수집·집계, 유효한 서명 자료 수용, 자동 만료를 구현하거나 검증한 것은 아닙니다. 해당 내용은 후속 실제 시나리오 설계로 구분합니다.
