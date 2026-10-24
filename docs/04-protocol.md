# 공개 데이터와 인터페이스 계약 초안

상태: `draft-0.1`. 아직 구현되거나 상호운용성이 검증된 규격은 아닙니다. M0에서 Valhalla 내부 구간 식별자와 속도 파일을 확인한 뒤 JSON Schema·OpenAPI로 옮깁니다. 그 전에는 안정된 외부 API라고 공표하지 않습니다.

## 공통 규칙

- 시간은 UTC RFC 3339, 길이는 m, 소요시간은 s, 속도는 m/s입니다. Valhalla의 km/h와 변환하는 책임은 엔진 어댑터에 있습니다.
- 좌표는 이름이 있는 `latitude`, `longitude` 필드로 전달합니다. 경로 선은 GeoJSON `[longitude, latitude]` 순서로 전달합니다.
- 엔진 구간 번호는 문자열입니다. 숫자 정밀도 손실을 피하고 반드시 `graph_id`와 함께 사용합니다.
- `schema_version`의 major가 다르면 거부합니다. 알려지지 않은 선택 필드는 무시할 수 있지만 필수 필드·enum은 명시적으로 검증합니다.
- 공개 문서에 가상의 `confidence: 0.92` 같은 값을 넣지 않습니다. 보정된 확률 모델이 없으므로 관측 상태·방법·표본 기준으로 품질을 설명합니다.
- 입력의 제한 길이, 배열 개수, 유한한 수, 좌표 범위, 시간 범위, 파일 크기 한도를 모두 검사합니다.

## API 경계

| 인터페이스 초안 | 권한과 역할 | 핵심 응답 |
| --- | --- | --- |
| `POST /v1/observations/batches` | 동의한 시험 기여자, 단기 토큰 | `202` 처리 접수. 집계 완료를 뜻하지 않음 |
| `POST /v1/routes` | 길찾기 사용자, 요청 한도 적용 | 경로와 실제 사용 버전·교통정보 상태 |
| `GET /v1/regions/{region_id}/current` | 공개, 짧은 캐시 | 현재 그래프·교통정보 목록, 만료시각 |
| `GET /v1/artifacts/{sha256}` | 공개 승인 자료만 | 길이·내용 해시가 고정된 파일 |
| `POST /v1/nodes/enroll` | 초대받은 운영자 | `PENDING`; 등록만으로 서비스 배정하지 않음 |
| `POST /v1/nodes/{node_id}/heartbeat` | 해당 노드 자격증명 | 로드한 버전·준비 상태·수용량 |
| `POST /internal/v1/route` | 중계 서버가 인증한 요청만 | 노드가 실제 사용한 버전과 경로 |

`429`는 한도 초과, `409`는 버전 불일치, `422`는 유효하지 않은 좌표·범위 등 입력 오류, `503`은 준비된 서버 없음에 사용합니다. 관측 API는 형식이 틀린 배치를 통째로 거부합니다. 접수 후 매칭되지 않은 관측은 사유별 집계 지표에만 남기고 공개 속도 계산에 넣지 않습니다.

노드가 등록하는 주소를 그대로 HTTP 요청 대상으로 삼지 않습니다. HTTPS, 운영자 승인, 공인 주소 검증, DNS 재해석 확인, redirect 금지, 내부 주소·클라우드 메타데이터 주소 차단으로 중계 API가 내부망 접근 통로가 되는 것을 막습니다.

## 비공개 관측 배치

```typescript
type ObservationBatch = {
  schema_version: "0.1";
  batch_id: string;              // 재시도 동안 동일, 같은 ID로 다른 본문 금지
  consent_version: string;
  source_class: "CAR" | "BUS" | "SYNTHETIC";
  samples: Array<{
    sample_id: string;           // 같은 점을 다음 배치에 포함해도 동일
    observed_at: string;
    latitude: number;
    longitude: number;
    accuracy_m: number;
    speed_mps: number | null;
    heading_deg: number | null;
  }>;
};
```

클라이언트는 5초 간격 측정, 30초마다 최대 6개 새 점 전송을 초기값으로 사용합니다. 서버 제한은 배치당 최대 60개·64KB로 둡니다. 매칭에는 앞 배치의 마지막 일부 점이 필요할 수 있어 제한된 비공개 문맥을 이어 붙이되, 이전 점과 이미 완성된 통과 구간을 다시 집계하지 않습니다. 장시간 단절·터널 구간을 일직선으로 보간하지 않습니다.

토큰 발급 주체가 짧은 기간의 기여자 가명을 부여합니다. 이는 클라이언트가 임의로 보낸 UUID와 다릅니다. 단기 토큰을 여러 개 받아도 같은 집계 창에서는 같은 기여자로 계산합니다. 공개 자료에 토큰·기여자 가명·GPS 점·차량 ID는 포함하지 않습니다.

v0.1은 위 비공개 입력만 지원합니다. 향후 단말 매칭 결과는 별도 계약으로 정의하며, 클라이언트가 보낸 `edge_id`를 검증된 관측과 같은 신뢰 수준으로 취급하지 않습니다.

## 지도 매칭 후 내부 통과 관측

`MatchedTraversal`은 `observation_id`, `graph_id`, `edge_id`, `entered_at`, `exited_at`, `distance_m`, `duration_s`, `source_class`, `contributor_window_key`, `match_method`, `match_quality`를 갖습니다. 방향은 엔진의 방향성 구간에 포함되며 필요하면 표시용 속성을 별도로 둡니다.

동일한 GPS 문맥을 재시도할 때 같은 `observation_id`가 생성되어야 합니다. 키는 매칭 정책 버전·입력 sample ID 범위·그래프·구간 통과 순번에서 결정합니다. 매칭 정책이 달라진 재처리는 새 정책 실행으로 분리하고 같은 실시간 창에 중복 합산하지 않습니다.

실시간 입력은 수신 시점 기준 120초보다 오래되거나 30초 이상 미래이면 제외합니다. 집계 시간은 관측 시각 기준 60초 창이고, 창 종료 후 30초까지 도착한 값만 받아 마감합니다. 이 숫자는 초기 정책이며 M0/M1 평가에서 고정합니다. 늦은 자료의 별도 연구 보관은 별도 동의를 전제로 합니다.

중복 키는 24시간 보관하고, 큐 보관·재시도도 최대 24시간으로 제한합니다. 그 이후의 재생은 실시간 경로로 다시 보내지 않습니다. 같은 배치 ID에 다른 본문이면 충돌로 거부합니다.

## 속도 산출과 공개 상태

GPS 순간속도의 단순 평균 대신, 완성된 방향성 구간 통과시간을 사용합니다. 동일 기여자의 한 구간·한 창 기여를 한 값으로 제한하고, 통과시간의 중앙값에서 대표속도를 산출합니다. 일부 구간만 관측된 경우 매칭 품질과 구간 길이 기준을 충족한 자료만 사용합니다. 복잡한 교차로의 시간 배분은 M0에서 검증해야 합니다.

정상 신호대기와 정체 시간은 통과시간에 포함합니다. 속도 0이라는 이유로 제거하면 실제 정체를 지우게 됩니다. 주차·시동 종료·노선 이탈은 별도 상태와 지속시간으로 제외하고, 버스 정류장 정차·전용차로는 승용차와 분리합니다.

| `status` | 의미 | `speed_mps` | 경로 계산 |
| --- | --- | --- | --- |
| `LIVE` | 가안 5명 이상의 서로 다른 유효 기여자가 있고 기간 내 자료 | 양수 | 교통정보 적용 |
| `INSUFFICIENT` | 관측은 있으나 공개·품질 기준 미달 | `null` | 과거값 또는 기본값, 출처 표시 |
| `UNKNOWN` | 사용할 관측 없음 | `null` | 기본값, 실시간이라고 표시하지 않음 |
| `STALE` | 과거 자료가 만료됨 | `null` | live 적용 해제 |

여기서 '5명'은 실제 사람을 암호학적으로 증명한 수가 아니라 발급 정책 아래 중복 제거된 기여자 수입니다. 공개 참여에서 가짜 계정을 막아준다는 보장이 없습니다. v0.1은 제한된 모집으로 검증합니다.

통행 폐쇄는 위 속도 상태와 별개입니다. 0 속도, 표본 없음, 낮은 속도만으로 폐쇄를 만들지 않습니다. 검증된 도로 통제 출처와 전용 계약을 확보하기 전까지 사용자 기여로 폐쇄를 입력하는 기능은 제외합니다.

## 공개 교통정보 묶음

Executable pilot refinement / 실행 파일럿 구체화: [P07 contract](25-p07-publication-contract.md) defines the planned exact signed envelope, simulation namespace, retained entry direction, local trust roots and durable ordering. It supersedes the shape below for P07 implementation; direct P07 verification is still pending. / P07 계약에서 시험 영역·구간 방향·정확한 서명 형식·로컬 신뢰키·영속 순번을 구체화했습니다. P07 구현에는 아래 초안보다 해당 계약을 우선하며 직접 검증은 아직 전입니다.

```typescript
type TrafficSnapshot = {
  schema_version: "0.1";
  publisher_id: string;
  graph_id: string;
  region_id: string;
  sequence: number;
  window_start: string;
  window_end: string;
  published_at: string;
  valid_until: string;
  aggregation_policy: string;
  entries: Array<{
    edge_id: string;
    source_class: "CAR" | "BUS" | "SYNTHETIC";
    status: "LIVE" | "INSUFFICIENT" | "UNKNOWN" | "STALE";
    speed_mps: number | null;
    sample_bucket: "5-9" | "10-19" | "20+" | null;
  }>;
};
```

`valid_until`은 `window_end + 180초`를 초기값으로 둡니다. 지연된 게시가 유효기간을 연장하지 않습니다. 공개 표본 수는 구간으로 표시하고 5명 미만의 정확한 수는 내보내지 않습니다. 이 기준은 재식별 위험을 줄이는 조치일 뿐 익명성 보증이 아닙니다.

첫 버전은 지역별 완전한 스냅샷입니다. 생략된 구간은 `UNKNOWN`이며 이전 스냅샷의 live 속도를 계승하지 않습니다. 노드가 오래된 바이너리 속도를 남겨두지 않도록 전체 초기화·교체를 검증합니다. 향후 변경분 전송은 `base_snapshot_id`와 삭제 항목을 포함한 별도 버전으로 도입합니다.

내용 파일의 SHA-256을 `traffic_snapshot_id`로 사용합니다. 서명은 별도 envelope가 정확한 파일 바이트의 해시·크기·발급자·순번·유효기간을 포함해 보호합니다. JWS 등 기존 표준 라이브러리로 구현하고 임의의 JSON 문자열 직렬화 순서를 서명 규칙으로 삼지 않습니다. 서명 필드를 내용 해시 내부에 넣는 순환 구조는 피합니다.

## 지도 배포 목록

`GraphManifest`에는 `graph_id`, `region_id`, `coverage_geometry`, `source_osm_timestamp`, `source_sha256`, `engine_version`, `engine_image_digest`, `build_config_sha256`, `edge_namespace`, `artifacts[{path, sha256, byte_length, media_type}]`, `licenses`, `created_at`를 둡니다.

지도·프로그램 배포는 기존 TUF 구현체를 통해 서명·버전·만료·키 교체를 검증합니다. 노드는 높은 버전을 한 번 확인한 뒤 낮은 버전으로 돌아가지 않습니다. 운영상 되돌리기는 새 순번의 배포 목록이 이전의 안전한 파일 해시를 다시 지정하는 방식입니다. [TUF](https://theupdateframework.io/docs/overview/)

## 경로 요청과 응답

```typescript
type RouteRequest = {
  schema_version: "0.1";
  request_id: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile: "car";
  traffic_policy: "prefer_live" | "base_only";
};

type RouteResponse = {
  request_id: string;
  graph_id: string;
  traffic_snapshot_id: string | null;
  engine_version: string;
  costing_config_id: string;
  calculated_at: string;
  node_id: string;
  traffic_mode: "LIVE_MIXED" | "BASE_ONLY";
  live_coverage_ratio: number;    // 경로 길이 중 유효 실측속도가 적용된 비율
  distance_m: number;
  duration_s: number;
  geometry: object;              // GeoJSON LineString
  maneuvers: object[];           // M0에서 필수 필드 확정
  warnings: string[];
};
```

위 코드의 `live_coverage_ratio`는 경로 길이 중 유효한 실측속도가 적용된 비율이며, 정확할 확률이 아닙니다. 조작된 비율을 노드가 주장할 수 있으므로 엔진 결과와 교통 파일을 대조하는 검사 항목에 포함합니다. 아직 확정되지 않은 안내 필드는 M0 결과와 함께 구체화합니다.

중계 서버가 노드를 고를 때 요청에 정확한 그래프·교통정보·비용 설정과 계산 기준시각을 붙입니다. 노드는 그것을 실행할 수 없으면 `VERSION_MISMATCH`를 반환합니다. 서명 대상은 요청 해시와 결과 해시·버전·시각을 포함합니다. 현재 버전으로 요청을 몰래 바꾸지 않습니다.

오류 코드는 `INVALID_INPUT`, `OUT_OF_COVERAGE`, `VERSION_MISMATCH`, `TRAFFIC_EXPIRED`, `NO_ROUTE`, `NO_HEALTHY_NODE`, `RATE_LIMITED`를 구분합니다. HTTP `200`만으로 교통정보 적용 성공을 판단하지 않습니다.
