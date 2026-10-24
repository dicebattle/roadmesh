# P08 installed-tool reconnaissance / P08 설치 도구 사전 조사

Main specified the bounded inspection and Sol ran it against the pinned Valhalla base and actual Seoul pilot image `sha256:8b4a0609466e08dd6b384be7104ffa3f1c43270d9a8e931f3d93e2243566b4b6`, Linux/arm64. Containers used network none,2CPU/4GiB, unique names/labels and automatic removal. [Executed commands](commands.txt), [actual pilot tool output](derived-tools-output.log), [empty final owned-container inventory](cleanup-output.log). Original scripts, full installed-header output and image inspection remain locally under `data/p08-abi-probe`.

메인이 제한된 조사 범위를 정하고 Sol이 고정 Valhalla 기반 이미지와 실제 서울 파일럿 이미지에서 실행했습니다. 네트워크 차단·2CPU/4GiB·고유이름/라벨·자동삭제를 사용하고 명령·실제도구출력·마지막 소유컨테이너부재를 보존합니다. 스크립트·설치헤더전체·이미지검사원문은 로컬 data폴더에 남아 있습니다.

Installed `valhalla_build_extract --with-traffic` provides a traffic archive skeleton. The installed traffic header has32/8-byte static assertions and stale24/2-byte prose, consistent with the [pinned source inspection](../../../wiki/sources/valhalla-live-traffic.md). Neither image contains a C/C++ compiler in PATH or the inspected /usr,/opt locations. No package installation or image build was attempted. Actual sizeof/offsetof/sample-bitfield execution therefore remains unverified; ELF little-endian AArch64 does not prove that ABI by itself.

설치된 엔진 도구가 교통정보 파일의 뼈대를 만들 수 있습니다. 설치 헤더도32/8바이트 정적 검사와 낡은24/2바이트 설명이 함께 있습니다. 두 이미지의 PATH·조사한/usr,/opt에서C/C++컴파일러가 없어 설치·빌드 없이 종료했습니다. 따라서 실제 크기·위치·비트필드 실행 검증은 미확인이고 실행파일의 바이트순서만으로 해당 배치를 증명하지 않습니다.

No graph mutation, route execution, traffic encoder or P08 completion is claimed. Next: main fixes the encoder/expiry contract using upstream skeleton generation, then Sol implements TypeScript adapters and main proves actual Seoul route/cost change and expiry rollback. This preliminary investigation does not replace those gates.

그래프 변경·경로 실행·속도 인코더·P08완료를 주장하지 않습니다. 다음은 메인이 상위 뼈대 생성 도구를 이용한 인코더/만료 계약을 정하고 Sol이 TypeScript 연결기를 구현하며 메인이 실제 서울 경로/비용 변화·만료복구를 증명하는 단계입니다. 사전 조사는 해당 기준을 대신하지 않습니다.
