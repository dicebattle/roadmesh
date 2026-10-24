# P08 installed-tool reconnaissance / P08 설치 도구 사전 조사

Main specified the bounded inspection and Sol ran it against the pinned Valhalla base and actual Seoul pilot image `sha256:8b4a0609466e08dd6b384be7104ffa3f1c43270d9a8e931f3d93e2243566b4b6`, Linux/arm64. Containers used network none,2CPU/4GiB, unique names/labels and automatic removal. [Executed commands](commands.txt), [actual pilot tool output](derived-tools-output.log), [empty final owned-container inventory](cleanup-output.log). Original scripts, full installed-header output and image inspection remain locally under `data/p08-abi-probe`.

메인이 제한된 조사 범위를 정하고 Sol이 고정 Valhalla 기반 이미지와 실제 서울 파일럿 이미지에서 실행했습니다. 네트워크 차단·2CPU/4GiB·고유이름/라벨·자동삭제를 사용하고 명령·실제도구출력·마지막 소유컨테이너부재를 보존합니다. 스크립트·설치헤더전체·이미지검사원문은 로컬 data폴더에 남아 있습니다.

Installed `valhalla_build_extract --with-traffic` provides a traffic archive skeleton. The installed traffic header has32/8-byte static assertions and stale24/2-byte prose, consistent with the [pinned source inspection](../../../wiki/sources/valhalla-live-traffic.md). Neither image contains a C/C++ compiler in PATH or the inspected /usr,/opt locations. No package installation or image build was attempted. Actual sizeof/offsetof/sample-bitfield execution therefore remains unverified; ELF little-endian AArch64 does not prove that ABI by itself.

설치된 엔진 도구가 교통정보 파일의 뼈대를 만들 수 있습니다. 설치 헤더도32/8바이트 정적 검사와 낡은24/2바이트 설명이 함께 있습니다. 두 이미지의 PATH·조사한/usr,/opt에서C/C++컴파일러가 없어 설치·빌드 없이 종료했습니다. 따라서 실제 크기·위치·비트필드 실행 검증은 미확인이고 실행파일의 바이트순서만으로 해당 배치를 증명하지 않습니다.

No graph mutation, route execution, traffic encoder or P08 completion is claimed. Next: main fixes the encoder/expiry contract using upstream skeleton generation, then Sol implements TypeScript adapters and main proves actual Seoul route/cost change and expiry rollback. This preliminary investigation does not replace those gates.

그래프 변경·경로 실행·속도 인코더·P08완료를 주장하지 않습니다. 다음은 메인이 상위 뼈대 생성 도구를 이용한 인코더/만료 계약을 정하고 Sol이 TypeScript 연결기를 구현하며 메인이 실제 서울 경로/비용 변화·만료복구를 증명하는 단계입니다. 사전 조사는 해당 기준을 대신하지 않습니다.

## Bounded engine experiments / 제한된 엔진 실험

[Format experiment](traffic-format/summary.md): three historical LIVE edge IDs with direct10/2km/h records increased route time147.404→177.663→273.783s, but did not change its path. [Single middle edge](single-edge/summary.md): a preselected75m target had a legal excluded-location alternative, yet actual traffic kept the original route because its cost393.156 remained below the alternative416.986. These insufficient detour observations are retained.

형식실험은역사자료의세구간속도를직접낮춰시간증가를확인했지만경로는같았습니다. 미리정한중앙75m구간은제외요청으로합법대안을확인했으나실제정체경로의비용이대안보다낮아우회하지않았습니다. 부족한결과를보존합니다.

[Fixed140m corridor](corridor/summary.md): the prior alternative bypassed the contiguous24/41/75m baseline edges. Main fixed those three before the next bounded experiment. The unmodified request with only their2km/h bytes chose a different2.412km/184.731s path, avoiding all three; empty-file restoration exactly recovered2.119km/147.404s. No exclude location, waypoint or artificial route-cost factor was used in the traffic request. Main independently parsed14 upstream index/header records, checked the exact three eight-byte speed slots and unchanged other bytes, original responses/trace and exact absence of all three owned containers. [Main proof](main-verification.json). A case-sensitive cleanup-message check was corrected only in the independent inspector; engines were not rerun.

이전대안이연속24/41/75m구간을모두우회하는것을확인하고메인이세구간을고정했습니다. 세속도만2km/h로바꾼원래요청은세구간을피하는2.412km/184.731초경로를선택하고빈파일복구는2.119km/147.404초와정확히같았습니다. 실제교통요청에제외좌표·경유·인위비용가중을넣지않았습니다. 메인은상위목록/헤더14개·정확한세속도기록과그밖의바이트보존·원응답/trace·소유컨테이너3개부재를독립검사했습니다. 정리오류문구대소문자는독립검사기만바로잡고엔진은반복하지않았습니다.

Compressed archives in each experiment retain requests/responses, configuration, scripts and traffic byte artifacts. The87MiB generated graph.tar is omitted from the first archive; its hash and underlying graph identity remain recorded. Experiments2/3 reuse the first skeleton. OSM-derived data retains © OpenStreetMap contributors and ODbL1.0. These are direct-engine probes using archived sample identities, not fresh P05/P06/P07 flow, automatic expiry or complete P08 implementation. Next design must produce five qualifying synthetic contributors per target edge in one event window, publish/accept that real aggregate and exercise compiler activation/expiry.

각압축에요청/응답·설정·스크립트·교통바이트를보존하며첫실험의생성graph.tar87MiB는제외하고해시·원그래프식별은유지합니다. 후속둘은첫뼈대를재사용하고OSM기여자·ODbL1.0을유지합니다. 역사표본식별자를쓴직접엔진실험이며새수집/집계/서명수용·자동만료·P08완료가아닙니다. 다음설계는대상구간마다적격합성5명을같은관측창에완료시켜실제집계의게시/수용·변환/활성화/만료를연결해야합니다.
