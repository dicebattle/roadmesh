# P04 map matching / P04 도로 매칭

Status: implementation added; independent full-run and hosted verification pending. / 상태: 구현을 추가했으며 메인의 전체 실행·원격 검증은 아직 전입니다.

Main designed the [bounded contract](../../docs/19-p04-matching-design.md). Sol implemented the TypeScript adapter and report integration. Valhalla3.9.1 performs actual map snapping; RouteLens validates input/graph identity, excludes uncertain evidence and computes observed traversal times. Truth is supplied only to the post-match evaluator.

메인이 제한된 계약을 설계하고 Sol이 TypeScript 연결기·보고서 통합을 구현했습니다. 실제 지도 대응은 Valhalla3.9.1이 수행합니다. RouteLens는 입력·그래프 식별을 검사하고 불확실 증거를 제외하며 관측 통과시간을 계산합니다. 정답은 매칭 이후 평가기에만 전달합니다.

```sh
npm run build
npm run match -- data/input.json --graph data/graph --output data/new-match
npm run simulation:check -- --output data/new-integrated-run
```

The input envelope contains `schema_version`, `matching_id`, `graph_id`, and P03-style `observations`. No truth fields are accepted. The existing P02 bundle must include its local PBF/tiles and verified evidence. The published compact report archive deliberately omits large graph binaries; use a fresh integration run to generate a reusable local bundle.

입력 봉투에는 위 네 필드와 P03 형식의 관측만 넣습니다. 정답 필드는 거부합니다. 기존 P02 묶음은 로컬 PBF·타일·검증 증거를 포함해야 합니다. 공개하는 작은 보고 자료는 큰 그래프 바이너리를 생략하므로 재사용할 로컬 묶음은 새 통합 실행으로 만듭니다.

- `--batch-size N --overlap N` exercises bounded context accumulation. Finalization runs once at trip end; this is not a persistent or real-time queue.
  이 옵션은 제한된 문맥 누적을 검사합니다. 여행 종료 후 한 번 계산하며 영속·실시간 큐가 아닙니다.
- Matched GPS points and accepted complete traversals are different counts. A matching point can belong to an excluded partial traversal. Gaps, ambiguity and unsupported timing remain explicit reasons.
  대응된 GPS와 수용된 완전 통과는 다른 개수입니다. 매칭점이 일부 통과 제외에 속할 수 있으며 누락·모호성·시간 근거 부족을 사유로 보존합니다.
- `manifest.json` is written last, only after successful execution, graph rechecking and verified owned-container cleanup. Raw request/response/command files, semantic results and source identity are hash-bound.
  실행·그래프 재검사·소유 컨테이너 정리가 확인된 뒤에만 마지막에 목록을 작성합니다. 요청·응답·명령 원문과 의미 결과·소스 식별을 해시로 연결합니다.
- Synthetic-only policy:3000ms continuity, conservative parallel-way geometry, exact endpoint observations or bounded interpolation. The production sampling draft and real-road accuracy are not established by these fixtures.
  합성 전용 정책은3000ms 연속성·보수적 평행도로 검사·끝점 관측 또는 제한 보간입니다. 운영 관측 초안·실제 도로 정확도를 증명하지 않습니다.

Next: [P05 durable ingestion and recovery](../../docs/20-p05-ingestion-design.md). / 다음은 P05 영속 수집·복구입니다.
