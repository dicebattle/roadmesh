# 공식 출처와 조사 기록

확인일: 2026-10-24. 공식 프로젝트 문서, 공개 GitHub 저장소의 기본 브랜치 커밋·릴리스·라이선스 파일, 공급자 문서를 사용했습니다. private 대화 원문·개인 계정 자료는 공개 저장소에 포함하지 않습니다.

## 경로와 지도

- [Valhalla 개요](https://valhalla.github.io/valhalla/): 지원 기능·구성·라이선스 안내.
- [Valhalla 속도](https://valhalla.github.io/valhalla/concepts/speeds/): live traffic 파일과 속도 선택.
- [Valhalla 지도 매칭](https://valhalla.github.io/valhalla/api/map-matching/api-reference/): 매칭 출력의 구간·속성. 고정 버전으로 실제 계약 검증 필요.
- [Valhalla 릴리스](https://github.com/valhalla/valhalla/releases), [COPYING](https://github.com/valhalla/valhalla/blob/master/COPYING).
- [OSRM](https://github.com/Project-OSRM/osrm-backend), [GraphHopper](https://github.com/graphhopper/graphhopper): 비교 엔진.
- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js), [MapLibre Native](https://github.com/maplibre/maplibre-native): 지도 렌더러.
- [PMTiles 문서](https://docs.protomaps.com/pmtiles/), [라이선스](https://github.com/protomaps/PMTiles/blob/main/LICENSE): Range 요청과 읽기 전용 파일.
- [OSM 저작권과 라이선스](https://www.openstreetmap.org/copyright): 데이터 출처와 ODbL.

## 실행 환경

- [Workers 제한](https://developers.cloudflare.com/workers/platform/limits/).
- [Queues 전달 보장](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [과금](https://developers.cloudflare.com/queues/platform/pricing/).
- [Durable Objects 제한](https://developers.cloudflare.com/durable-objects/platform/limits/): 구현 착수 시 객체별 처리량·저장 한도 재확인.
- [KV 동작과 일관성](https://developers.cloudflare.com/kv/concepts/how-kv-works/).
- [R2 과금](https://developers.cloudflare.com/r2/pricing/).
- [Containers](https://developers.cloudflare.com/containers/), [스냅샷](https://developers.cloudflare.com/containers/guides/snapshots/).
- [Supabase 변경 기록](https://supabase.com/changelog), [PostGIS](https://supabase.com/docs/guides/database/extensions/postgis).

Supabase 변경 기록에는 2026-10-12의 일부 TLS 암호군 중단 예고와 10-05의 프레임워크 어댑터 폐기 안내가 있었습니다. 신규 구현에서 낡은 SDK 어댑터 예제를 그대로 복사하지 않고, 실제 선택한 클라이언트 버전의 문서를 확인합니다.

## 분산 배포와 업데이트

- [TUF 개요](https://theupdateframework.io/docs/overview/), [위협 모델](https://theupdateframework.io/docs/security/).
- [Kubo](https://github.com/ipfs/kubo), [IPFS 개인정보](https://docs.ipfs.tech/concepts/privacy-and-encryption/).
- [go-libp2p](https://github.com/libp2p/go-libp2p): 후속 전송 계층 후보의 활동 확인.

## 버스 확장

- [Traccar](https://github.com/traccar/traccar).
- [OneBusAway application-modules](https://github.com/OneBusAway/onebusaway-application-modules).
- [OneBusAway maglev](https://github.com/OneBusAway/maglev).
- [OneBusAway vehicle-positions](https://github.com/OneBusAway/vehicle-positions).
- [OneBusAway trip-updates](https://github.com/OneBusAway/trip-updates).
- [TheTransitClock/transitime](https://github.com/TheTransitClock/transitime).
- [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner).
- [GTFS Realtime 권장사항](https://gtfs.org/documentation/realtime/realtime-best-practices/).

## 조사 결과 해석

[upstream-snapshot.json](../research/upstream-snapshot.json)은 공개 API를 조회한 시점의 저장소·릴리스·커밋 메타데이터입니다. `pushed_at`에는 기본 브랜치 외 활동도 포함될 수 있으므로 기본 브랜치 커밋 시각을 별도로 저장했습니다. 릴리스 조회가 404면 대표 릴리스가 없다는 뜻이며 프로젝트가 중단됐다는 증명은 아닙니다.

성능·정확도·전국 지도 크기·실제 운영비는 아직 측정하지 않았습니다. [로드맵](05-roadmap.md)의 실험이 이를 채웁니다.
