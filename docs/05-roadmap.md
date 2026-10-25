# 개발 순서와 통과 기준

P01–P14 local-pilot runtime acceptance is complete locally and on GitHub Actions: whole 390, Node.js 22/24 each 303. Main independently checked 16,236 hosted original hashes, 11 complete PostgreSQL/Worker pairs and 21 SQLite copies across 14 actors. The runtime fingerprint matches the accepted local run and actual recordings. Protected integration and the latest checked head are tracked by [PR #14](https://github.com/dicebattle/routelens/pull/14). Geographic 100/100, real driving, live traffic and production deployment remain separate.

P01~P14 로컬 파일럿의 실행 검증을 로컬과 GitHub Actions에서 마쳤습니다. 전체 390개와 Node.js 22·24 각각 303개를 통과했고, 메인이 원격 원문 해시 16,236개·집계 전체 11쌍·객체 14개의 SQLite 복사본 21개를 독립 확인했습니다. 실행 지문은 수용한 로컬 실행·실제 녹화와 같습니다. 보호 병합과 최신 검사 커밋은 [PR #14](https://github.com/dicebattle/routelens/pull/14)에서 확인합니다. 실제 지역 100/100·실주행·실시간 교통·운영 배포는 별도입니다.

[Hosted evidence / 원격 근거](../research/pilot/2026-10-25-p13/hosted/README.md). Older progress below is historical. / 아래 진행 기록은 과거 시점입니다.

## Local pilot track / 로컬 파일럿 경로

P01/P14a status: implemented and directly verified locally and in GitHub Actions on Node 22/24 after the TypeScript migration. Required CI is now active on main. [Module and evidence](../wiki/modules/pilot-runner.md). [P02 graph checks](../wiki/modules/test-graph.md) are verified; P03 is locally verified with an integrated recording; P04 is next and the full P14b matrix remains.

P01/P14a 상태: 구현 후 로컬과 TypeScript 전환 후 GitHub Actions의 Node 22/24에서 직접 검증했습니다. main에 필수 CI도 적용했습니다. [모듈과 증거](../wiki/modules/pilot-runner.md)를 참고하세요. [P02 그래프 검사](../wiki/modules/test-graph.md)도 검증했으며 P03도 통합 녹화와 함께 로컬 검증했고 다음은 P04이며 P14b 전체 행렬은 남아 있습니다.

Updated 2026-10-24: the user requested full local simulation before expanding implementation. Follow [P01–P14](11-local-pilot.md), starting with the scenario/evidence contract and fast CI checks, then a tiny real-engine synthetic graph. RM-001's 100/100 reviewed cases remain required for geographic quality evaluation, but no longer block synthetic integration work. The earlier “real-road corpus first for all implementation” order is superseded for the local pilot only. P01 and P14a code now exists; its direct and hosted verification is recorded in the module page. P02 is also implemented with independent local engine proof; P03 now has local integrated evidence; P04 onward is not complete.

2026-10-24 변경: 사용자가 전체 흐름을 로컬 시뮬레이션으로 검증하기를 요청했습니다. [P01~P14](11-local-pilot.md)에 따라 시나리오·증거 계약과 빠른 CI 검사, 작은 실제 엔진용 합성 그래프부터 진행합니다. RM-001의 검토 자료 100/100개는 실제 지역 품질 평가에 유지하되 합성 통합 구현의 선행 조건에서 분리합니다. 모든 구현에 앞서 실제 도로 자료부터 확보하던 순서는 로컬 파일럿에 한해 대체합니다. P01·P14a 코드는 구현됐으며 직접·원격 검증은 모듈 문서에 기록합니다. P02도 독립 로컬 엔진 증거와 함께 구현했으며 P03도 로컬 통합 증거를 갖췄으며 P04 이후는 미완료입니다.

아래 기간은 경험 있는 개발자 1명이 집중 작업할 때의 **공수 가정**입니다. 실제 운전자 모집, 법적 검토, 데이터 이용 허가, 앱 배포 심사, 이동 기록 수집에 걸리는 대기시간은 별도입니다. 2026-10-24 현재 RM-001 입력 검사와 P01/P14a 코드가 구현됐습니다. 합성 지도 생성은 P02에서 검증했으며 실제 도로 사례·운영 지도·내비게이션은 아직 준비되지 않았습니다. 최신 근거는 [작업 기록](../wiki/log.md)을 따릅니다.

## M0 가장 위험한 연결부터 검증 — 1~2 개발자 주

| ID | 작업 | 선행 작업 | 산출물과 통과 조건 |
| --- | --- | --- | --- |
| RM-001 | 시험 지역·입력 사용권·OSM 품질 표본 확정 | 없음 | 도로 100쌍, 매칭 사례 100개, 합법적 기대경로·불확실 사례 목록 |
| RM-002 | Valhalla 3.9.1 그래프 생성 재현 | RM-001 | 원본·설정·이미지·출력 해시, 빌드 시간·최대 메모리·파일 크기 |
| RM-003 | 경로·도로 매칭 성능과 품질 측정 | RM-002 | 같은 데이터·기기에서 지연 분포, 오매칭률, 금지 회전 검사 |
| RM-004 | 구간 속도 → live traffic 변환 | RM-002 | 합성 정체로 경로/시간 변화, 만료 후 기본값 복구, 그래프 불일치 거부 |
| RM-005 | 표본이 틀렸을 때의 처리 확정 | RM-003, RM-004 | 불확실 매칭 제외·신호대기 보존·0 속도/폐쇄 구분 |

첫 시험 서버는 4 vCPU·8GiB RAM·SSD를 측정용 기준으로 삼습니다. 이는 충분하다는 보장이 아닙니다. 그래프 생성은 별도의 최대 메모리를 기록합니다. 단일 요청·동시 10요청, 준비된 상태·재시작 직후를 나눠 시험하고 p50/p95/p99를 기록합니다.

### RM-001을 작은 작업으로 나누기

| 하위 작업 | 상태 | 근거·다음 작업 |
| --- | --- | --- |
| RM-001a 시험자료 계약·검사 도구 | 구현·로컬 검증 완료 | [모듈](../wiki/modules/evaluation-corpus.md), 집중 테스트 10개 통과 |
| RM-001b 실제 시험 지역·공개 원본·기대 결과의 근거 선정 | 미착수 | 합성 예제의 서울 범위는 실제 시험 지역 확정이 아님. 소수 사례부터 수작업 검토 |
| RM-001c 경로 100개·매칭 100개의 검토 자료 확보 | 미착수 | 준비 수 현재 각 0개. 불확실 사례와 사용권을 별도로 관리 |

검사 도구가 `ready_for_m0_measurement=true`를 출력하더라도 기록된 검토 근거의 진실성이나 실제 경로 품질을 증명하지는 않습니다. 이 값은 자료 형식·선언된 권리·사례 수 조건만 검사합니다.

**진행 기준:** 준비된 서버에서 경로 계산 p95 1초 이내를 초기 목표로 둡니다. 정답이 검토된 구간에서 방향성 도로 매칭 정확도 95% 이상, 명확한 통행금지·금지 회전 위반 0건을 목표로 하되 제외된 불확실 사례의 비율도 공개합니다. 작은 표본 통과를 한국 전체 품질로 일반화하지 않습니다.

통과하지 못하면 Valhalla 설정·지도 문제를 먼저 나눕니다. 엔진 문제라면 같은 자료로 OSRM 비교를 시작합니다. 조정 후에도 목적을 달성하지 못하면 범위를 줄이거나 엔진 선택을 바꾸고 앱 구현을 미룹니다.

## M1 데이터 수집·집계·공개 계약 — 2~3 개발자 주

| ID | 작업 | 선행 작업 | 통과 조건 |
| --- | --- | --- | --- |
| RM-006 | 스키마·합성 입력·호환성 검사 | M0 | 단위·시간·버전·오류 검증, 잘못된 값 거부 |
| RM-007 | 수집·큐·매칭 연결 | RM-006 | 접수 후 실패·재시도 추적, 동일 배치 재전송 시 중복 집계 없음 |
| RM-008 | 구간 소유권·집계 상태 | RM-007 | 부분 성공 후 재시도·순서 역전·마감 후 입력에서 동일 결과 |
| RM-009 | 서명·배포·만료·키 교체 | RM-008 | 변조·이전 순번·만료·다른 그래프·미승인 게시자 거부 |
| RM-010 | 독립 설치 실행 어댑터 | RM-008 | PostgreSQL 구성과 Cloudflare 구성의 합성 재생 결과 일치 |

클라우드 실제 자원 생성은 구현·배포 단계에서 별도 수행합니다. 로컬 모의 실행 통과만으로 클라우드 한도와 비용이 검증됐다고 쓰지 않습니다.

**진행 기준:** 가안 동시 주행자 1,000명, 30초 업로드 패턴을 한 시간 재생합니다. 수집 거부율과 사유, 처리 대기시간, 중복 제거, 매칭 제외율, 큐 잔량을 기록합니다. 표본 수 0·1·4·5, 동명 기여 반복, 10% 허위 관측 삽입을 시험합니다. 허위 관측은 분포·전략에 따라 결과가 달라지므로 특정 비율을 견딘다고 일반화하지 않습니다.

## M2 경로 노드와 웹 미리보기 — 2 개발자 주

| ID | 작업 | 선행 작업 | 통과 조건 |
| --- | --- | --- | --- |
| RM-011 | 노드 에이전트·지도/교통정보 교체 | RM-009 | 요청 진행 중 버전 교체에도 응답 버전 혼합 없음 |
| RM-012 | 두 노드 등록·중계·장애 전환 | RM-011 | 하나 종료, 느린 응답, 오래된 정보, 그래프 불일치 각각 처리 |
| RM-013 | MapLibre 웹 경로 화면 | RM-012 | 좌표 선택→경로→상태 표시 실제 브라우저 확인 |
| RM-014 | 독립 설치·기여 문서 | RM-010, RM-013 | 새 환경에서 유료 계정 없이 합성 사례 재현 |

**v0.1 공개 기준:** 두 독립 프로세스에서 같은 요청·버전의 결과를 비교하고, 전체 응답 p95 2초·제한된 장애 복구 3초 이내를 초기 목표로 합니다. 대칭 도로에서 같은 비용의 여러 경로가 가능하므로 문자열 완전 일치 대신 법적 제약·총비용·허용 오차를 비교합니다. 설치 문서와 실패 상태가 확인되어야 개발자 미리보기로 공개합니다.

M0~M2 합계는 **5~7 개발자 주** 가정입니다. 이 시점 결과물은 내비게이션 기반과 웹 미리보기이며 실주행 앱이 아닙니다.

## M3 제한된 Android 주행 시험 — 추가 3~5 개발자 주 + 수집 기간

- RM-015: 위치 권한·동의·백그라운드 위치 정책, 수집 중단·삭제, 네트워크 지연 버퍼.
- RM-016: 경로 진행·회전 안내·시스템 음성 합성·경로 이탈 감지·재탐색.
- RM-017: 배터리·데이터 사용·화면 잠금·터널·통신 단절·앱 종료/복구 시험.
- RM-018: 독립된 실제 주행 기록으로 도착시간 품질 비교. 동일 기록을 집계 학습과 평가에 동시에 쓰지 않음.

실주행에는 정차 상태에서 설정하고 운전 중 조작이 필요 없는 흐름을 사용합니다. 실제 운전 시험과 앱 배포는 기술 재생 시험 이후 별도 준비합니다.

**v0.2 판단 기준:** 같은 경로·시간대에서 기본 속도와 교통정보 적용의 이동시간 오차를 비교합니다. 공개 후보 목표는 유효 표본이 있는 구간의 중앙 절대오차 10% 이상 개선, p90 오차의 유의미한 악화 없음입니다. 표본 수·커버리지·실패 사례를 함께 보고 개선이 불명확하면 실시간 안내로 승격하지 않습니다. 노선 선택 품질과 시간 예측 품질은 별도로 평가합니다.

## M4 승인된 독립 운영자 연결 — 추가 2~3 개발자 주

서로 다른 운영자·네트워크의 3개 이상 노드로 승인·폐기·버전 교체·기준 응답 대조를 시험합니다. 가정용 NAT 환경은 외부 HTTPS 주소 또는 명시적 중계 연결로 지원하고, 관리용 터널 자격증명을 다른 노드와 공유하지 않습니다. 노드 운영자에게 어떤 위치정보가 보이는지 알립니다.

TUF 구현체 고정, 키 폐기, 서명 사고 복구 훈련, 프로세스 자원 제한, 오픈소스 설치 자료 검증이 끝나야 v0.3으로 부릅니다. 초기 운영자는 소수라도 단일 소유자의 서버 여러 대와 구분해야 합니다.

## M5 선택적 P2P — 추가 2~4 개발자 주의 비교 실험

먼저 Kubo로 공개 지도 파일 복제를 검증합니다. HTTP 미러 대비 다운로드 시간·원본 서버 바이트 감소·운영자 대역폭·저장량·복구 성공률을 측정합니다. 이득이 없으면 HTTP를 유지합니다. R2의 인터넷 전송량 비용이 없으므로 P2P 도입 이유는 비용만이 아니라 독립성·복제 가용성도 포함합니다.

교통정보 Gossipsub는 별도 실험입니다. 게시자 권한·지역별 구독·크기 제한·만료·순번 중복 제거를 적용합니다. 지도 파일 배포와 경로 요청 분산은 다른 기능입니다. P2P 경로 호출·단말 도로 매칭·오프라인 재탐색은 이 단계 이후 각각의 결정으로 진행합니다.

## 착수 순서

Local pilot: **P01/P14a → P02 → P03/P04 → P05/P06 → P07/P08 → P09/P10 → P11/P12 → P13/P14b**. Geographic evaluation retains **RM-001b → RM-001c → RM-002 → RM-003/RM-004**. Do not use synthetic success as real-road proof. The original development-week estimates do not include a measured estimate for this expanded pilot; revise them after P02 integration.

로컬 파일럿은 **P01/P14a → P02 → P03/P04 → P05/P06 → P07/P08 → P09/P10 → P11/P12 → P13/P14b** 순서입니다. 실제 지역 평가는 **RM-001b → RM-001c → RM-002 → RM-003/RM-004**를 유지합니다. 합성 시험 성공을 실제 도로 증명으로 사용하지 않습니다. 기존 개발 주차 추정에는 확대된 파일럿의 실측 공수가 포함되지 않으며 P02 연결 이후 재산정합니다.
