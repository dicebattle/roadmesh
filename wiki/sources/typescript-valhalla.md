# Toolchain and P02 sources / 도구 체계·P02 출처

Accessed 2026-10-24 by main. These sources informed implementation choices; they do not prove RouteLens performance or road accuracy.

메인이 2026-10-24 확인했습니다. 구현 선택의 근거이며 RouteLens 성능·도로 정확도 증거는 아닙니다.

- [Node releases](https://nodejs.org/en/about/previous-releases): 22/24 LTS; use both in CI. / 22·24 LTS를 CI에 사용합니다.
- [random-js](https://github.com/ckknight/random-js): MT19937 and array seeding; a narrow adapter preserves Python integer sampling. Version 2.1.0, MIT. / MT19937·배열 시드 제공, 좁은 어댑터로 Python 정수 추출을 보존합니다.
- [node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser): strict options and AST enable duplicate-key rejection. Version 3.3.1, MIT. / 엄격 옵션·구문 트리로 키 중복을 거부합니다.
- [Valhalla Docker documentation](https://github.com/valhalla/valhalla/blob/3.9.1/docker/README.md): official base image contains build/service executables. Main resolved the 3.9.1 image index and platform manifests with Docker, and executed `valhalla_service --version`: 3.9.1. / 공식 기반 이미지의 실행 파일·실제 이미지 식별·버전을 확인했습니다.
- [Valhalla service source](https://github.com/valhalla/valhalla/blob/3.9.1/src/valhalla_service.cc): one-shot CONFIG/ACTION/JSON mode supports route, locate and trace_attributes without a persistent server. / 서버 상시 실행 없이 단일 경로·구간·속성 요청이 가능합니다.
- [Valhalla locate API](https://github.com/valhalla/valhalla/blob/3.9.1/docs/docs/api/locate.md): verbose response exposes directed edge identity, OSM way, shape and access. / 방향성 구간 ID·OSM 도로·지형·접근 정보를 제공합니다.
- [Osmium tool](https://osmcode.org/osmium-tool/): existing OSM conversion utility. Ubuntu 24.04 base package metadata returned osmium-tool 1.16.0-1build1 on arm64. / 기존 OSM 변환 도구를 재사용하며 기반 배포판 패키지 버전을 확인했습니다.

Confidence: primary documentation and actual executable/package metadata. Unknown: cross-platform graph byte reproducibility, hosted engine integration and actual-road quality. Designs: [migration](../../docs/14-typescript-migration.md), [P02](../../docs/15-p02-test-graph.md).

신뢰 근거는 공식 문서·실제 실행 파일·패키지 메타데이터입니다. 플랫폼 간 그래프 바이트 재현·원격 엔진 연결·실제 도로 품질은 미확인입니다. 관련 설계는 위 링크에 있습니다.
