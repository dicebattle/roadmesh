# P01 runner and P14a checks / P01 실행기와 P14a 검사

Scope: a deterministic **fixture-label event schedule**, assertion evaluation and evidence files. It does not produce GPS, load a graph, call Valhalla, inject network/process failures, or measure real-road accuracy. Those boundaries remain P02 onward.

범위는 결정적인 **시험 도로 이름표 이벤트 일정**, 검사 판정, 증거 파일입니다. GPS 생성·그래프 로딩·Valhalla 호출·프로세스/통신 장애 주입·실제 도로 정확도 측정은 하지 않습니다. 해당 기능은 P02 이후에 남아 있습니다.

The main agent designed [the implementation contract](../../docs/13-p01-p14a-contract.md). A Sol subagent implements the code and focused tests. The main agent inspects the code and directly executes committed scenarios before recording completion. Status and evidence are kept in [the work log](../log.md).

메인 에이전트가 [구현 계약](../../docs/13-p01-p14a-contract.md)을 설계했고 Sol 하위 에이전트가 코드·집중 테스트를 구현합니다. 메인 에이전트가 코드를 검토하고 커밋된 시나리오를 직접 실행한 뒤 완료를 기록합니다. 상태·증거의 기준은 [작업 기록](../log.md)입니다.

## Evidence interpretation / 증거 해석

- Event hashes are comparable across repeated runs; run UUIDs and wall-clock timestamps are deliberately different.
  반복 실행의 이벤트 해시는 비교 가능하며 실행 UUID·현실 시작시각은 의도적으로 다릅니다.
- `source_commit` and `dirty_tree` describe the actual checkout at execution. A later documentation commit does not retroactively change the tested code identity.
  `source_commit`·`dirty_tree`는 실제 실행 체크아웃 상태입니다. 이후 문서 커밋이 검사한 소스 식별자를 소급 변경하지 않습니다.
- A failed or unsupported required assertion makes the run unsuccessful even when evidence files were written successfully.
  결과 파일을 정상 저장했어도 필수 검사가 실패하거나 미지원이면 실행은 성공이 아닙니다.
- CI's intentional negative scenarios must fail as expected. Their expected rejection is a successful check of error handling, not a claim that those scenarios passed.
  CI의 의도적 실패 시나리오는 실제로 예상대로 실패해야 합니다. 예상된 거부는 오류 처리 검사의 성공이며 시나리오 자체의 성공이 아닙니다.
- Graph identity in a scenario is a future reference only. The run manifest must clearly identify the lack of engine execution.
  시나리오의 그래프 식별자는 후속 연결용 참조이며, 실행 목록은 엔진을 실행하지 않았음을 명시해야 합니다.

## Run commands / 실행 명령

From the repository root, choose output directories that do not yet exist. Repeating a command with the same directory is intentionally rejected.

저장소 루트에서 아직 존재하지 않는 출력 폴더를 지정합니다. 같은 폴더로 명령을 반복하면 의도적으로 거부됩니다.

```bash
mkdir -p data
python3 -m tools.pilot_runner fixtures/pilot/success.json --output data/p01-example
python3 -m tools.pilot_checks --output data/p01-checks
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The [runner](../../tools/pilot_runner.py) writes events, assertions, a bilingual summary and a final manifest. Completion manifests are written last. Existing paths are preserved. The [direct-check wrapper](../../tools/pilot_checks.py) runs five CLI cases: two successful replays, an expected assertion failure, an unsupported assertion and invalid input. It checks report contents as well as exit codes, and fails if the expected behavior is violated.

[실행기](../../tools/pilot_runner.py)는 이벤트·판정·이중 언어 요약과 최종 실행 목록을 저장하며 완료 목록은 마지막에 기록합니다. 기존 경로는 보존합니다. [직접 검사 도구](../../tools/pilot_checks.py)는 성공 재생 두 번·의도적 실패·미지원 검사·잘못된 입력의 다섯 CLI 사례를 실행하고, 종료코드뿐 아니라 보고서도 검사하여 기대 동작이 깨지면 실패합니다.

The [fixture](../../fixtures/pilot/success.json) independently expects 7 events: 2 departures, 3 fixture-label entries and 2 scheduled markers. The last marker occurs at 500 ms. Same-time order is departure, edge entry, then fault marker. Markers do not inject actual failures.

[예제](../../fixtures/pilot/success.json)의 기대값은 독립적으로 계산한 출발 2개·도로 이름표 진입 3개·장애 표식 2개, 총 7개입니다. 마지막 표식은 500ms입니다. 같은 시각에서는 출발·도로 진입·표식 순서이며, 표식이 실제 장애를 주입하지는 않습니다.

## P14a workflow / P14a 워크플로

[Fast checks](../../.github/workflows/fast-checks.yml) runs the existing corpus and new P01 tests under Python 3.11 and 3.13. Job names are `Python 3.11`, `Python 3.13` and the aggregate `Required checks`. Evidence upload runs even after a test fails; absence of expected artifacts is an error. Matrix failure, cancellation or skipping prevents aggregate success. Artifacts are retained for seven days.

[빠른 검사](../../.github/workflows/fast-checks.yml)는 Python 3.11·3.13에서 기존 자료 검사와 신규 P01 테스트를 실행합니다. 작업 이름은 위와 같고 종합 검사는 `Required checks`입니다. 실패 후에도 증거를 업로드하며 필요한 결과물이 없으면 오류입니다. 버전별 검사 실패·취소·생략은 종합 성공을 막습니다. 결과물 보관은 7일입니다.

Sol's first focused suite passed 26 tests. Main review found ordering and interrupted-output gaps, which Sol corrected with two regression tests. The revised focused suite passed 28 tests in one additional run. Clean-commit direct verification and hosted CI evidence are recorded separately in the work log; unit success alone is not proof of hosted CI.

Sol의 최초 집중 검사 26개 통과 후 메인 검토에서 순서·저장 중단 문제가 발견됐고 Sol이 회귀 테스트 두 개와 함께 수정했습니다. 수정된 집중 검사 28개는 추가 한 번 실행으로 통과했습니다. 깨끗한 커밋 직접 검증과 원격 CI 증거는 작업 기록에 별도로 남기며 단위 검사 성공만으로 원격 CI를 증명하지 않습니다.

## Sources and boundaries / 출처와 경계

The workflow follows GitHub's [push and pull-request triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and [minimal permissions and pinned actions](https://docs.github.com/en/actions/reference/security/secure-use) guidance. Action revisions are recorded in the contract. No upstream routing code or private dataset is bundled.

워크플로는 GitHub의 [푸시·PR 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)와 [최소 권한·Actions 버전 고정](https://docs.github.com/en/actions/reference/security/secure-use) 지침을 따릅니다. Actions 커밋은 구현 계약에 기록합니다. 외부 경로 엔진 코드·비공개 데이터는 포함하지 않습니다.
