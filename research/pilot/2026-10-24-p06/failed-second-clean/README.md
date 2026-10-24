# Failed second clean run / 두 번째 깨끗한 실행 실패

Source: `2e69634161728dabc5eb82609dd7155a6bdc4eea`. The fresh actual-Seoul run failed honestly: Mapo-gap complete traversal coverage12/18 did not meet the unchanged70% floor. The newly corrected local-minimum enumeration recovered all13 false ambiguity points; the separate endpoint/direction regression remained. Overall baseline acceptance was213/237. P05 and P06 did not run, so this folder does not claim whole-pipeline success.

위 소스의 새 실제 서울 실행은 마포 누락 완전 통과12/18이70%에 못 미쳐 실패했습니다. 잘못된 모호성13개는 회복됐지만 별도의 끝점·방향 회귀가 남았습니다. 기본 채택은213/237이며 P05·P06은 실행되지 않았으므로 전체 성공 기록이 아닙니다.

The original failure, per-vehicle assertions/evaluation, cleanup records and read-only start-anchor analysis are preserved here. Complete raw output remains locally at `data/p06-main-20261024-r2`; the new regression fixture preserves the relevant original response and observations with OSM attribution. The main design correction is in [the projection contract](../../../../docs/24-observed-projection-policy.md). No input, threshold or prior result was rewritten to pass.

실패·차량별 판정/평가·정리·읽기 전용 시작 근거 분석을 보존합니다. 전체 원문은 위 로컬 경로에 남기고 관련 원응답·관측은 출처를 포함한 회귀 자료에도 보존합니다. 보정 설계는 연결 문서에 있으며 입력·기준·이전 결과를 통과에 맞춰 바꾸지 않았습니다.
