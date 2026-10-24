# First clean run and coverage finding / 첫 깨끗한 실행과 관측 보존 문제

Clean source `5a173c8aadc4c7e93bf1622510420e5e0e1db3f2` passed145 existing assertions. [Main inspection](main-verification.json) checked2,642 unique raw hashes and all193 stored/reference traversals. [P06 inspection](aggregation-verification.json) independently checked the actual aggregate, process/lock/deletion behavior and cleanup. The [live DB read](main-live-contributions.json) includes the actual activity/consent/availability fields of21 stored P06 contributions before revocation.

위 깨끗한 소스에서 기존145개 검사를 통과했습니다. 메인이2,642해시·저장/기준193통과와 실제 집계·중단·잠금·삭제·정리를 독립 검사했습니다. 실행 중 DB에서 읽은21개 P06 통과에는 실제 활동·동의·사용 가능 시각도 포함됩니다.

**Not the final accepted implementation.** Comparing the unchanged237-traversal denominator showed baseline acceptance193/237 versus prior v2's215/237. Clean inputs improved to79/79, but noisy/gapped traces lost coverage. The previous positive-result checks alone did not detect this usefulness regression. [Per-vehicle evaluation](seoul-evaluation.json), [original-candidate analysis](local-minimum-analysis.json), [main correction contract](../../../../docs/24-observed-projection-policy.md).

**최종 승인 구현은 아닙니다.** 정답237개를 그대로 비교하니 이전215개보다 채택이 줄었습니다. 정상 입력은79/79로 좋아졌지만 잡음·누락이 있는 자료의 보존율이 낮아졌습니다. 기존 성공 판정만으로는 이 유용성 저하를 잡지 못했습니다. 차량별 평가·후보 원문 분석·보정 계약을 함께 보존합니다.

Of14 ambiguous projected points,13 extra clamped vertices were not local distance minima of the continuous path; their exactly shared adjacent segment had a strictly closer interior projection. One genuine two-interior ambiguity remains. The refinement removes only those invalid candidates without relaxing0.01m ambiguity or150ms/2% timing/speed criteria. Add the existing70% complete-traversal coverage floor to all six noisy/gapped vehicles as well as clean ones, preserving the original checks. The subsequent full run therefore requires151 assertions.

모호 표본14개 중13개는 더 가까운 인접 내부 투영이 있는 같은 꼭짓점을 잘못 중복 후보로 센 경우였습니다. 진짜 내부 후보 두 개가 있는1개는 계속 제외합니다. 동률·시간·속도 기준을 완화하지 않고 잘못된 후보만 제거합니다. 정상 입력에 이미 적용하던 완전통과 보존율70%를 잡음·누락6대에도 추가해 원래 검사와 함께 다음 전체151개를 요구합니다.

These are compact inspection records; complete raw outputs remain preserved locally. The new regression fixture includes the original relevant engine responses and geometry with attribution. All vehicle activity is synthetic, with OSM-derived geometry retaining ODbL1.0. The first run is retained as a passed gate with a subsequently discovered review finding, not silently relabeled or overwritten.

이 폴더는 주요 검사 기록이며 전체 원문은 로컬에 보존합니다. 새 회귀 자료에는 관련 엔진 원문·지형·출처를 넣습니다. 차량은 합성이고 지도는 ODbL1.0을 유지합니다. 첫 실행은 기존 판정을 통과했지만 검토에서 문제를 찾은 기록으로 보존하며 결과를 조용히 바꾸거나 덮어쓰지 않습니다.
