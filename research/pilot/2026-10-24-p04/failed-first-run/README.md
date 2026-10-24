# First integrated attempt / 첫 통합 시도

Clean source `5afbb0c`, Node22.23.4, command `node dist/tools/simulation_checks.js --output data/p04-main-20261024` exited1. The preserved checks show normal, noise, parallel ambiguity, split/overlap and ordinary rejection behavior passing. Tampered graph input was correctly rejected (`InputError`), but the integration harness checked its copied input bundle directory for absence of an output manifest. The input P02 manifest already existed, so this assertion failed. No completed integration manifest was published. The next attempt uses a distinct rejected-output path. This record is retained rather than relabeled as success.

깨끗한 소스5afbb0c·Node22.23.4의 위 명령은 종료1이었습니다. 정상·잡음·평행도로 모호성·분할/중첩·일반 입력 거부는 통과했습니다. 변조 그래프는 InputError로 정상 거부됐지만, 통합 검사기가 복사한 입력 그래프 폴더에서 결과 목록이 없는지 확인했습니다. 그곳에는 원래 P02 목록이 있어 검사가 실패했습니다. 전체 통합 완료 목록은 게시하지 않았습니다. 다음 실행은 별도 거부 결과 경로를 사용하며 이 기록을 성공으로 바꾸지 않습니다.
