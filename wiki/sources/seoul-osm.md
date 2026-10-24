# Seoul OSM source and engine probes / 서울 OSM 출처·엔진 조사

Inspected2026-10-24 by main. / 메인이2026-10-24에 확인했습니다.

- [Geofabrik South Korea](https://download.geofabrik.de/asia/south-korea.html) lists a public dated PBF and its checksum. Main downloaded the2026-10-23 file and verified the upstream MD5, then pinned SHA256 for project integrity. Dates, bytes and bounding extraction are fixed in [the design](../../docs/21-seoul-road-simulation.md). Public extracts omit contributor user IDs/names; no private driver history is included.
  공식 국가 추출본·비교 파일을 내려받아 MD5를 대조하고 프로젝트 무결성은SHA256으로 고정했습니다. 날짜·바이트·추출 범위는 설계에 기록합니다. 공개 추출본은 기여자 계정 식별자를 생략하며 개인 주행 이력을 포함하지 않습니다.
- [OSM copyright](https://www.openstreetmap.org/copyright) identifies ODbL and attribution requirements. Keep map data/derived geometry licensing distinct from Apache-2.0 project code. Display credits and source/license links in reports and recordings.
  공식 저작권 안내의 ODbL·출처 표기를 반영하고 지도·파생 지형과 Apache-2.0 코드를 구분합니다. 보고서·녹화에 출처·라이선스 링크를 표시합니다.
- [Osmium extraction manual](https://docs.osmcode.org/osmium/latest/osmium-extract.html) explains complete referenced ways and strategy options. The installed1.16.0 accepts short `-S types=restriction`; a first probe's guessed long flag was rejected before extraction, and its owned container was removed. Corrected extraction/build/route requests passed; preserve the failure as probe evidence.
  공식 설명대로 참조된 전체 도로·전략을 사용합니다. 설치 버전은 짧은 옵션을 받습니다. 첫 조사에서 잘못 쓴 긴 옵션은 추출 전 거부돼 컨테이너를 정리했고, 올바른 옵션의 추출·생성·경로는 통과했습니다. 실패도 조사 근거로 보존합니다.
- Pinned [Valhalla3.9.1 exporter source](https://github.com/valhalla/valhalla/blob/3.9.1/src/valhalla_export_edges.cc) exports grouped shape/name records, not a complete directed-ID catalog. Use it only for display context; read actual graph IDs and full edge shapes with `locate` and route/trace responses. Export stdout includes logging lines; preserve raw output and validate records rather than treating log text as coordinates.
  고정 엔진 내보내기는 지형·이름 묶음이며 전체 방향 ID목록이 아닙니다. 화면 배경에만 쓰고 실제구간ID·전체지형은 조회·경로/매칭응답에서 읽습니다. stdout로그를 좌표로 해석하지 않고 원문보존·레코드검사를 합니다.

Confidence: source provenance, checksum agreement and actual local engine responses are verified. OSM completeness, current road conditions, independent map-matching accuracy and traffic realism are not established. The scene uses road geometry rather than a vehicle-interaction traffic simulator; later density/queue modules must not imply microscopic traffic realism without separate validation.

확인한 것은 자료 출처·해시 일치·실제 로컬 엔진 응답입니다. OSM 완전성·현재 도로 상황·독립 매칭 정확도·교통 현실성은 아직 증명하지 않았습니다. 이번 장면은 도로 지형 기반 운동학이며 차량끼리 상호작용하는 교통모델이 아닙니다. 후속 밀도·정체 모듈도 별도 검증 없이 미시 교통 현실성을 주장하면 안 됩니다.
