# 설계 결정과 미결정 항목

상태는 구현 완료 여부가 아니라 계획에서의 선택을 뜻합니다. 변경할 때는 근거·영향·검증 계획을 같은 항목에 기록합니다.

| 번호 | 결정 | 이유 | 다시 검토할 조건 |
| --- | --- | --- | --- |
| ADR-001 | 수집은 운영자 관리, 경로 계산은 승인 노드에 분산 | 작은 참여망에서 신뢰와 운영 책임을 명확히 함 | 독립 운영자들이 같은 계약으로 운영 가능할 때 |
| ADR-002 | Valhalla 우선, 엔진 핵심 포크 없음 | 경로·매칭·교통 파일을 재사용 | M0 품질·지연·메모리 목표 미달 |
| ADR-003 | 휴대폰 전국 그래프 다운로드 제외 | 설치 크기·첫 사용 지연 감소 | 오프라인 사용 수요와 지역 그래프 실측 확보 |
| ADR-004 | 초기 노드는 같은 지역 전체를 복제 | 지역 경계 경로 조합의 복잡성 방지 | 전국 자료가 노드 자원 한도를 넘을 때 |
| ADR-005 | Cloudflare 운영 구성 + 일반 서버 설치 구성 | 익숙한 운영 환경과 오픈소스 독립성 양립 | 유지관리 비용이 실제로 과도한 경우 |
| ADR-006 | 실시간 핵심 기준 상태에 KV 사용하지 않음 | 늦은 전파로 만료·폐기 처리가 지연될 수 있음 | 명시적인 지연 허용 데이터에만 활용 |
| ADR-007 | 원시 GPS는 신뢰 영역에서만 처리 | 공개망의 복제·재식별 위험 제한 | 단말 매칭 또는 검증된 보안 집계가 준비됐을 때 |
| ADR-008 | P2P 전송은 후속, HTTP 계약 먼저 | 경로·교통정보 품질이 우선 병목 | 독립성 또는 배포 비용 이득이 측정될 때 |
| ADR-009 | 앱 코드·문서는 Apache-2.0 | 재사용·기여·특허 허여를 명시 | 공개 후 라이선스 변경은 기여자 권리 검토 필요 |
| ADR-010 | 버스 제품은 별도 범위 | 배차·권한·도착예측은 다른 제품 문제 | 별도 사용자가 확정되고 자동차 핵심과 일정 분리 가능 |
| ADR-011 | 제품명 RouteLens, 저장소·폴더 routelens | 사용자가 경로 탐색 의미와 Metro Lens 계열 이름을 선택 | 사용자가 이름 변경을 요청할 때 |
| ADR-012 | 설계 문서 + 프로젝트 위키 + 출처·누적 기록 | 계획·구현 근거가 대화에만 남지 않도록 함 | 중복·낡은 정보는 페이지 통합과 교차 참조로 해결 |
| ADR-013 | 첫 모듈은 RM-001 시험자료 검사 | 엔진 성능을 판단하기 전에 평가 입력과 근거를 구분해야 함 | 실제 도로 사례 확보 후 RM-002 착수 |
| ADR-014 | Separate local simulation from geographic evidence / 로컬 합성 검증과 실제 지역 증거 분리 | Exercise the complete pipeline without pretending synthetic cases are reviewed roads / 합성을 검토된 실제 도로로 꾸미지 않고 전체 흐름 검증 | Geographic evaluation still requires reviewed inputs / 실제 지역 평가는 검토 자료 필요 |
| ADR-015 | Protect main; finish with branch pushes / main 보호·작업 브랜치 푸시로 마무리 | Preserve a review boundary and remote handoff / 검토 경계와 원격 결과 보존 | Add required checks after P14a succeeds / P14a 성공 후 필수 검사 추가 |
| ADR-016 | English first with Korean messages / 영어 우선·한국어 병기 | Human and agent readability across interfaces and commits / 인터페이스·커밋을 사람과 에이전트가 이해 | Keep machine identifiers and historical evidence intact / 규격 식별자·과거 증거 유지 |
| ADR-017 | P01 schedules fixture-label events only / P01은 도로 이름표 이벤트 일정만 생성 | Build truthful replay and evidence before GPS or engine integration / GPS·엔진 연결 전에 정직한 재현·증거 기반 마련 | Extend at P02/P03 without presenting P01 as real routing / P02/P03에서 확장하고 P01을 실제 경로 계산으로 표현하지 않음 |
| ADR-018 | Korean chat, bilingual project artifacts / 대화는 한국어·프로젝트 기록물은 이중 언어 | User clarified the scope of the language rule / 사용자가 언어 규칙의 범위를 정정 | Follow explicit user language requests / 명시적인 사용자 언어 요청을 따름 |

| ADR-019 | TypeScript for verification and production coordination / 검증과 운영 조정에 TypeScript 통일 | User-requested shared toolchain and future type reuse; preserve P01 replay parity / 사용자 요청에 따른 도구 통일·후속 타입 공유, P01 재생 동등성 유지 | Revisit only with measured requirements; see [migration](14-typescript-migration.md) / 실측 요구에 따라 재검토 |

## 아직 확정하지 않은 것

1. 시험 지역·원본 확보 방법·실제 운전자 모집 규모.
2. 한국 도로에서의 경로 엔진 성능과 지도 품질.
3. Valhalla live traffic 바이너리 변환의 정확한 구현, 매우 낮은 속도 처리, 변경분 교체 방식.
4. TUF와 JWS의 구체적 라이브러리·버전, 키 보관 방식. 암호 기능을 자체 구현하지 않는 방향은 확정.
5. 지도 표시 데이터의 생성 도구·서체·스타일과 재배포 조건.
6. 운영 호스팅 공급자, 실제 월 예산과 노드 최소 사양.
7. 공개 참여에서 익명성·중복 계정·관측 신뢰도를 함께 다룰 정책. 초대 시험은 해결책의 검증 범위가 제한됨.
8. 제품명은 RouteLens로 확정. 도메인·상표 등록 여부는 미검토이며 이름 확정과 구분.

## 이전 논의를 구체화한 방향

서버를 자원봉사자에게 나누고 검증된 자료를 배포한다는 목적은 유지합니다. 다만 경로를 여러 노드의 조각으로 합치는 것, 휴대폰을 필수 계산 서버로 삼는 것, 원본 관측을 공개 P2P로 전파하는 것은 첫 버전에서 제외합니다.

서버리스 수집이 가능하다는 것과 지도 매칭까지 일반 Worker 하나에서 처리된다는 것은 다릅니다. 코드 공개와 위치 데이터 공개도 다릅니다. 이 두 구분이 전체 설계의 경계입니다.

## ADR-020: Conservative observed-time matching / 보수적인 관측시간 매칭

Use pinned Valhalla map snapping behind a TypeScript adapter; do not fork its matcher. The P04 adapter accepts only supported synthetic observations on a verified graph, keeps ambiguous/gapped/partial evidence explicit, and derives complete traversal times from observation timestamps rather than engine ETA. A bounded session finalizes once after all batches; no streaming or durable queue claim. [Contract and fixed checks](19-p04-matching-design.md). Revisit thresholds only with documented new evidence; real-road matching quality remains unmeasured.

고정 Valhalla 매칭을 TypeScript 연결기로 재사용하며 엔진 매칭기를 포크하지 않습니다. 검증 그래프의 지원 합성 관측만 받고 모호·누락·일부 증거를 명시하며 예상 주행시간 대신 원래 관측시각으로 완전 통과시간을 만듭니다. 크기가 제한된 세션이 모든 배치 후 한 번 확정하며 실시간·영속 큐로 주장하지 않습니다. 새 근거를 기록한 뒤에만 기준을 재검토하며 실제 도로 매칭 품질은 아직 측정하지 않았습니다.
