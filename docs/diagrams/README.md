# Architecture figure / 아키텍처 그림

The README embeds actual versioned SVG images, drawn with the [Diagram Design skill](https://github.com/cathrynlavery/diagram-design) (installed version 2.6.120). The figure uses RouteLens's existing colors and system-font stacks from [the client stylesheet](../../web/pilot/style.css), as selected by the user. Its eight components and eight connections come from the previous README diagram; none were dropped or merged.

README에는 Git으로 관리하는 실제 SVG 이미지를 넣습니다. 다이어그램 디자인 스킬로 그렸으며 사용자가 선택한 RouteLens 화면의 색상·시스템 서체를 적용했습니다. 기존 그림의 구성요소 8개·연결 8개를 모두 유지했습니다.

- English: [image](architecture.svg), [self-contained HTML](architecture.html).
- 한국어: [이미지](architecture.ko.svg), [단일 HTML 원본](architecture.ko.html).
- [TypeScript generator / TypeScript 생성 원본](render-architecture.ts).
- [English semantic source](source.mmd), [한국어 의미 원본](source.ko.mmd), [extracted source inventory / 추출 목록](source-analysis.json).
- [Style decisions / 스타일 결정](style-guide.md), [verification / 검사 결과](verification.json).

The 1280×720 architecture figure follows traffic data and route results, rather than showing every request/reply message. Synthetic movement, managed collection, shared signed traffic, two compatible routing nodes, gateway selection and browser results retain the current pilot's boundaries. See the [architecture contract](../02-architecture.md) for details.

1280×720 구조도는 교통자료와 경로 결과의 흐름을 보여줍니다. 모든 요청·응답 메시지를 그린 것은 아닙니다. 합성 이동·관리되는 수집·서명한 교통자료 공유·호환 경로 노드 두 개·중계 선택·브라우저 결과라는 현재 파일럿 범위를 유지합니다.

## Reproduce / 다시 만들기

With Node.js 22 or 24 and the repository's locked TypeScript dependencies:

Node.js 22 또는 24와 저장소에 고정한 TypeScript 의존성을 사용합니다.

```sh
node --experimental-strip-types docs/diagrams/render-architecture.ts
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node docs/diagrams/render-architecture.ts
```

The generator creates both HTML files. The packaged skill's `scripts/export_svg.py` exports each HTML into its adjacent SVG with `--system-fonts`; `scripts/self_check.py` checks both HTML files. These packaged Python helpers are authoring tools, not a new RouteLens runtime or verification dependency. No packages were installed for this update. The committed SVGs display directly on GitHub.

생성기는 한영 HTML을 만듭니다. 스킬의 SVG 내보내기 도구를 `--system-fonts`로 실행해 SVG를 만들고, 자체 검사 도구로 두 HTML을 확인했습니다. 스킬에 포함된 Python 도구는 그림 제작용이며 RouteLens 실행·검증 도구에 의존성을 추가하지 않았습니다. 이번 변경을 위해 패키지를 설치하지 않았고 SVG는 GitHub에서 바로 표시됩니다.

Font files are not redistributed. Avenir Next and Apple SD Gothic Neo are used where available; other systems use the declared Segoe UI/sans-serif fallbacks. The source HTML has a local horizontal scroller for narrow screens and a print layout. SVG images scale inside GitHub and can be opened at full size.

서체 파일은 배포하지 않습니다. 설치된 환경에서는 Avenir Next·Apple SD Gothic Neo를 사용하고 다른 시스템은 명시된 대체 서체를 사용합니다. HTML은 좁은 화면에서 그림 영역만 가로로 스크롤하며 SVG는 GitHub 안에서 확대·축소됩니다.

Template-derived layout primitives retain the upstream [MIT notice](diagram-design-LICENSE.txt). Project content and the generator follow RouteLens's repository license.

템플릿에서 가져온 배치 규칙의 MIT 고지를 보존합니다. 프로젝트 내용·생성 원본은 RouteLens 저장소 라이선스를 따릅니다.
