"""Schedule synthetic pilot events and preserve evidence / 합성 일정과 증거를 보존합니다."""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import platform
import random
import re
import subprocess
import sys
import uuid

MAX_BYTES = 1024 * 1024
MAX_EVENTS = 20000
EVENT_PRIORITY = {"vehicle_departure": 0, "fixture_edge_enter": 1, "fault_marker": 2}
ROOT = Path(__file__).resolve().parents[1]


class PilotError(ValueError):
    pass


def fail(path, en, ko):
    raise PilotError(f"{path}: {en} / {ko}")


def record(value, path, required, optional=()):
    if not isinstance(value, dict) or set(required) - value.keys() or value.keys() - set(required) - set(optional):
        fail(path, "expected exactly the documented fields", "문서에 정의된 필드를 정확하게 입력해야 합니다")


def integer(value, path, low, high=None):
    if type(value) is not int or value < low or (high is not None and value > high):
        fail(path, "integer outside the allowed range", "허용 범위 안의 정수가 필요합니다")


def label(value, path):
    if not isinstance(value, str) or not value.strip():
        fail(path, "expected nonempty text", "비어 있지 않은 문자열이 필요합니다")


def identifier(value, path):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", value):
        fail(path, "expected a lowercase identifier of 1–80 characters", "1~80자의 소문자 식별자가 필요합니다")


def collection(value, path, minimum, maximum=None):
    if not isinstance(value, list) or len(value) < minimum or (maximum is not None and len(value) > maximum):
        fail(path, "array size outside the allowed range", "배열 항목 수가 허용 범위를 벗어났습니다")


def unique(items, key, path):
    seen = set()
    for item in items:
        identifier(item[key], f"{path}.{key}")
        if item[key] in seen:
            fail(path, "duplicate identifier", "식별자가 중복되었습니다")
        seen.add(item[key])


def validate(spec):
    record(spec, "scenario", ("schema_version", "scenario_id", "fixture_graph_id", "seed", "start_time_utc", "duration_s", "vehicles", "faults", "assertions"))
    if spec["schema_version"] != "0.1":
        fail("schema_version", "unsupported version", "지원하지 않는 버전입니다")
    for key in ("scenario_id", "fixture_graph_id"):
        identifier(spec[key], key)
    integer(spec["seed"], "seed", 0, 2**32 - 1)
    integer(spec["duration_s"], "duration_s", 1, 3600)
    start = spec["start_time_utc"]
    if not isinstance(start, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", start):
        fail("start_time_utc", "expected UTC RFC3339 whole seconds ending in Z", "Z로 끝나는 UTC RFC3339 초 단위 시각이 필요합니다")
    try:
        datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ") + timedelta(seconds=spec["duration_s"])
    except (ValueError, OverflowError):
        fail("start_time_utc", "invalid or overflowing timestamp", "유효하지 않거나 범위를 초과하는 시각입니다")
    collection(spec["vehicles"], "vehicles", 1, 100)
    collection(spec["faults"], "faults", 0)
    collection(spec["assertions"], "assertions", 1)
    event_count = len(spec["faults"])
    for vehicle in spec["vehicles"]:
        record(vehicle, "vehicle", ("vehicle_id", "departure_ms", "step_ms", "start_jitter_ms", "route_labels"))
        for key in ("departure_ms", "start_jitter_ms", "step_ms"):
            integer(vehicle[key], "vehicle." + key, 1 if key == "step_ms" else 0)
        collection(vehicle["route_labels"], "route_labels", 1, 100)
        for item in vehicle["route_labels"]:
            label(item, "route_labels")
        if vehicle["departure_ms"] + vehicle["start_jitter_ms"] + (len(vehicle["route_labels"]) - 1) * vehicle["step_ms"] > spec["duration_s"] * 1000:
            fail("vehicle", "maximum event time exceeds duration", "최대 출발 지연을 포함한 마지막 이벤트가 기간을 초과합니다")
        event_count += 1 + len(vehicle["route_labels"])
    unique(spec["vehicles"], "vehicle_id", "vehicles")
    vehicle_ids = {v["vehicle_id"] for v in spec["vehicles"]}
    for fault in spec["faults"]:
        record(fault, "fault", ("fault_id", "at_ms", "target_vehicle_id", "kind"))
        integer(fault["at_ms"], "fault.at_ms", 0, spec["duration_s"] * 1000)
        if not isinstance(fault["target_vehicle_id"], str) or fault["target_vehicle_id"] not in vehicle_ids:
            fail("fault.target_vehicle_id", "unknown vehicle", "등록되지 않은 차량입니다")
        if fault["kind"] != "marker":
            fail("fault.kind", "only marker is supported", "marker만 지원합니다")
    unique(spec["faults"], "fault_id", "faults")
    if event_count > MAX_EVENTS:
        fail("scenario", "event count exceeds 20000", "이벤트가 20000개를 초과합니다")
    for assertion in spec["assertions"]:
        record(assertion, "assertion", ("assertion_id", "kind", "expected"), ("event_kind",))
        label(assertion["kind"], "assertion.kind")
        kind = assertion["kind"]
        if kind == "event_kind_count":
            label(assertion.get("event_kind"), "assertion.event_kind")
        elif "event_kind" in assertion:
            fail("assertion.event_kind", "only valid for event_kind_count", "event_kind_count에서만 사용할 수 있습니다")
        if kind in ("event_count", "event_kind_count", "last_event_ms"):
            integer(assertion["expected"], "assertion.expected", 0)
        elif kind == "event_digest" and (not isinstance(assertion["expected"], str) or not re.fullmatch(r"[0-9a-f]{64}", assertion["expected"])):
            fail("assertion.expected", "expected 64 lowercase hexadecimal characters", "소문자 16진수 64자리가 필요합니다")
    unique(spec["assertions"], "assertion_id", "assertions")
    return spec


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail("JSON", "duplicate object key", "객체 키가 중복되었습니다")
        result[key] = value
    return result


def reject_constant(value):
    fail("JSON", "NaN and Infinity are not allowed", "NaN과 Infinity는 허용되지 않습니다")


def load_scenario(path):
    with Path(path).open("rb") as source:
        raw = source.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        fail("scenario", "input exceeds 1 MiB", "입력이 1MiB를 초과합니다")
    spec = json.loads(raw, object_pairs_hook=unique_keys, parse_constant=reject_constant)
    return validate(spec), hashlib.sha256(raw).hexdigest()


class EventClock:
    def __init__(self):
        self.offset_ms = 0

    def advance(self, offset_ms):
        integer(offset_ms, "clock", 0)
        if offset_ms < self.offset_ms:
            fail("clock", "event time cannot move backward", "이벤트 시각은 역행할 수 없습니다")
        self.offset_ms = offset_ms
        return offset_ms


def canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def schedule(spec, clock=None):
    clock = clock if clock is not None else EventClock()
    rng = random.Random(spec["seed"])
    pending = []
    for vehicle in sorted(spec["vehicles"], key=lambda value: value["vehicle_id"]):
        departure = vehicle["departure_ms"] + rng.randint(0, vehicle["start_jitter_ms"])
        pending.append((departure, "vehicle_departure", vehicle["vehicle_id"], 0, {}))
        for index, fixture_label in enumerate(vehicle["route_labels"]):
            pending.append((departure + index * vehicle["step_ms"], "fixture_edge_enter", vehicle["vehicle_id"], index, {"fixture_label": fixture_label}))
    for index, fault in enumerate(sorted(spec["faults"], key=lambda value: value["fault_id"])):
        pending.append((fault["at_ms"], "fault_marker", fault["target_vehicle_id"], index, {"fault_id": fault["fault_id"]}))
    start = datetime.strptime(spec["start_time_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    events = []
    for sequence, (offset, kind, entity, ordinal, extra) in enumerate(sorted(pending, key=lambda item: (item[0], EVENT_PRIORITY[item[1]], item[2], item[3])), 1):
        clock.advance(offset)
        events.append({"sequence": sequence, "kind": kind, "entity_id": entity, "offset_ms": offset,
                       "event_time_utc": (start + timedelta(milliseconds=offset)).isoformat(timespec="milliseconds").replace("+00:00", "Z"), **extra})
    return events, hashlib.sha256(canonical(events)).hexdigest()


def evaluate(spec, events, digest):
    results = []
    for assertion in spec["assertions"]:
        kind = assertion["kind"]
        if kind == "event_count":
            actual = len(events)
        elif kind == "event_kind_count":
            actual = sum(event["kind"] == assertion["event_kind"] for event in events)
        elif kind == "last_event_ms":
            actual = events[-1]["offset_ms"]
        elif kind == "event_digest":
            actual = digest
        else:
            results.append({**assertion, "required": True, "status": "SKIPPED", "actual": None, "evidence_path": None,
                            "message_en": "Unsupported assertion; required check was skipped.",
                            "message_ko": "지원하지 않는 검사이며 필수 검사가 생략되었습니다."})
            continue
        passed = actual == assertion["expected"]
        results.append({**assertion, "required": True, "status": "PASS" if passed else "FAIL", "actual": actual, "evidence_path": "events.json",
                        "message_en": "Expectation matched." if passed else "Expectation did not match.",
                        "message_ko": "기대값과 일치합니다." if passed else "기대값과 일치하지 않습니다."})
    return results


def source_identity():
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True, timeout=5).stdout.strip()
        status = subprocess.run(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT, check=True, capture_output=True, text=True, timeout=5).stdout
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", commit):
            raise ValueError("invalid commit")
        return {"commit": commit, "dirty": bool(status)}
    except (OSError, subprocess.SubprocessError, ValueError):
        return {"commit": None, "dirty": None}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def run(scenario_path, output):
    started = now()
    spec, scenario_digest = load_scenario(scenario_path)
    events, event_digest = schedule(spec)
    assertions = evaluate(spec, events, event_digest)
    passed = all(item["status"] == "PASS" for item in assertions)
    manifest = {"schema_version": "0.1", "run_id": str(uuid.uuid4()), "scenario_id": spec["scenario_id"],
                "source": source_identity(), "python": platform.python_version(), "platform": platform.platform(),
                "scenario_sha256": scenario_digest, "event_sha256": event_digest,
                "started_at_utc": started, "completed_at_utc": now(), "event_count": len(events),
                "fixture_graph_id": spec["fixture_graph_id"], "graph_resolved": False, "graph_loaded": False,
                "engine_executed": False, "image_digests": [], "aggregation_policy": None,
                "status": "PASS" if passed else "FAIL", "seed": spec["seed"],
                "evidence": {"events": "events.json", "assertions": "assertions.json", "summary": "summary.md"}}
    summary = (f"# Pilot evidence / 파일럿 증거\n\n"
               f"Result / 결과: {manifest['status']}\n\n"
               f"Scenario / 시나리오: `{spec['scenario_id']}`\n\n"
               f"Events / 이벤트: {len(events)}; SHA-256: `{event_digest}`\n\n"
               "Synthetic scheduler only: no routing engine, loaded graph, GPS, traffic speed, image or aggregation policy.\n"
               "합성 일정 생성만 수행했습니다. 경로 엔진·그래프 로딩·GPS·교통속도·이미지·집계 정책은 실행하거나 적용하지 않았습니다.\n\n"
               "Required assertions / 필수 검사:\n\n" + "".join(
                   f"- `{item['assertion_id']}`: {item['status']} — {item['message_en']} / {item['message_ko']}\n" for item in assertions) +
               "\nEvidence / 증거: [manifest.json](manifest.json), [events.json](events.json), [assertions.json](assertions.json).\n")
    # Atomic directory creation refuses directories, files and dangling symlinks alike.
    output = Path(output)
    try:
        output.mkdir()
    except FileExistsError:
        fail("output", "path already exists; choose a new directory", "경로가 이미 있습니다. 새 폴더를 지정하세요")
    for name, value in (("events.json", events), ("assertions.json", assertions)):
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (output / "summary.md").write_text(summary, encoding="utf-8")
    # Publish the completion manifest last; a failed write must not leave it behind.
    manifest["completed_at_utc"] = now()
    manifest_path = output / "manifest.json"
    try:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    except OSError:
        manifest_path.unlink(missing_ok=True)
        raise
    return 0 if passed else 1


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        self.exit(2, f"error: {message}\nInvalid arguments; see --help. / 인자가 올바르지 않습니다. --help를 확인하세요.\n")


def main(argv=None):
    parser = Parser(description=__doc__, add_help=False)
    parser.add_argument("-h", "--help", action="help", help="show help / 도움말 표시")
    parser.add_argument("scenario", type=Path, help="scenario JSON / 시나리오 JSON")
    parser.add_argument("--output", type=Path, required=True, help="new evidence directory / 새 증거 폴더")
    args = parser.parse_args(argv)
    try:
        code = run(args.scenario, args.output)
    except (OSError, ValueError, UnicodeError, RecursionError, OverflowError) as error:
        print(f"Pilot input/output error; partial output is incomplete evidence. / 파일럿 입력·출력 오류이며 일부 출력은 미완료 증거입니다.\n{error}", file=sys.stderr)
        return 2
    print(f"Evidence written: {args.output}; exit {code}. / 증거 저장: {args.output}; 종료 코드 {code}.")
    return code


if __name__ == "__main__":
    sys.exit(main())
