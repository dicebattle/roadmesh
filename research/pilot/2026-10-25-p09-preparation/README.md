# P09 persistent engine capability probe / P09 지속 엔진 실행 능력 조사

[Original archive / 원문 압축](probe.tar.gz) · [Main review / 메인 검토](main-review.json) · [Recorded incomplete outcome / 기록된 미완료 결과](result.json).

## English

Status: incomplete due to the probe's readiness observer, not established HTTP-service failure. Exactly one owned container and one native daemon start were attempted. No package/compiler installation, image build, external request, alternative startup method or restart was attempted. No P09 design/implementation completion is claimed.

The actual current graph is `41a52d348bfeb0a71a988b0fb1680affe510626ac6865cc9b0f775716ffca070`, with manifest image `sha256:34fcb41045d960a181f44583484b7a4372355d4b276f6f78c603e884e706d5c2` (linux/arm64). The graph was mounted readonly; the validated P08 blank traffic file was copied only into the owned work directory. Its SHA256 is `c9d1a038a5c66cbb018f244e3d020eb6b6d4ee8d38f566ebc6cac4809307d23a`. Container inspect records network none,2CPUs,4GiB and no published ports. The copied config fixes `httpd.service.listen=tcp://127.0.0.1:8002` and uses graph tiles plus the owned blank traffic copy.

Installed `valhalla_service --help` explicitly describes “a multi-threaded Valhalla HTTP service” and usage `CONFIG_JSON [CONCURRENCY]` or `CONFIG_JSON ACTION JSON_REQUEST`. Version3.9.1 and installed curl/wget/ps/timeout are recorded in `004.stdout.log`. The single start used `valhalla_service /work/service-config.json 1`; its stdout confirms14 traffic tiles loaded. Original config, startup script and command logs are preserved.

The scripted readiness observer checked only `/proc/net/tcp`. It timed out and entered cleanup without issuing either planned route request. A supplementary read-only observation found the actual LISTEN socket in `/proc/net/tcp6` as IPv4-mapped127.0.0.1:8002, and native `valhalla_service` PID24 alive with start ticks862721. The original observation is preserved in `mapped-loopback-observation.txt`. Thus the readiness assertion's “no listener” wording is contradicted by direct evidence: the observer omitted the mapped IPv6 socket table. This is a probe limitation, not grounds to claim HTTP unsupported.

Actual HTTP route request count:0. Successful repeated same-daemon route count remains unverified. No response JSON, HTTP200 or stable-PID-across-requests claim follows. The same original Teheran OD/options plus date_time.type0 was prepared but not sent.

Cleanup sent TERM only to the exact recorded daemon PID; original process absence was observed before container deletion (`result.json`:daemon_absent_before_container_removal=true). The script then removed the exact label/mount-verified owned container and confirmed absence plus an empty owner-label listing. See `commands.json`, the final inspect/listing logs and `result.json`. Cleanup did not touch other tasks or the P08 graph/source. Further readiness handling or another execution requires a new explicit scope; none was performed here. P08 correction remains the priority.

## 한국어

결과는 **준비 상태 감시 코드의 한계로 미완료**입니다. 같은 소유 컨테이너에서 서비스는 한 번만 시작했습니다. 설치 도움말은 지속 HTTP 모드와 실행 문법을 명시하며 curl도 있습니다. 실제 데몬은 PID24로 살아 있었고14개 교통 타일을 읽었습니다.

제 감시 코드가 `/proc/net/tcp`만 읽어서 준비 실패로 처리했지만, 추가 읽기에서 실제 리스너가 `/proc/net/tcp6`의 IPv4-mapped127.0.0.1:8002에 있음을 확인했습니다. 따라서 HTTP 미지원으로 결론 내리지 않습니다. 준비 실패 후 정리로 들어갔으므로 두 경로 요청은 보내지 않았습니다. 요청 성공·같은 PID의 반복 경로 계산은 아직 확인하지 못했습니다.

현재 그래프·manifest의 실제 이미지·검증한 P08 빈 파일 복사만 사용했고 그래프읽기전용·네트워크차단·CPU2개·메모리4GiB·외부 포트 없음 조건을 유지했습니다. 다른 방식 재시작·설치·외부 요청·생산 변경은 하지 않았습니다.

기록한 정확한 데몬 PID에만 TERM을 보냈고, 컨테이너 삭제 전에 해당 프로세스 부재를 확인했습니다. 소유 라벨/마운트를 확인한 컨테이너만 삭제한 뒤 실제 부재와 빈 소유 목록을 확인했습니다. 원문을 보존하고 추가 실행은 하지 않습니다. P09 설계·구현 완료나 요청 마무리 보장은 아니며 다음 우선순위는 메인이 조사 중인 P08 교정입니다.

## Bounded retry completed / 제한 재검사 완료

[Retry evidence](retry/README.md) records two successful ordinary HTTP routes on the same persistent engine after correcting the socket observer. Main verified 268 original hashes, original responses, stable PID/start ticks, resource isolation and exact container absence. The earlier probe above is preserved. This is capability evidence only; P09 activation and draining remain unimplemented. Archive SHA256: `0eaf279cb67cb06c5f6b07ec1205aa178ce832a1994d28abbe7c1682859a30f8`.

소켓 감시를 고친 제한 재검사에서 같은 지속 엔진의 HTTP 경로 두 건을 성공했습니다. 메인은 원문 해시 268개·응답·같은 PID/시작 눈금·격리·정확한 컨테이너 부재를 확인했습니다. 앞선 실패는 보존하며 P09 활성화·기존 요청 마무리 완료를 뜻하지 않습니다.
