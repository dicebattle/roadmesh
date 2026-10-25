# NAV-02 clock correction and final acceptance / 시간 경계 수정·최종 수용

This report supersedes the runtime acceptance in [first NAV-02 report](../2026-10-25-nav02/report.md), while preserving every earlier original. Final review found that a future fix received after the last valid position expired could reject the fix yet retain old ON_ROUTE guidance. The original Seoul-route reproducer showed FUTURE_FIX + ON_ROUTE +2117m at now6000ms. The minimum correction reuses the existing monotonic `advance(now)` after route binding and clock validation, before rejecting sample times. The same input now returns FUTURE_FIX + STALE with no next turn, remaining distance or confirmed position. No other algorithm or quota changed.

앞선 NAV-02 원문은 보존하고 실행 수용은 이 보고서로 대체합니다. 마지막 유효 위치 만료 뒤 미래 표본을 받으면 표본만 거부하고 옛 안내가 남는 것을 서울 경로에서 직접 재현했습니다. 연결·시계 검증 뒤 기존 시계 만료를 먼저 적용하는 최소 수정으로 같은 입력에서 오래됨과 현재 안내/거리/확정 위치 보류를 확인했습니다. 다른 알고리즘·통과 개수는 바꾸지 않았습니다.

- Design, code, direct review: main Sol, no subagents. / 메인 Sol이 설계·구현·직접 검토했습니다.
- Clean source: `fe49b55cad5b61a9f2dd6043922b4480e5bf2bbb`.
- Implementation SHA256: `70af32dc05269aee3a739e234e8db66718bfd1ee86c70b4d84c776be2c5a1db4`.
- [Before](clock-gap-before.json) · [after](clock-gap-after.json) · [contract](../../../docs/37-nav02-route-progress.md).

## Verification / 검증

Node22 strict build, focused10/10 and full320/320 passed. Fresh whole438/438 preserves406 prior cases and32 progress cases; the existing future-sample case now also checks expired guidance. Exact identities and results are in [manifest](manifest.json), [whole report](report.html), [whole independent audit](main-whole-verification.json) and [progress independent audit](main-progress-verification.json). All original/native/signature/state/SQLite inspections are repeated for the corrected clean source rather than inherited from the previous PASS. / Node22 엄격 빌드·집중10개·전체320개를 통과했고 새 전체438개에서 기존 미래 표본 사례의 만료 안내 검사를 강화했습니다. 수정 소스의 원문·엔진·서명·저장·SQLite를 다시 확인했으며 과거 성공을 대신 쓰지 않습니다.

The actual browser checks replay noisy GPS on original Seoul geometry, next turn/remaining distance, actual nearby-road departure, pause, rejoin, endpoint arrival, invalidation and390px layout. The IAB manual review and newly recorded full video use the same corrected runtime. Authored positions and synthetic traffic remain clearly labeled. / 실제 화면으로 서울 원 지형의 합성 오차·다음/남은 거리·주변 도로 이탈·중단·복귀·끝점 도착·초기화·390픽셀을 검증합니다. 내장 브라우저·새 전체 녹화도 수정된 실행을 사용하며 합성 구분을 유지합니다.

[![Final replay](https://raw.githubusercontent.com/dicebattle/routelens/41bebadf3d4a1b475ab95bceb69f208ce202967e/docs/media/demo-poster.ko.png)](https://raw.githubusercontent.com/dicebattle/routelens/41bebadf3d4a1b475ab95bceb69f208ce202967e/docs/media/demo.ko.gif)

[English GIF](https://raw.githubusercontent.com/dicebattle/routelens/41bebadf3d4a1b475ab95bceb69f208ce202967e/docs/media/demo.gif) · [한국어 GIF](https://raw.githubusercontent.com/dicebattle/routelens/41bebadf3d4a1b475ab95bceb69f208ce202967e/docs/media/demo.ko.gif) · [MP4](https://raw.githubusercontent.com/dicebattle/routelens/41bebadf3d4a1b475ab95bceb69f208ce202967e/docs/media/demo.ko.mp4) · [original](capture-original.webm) · [video provenance](published-video.json) · [manual evidence](iab/review.json).

## Original preservation / 원문 보존

[Inspectors](inspectors/), [logs](logs/), [reconstructable whole originals](originals/) and [restoration verification](restoration-verification.json) retain actual bytes. Concatenate archive parts in lexical order, check receipt SHA256, extract to a fresh folder, verify every listed size/hash. Only exact declared map binaries are omitted; native JSON/XML and SQLite/WAL/SHM are retained. Hosted omissions are explicitly unverified bytes; no missing bytes are fabricated. Raw tool output whitespace is preserved. / 검사기·로그·복원 묶음과 영수증을 보존합니다. 이름순 분할 연결·해시·새 폴더 복원·전체 크기/해시를 검사하며 선언 지도 외 엔진·SQLite를 유지합니다. 원격 지도 제외는 바이트 미확인으로 명시하고 원문 공백도 보존합니다.

```sh
npm test
npm run simulation:check -- --output data/your-fresh-nav02-run
npm run media:check
npm run cloudflare:types -- --check
```

## Scope and delivery / 범위·전달

The module demonstrates route-bound authored GPS on actual Seoul OSM; it does not measure real phone accuracy, reviewed legal road correctness, accessible entrances, real ETA or production availability. No automatic rerouting, voice or device location upload is added. NAV-06 destination search/confirmation is next; independent100-route/100-matching and real-device gates remain. The authorized finish is feature push, exact-head required CI/original review and normal protected main merge. No deployment. The exact final hosted CI result and inspected-original summary will be recorded in the bilingual protected merge commit after observation. This avoids changing the tested PR head merely to add its own CI result; the local originals remain versioned here. / 실제 서울 위 자체 합성 진행이며 단말 정확도·도로 법규·접근 출입구·실제 도착시간·운영 가용성 검증은 아닙니다. 자동 재탐색·음성·단말 위치 업로드 없이 다음은 목적지 검색/확인이고 독립100/100·단말 조건은 남습니다. 승인 범위는 푸시·정확한 원격 검사/원문 검토·정상 보호 main 병합이며 배포하지 않습니다.
