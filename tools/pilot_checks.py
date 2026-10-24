"""Check pilot CLI behavior and retain synthetic evidence / 파일럿 CLI와 합성 증거를 검사합니다."""

import argparse
import copy
import json
from pathlib import Path
import subprocess
import sys

from tools.pilot_runner import Parser, ROOT, canonical
import hashlib


def check(output):
    output = Path(output)
    output.mkdir()
    results = []
    fixture = json.loads((ROOT / "fixtures/pilot/success.json").read_text(encoding="utf-8"))
    variants = [("success-a", copy.deepcopy(fixture), 0, "PASS"),
                ("success-b", copy.deepcopy(fixture), 0, "PASS"),
                ("failed", copy.deepcopy(fixture), 1, "FAIL"),
                ("unsupported", copy.deepcopy(fixture), 1, "SKIPPED"),
                ("invalid", copy.deepcopy(fixture), 2, None)]
    variants[2][1]["assertions"][0]["expected"] = 0
    variants[3][1]["assertions"][0]["kind"] = "future-check"
    variants[4][1]["seed"] = True
    manifests = {}
    try:
        for name, spec, expected_exit, expected_status in variants:
            scenario = output / f"{name}.json"
            scenario.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
            destination = output / name
            process = subprocess.run([sys.executable, "-m", "tools.pilot_runner", str(scenario), "--output", str(destination)],
                                     cwd=ROOT, text=True, capture_output=True, timeout=30)
            (output / f"{name}.stdout.txt").write_text(process.stdout, encoding="utf-8")
            (output / f"{name}.stderr.txt").write_text(process.stderr, encoding="utf-8")
            errors = []
            if process.returncode != expected_exit:
                errors.append("unexpected exit code / 예상과 다른 종료 코드")
            if expected_status is not None:
                manifest = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
                assertions = json.loads((destination / "assertions.json").read_text(encoding="utf-8"))
                events = json.loads((destination / "events.json").read_text(encoding="utf-8"))
                summary = (destination / "summary.md").read_text(encoding="utf-8")
                manifests[name] = manifest
                expected_run = "PASS" if expected_exit == 0 else "FAIL"
                statuses = [item["status"] for item in assertions]
                if (manifest["status"] != expected_run or len(assertions) != len(spec["assertions"])
                        or statuses[0] != expected_status or any(status != "PASS" for status in statuses[1:])
                        or any(item["required"] is not True for item in assertions)):
                    errors.append("unexpected assertion report / 검사 보고서가 예상과 다릅니다")
                if manifest["event_sha256"] != hashlib.sha256(canonical(events)).hexdigest():
                    errors.append("event digest mismatch / 이벤트 해시 불일치")
                if "Pilot evidence / 파일럿 증거" not in summary:
                    errors.append("missing bilingual summary / 이중 언어 요약 누락")
            elif destination.exists():
                errors.append("invalid input wrote evidence / 잘못된 입력이 증거를 생성했습니다")
            results.append({"case": name, "expected_exit": expected_exit, "actual_exit": process.returncode,
                            "status": "FAIL" if errors else "PASS", "errors": errors})
        if manifests["success-a"]["event_sha256"] != manifests["success-b"]["event_sha256"]:
            results.append({"case": "replay", "status": "FAIL", "errors": ["replay differs / 재생 결과 불일치"]})
    except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError) as error:
        results.append({"case": "wrapper", "status": "FAIL", "errors": [f"Evidence check failed / 증거 검사 실패: {error}"]})
    finally:
        (output / "checks.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if any(result["status"] == "FAIL" for result in results) else 0


def main(argv=None):
    parser = Parser(description=__doc__, add_help=False)
    parser.add_argument("-h", "--help", action="help", help="show help / 도움말 표시")
    parser.add_argument("--output", type=Path, required=True, help="new checks directory / 새 검사 폴더")
    args = parser.parse_args(argv)
    try:
        code = check(args.output)
    except OSError as error:
        print(f"Cannot write checks / 검사 결과를 저장할 수 없습니다: {error}", file=sys.stderr)
        return 2
    print(f"Pilot CLI checks exit {code}; evidence: {args.output}. / 파일럿 CLI 검사 종료 코드 {code}; 증거: {args.output}.")
    return code


if __name__ == "__main__":
    sys.exit(main())
