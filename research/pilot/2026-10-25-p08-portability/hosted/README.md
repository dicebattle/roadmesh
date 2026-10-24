# Corrected Linux evidence / 수정 후 Linux 검증 근거

[PR run 40122629962](https://github.com/dicebattle/routelens/actions/runs/40122629962) and [push run 40122625901](https://github.com/dicebattle/routelens/actions/runs/40122625901) passed. The inspected PR artifact records clean merge-test commit `5f25a578e33cb623c3b16f954f26830ad484fa67` for branch head `6153689ada1bed5f1da43aaae0ae1e068208a4f6`. It has the same runtime fingerprint as the corrected local recording: `12b6c0164fba48fd08f6b2732ccd24197634ec9ae734ecf0a5de500a5e365404`.

수정 후 PR·푸시 실행 모두 통과했습니다. 메인이 내려받아 검사한 PR 자료는 브랜치 커밋을 포함하는 깨끗한 병합 시험 커밋을 기록하며, 실행 지문은 보완한 로컬 녹화와 같습니다.

- Whole pipeline: **238/238**; Node 22 and 24: **217/217 each**. / 전체 처리 238개, Node 22·24 각각 217개 통과.
- Main independently checked **4,122 present file hashes**, previous aggregation/signature/state evidence and **12/12 P08 hosted audits**. The original three targets retain their geometry; the west endpoint differs by exactly one longitude grid unit, approximately 0.088m. / 메인이 존재하는 원문 해시 4,122개·기존 집계/서명/영속 상태·P08 원격 감사 12개를 확인했습니다. 대상 원지형은 보존됐고 서쪽 끝점 경도 한 칸 차이도 원문에서 확인했습니다.
- Graph: `d0596c37f21f3c27fdc7d252926ee2376445a8ffdcebe19999f4630f61431c36`; actual linux/amd64 image: `sha256:279b67b67fe775fba1349d56c4bb1917b3c43287b7416cafe71aa1bd427a1a8a`.
- Exactly 17 declared map binary/extract paths are absent from selected inventories; their bytes are **not** independently verified. Traffic archives and hidden interrupted staging files are present and checked. Tiny graph files outside the selected inventories are not claimed byte-verified. / 명시한 지도 바이너리·묶음 17개는 원격 자료에서 제외됐으므로 바이트 검증을 주장하지 않습니다. 교통파일과 중단된 숨김 임시파일은 실제로 포함돼 검사했습니다. 선택 목록 밖 작은 그래프 원문도 해시 검증 주장에 포함하지 않습니다.
- Cleanup is checked through original hosted records, not current remote process queries. / 원격 정리는 보존된 실행 기록으로 확인했으며 현재 원격 프로세스 직접 조회는 아닙니다.

[Original downloaded evidence plus main audit outputs](evidence.tar.gz) · [Archive hashes](archive-sha256.json) · [Whole audit](main-verification.json) · [P08 audit](main-traffic-verification.json) · [Run metadata](run.json) · [Run log](run.log.gz) · [Node 24 log](node24.log.gz).

The archive retains the downloaded artifact without extra omissions and adds the independently generated audit outputs. Extract into a new directory. This remains real public Seoul roads with authored synthetic movement, not measured real driving or live Seoul traffic. P09–P14 remain unfinished.

압축은 내려받은 자료를 추가 제외 없이 보존하고 독립 검사 결과만 추가합니다. 새 폴더에 풀어 확인합니다. 실제 공개 서울 도로 위의 합성 이동 증거이며 실주행·현재 서울 교통을 측정한 것은 아닙니다. P09~P14는 미완료입니다.
