"""Synthetic scheduler contract checks / 합성 일정 생성 계약 검사."""

import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from tools import pilot_checks
from tools.pilot_runner import (EventClock, MAX_BYTES, PilotError, ROOT, canonical, evaluate,
                                load_scenario, main, run, schedule, source_identity, validate)


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / "fixtures/pilot/success.json").read_text(encoding="utf-8"))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def scenario(self, contents=None):
        path = self.directory / "scenario.json"
        path.write_text(json.dumps(self.spec) if contents is None else contents, encoding="utf-8")
        return path

    def cli(self, path, output):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return main([str(path), "--output", str(output)])

    def test_same_time_event_priority_and_stable_fault_order(self):
        for vehicle in self.spec["vehicles"]:
            vehicle.update(start_jitter_ms=0, departure_ms=0)
        for fault in self.spec["faults"]:
            fault["at_ms"] = 0
        events, digest = schedule(self.spec)
        at_zero = [event for event in events if event["offset_ms"] == 0]
        self.assertEqual([event["kind"] for event in at_zero], [
            "vehicle_departure", "vehicle_departure", "fixture_edge_enter",
            "fixture_edge_enter", "fault_marker", "fault_marker"])
        self.assertEqual([event["entity_id"] for event in at_zero[:2]], ["car-a", "car-b"])
        self.assertEqual([event["fault_id"] for event in at_zero[-2:]], ["marker-a", "marker-b"])
        self.spec["vehicles"].reverse()
        self.spec["faults"].reverse()
        self.assertEqual(schedule(self.spec), (events, digest))

    def test_partial_write_cannot_leave_completed_manifest(self):
        path = self.scenario()
        original = Path.write_text
        for failing_name in ("events.json", "assertions.json", "summary.md", "manifest.json"):
            output = self.directory / failing_name
            written = []

            def fail_write(destination, data, *args, **kwargs):
                written.append(destination.name)
                if destination.name == failing_name:
                    if failing_name == "manifest.json":
                        original(destination, data, *args, **kwargs)
                    raise OSError("injected write failure")
                return original(destination, data, *args, **kwargs)

            with self.subTest(failing_name=failing_name), patch("pathlib.Path.write_text", fail_write):
                self.assertEqual(self.cli(path, output), 2)
                self.assertFalse((output / "manifest.json").exists())
                if failing_name == "manifest.json":
                    self.assertEqual(written, ["events.json", "assertions.json", "summary.md", "manifest.json"])

    def test_seeded_replay_and_different_seed(self):
        validate(self.spec)
        events, digest = schedule(self.spec)
        self.assertEqual(schedule(self.spec), (events, digest))
        self.spec["seed"] = 8
        self.assertNotEqual(schedule(self.spec)[1], digest)
        self.assertEqual(digest, hashlib.sha256(canonical(events)).hexdigest())
        self.assertEqual(len(events), 7)  # 2 departures + 3 labels + 2 markers.
        self.assertEqual([event["sequence"] for event in events], list(range(1, 8)))
        self.assertEqual(events[-1]["event_time_utc"], "2026-10-24T00:00:00.500Z")
        self.assertEqual([event["fault_id"] for event in events if event["kind"] == "fault_marker"], ["marker-a", "marker-b"])
        self.assertTrue(all("latitude" not in event and "speed" not in event for event in events))

    def test_declaration_reordering_and_unicode_canonicalization(self):
        self.spec["vehicles"][0]["route_labels"] = ["도로"]
        expected = schedule(self.spec)
        self.spec["vehicles"].reverse()
        self.spec["faults"].reverse()
        self.assertEqual(schedule(self.spec), expected)
        self.assertIn(b"\\u", canonical(expected[0]))

    def test_clock_reversal_and_injection(self):
        clock = EventClock()
        clock.advance(100)
        with self.assertRaises(PilotError):
            clock.advance(99)
        with self.assertRaises(PilotError):
            clock.advance(True)
        clock = EventClock()
        schedule(self.spec, clock)
        self.assertEqual(clock.offset_ms, 500)

    def test_malformed_fields_and_values(self):
        mutations = [lambda s: s.update(schema_version="2"), lambda s: s.update(extra=True),
                     lambda s: s.update(seed=True), lambda s: s.update(seed=-1),
                     lambda s: s.update(seed=2**32), lambda s: s.update(duration_s=0),
                     lambda s: s.update(duration_s=3601), lambda s: s.update(duration_s=True),
                     lambda s: s.update(start_time_utc="2026-10-24T00:00:00+00:00"),
                     lambda s: s.update(start_time_utc="2026-02-30T00:00:00Z"),
                     lambda s: s.update(start_time_utc="9999-12-31T23:59:59Z"),
                     lambda s: s.update(vehicles=[]), lambda s: s.update(assertions=[]),
                     lambda s: s.update(faults={}), lambda s: s.update(scenario_id="UPPER"),
                     lambda s: s["vehicles"][0].update(step_ms=0),
                     lambda s: s["vehicles"][0].update(departure_ms=True),
                     lambda s: s["vehicles"][0].update(start_jitter_ms=-1),
                     lambda s: s["vehicles"][0].update(route_labels=[]),
                     lambda s: s["vehicles"][0].update(route_labels=[""]),
                     lambda s: s["vehicles"][0].update(unknown=1),
                     lambda s: s["faults"][0].update(target_vehicle_id="missing"),
                     lambda s: s["faults"][0].update(kind="kill-process"),
                     lambda s: s["faults"][0].update(at_ms=1001),
                     lambda s: s["assertions"][0].update(expected=True),
                     lambda s: s["assertions"][0].update(event_kind="vehicle_departure"),
                     lambda s: s["assertions"][1].pop("event_kind"),
                     lambda s: s["assertions"][0].update(kind="event_digest", expected="A" * 64)]
        for mutation in mutations:
            spec = copy.deepcopy(self.spec)
            mutation(spec)
            with self.subTest(mutation=mutation), self.assertRaises(PilotError):
                validate(spec)
        for collection, key in (("vehicles", "vehicle_id"), ("faults", "fault_id"), ("assertions", "assertion_id")):
            spec = copy.deepcopy(self.spec)
            spec[collection].append(copy.deepcopy(spec[collection][0]))
            with self.subTest(collection=collection), self.assertRaises(PilotError):
                validate(spec)

    def test_maximum_jitter_and_collection_limits(self):
        self.spec["vehicles"][0].update(departure_ms=900, start_jitter_ms=101)
        with self.assertRaises(PilotError):
            validate(self.spec)
        self.spec["vehicles"][0].update(start_jitter_ms=100)
        validate(self.spec)
        self.spec["vehicles"][0]["route_labels"] = ["edge"] * 101
        with self.assertRaises(PilotError):
            validate(self.spec)
        self.spec["vehicles"] = [dict(self.spec["vehicles"][1], vehicle_id=f"car-{i}") for i in range(101)]
        with self.assertRaises(PilotError):
            validate(self.spec)

    def test_event_limit_boundary(self):
        self.spec["faults"] = [{"fault_id": f"f-{i}", "at_ms": 0, "target_vehicle_id": "car-a", "kind": "marker"} for i in range(19995)]
        validate(self.spec)  # 19995 markers + five vehicle events.
        self.spec["faults"].append({"fault_id": "too-many", "at_ms": 0, "target_vehicle_id": "car-a", "kind": "marker"})
        with self.assertRaises(PilotError):
            validate(self.spec)

    def test_json_and_byte_limits(self):
        for raw in ('{"seed":1,"seed":2}', 'NaN', 'Infinity', '{}', '[]', '{'):
            with self.subTest(raw=raw), self.assertRaises((ValueError, PilotError)):
                load_scenario(self.scenario(raw))
        path = self.scenario()
        padding = MAX_BYTES - path.stat().st_size
        with path.open("a", encoding="utf-8") as stream:
            stream.write(" " * padding)
        load_scenario(path)
        with path.open("a", encoding="utf-8") as stream:
            stream.write(" ")
        with self.assertRaises(PilotError):
            load_scenario(path)

    def test_assertion_kinds_and_required_skip(self):
        events, digest = schedule(self.spec)
        self.spec["assertions"].append({"assertion_id": "digest", "kind": "event_digest", "expected": digest})
        self.assertTrue(all(item["status"] == "PASS" for item in evaluate(self.spec, events, digest)))
        self.assertTrue(all(item["evidence_path"] == "events.json" for item in evaluate(self.spec, events, digest)))
        self.spec["assertions"][0]["expected"] = 0
        self.assertEqual(evaluate(self.spec, events, digest)[0]["status"], "FAIL")
        self.spec["assertions"][0].update(kind="future", expected={"reserved": True})
        validate(self.spec)
        skipped = evaluate(self.spec, events, digest)[0]
        self.assertEqual(skipped["status"], "SKIPPED")
        self.assertTrue(skipped["required"])
        self.assertIsNone(skipped["evidence_path"])

    def test_cli_evidence_exit_codes_and_provenance(self):
        path = self.scenario()
        self.assertEqual(self.cli(path, self.directory / "pass"), 0)
        manifest = json.loads((self.directory / "pass/manifest.json").read_text())
        expected = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
        expected_dirty = bool(subprocess.run(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
        self.assertEqual(manifest["source"], {"commit": expected, "dirty": expected_dirty})
        self.assertEqual(manifest["scenario_sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertFalse(manifest["engine_executed"])
        self.assertFalse(manifest["graph_loaded"])
        self.assertFalse(manifest["graph_resolved"])
        self.assertEqual(manifest["image_digests"], [])
        self.assertIsNone(manifest["aggregation_policy"])
        self.assertEqual(set(manifest["evidence"].values()), {"events.json", "assertions.json", "summary.md"})
        summary = (self.directory / "pass/summary.md").read_text(encoding="utf-8")
        self.assertIn("Pilot evidence / 파일럿 증거", summary)
        self.assertIn("합성 일정 생성만", summary)
        self.assertEqual(self.cli(path, self.directory / "replay"), 0)
        replay = json.loads((self.directory / "replay/manifest.json").read_text())
        self.assertNotEqual(manifest["run_id"], replay["run_id"])
        self.assertEqual(manifest["event_sha256"], replay["event_sha256"])
        for kind, expected_status in (("event_count", "FAIL"), ("future", "SKIPPED")):
            self.spec["assertions"][0].update(kind=kind, expected=0)
            path = self.scenario()
            self.assertEqual(self.cli(path, self.directory / kind), 1)
            report = json.loads((self.directory / kind / "assertions.json").read_text())
            self.assertEqual(report[0]["status"], expected_status)
        self.spec["seed"] = True
        self.assertEqual(self.cli(self.scenario(), self.directory / "invalid"), 2)
        self.assertFalse((self.directory / "invalid").exists())

    def test_unknown_source_identity(self):
        with patch("tools.pilot_runner.subprocess.run", side_effect=OSError("git unavailable")):
            self.assertEqual(source_identity(), {"commit": None, "dirty": None})

    def test_existing_output_and_symlink_preserved(self):
        path = self.scenario()
        existing = self.directory / "existing"
        existing.mkdir()
        sentinel = existing / "keep"
        sentinel.write_text("unchanged")
        self.assertEqual(self.cli(path, existing), 2)
        self.assertEqual(sentinel.read_text(), "unchanged")
        for target in (existing, self.directory / "absent"):
            link = self.directory / ("link-" + target.name)
            link.symlink_to(target, target_is_directory=True)
            self.assertEqual(self.cli(path, link), 2)
            self.assertTrue(link.is_symlink())
        self.assertEqual(self.cli(path, sentinel), 2)

    def test_write_error_and_arguments_exit_two(self):
        path = self.scenario()
        with patch("pathlib.Path.write_text", side_effect=OSError("disk full")):
            self.assertEqual(self.cli(path, self.directory / "partial"), 2)
        self.assertFalse((self.directory / "partial/summary.md").exists())
        for arguments in ([], [str(path)], [str(path), "--output", "x", "--unknown"]):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                main(arguments)
            self.assertEqual(raised.exception.code, 2)

    def test_cli_wrapper_checks_exit_and_report(self):
        self.assertEqual(pilot_checks.check(self.directory / "checks"), 0)
        results = json.loads((self.directory / "checks/checks.json").read_text())
        self.assertEqual(len(results), 5)
        self.assertTrue(all(item["status"] == "PASS" for item in results))
        real_run = subprocess.run

        def corrupt_report(arguments, **kwargs):
            result = real_run(arguments, **kwargs)
            destination = Path(arguments[-1])
            if destination.name == "success-a":
                report_path = destination / "assertions.json"
                report = json.loads(report_path.read_text())
                report[0]["status"] = "FAIL"
                report_path.write_text(json.dumps(report))
            return result

        with patch("tools.pilot_checks.subprocess.run", side_effect=corrupt_report):
            self.assertEqual(pilot_checks.check(self.directory / "corrupted"), 1)


if __name__ == "__main__":
    unittest.main()
