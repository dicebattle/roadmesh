# Persistent routing nodes / 지속 실행 경로 노드

P09 runs two independent local node agents over a verified actual Seoul graph. Each node retains a native Valhalla HTTP daemon per immutable traffic generation, uses its own durable P07 consumer identity, and pins generation/engine identity for every request. [Fixed contract](../../docs/28-p09-routing-nodes.md) · [Development evidence](../../research/pilot/2026-10-25-p09/development/README.md).

P09는 검증된 실제 서울 그래프에 독립 로컬 노드 두 개를 실행합니다. 노드마다 불변 교통 세대의 Valhalla HTTP 엔진과 독립 P07 소비자 상태를 유지하고 요청 전체에 실제 세대·엔진 식별을 고정합니다.

Current status: actual development32/32 and inspected raw evidence passed. Clean whole270, refreshed recording and hosted delivery remain pending; P10 gateway/failover and later modules are not complete.

현재 실제 개발32개와 원문 검사를 통과했습니다. 깨끗한 전체270개·최신 녹화·원격 반영은 남아 있으며 P10 중계·장애 전환과 이후 모듈은 미완료입니다.

Run with Node22/24 and Docker after building:

```
npm run node:check -- --graph VERIFIED_SEOUL_GRAPH --output NEW_DIRECTORY
```

Use a new output directory. The full simulation command creates a fresh graph and executes all238 prior cases before the32 P09 cases. It starts actual synthetic ingestion/matching/aggregation/publication, two authenticated loopback nodes and owned native engine containers; cleanup is required. For an individually managed node, node:serve requires the0600 private configuration defined in the contract. Do not publish tokens or database connection strings.

새 출력 폴더를 사용합니다. 전체 시뮬레이션은 새 그래프를 만들고 기존238개 뒤에 P09의32개를 실행합니다. 실제 합성 수집·매칭·집계·게시, 인증된 로컬 두 노드와 소유 엔진 컨테이너를 띄우고 정리를 검사합니다. 개별 노드 실행에는 계약에 정의된0600 비공개 설정이 필요하며 토큰·DB 접속정보를 게시하지 않습니다.

Generation replacement keeps old engines until admitted requests settle, but rejects stale or expired results. Max two engine slots and eight admitted requests per node; polling never extends an in-progress reconciliation indefinitely. Database operations are serialized with a bounded queue; a timed-out unfinished query prevents additional work until it settles, and its old result is discarded. At exact expiry, the node selects a verified blank baseline or explicitly reports unavailable while preparing it. It never presents expired live traffic as current.

세대 교체 때 기존 요청이 끝날 때까지 옛 엔진을 유지하되 낡거나 만료된 결과는 거부합니다. 노드당 엔진 두 개·동시 접수 여덟 개로 제한하고 주기 호출로 조정 완료가 계속 밀리지 않게 합니다. DB 작업은 제한된 대기열에서 직렬 처리하며 시간 제한 뒤에도 실제 쿼리가 남으면 추가 작업을 막고 늦은 결과는 버립니다. 정확한 만료 뒤에는 검증된 기본 세대를 쓰거나 준비 중임을 명시합니다.

The native transport uses installed curl inside isolated containers; it is a pilot adapter, not a production network or latency claim. Configured HTTP502 faults are not packet-loss measurements. Trust changes use a new node process, not live configuration reload. The evidence viewer replays recorded results; it is not the complete navigation client.

격리 컨테이너 안의 설치된 curl을 사용하는 전송은 파일럿 연결기이며 운영 네트워크·지연 검증은 아닙니다. 설정된HTTP502는 패킷 손실 측정과 다릅니다. 신뢰 설정은 새 노드 프로세스에 적용하며 실행 중 교체는 제공하지 않습니다. 보고서 화면은 기록 재생이며 완성된 내비게이션은 아닙니다.

## Clean integrated proof / 깨끗한 통합 근거

Source537cf0c passed270/270 and main independent checks of7,062 listed hashes. The actual48.7s recording, mobile EN/KO review and owned cleanup passed. [Current report](../../research/pilot/2026-10-25-p09/report.md). Hosted inspection and protected delivery are pending.

소스537cf0c의270개·독립 목록 해시7,062개·실제48.7초 녹화·한영 모바일·소유 정리를 확인했습니다. 원격 검사·보호 반영은 대기 중입니다.

Hosted PR run40130640754 also passed270 and Node22/24 each235; main inspected6,988 present hashes and exact declared omissions. [Original evidence](../../research/pilot/2026-10-25-p09/hosted/README.md). Final-head protected merge remains.

원격PR실행도270개·Node각235개를 통과했고 메인이 존재 해시6,988개와 정확한 제외 목록을 검사했습니다. 최종커밋 보호 병합을 이어갑니다.
