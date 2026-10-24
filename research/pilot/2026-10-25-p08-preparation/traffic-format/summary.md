# P08 traffic-format development probe / P08 교통정보 형식 개발 조사

## English

This is a bounded format/engine development probe, not P08 implementation completion, P07 valid-snapshot acceptance, legal-detour proof, or expiry automation. The historical artifact expired at 2026-10-24T00:04:00Z; its three LIVE IDs were used only as sample targets. No other targets were searched or substituted. Expectations were written to `expected.json` before building or routing.

Input graph: `data/p07-claim-fix-main-20261025/seoul/graph`, graph ID `7f4fd63e63aae5e5b961fc26d36ecae0fe30128c5508d4e184109ef16d59a4be`. Actual manifest image: `sha256:34fcb41045d960a181f44583484b7a4372355d4b276f6f78c603e884e706d5c2`, linux/arm64. The graph was mounted readonly. The container had no network and limits of 2 CPUs/4 GiB. Upstream `valhalla_build_extract -c /work/build-config.json --with-traffic` created the extracts under owned `/work`. No project Python implementation or dependency installation was introduced.

The Node22 patch script parses the original first `index.bin` TAR member as 16-byte little-endian records: uint64 offset, uint32 tilebase, uint32 member size. It verifies every member's bounds, 32-byte header, matching uint64 tilebase, version3, and exact `32+8*directed_edge_count` length. Selected GraphIds use low3 level, low25 tilebase and the upper bits for edge index. Only each selected eight-byte record changes; all other bytes, TAR layout and index remain byte-identical. Index bytes, full original/derived SHA256 hashes, headers, offsets and before/after raw bytes are in `original-index.bin` and `patch-evidence.json`. This is not a compiled C++ ABI proof.

Each selected complete edge was encoded with overall=s1=kph/2, breakpoint1=255 and all remaining fields zero. Three byte ranges were patched: 310624..310631, 310944..310951 and 310976..310983. No zero-speed closure was introduced. Four actual route invocations used identical original Teheran OD/options plus `date_time.type=0`, each with an explicit distinct traffic path:

| Variant | Time (seconds) | Delta | Cost | Distance (km) | Shape |
| --- | ---: | ---: | ---: | ---: | --- |
| empty skeleton baseline | 147.404 | 0 | 289.959 | 2.119 | baseline |
| three edges at 10 km/h | 177.663 | +30.259 | 301.485 | 2.119 | same |
| three edges at 2 km/h | 273.783 | +126.379 | 399.887 | 2.119 | same |
| empty skeleton restored | 147.404 | 0 | 289.959 | 2.119 | same |

All four responses have trip.status=0. Restoration matches baseline shape and time within the predeclared 1e-6-second tolerance. Time and cost increased with lower selected speeds; no route-shape change was observed. These are observed responses, not independently declared expected alternatives. No-effect was not treated as success.

One actual `trace_attributes` call over the baseline route shape confirms all targets are present: 1296274839952 (0.028 km, baseline speed57), 1297617017232 (0.023 km, speed57), 1297751234960 (0.047 km, speed94). The 0.098 km total supports the expected direction of length-based time change. Exact total route time is engine output; this probe does not assert it equals a simple length/speed quotient or explain all costing adjustments.

Original stdout/stderr and exact requests are preserved per variant. The four route calls were made once each; trace was called once. `observations.json` contains parsed comparisons. `container-inspect.json` records actual mounts/resource isolation. `cleanup.log` records exact owned-container deletion and an empty final label-filtered inventory. No owned container or process remains. The source graph is read-only; production code, documentation, tests and Git were not changed.

## 한국어

고정된 형식과 실제 엔진 효과를 확인하는 개발 조사입니다. P08 구현 완료·P07 유효 자료 수용·합법 대안 경로·자동 만료 복구의 증거가 아닙니다. 입력 artifact는 이미 만료된 역사 자료이며 LIVE 세 개의 ID만 표본으로 사용했습니다. 다른 대상을 찾거나 바꾸지 않았고 실행 전에 expected.json을 작성했습니다.

같은 새 서울 그래프와 manifest에 기록된 실제 파생 이미지를 사용했습니다. 그래프는 읽기 전용으로 연결했고 네트워크 차단·CPU2개·메모리4GiB 한도를 적용했습니다. 설치된 상위 도구로 graph extract와 traffic skeleton을 생성했습니다.

Node22 조사 스크립트가 index.bin의 16바이트 기록과 모든 member 범위·헤더32바이트·tilebase·구간 수·형식버전3을 검사했습니다. 선택한 속도 기록 세 개의 8바이트만 변경하고 index·그 밖의 바이트·TAR 배치를 그대로 보존했습니다. 원본/파생 해시와 변경 위치·원시 바이트를 기록했으며, 이를 C++ 컴파일을 통한 ABI 증거로 표현하지 않습니다.

실제 경로 계산 네 번에서 시간은 147.404초 → 177.663초 → 273.783초 → 147.404초였습니다. 속도를 낮추자 시간과 비용이 늘었으며 거리와 경로 지형은 모두 같았습니다. 빈 skeleton 복구는 사전 허용 오차 안에서 기본값과 일치했습니다. 우회는 관찰되지 않았습니다. 복구는 수동 파일 선택으로 확인했으며 자동 만료 처리로 표현하지 않습니다.

기본 경로의 trace_attributes를 실제로 한 번 실행하여 대상 세 개가 모두 경로에 포함됨을 확인했습니다. 길이는 각각28m·23m·47m입니다. 방향은 길이 기반 통과시간 증가와 일치하지만 전체 엔진 시간을 단순한 거리/속도 나눗셈으로 설명하거나 독립 정답으로 복제하지 않습니다.

원문 명령·응답·해시·변경 위치·실행계획이 아닌 실제 엔진 응답을 보존했습니다. 고유 소유 컨테이너만 삭제했고 최종 라벨 조회는 비어 있습니다. 생산 파일·문서·검사·Git은 수정하지 않았습니다.
