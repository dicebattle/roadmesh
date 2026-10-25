# P12 evidence archive / P12 근거 보존

Start with the [bilingual report](report.md). The original full run and demo are separate archives. Reconstruct the full original tree with the four ordered parts listed in [archive-verification.json](archive-verification.json); verify concatenated SHA-256 before extracting. The demo uses its own [inventory](demo-archive-verification.json). Exact omitted map bytes are listed in [omitted-files.json](omitted-files.json) and [demo-omitted-files.json](demo-omitted-files.json). Original hashes were checked locally before omission. No arbitrary missing files are accepted. Three supplemental audits are separate from original inventories.

이중 언어 보고서에서 시작합니다. 전체 실행·시연은 별도 묶음입니다. 목록 순서대로 전체 네 조각을 이어 SHA-256을 확인하고 새 폴더에 풉니다. 시연은 자신의 목록을 사용합니다. 제외 지도 바이트는 정확한 목록에 있고 제외 전에 로컬 해시를 검사했습니다. 임의 누락은 허용하지 않으며 추가 감사 세 파일은 원 목록과 구분합니다.

```sh
cat originals.tar.gz.part01 originals.tar.gz.part02 originals.tar.gz.part03 originals.tar.gz.part04 > originals.tar.gz
shasum -a 256 originals.tar.gz
mkdir restored-originals
tar -xzf originals.tar.gz -C restored-originals
```

Expected SHA-256 / 기대 해시: `20cc17d90928d2c56c77ec9878d995d4857761a9d1cc6a37a6b9268d940c4833`. The report HTML needs its relative files, already copied for published UI links. Full private request details are available in the archived originals.

보고서 HTML의 상대 경로는 공개 화면 링크를 위해 복사했습니다. 전체 내부 요청 근거는 묶음에 있습니다.
