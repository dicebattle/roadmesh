# 오픈소스 비교와 선택 근거

확인일: 2026-10-24. 아래 버전은 조사 시점의 후보이며 실행 환경에 고정한 의존성 목록이 아닙니다. 설치 단계에서 릴리스 태그뿐 아니라 이미지 또는 소스 커밋 해시를 고정합니다. 기계 조회값은 [upstream-snapshot.json](../research/upstream-snapshot.json)에 보관합니다.

## 자동차 내비게이션

| 구성 | 선택 | 직접 만들 부분 | 선택 근거·제약 |
| --- | --- | --- | --- |
| 도로 원본 | OpenStreetMap | 한국 시험 지역 품질 검사·변경 승인 | 공개 데이터, 실시간 혼잡은 별도 필요 |
| 경로 계산·지도 매칭 | Valhalla 3.9.1 우선 | 실행 어댑터·교통 파일 변환·버전 검사 | 경로·매칭·교통속도 기능을 한 엔진으로 시험 가능 |
| 경로 엔진 대안 | OSRM v26.10.0 | 같은 입력의 비교 시험만 | MLD 갱신 비용과 메모리를 실제 비교; 처음부터 이중 구현하지 않음 |
| 경로 엔진 대안 | GraphHopper 11.1 | M0 결과가 부족하면 검토 | JVM 운영 선택지; 공개 엔진과 유료 API 기능 구분 |
| 지도 표시 | MapLibre GL JS / Native | 길안내 상태·경로 진행·재탐색 UI | 렌더러이며 완성된 내비게이션 SDK는 아님 |
| 화면 지도 파일 | PMTiles | 지역별 생성·목록·저작자 표시 | HTTP Range로 필요한 타일만 읽음; 도로 계산 그래프와 별개 |
| 지도 업데이트 신뢰 | TUF 호환 구현체 | 우리 파일 목록·배포 정책 | 서명·만료·버전 검증을 새 암호체계로 만들지 않음 |
| P2P 파일 배포 | Kubo/IPFS 후속 후보 | 승인 파일만 배포·보존·삭제 정책 | 공개 파일 복제용, 계산 분산 엔진 아님 |
| P2P 실시간 전파 | libp2p/Gossipsub 후속 후보 | 지역 구독·크기 한도·게시자 권한·만료 | 데이터 진실성·가짜 참여자 문제는 해결해주지 않음 |
| 장소·주소 검색 | v0.1 제외 | 우선 좌표·지도 선택 | 후속에 Nominatim/Pelias 별도 품질·운영비 비교 |

Valhalla는 공식 프로젝트에서 MIT 계열로 안내하지만 저장소의 `COPYING`과 포함 라이브러리 고지는 릴리스별로 함께 확인합니다. OSRM은 BSD-2-Clause, GraphHopper는 Apache-2.0입니다. MapLibre GL JS는 BSD-3-Clause, Native는 BSD-2-Clause입니다. PMTiles 구현은 BSD-3-Clause, 규격은 public domain/CC0로 안내하며 샘플 지도는 별도 조건입니다. 저장소 API의 `NOASSERTION`은 라이선스가 없다는 뜻이 아니므로 실제 파일을 확인했습니다.

PMTiles는 읽기 전용 묶음이며 일부 타일을 바꾸는 데도 파일을 다시 작성하는 제약이 있습니다. 지도 표시 자료는 지역별 파일로 생성하고, 더 자주 바뀌는 교통정보는 별도 작은 파일로 배포합니다. [PMTiles 개념](https://docs.protomaps.com/pmtiles/)

## 개발 활동 확인 결과

| 저장소 | 확인된 최신 릴리스 | 기본 브랜치 최근 커밋 UTC | 판단 |
| --- | --- | --- | --- |
| valhalla/valhalla | 3.9.1, 2026-10-06 | 2026-10-19 | 첫 엔진 후보 |
| Project-OSRM/osrm-backend | v26.10.0, 2026-10-01 | 2026-10-21 | 비교 대안 |
| graphhopper/graphhopper | 11.1, 2026-09-29 | 2026-10-23 | 비교 대안 |
| maplibre/maplibre-native | android-v13.7.1, 2026-10-15 | 2026-10-23 | Android 렌더러 후보 |
| maplibre/maplibre-gl-js | v6.15.0, 2026-10-18 | 2026-10-23 | 웹 렌더러 후보 |
| protomaps/PMTiles | 저장소 전체 대표 릴리스 없음 | 2026-09-16 | 언어별 패키지 릴리스를 별도 고정 |
| ipfs/kubo | v0.43.1, 2026-09-15 | 2026-09-27 | 후속 파일 배포 실험 |
| libp2p/go-libp2p | v0.51.0, 2026-10-23 | 2026-10-23 | 생태계 활동 근거; Go 도입 확정 아님 |

최근 커밋은 관리 활동의 단서입니다. 담당자 수, 문제 응답 속도, 보안 수정, 릴리스 간 호환성과 시험 지역의 실제 성능은 M0에서 추가 평가합니다. 특정 프로젝트가 최근 갱신됐다는 이유만으로 그 조직의 다른 저장소까지 유지보수된다고 보지 않습니다.

## 직접 작성하는 핵심

1. **교통정보 산출:** 어떤 관측을 도로 통과시간으로 인정할지, 동일 기여자의 반복 관측을 어떻게 제한할지, 표본 부족과 만료를 어떻게 표현할지.
2. **교통정보 변환:** 공개 구간별 통계 → 그래프에 맞는 Valhalla 속도 파일. 기본 속도와 실시간 속도 적용 여부 추적.
3. **노드 운영:** 설치, 데이터 동기화, 준비 상태, 등록 승인, 폐기, 요청 제한, 장애 시 전환.
4. **공개 계약:** 지도·교통정보·경로 요청의 버전, 단위, 오류, 호환성 검사.
5. **개인정보 최소화:** 동의, 제한된 보관, 원본과 공개 자료 분리, 공개 전 표본 기준, 로그 제거.
6. **평가:** GPS 매칭 정확도·도착시간 오차·허위 관측 영향·장애 복구를 반복 측정하는 자료와 도구.

이 영역은 기존 엔진 몇 개를 설치하는 것으로 채워지지 않습니다. 반대로 최단경로 알고리즘, 지도 렌더러, 암호 서명 원시 함수, GPS 단말 통신 프로토콜을 새로 구현하지 않습니다.

## 참조만 하는 프로젝트

Clearway와 OpenTraffic은 아이디어·역사적 구조를 이해하는 자료로만 취급하고 실행 의존성에 넣지 않습니다. 이 문서는 두 프로젝트의 현재 상태를 새로 검증한 평가가 아닙니다. 완성형 교통정보 시스템이 없는 부분을 오래된 코드를 통째로 가져와 메우지 않는다는 선택입니다.

OsmAnd·Organic Maps·Librescoot는 실제 길안내·오프라인 경험을 조사할 후속 후보입니다. 앱 전체를 포크하면 기능뿐 아니라 코드 라이선스, 빌드, 업데이트 부담도 가져오므로 처음부터 채택하지 않습니다. 모바일 길안내 SDK를 추가할 경우 현재 유지보수와 라이선스를 따로 확인합니다.

버스용 Traccar, OneBusAway와 TransitClock 계열의 선택은 [별도 확장 계획](08-transit-extension.md)에 정리합니다.

## Public speeds / 공공 속도

Reuse `shapefile`(BSD-3-Clause) and `proj4`(MIT) for official geometry/projection, built-in Node SQLite for local durable state, existing `jose` for standard Ed25519 JWS and Valhalla's existing traffic ABI/native routing. RouteLens owns strict bounded reads, Korean time/units, directed mapping evidence, source policy/freshness/coverage, signing scope/sequence/withdrawal and lifecycle integration. Do not implement a GIS binary parser, routing engine, cryptography or database. Source data keeps its own terms. [Current contract](38-public-road-speeds.md).

지형/좌표계는 기존 GIS 라이브러리, 영속 상태는 내장 SQLite, 서명은 기존 jose, 경로는 Valhalla를 재사용합니다. 제한 수집·한국 시각/단위·방향 대응 근거·출처/만료/적용률·서명 범위/순서/철회·실행 연결만 직접 구현하며 원 자료 이용 조건은 유지합니다.
