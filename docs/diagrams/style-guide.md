# RouteLens diagram style / RouteLens 구조도 스타일

The user selected the existing RouteLens client style on 2026-10-25. This project-local record is the effective style guide for these figures. Source: [web/pilot/style.css](../../web/pilot/style.css), accepted runtime at 76331c7. It does not change shared skill settings or create a global saved profile.

사용자가 2026-10-25에 현재 RouteLens 화면의 스타일을 선택했습니다. 이 문서는 이번 그림에 적용한 프로젝트 안의 스타일 원본이며 공용 스킬 설정이나 전역 프로필을 바꾸지 않습니다.

### Semantic roles / 의미별 색상

| Role / 역할 | Value / 값 | Source and use / 출처·사용 |
| --- | --- | --- |
| paper | `#f5f7f9` | Client paper / 화면 배경 |
| paper-2 | `#edf1f4` | Quiet grouping surface / 처리 영역 배경 |
| ink | `#172b3a` | Client ink / 본문·노드 이름 |
| ink-strong | `#172b3a` | Same ink; no accent-filled text / 같은 본문색 |
| muted | `#526575` | Client secondary text / 보조 설명·연결선 |
| soft | `#526575` | Same readable secondary color / 읽기 쉬운 영역 이름 |
| rule | `#cad4df` | Client road color, decorative boundaries / 도로색·보조 경계 |
| rule-solid | `#cad4df` | Decorative legend separator / 범례 구분선 |
| accent | `#18816b` | Client route green; two focal borders / 경로 녹색·강조 경계 두 개 |
| accent-tint | `#e5f0ec` | Derived quiet green fill / 옅게 만든 녹색 배경 |
| link | `#2166ac` | Client focus color; not needed on these connectors / 화면 포커스색·이번 연결선에는 미사용 |

### Typography / 서체

Font source: system.

| Role / 역할 | Family and weight / 서체·굵기 |
| --- | --- |
| title | Avenir Next, Apple SD Gothic Neo, Segoe UI, sans-serif; 600 |
| node-name | Same brand stack; 600 / 같은 브랜드 서체 |
| sublabel | Client system body stack; 400 / 화면 시스템 본문 서체 |
| eyebrow | Client body stack; 600 / 화면 본문 서체 |
| arrow-label | Client body stack; no labels required / 이번 연결선 이름은 불필요 |
| callout | Brand stack for heading, body stack for prose / 제목·본문 서체 구분 |

The slide-16x9 ramp uses 40px titles, 16px node names, 12px details and 14px group headings. Technical Latin tags use 8px UI monospace. Korean prose stays in the sans-serif body stack. Node origins, dimensions and spacing follow a 4px grid; nonaligned connectors use 8px orthogonal elbows.

16:9 도표의 제목 40픽셀·노드 이름 16픽셀·설명 12픽셀·영역 제목 14픽셀을 사용합니다. 영문 기술 표식만 작은 고정폭 서체로 두고 한국어 설명은 본문 서체로 유지합니다. 위치·크기는 4픽셀 단위이며 꺾인 연결선은 반지름 8픽셀을 사용합니다.

Measured contrast: ink/paper 13.55:1, muted/paper 5.62:1, accent border/green fill 4.10:1, ink/input fill 11.91:1. Green carries border emphasis, while readable ink carries text. System-font fallbacks remain explicit; exact font files are not embedded.

명암 대비는 본문/배경 13.55:1·보조 글자/배경 5.62:1·녹색 경계/옅은 녹색 4.10:1·입력 상자 본문 11.91:1입니다. 녹색은 경계를 강조하고 글자는 짙은 본문색으로 표시합니다. 대체 서체를 명시하고 서체 파일은 넣지 않습니다.
