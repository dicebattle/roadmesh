# Interrupted first clean run / 첫 깨끗한 실행 중단

Source 040117b completed tiny48 + Seoul35 + P05 34 + P06 34, but stopped during P07 database readiness. On resumption both original tool sessions and parent/observer processes were absent; OrbStack reported Stopped and Docker was unavailable. No P07 assertion or whole-run manifest exists. The initiating cause is unknown; this is incomplete evidence, not a passed simulation or a proven application failure.

소스 040117b는 작은 회귀48·서울35·P05 34·P06 34를 완료했지만 P07 데이터베이스 준비 중 멈췄습니다. 재개 시 원래 도구 세션·상위/관찰 프로세스가 없고 OrbStack과 Docker도 중지 상태였습니다. P07 검사·전체 실행 결과가 없으므로 미완료이며 성공이나 애플리케이션 결함으로 단정하지 않습니다. 최초 중단 원인은 확인되지 않았습니다.

Main restarted the local runtime, verified the exact run label, removed only its abandoned database container/volume and private environment directory. Other resources were preserved. The original partial outputs are archived, omitting source PBF files, generated tiles and tampered graph copies; original manifests retain hashes for omitted files. No production code or acceptance threshold changed. A new clean whole run is required.

메인이 로컬 실행 환경을 복구하고 정확한 실행 라벨을 확인해 해당 잔여 DB 컨테이너·볼륨·비공개 환경 폴더만 정리했습니다. 다른 자원은 보존했습니다. 부분 결과를 보존하되 PBF·생성 타일·변조 그래프 사본은 제외했고 원래 목록의 해시는 유지합니다. 생산 코드·통과 기준 변경 없이 새 깨끗한 전체 실행이 필요합니다.
