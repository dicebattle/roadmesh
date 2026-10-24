# P12 development originals / P12 개발 원문

Status: development proof only. Full clean358, final media, hosted evidence and protected delivery remain pending. Main Sol designed, implemented and directly ran these checks. The primary graph is the pinned actual Seoul OSM graph `4df7433fbbdb6c66a951e23feaff2ede7ab1b0f7eb97310bc60308c6d1569e95`; development reuses the verified P11 graph, while final whole simulation must rebuild it.

상태: 개발 근거이며 깨끗한 전체358개·최종 미디어·원격 근거·보호 반영은 남아 있습니다. 메인 Sol이 설계·구현·직접 실행을 맡았습니다. 주요 지도는 고정한 실제 서울 OSM입니다. 개발에서는 검증한 P11 지도를 재사용하며 최종 전체 실행은 새로 생성해야 합니다.

## Actual runtime / 실제 실행

`node dist/tools/scenario_checks.js --graph VERIFIED_SEOUL_GRAPH --output data/p12-runtime-dev02 --runtime-only` passed19 development outcomes with owned cleanup. Main independently checked1,391 original hashes, one standard Ed25519 signature/artifact, exact private/public request bindings and original HTTP400/native identity evidence. Native171 becomes `NO_SUITABLE_ROAD`;442 becomes `NO_PATH`. The real reset case completed in1,581.126ms; the accepted-no-headers stall used4,004.290ms on A and completed through B in5,591.376ms, preserving4s/12s limits. Actual CAR rows and candidate bytes were unchanged after BUS/OTHER rejection and exact CAR retry.

위 명령은 개발19개와 소유 정리를 통과했습니다. 메인이 원문 해시1,391개·표준 서명/내용1건·비공개/공개 요청 연결·원 HTTP400/엔진 식별을 독립 검사했습니다. 실제 연결 중단은 약1.581초, 무응답 A는 약4.004초 뒤 취소하고 B를 통해 약5.591초 안에 완료했습니다. 버스/기타 거부와 자동차 재시도 뒤 실제 자동차 행·집계 바이트가 그대로였습니다.

[Independent inspection](p12-runtime-dev02-independent.json), [inspector](inspect-p12-runtime.mjs). Source commit `226d73d8c0b4d55cb6812505b0ae3efdf30facf9`, dirty=true, runtime fingerprint `05cf88f6aa7ae5ea8d68657304a98db15a43a6521c20d4092da09f233e0a7485`. Repeated equal native inputs are listed as candidates; this inspector does not invent unique per-call native identifiers.

소스는 위 커밋의 미커밋 개발 상태이며 실행 지문을 명시합니다. 같은 엔진 입력이 반복된 경우 후보를 모두 나열하며 없는 호출별 엔진 식별자를 만들지 않습니다.

## Actual outer supervisors / 실제 상위 감독

[Two results](supervisor-results.json) passed after a real browser/native baseline with rendered geometry equal to the API response. SIGTERM exited130; deliberate parent failure exited1. Each fixture verified browser PID/start identities, nested client/outer cleanup, no remaining recorded processes and a closed app port. Original screenshots and actual WebM are in the archive. This proves the observed live phase only. Both use dirty development fingerprint `b6efdc65b2373bf0d2ee619780530a05fde03fde88df5c971b737bd8b60d0dff`.

실제 브라우저/엔진 기본 경로와 지도 지형 일치 뒤 두 경우를 통과했습니다. 종료 신호는130, 의도한 부모 실패는1로 끝났고 각각 브라우저 원 PID/시작 식별·내부 화면과 상위 정리·기록 프로세스 부재·포트 닫힘을 검사했습니다. 원 스크린샷·실제 WebM을 묶음에 보존하며 관측한 실행 단계만 증명합니다. 두 실행의 미커밋 개발 지문은 위와 같습니다.

## Preserved failures and corrections / 보존한 실패·보정

- runtime-dev01 rejected the node's expected pre-ready503. Node-status waiting now accepts the existing503 status shape. Its cleanup passed.
- runtime-dev02 passed19 but retained a MaxListeners warning: normal keep-alive status requests accumulated socket-close listeners. The proxy now removes a listener when its response finishes; reset/stall listeners remain until the socket closes. Final whole execution must verify this correction.
- supervisor-dev01 received a native200 but inspected map geometry before its asynchronous render finished. It failed before fault injection; cleanup passed. The gate now waits for exact rendered/API geometry equality.
- supervisor-dev02 exercised SIGTERM, but upstream Playwright's default signal handler raced the owner's context/video shutdown. Exact processes and ports were gone, but cleanup was correctly FAIL. The launch now disables upstream signal handlers so the owner controls context→video→browser→server. supervisor-dev03 passed both cases without suppressing errors.
- The first complete unit run passed295/296. The new report fixture was invalid (empty roads/vehicles and zero duration); its first focused correction still had zero duration. These failures and the subsequent corrected focused result are retained. They are test-fixture failures, not successful report proof.

- 첫 실행은 준비 전 정상503을 잘못 거부했고 기존 상태 형식을 기다리도록 수정했습니다. 정리는 통과했습니다.
- 개발19개 실행의 경고는 정상 연결 재사용 중 소켓 종료 리스너 누적이었습니다. 정상 응답 완료 때만 리스너를 제거하고 중단/무응답은 소켓 종료까지 유지합니다. 최종 전체 실행에서 보정을 확인해야 합니다.
- 첫 감독 실행은 엔진200 뒤 비동기 지도 완료를 기다리지 못했습니다. 장애 주입 전 실패이며 정리는 통과했습니다. 지도/API 지형이 일치해야 진행하도록 바꿨습니다.
- 두 번째 감독은 실제 종료 신호에서 상위 도구의 기본 신호 처리와 소유 정리가 경쟁했습니다. 프로세스·포트는 없어졌지만 정리는 실패로 유지했습니다. 기본 신호 처리를 끄고 소유자가 정리 순서를 통제한 세 번째 실행에서 두 경우 모두 통과했습니다.
- 첫 전체 단위 검사는295/296이었고 신규 보고서 시험 입력의 도로/차량 누락·0시간이 원인이었습니다. 첫 집중 보정에도0시간이 남았으며 실패와 최종 보정 결과를 모두 보존합니다. 실패한 입력을 보고서 성공 근거로 세지 않습니다.

## Inventory / 목록

[Exact inventory and omissions](inventory.json), [original archive](originals.tar.gz):5,755 included files, exactly six verified map-extract `graph.tar` files omitted with original hashes,32,348,501 compressed bytes, SHA256 `e6e0e72f4b8aac3ed4013ebc4b79a2d54c76ade3d1b16bd40604447ac42edd9f`. All five development directories, including failures, are represented. CLI/build logs are gzip files beside the archive. No real GPS, private keys or credentials are intentionally published.

정확한 목록·제외와 원문 묶음에 개발 다섯 폴더의 실패를 포함합니다. 파일5,755개를 포함하고 검증한 지도 추출6개만 원 해시와 함께 제외했습니다. 압축32,348,501바이트와 위 해시를 확인했습니다. 명령/컴파일 원문은 별도 gzip으로 보존하며 실제 GPS·비밀키·인증값을 공개 자료에 넣지 않습니다.

## Final candidate unit and resource checks / 최종 후보 단위·자원 검사

After correcting the authored report fixture's duration, the focused report2/2 passed; the final complete `npm test` passed296/296 in5.576s on Node22.23.4. [Complete final log](p12-unit-final.log.gz), [corrected focused log](p12-report-unit-corrected.log.gz). Main also inspected a fresh Docker inventory: all27 recorded owned names,14 original engine IDs and13 owned volume names were absent. [Resource read-back](main-resource-absence.json). This inventory is a current local check; it is not a hosted-resource claim. Runtime/source changes after the development fixtures still require the fresh full358 gate.

보고서 시험 입력의 시간을 보정해 집중2/2를 통과했고 최종 전체 단위 명령은 Node22.23.4에서 약5.576초에296/296을 통과했습니다. 메인이 새 Docker 목록으로 소유 이름27개·원 엔진ID14개·볼륨13개의 부재도 검사했습니다. 현재 로컬 조회이며 원격 자원 주장으로 쓰지 않습니다. 개발 자료 이후의 소스 변경은 여전히 새 전체358개 판정이 필요합니다.
