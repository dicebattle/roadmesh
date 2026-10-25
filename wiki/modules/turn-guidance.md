# Native turn guidance / 엔진 회전 안내

Implemented NAV-01; [contract](../../docs/36-nav01-turn-guidance.md), [priority plan](../../docs/35-usable-navigation-roadmap.md), [direct evidence](../../research/pilot/2026-10-25-nav01/report.md). Main Sol designed, implemented and reviewed the increment.

NAV-01을 구현했고 메인 Sol이 설계·구현·직접 검토했습니다. 고정 계약·우선순위·원 검증은 연결 문서에서 확인합니다.

`tools/guidance.ts` is a dependency-free shared boundary. The gateway validates raw native mode/units/locale/types/shape continuity/text/rounded totals and publishes only the narrow DTO. `client_server.ts` and browser state require the requested locale; omission preserves unguided response shape. Hashes/final freshness remain authoritative. UI uses `textContent`, an ordered list and existing language controls; changing language cancels and clears the former result.

공통 안내 검증기는 외부 의존이 없고 엔진 수단·단위·언어·종류·지형 연결·문장·합계를 검증해 제한된 자료만 공개합니다. 서버·브라우저가 요청한 언어를 요구하고 안내 없는 전송 형태·해시·최종 신선도를 유지합니다. 문장을 안전한 문자열로 표시하고 언어 변경 때 취소·삭제합니다.

`tools/guidance_checks.ts` adds16 fixed assertions inside the single owned P11 browser lifecycle. They are reported separately from P11's32; whole integration preserves390+16=406. Independent inspectors compare actual daemon bytes, gateway hashes, public DTO, returned polyline and browser order. Fault mutations are boundary tests, not geographic truth or engine-induced faults. Native Korean text can be terse; GPS, speech, real mobile lifecycle and independent road quality remain unverified.

기존 P11 단일 실행 안에 고정16개를 추가하되32개와 별도 보고하고 전체390+16=406개를 유지합니다. 독립 감사에서 실제 데몬 바이트·중계 해시·공개 자료·지형·화면 순서를 대조합니다. 오류 변형은 경계 검사이며 도로 정답·엔진 장애로 주장하지 않습니다. GPS·음성·실제 단말·독립 도로 품질은 후속입니다.
