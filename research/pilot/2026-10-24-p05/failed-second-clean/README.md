# Second clean P05 run: observer race / 두 번째 깨끗한 P05 실행: 관찰 경쟁

Clean source `9ba9bbc9181975e575d43010954eb91f62d3b744` passed tiny48, fresh Seoul29 and31 P05 assertions. Actual response-loss recovery, PostgreSQL same-volume restart, engine retry exhaustion, clock-only expiry, revocation and24h deletion were exercised. The retention read-back contains zero trips, batches, samples, traversals, events and raw payloads; the configured contributor registry remains.

깨끗한 소스에서 tiny48·새 서울29·P05의31검사를 통과했습니다. 응답 유실 복구·같은 볼륨의 PostgreSQL 재시작·엔진 재시도 한도·시계만 진행한 만료·철회·24시간 삭제를 실제로 검사했습니다. 삭제 후 여행·배치·표본·통과·이벤트·원문은0개이며 설정한 기여자 등록부는 남습니다.

The final abort probe failed. [Raw observation](engine-observation-race.json) shows an actual `locate` process, followed by its absence after Docker pause. It ended between the separate commands. Cleanup succeeded, but this is not evidence of interrupting a running engine and there is no final PASS manifest. The corrected probe uses a bounded observer inside the exact owned container to SIGSTOP the verified matching process, checks executable/state, then pauses and kills/cleans the worker/container.

마지막 중단 검사는 실패했습니다. 원문에는 실제 locate 프로세스가 있지만 Docker 일시정지 뒤에는 없습니다. 두 명령 사이에 실행이 끝났습니다. 정리는 성공했으나 실행 중 엔진을 중단한 증거가 아니므로 최종 통과 목록을 만들지 않았습니다. 수정 검사는 정확한 소유 컨테이너 안에서 실제 매칭 프로세스를 정지하고 실행 파일·상태를 확인한 뒤 처리자/컨테이너 종료·정리를 수행합니다.
