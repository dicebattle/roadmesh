# P09 persistent HTTP capability retry / P09 지속 HTTP 실행 능력 재검사

## English

Status: the single approved bounded retry observed two successful route requests on the same native persistent engine. This corrects only the earlier readiness observer's IPv4-only socket-table assumption. The original failed probe is preserved unchanged. This is not P09 implementation/design completion or evidence of activation, draining, failover, expiry switching, load capacity or production latency.

Inputs come from `data/p08-portable-main-20261025`: the exact `seoul/graph/manifest.json` image, verified graph mounted readonly, and the blank immutable generation referenced by `traffic/routes/baseline.json`. Before execution the script verifies baseline mode NO_USABLE_SNAPSHOT, snapshot=null, live_edges=0, matching graph/image/generation/file hash and identical ordinary request. It copies that blank file only into its new owned output; no original file is modified. `expected.json` preserves exact graph/image/manifest/skeleton identity, source generation/path, request, predeclared sequence and limits.

Isolation: one uniquely named/labeled container, network none,2CPUs,4GiB, exact readonly graph mount and no host port binding. `container-inspect.json` preserves the actual settings. Installed tools/help/version were inspected without package installation, image building or external requests. The only daemon start was `valhalla_service /work/service-config.json 1`. Its configured listen address remained `tcp://127.0.0.1:8002`.

The readiness command checks both `/proc/net/tcp` and `/proc/net/tcp6`, requiring state0A, port8002 and exactly IPv4127.0.0.1 or its IPv4-mapped IPv6 representation, plus the recorded daemon PID being alive. It observed `0000000000000000FFFF00000100007F:1F42` in tcp6 (`007.stdout.log`). No wildcard listener or alternate bind/start was used.

| Observation | First request | Second request |
| --- | --- | --- |
| Endpoint/method | Loopback POST /route | Same |
| HTTP status | 200 (`010.stdout.log`) | 200 (`013.stdout.log`) |
| Native trip.status | 0 | 0 |
| Native engine PID/start ticks |24 /1007057 |24 /1007057 |
| ETA seconds |147.404 |147.404 |
| Distance km |2.119 |2.119 |
| Cost |289.959 |289.959 |
| Shape |same as recorded P08 baseline |same as first/P08 baseline |

PID/start ticks were checked before both requests and after each request; the native process was alive in every observation. Exactly two HTTP calls were made, using the same original two-point Teheran request, auto costing, kilometers/en-US and date_time.type0. Raw headers and JSON bodies are `route-1.*` and `route-2.*`; complete command stdout/stderr and exact arguments are indexed in `commands.json`. `observations.json` retains original /proc stat strings, summaries, shapes and comparison values. No daemon restart occurred between requests.

Cleanup sent TERM only to the exact recorded daemon. Its native PID was absent before container removal; the waiting launch shell recorded daemon.exit=0. The container was removed only after checking its unique owner label and exact /work source mount. Final exact inspect reports absent, and the owner-label inventory is empty (`result.json`, final command logs). There are no retained owned services. No tracked/P08 source, previous evidence or other task resource was changed.

Commands / 명령:

```
PATH=/Users/dice/.local/share/mise/installs/node/22.23.2/bin:$PATH node data/p09-engine-service-probe-r2/probe.mjs
```

## 한국어

승인된 제한 재검사 한 번에서 **같은 실제 지속 엔진으로 경로 요청 두 번이 성공했습니다.** 이전 준비 감시가 tcp만 읽었던 한계만 고쳤고 첫 실패 원문은 보존했습니다. P09 구현·설계 완료나 활성화·기존 요청 마무리·장애 전환·만료 교체·처리 용량·운영 지연 검증은 아닙니다.

portable-main의 실제 그래프 manifest 이미지와 baseline 결과가 참조하는 빈 불변 세대를 검증해 새 소유 폴더로만 복사했습니다. 원본은 수정하지 않았습니다. 그래프 읽기 전용·네트워크 차단·CPU2개·메모리4GiB·외부 포트 없음 조건을 실제 inspect로 확인했습니다.

서비스를 한 번 시작한 뒤 tcp/tcp6 양쪽에서 정확한 loopback8002 리스너와 PID 생존을 확인했습니다. 실제 리스너는 IPv4-mapped127.0.0.1이었습니다. 불특정 주소로 바꾸거나 대체 시작을 하지 않았습니다.

동일한 원래 테헤란 두 좌표·현재 출발 일반 요청을 POST /route로 정확히 두 번 보냈고 둘 다 HTTP200·정상 trip.status0이었습니다. PID24와 시작 눈금1007057이 요청 전·각 요청 뒤 모두 같았습니다. 두 결과는 경로 지형·147.404초·2.119km·비용289.959로 같았으며 기록된 P08 기본 경로와도 일치했습니다. 원 HTTP 상태·헤더·JSON·프로세스 상태를 모두 보존했습니다.

정확한 데몬에 TERM을 보내 정상 종료코드0과 프로세스 부재를 확인한 뒤 소유 라벨·마운트가 맞는 컨테이너만 삭제했습니다. 실제 컨테이너 부재와 빈 소유 목록을 확인했습니다. 생산 파일·P08 코드·이전 자료·다른 작업 자원은 변경하지 않았고 추가 실행은 하지 않았습니다.
