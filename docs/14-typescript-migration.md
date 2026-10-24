# TypeScript verification tools / TypeScript 검증 도구 전환

Decision: use TypeScript/Node.js for the evaluation-corpus validator, P01 runner, direct-check wrapper and future pilot tooling. Main designs and reviews; Sol implements. The user explicitly requested the migration while the project is small. Production and verification share a language/toolchain, and later shared contracts need not be reimplemented in Python. This replaces the earlier Python tooling decision; it is not a claim of measured performance superiority.

결정: 자료 검사기·P01 실행기·직접 검사 도구·후속 파일럿 도구를 TypeScript/Node.js로 통일합니다. 메인이 설계·검토하고 Sol이 구현합니다. 사용자가 초기 단계에서 전환을 명시적으로 요청했으며 운영·검증의 언어와 도구를 맞추고 후속 계약을 Python으로 재구현하지 않기 위함입니다. 기존 Python 선택을 대체하며 성능 우위를 실측했다는 뜻은 아닙니다.

## Preserved contract / 보존할 계약

- Keep scenario/corpus schema 0.1, JSON report keys, enum values and exits 0/1/2. CLI invocation changes to documented npm/Node commands; bilingual wording may improve without changing meaning.
  시나리오·자료 규격 0.1, JSON 필드·enum·종료코드 0/1/2를 유지합니다. 실행 명령은 npm/Node로 바뀌며 이중 언어 문구는 의미를 유지해 개선할 수 있습니다.
- Preserve event sequence and exact canonical SHA-256, including Python-compatible seeded integer jitter and ASCII-escaped sorted-key JSON. Use an existing MT19937 implementation plus a small compatibility adapter, not a new random algorithm.
  Python 호환 정수 시드 지연과 ASCII 이스케이프·키 정렬 JSON을 포함해 이벤트 순서·정확한 SHA-256을 유지합니다. 기존 MT19937 구현에 작은 호환 어댑터를 붙이고 새 난수 알고리즘은 만들지 않습니다.
- Reject duplicate JSON keys, malformed values, boolean numbers, unknown fields and unsafe/nonfinite numeric inputs. Exact integer domains use safe-integer validation in JavaScript. Ordinary supported inputs must match Python; any explicit numeric-domain tightening is recorded rather than hidden.
  중복 JSON 키·잘못된 값·bool 숫자·알 수 없는 필드·안전 범위 밖/비유한 숫자를 거부합니다. 정수 계약은 JavaScript 안전 정수 검사를 사용합니다. 지원 입력은 Python과 같아야 하며 숫자 영역을 더 엄격히 제한하는 차이는 숨기지 않고 기록합니다.
- Preserve required SKIPPED→unsuccessful behavior, semantic same-time order, source commit/dirty provenance, no loaded graph/engine claims, new-directory-only writes and completion manifest written last.
  필수 생략 검사의 실패 처리·같은 시각의 의미상 순서·커밋/미커밋 출처·엔진 미실행 표시·새 폴더만 쓰기·완료 목록의 마지막 저장을 유지합니다.

## Implementation boundary / 구현 경계

Use strict TypeScript compiled by `tsc`, Node's test runner and npm lockfile. Node 22 and 24 are CI targets. Keep dependency versions exact. Candidate libraries verified from their official npm metadata: `jsonc-parser` 3.3.1 (strict JSON mode plus AST duplicate detection), `random-js` 2.1.0 (MT19937), TypeScript and Node typings as development dependencies. Do not silently accept JSON comments/trailing commas just because the parser supports them. Do not add a generic application framework.

strict TypeScript를 `tsc`로 컴파일하고 Node 테스트 실행기·npm 잠금 파일을 사용합니다. CI 대상은 Node 22·24이며 의존성은 정확한 버전으로 고정합니다. 공식 npm 메타데이터에서 확인한 후보는 엄격 JSON과 AST 중복 검사에 `jsonc-parser` 3.3.1, MT19937에 `random-js` 2.1.0, 개발 의존성으로 TypeScript·Node 타입입니다. 파서가 지원한다고 주석·후행 쉼표를 허용하지 않습니다. 범용 앱 프레임워크는 추가하지 않습니다.

Port all 28 existing behavioral test categories; add cross-language golden cases. Remove tracked executable Python/tests after parity is established; preserve old implementation in Git history and old evidence untouched. Final CI must not depend on Python. Keep stable aggregate `Required checks` and GitHub Actions app identity so main protection continues to work.

기존 행동 검사 28개 범주를 모두 이전하고 언어 간 기준 사례를 추가합니다. 동등성 확인 후 실행용 Python·테스트를 버전 관리에서 제거하되 Git 이력과 과거 증거는 그대로 보존합니다. 최종 CI는 Python에 의존하지 않습니다. 종합 검사 이름과 앱 식별은 유지해 main 보호를 이어갑니다.

## Proof and integration / 증명과 반영

Capture Python reference outputs from revision `0095b3b2611b1ced21e8c39f788d9799bf58dbd9` before removal. Cover seeds 0, 1, 7, 8 and 4294967295, Unicode labels, declaration reordering, successful/failed/skipped assertions, corpus readiness and invalid-input exits. These are migration reference outputs, not new road ground truth. Main directly compares the implementations and inspects clean-commit reports and Node 22/24 CI artifacts. Runtime provenance fields may differ appropriately; event/content contracts must not.

제거 전에 위 Python 리비전의 결과를 보존합니다. 여러 시드·유니코드·선언 순서·성공/실패/생략·자료 준비 상태·입력 오류 종료코드를 비교합니다. 이는 이전 기준이며 도로의 새 정답 자료가 아닙니다. 메인이 두 구현을 직접 비교하고 깨끗한 커밋의 보고서·Node 22/24 CI 결과물을 검사합니다. 런타임 출처 필드는 실제 환경에 맞게 달라질 수 있지만 이벤트·내용 계약은 유지해야 합니다.

The current feature branch contains the earlier design branch. A protected merge commit of the verified feature branch will integrate both histories; verify ancestry afterward. No force push, protection bypass or unrelated repository merge. Continue P02 from the resulting main.

현재 기능 브랜치에는 앞선 설계 브랜치가 포함됩니다. 검증한 기능 브랜치를 보호된 PR로 merge commit 병합하면 두 이력이 모두 들어가며 이후 조상 관계로 확인합니다. 강제 푸시·보호 우회·다른 저장소 병합은 하지 않습니다. 이후 갱신된 main에서 P02를 진행합니다.
