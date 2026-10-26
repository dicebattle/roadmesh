# Timestamped regional routing increment / 원시각 포함 지역 경로 연결

Requested 2026-10-26: connect Gyeonggi and Korea Expressway observations to actual Seoul/metropolitan native routes, measure directed coverage and ETA changes, preserve bilingual evidence and push the feature branch. Main Sol owns design, implementation and direct review. No main merge, paid resource, account/key application or deployment is requested.

경기·도로공사 원시각 자료를 실제 서울·수도권 엔진 경로에 연결하고 적용률·예상 시간 변화를 직접 검증합니다. 메인 Sol이 설계·구현·검토하며 작업 브랜치 푸시까지 수행합니다.

Discovery/design gate: the ITS-only contract requires exact standard node/link identity. Do not relabel service-link IDs, VDS points or conzones as ITS links. Obtain official compatible geometry/direction and retain CRS, original bytes/hash, source time, geometry revision and mapping omissions. A website timestamp proves neither geometry nor permitted continuous access. No key registration or transport bypass; public demo access stays explicitly labeled. Unavailable geometry must remain excluded rather than passing via weaker tolerances.

기존 ITS 식별자 계약에 서비스 링크·검지기·콘존을 위장하지 않습니다. 기관 지형·방향·좌표계·원문 해시·원시각·미대응을 검토하고 공개 시험 접근을 표시합니다. 지형이 검증되지 않으면 기준을 완화하지 않고 제외합니다.

Reuse the pinned actual OSM source, native traffic encoding, signature/expiry/high-water safeguards and client. A small explicit regional adapter/contract may be added after source geometry inspection; preserve existing ITS and synthetic behavior. Define an auditable Seoul/metropolitan route inventory before measurement. Compare baseline and traffic with the same graph, request/departure clock and saved source batch; report route changes separately from same-shape ETA changes. Capture timestamps stay unchanged; any historical replay must be visibly labeled with its fixed clock and cannot serve as current traffic. Test wrong direction, stale/future/missing/duplicate data, ambiguity, mixed-source conflict, source outage and expiry before native/browser acceptance. Run fresh implemented-module integration, inspect originals and refresh media when runtime behavior changes.

고정 OSM·변환·서명·만료·순번·화면을 재사용하고 출처 지형 확인 후 좁은 지역 연결 계약을 확정합니다. 측정 전 시험 도로 목록을 고정하고 같은 지도·요청·출발시각·관측 묶음으로 비교합니다. 과거 재생은 고정 시계를 표시하며 현재 교통으로 제공하지 않습니다. 집중 장애·방향·시각·중복 검증과 새 전체 통합·원문·화면·녹화를 확인합니다.
