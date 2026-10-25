# NAV-01 turn guidance contract / NAV-01 회전 안내 계약

Status: main-agent design fixed before implementation. / 상태: 구현 전에 메인 에이전트가 설계를 확정합니다.

## Request and compatibility / 요청·호환성

Add optional `guidance_language: "en-US" | "ko-KR"` to the public gateway request and the internal traffic/node route request. Omission keeps today's native request, public response and legacy tests unchanged. Presence requests validated guidance and selects the same locale in Valhalla's native request. Unknown locales or fields are rejected before calling a node. Request hashes cover the complete actual request, including this option. The existing graph/snapshot/generation/cost/expiry/deadline checks remain authoritative.

공개 요청과 내부 엔진 요청에 선택형 안내 언어를 추가합니다. 생략하면 기존 네이티브 요청·공개 응답·회귀 검사를 유지합니다. 지정하면 같은 언어를 Valhalla에 전달하고 안내를 검증해 반환합니다. 지원하지 않는 언어·필드는 노드 호출 전에 거부합니다. 요청 해시는 이 선택값까지 포함하며 지도·교통자료·세대·비용·만료·기한 검사는 그대로 적용합니다.

## Public result / 공개 결과

Only a guided successful request adds `guidance`:

안내를 요청한 성공 응답에만 다음 자료를 추가합니다.

```ts
interface RouteGuidance {
  schema_version: "0.1";
  language: "en-US" | "ko-KR";
  maneuvers: Array<{
    index: number;
    native_type: number;
    instruction: string;
    distance_m: number;
    duration_s: number;
    begin_shape_index: number;
    end_shape_index: number;
  }>;
}
```

The guidance inherits the enclosing route's exact request hash, graph/snapshot/generation identity and geometry. Shape indexes address that returned polyline, not a resampled distance axis. Never invent a maneuver from heading differences or translate native instructions with an AI model.

안내는 바깥 경로의 요청 해시·지도/교통자료/세대·지형에 연결합니다. 인덱스는 반환한 원 경로 정점을 가리키며 새로 만든 거리축을 사용하지 않습니다. 방향 변화만으로 회전을 꾸미거나 AI로 원 안내를 번역하지 않습니다.

## Validation / 검증

Accept only one successful car leg with kilometers and the requested native locale, 2–512 maneuvers, bounded nonempty plain-text instructions (≤1024 code units), finite nonnegative lengths/times and integer shape indexes inside the exact decoded geometry. The sequence must start at geometry index 0, end at its final point, remain contiguous/nondecreasing and contain a departure followed by an arrival. Preserve the pinned engine's numeric maneuver type; support only known 3.9.1 driving maneuvers. Check total maneuver distance/time against the validated route summary: distance tolerance `(maneuver_count + 1) * 0.5 + 0.000001` meters and time tolerance `(maneuver_count + 1) * 0.0005 + 0.000001` seconds. These bounds cover independent rounding to 0.001 km and 0.001 s in pinned 3.9.1. Types 1–27 and 37–38 are supported car guidance; ferry/transit/indoor/park instructions fail closed in this first car-only increment. Arrival must be the final zero-length, zero-time maneuver; intermediate departure/arrival types are rejected. A bad or missing list is a rejected node response, never a partial successful route. No unvalidated signs, URLs, speech strings or extra native fields enter the public DTO.

성공한 자동차 구간 하나·킬로미터 단위·요청한 엔진 언어·2~512개 안내·제한된 비어 있지 않은 일반 문자열·유한한 거리/시간·원 지형 안의 정수 인덱스만 받습니다. 첫 정점부터 마지막 정점까지 순서와 연결을 확인하고 출발·도착을 요구합니다. 고정 엔진의 알려진 주행 안내 종류만 지원하며 전체 거리·시간은 원 경로 요약과 명시한 직렬화 오차 안에서 대조합니다. 목록이 잘못되거나 없으면 노드 응답을 거부하며 부분 성공으로 표시하지 않습니다. 검증하지 않은 표지·URL·음성 문자열·추가 필드는 공개하지 않습니다.

## Browser behavior / 브라우저 동작

The actual browser client requests its current locale and shows an ordered maneuver list with the route result. A language change cancels the request and clears the former route/instructions, so an English list cannot remain under Korean labels or vice versa. Existing input changes, failures, version changes, expiry and unavailable service clear the guidance together with geometry. Use `textContent`; instructions cannot inject HTML. Keep map/result usable on 390px, keyboard operation and a readable list when WebGL is unavailable. No GPS collection, simulated current-position marker, speech playback or "start driving" claim is added.

현재 화면 언어로 안내를 요청하고 경로 결과 아래에 회전 목록을 표시합니다. 언어를 바꾸면 요청을 취소하고 이전 경로·안내를 지워 잘못된 언어의 목록이 남지 않게 합니다. 입력 변경·실패·버전 변경·만료·사용 불가 때도 지도와 함께 지웁니다. 문자열은 HTML로 삽입하지 않고 390픽셀·키보드·지도 불가 상태에서도 읽을 수 있어야 합니다. GPS 수집·현재 위치 모사·음성 재생·주행 시작 주장은 이번 범위가 아닙니다.

## Direct acceptance / 직접 통과 조건

Preserve the existing 390 checks. Add real native English/Korean requests and actual browser bindings; compare every published instruction/type/index/distance/time to retained native originals, verify baseline and traffic routes, language switching, malformed/missing/out-of-range/noncontiguous guidance rejection and route invalidation. Prove ordinary unguided wire compatibility. Expected values are declared before implementation; an unchanged PASS counter is not new guidance evidence. Record precise new case IDs/counts with the integration design before running the acceptance suite.

기존 390개를 유지합니다. 실제 한영 엔진 요청·브라우저 결과에서 공개한 문장·종류·인덱스·거리·시간을 원본과 모두 대조하고 기본/교통 경로·언어 전환·잘못된/누락/범위 밖/끊긴 안내 거부·경로 무효화를 확인합니다. 안내 없는 요청의 기존 전송 호환성도 검증합니다. 실제 검사 전에 새 검사 ID·수를 고정하며 기존 통과 수만으로 새 안내 검증을 주장하지 않습니다.

## Fixed acceptance inventory / 고정 통과 목록

The sixteen `nav01-` IDs are fixed before implementation: `native-baseline-en`, `native-baseline-ko`, `native-traffic-en`, `native-traffic-ko`, `exact-native-binding`, `legacy-wire`, `unknown-locale`, `missing-guidance`, `wrong-locale`, `invalid-index`, `broken-continuity`, `inconsistent-metrics`, `unsafe-text`, `language-reset`, `input-clears`, `mobile-readable`. They run inside the owned P11 browser lifecycle, are reported separately, and are added after preserving all 390 original whole-pilot checks: **406 total**. Fault cases mutate a same-run real result and exercise the shared boundary validator; they are not claimed as native engine faults or geographic ground truth. Actual engine/browser cases use retained originals. P11 Korean acceptance now recalculates after switching language instead of reusing an English result.

구현 전에 위 16개 ID를 고정합니다. P11 소유 브라우저 수명주기 안에서 실행하되 별도로 보고하고 기존 전체 390개 뒤에 추가해 **전체 406개**로 검사합니다. 오류 사례는 같은 실행의 실제 결과를 변형해 공통 경계 검증기에 넣으며 엔진 자체 장애나 실도로 정답으로 주장하지 않습니다. 실제 엔진·브라우저 사례는 원본을 보존합니다. P11 한국어 검사는 영어 결과를 재사용하던 방식에서 언어 변경 후 재계산으로 바꿉니다.

## Implementation outcome / 구현 결과

The fixed sixteen cases passed inside the actual P11 runtime on a fresh Seoul graph, preserving all390 previous cases for406 total. Strict build and310 tests passed; main independently checked every original published instruction/metric/index against daemon bytes and exact geometry. See [the dated evidence](../research/pilot/2026-10-25-nav01/report.md). Native Korean phrasing is retained as produced; driving/localization usability, GPS progress and speech remain future acceptance.

새 서울 지도의 실제 P11 실행 안에서 고정16개를 통과하고 기존390개를 유지해 전체406개를 통과했습니다. 엄격 빌드·검사310개와 메인의 공개 원 안내 전체/수치/인덱스·데몬 바이트/정확한 지형 대조를 기록했습니다. 한국어 문장은 엔진 원문을 유지하며 실주행 표현·GPS 진행·음성 검증은 후속입니다.
