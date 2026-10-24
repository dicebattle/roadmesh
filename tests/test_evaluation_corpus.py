"""Checks for invalid evidence, duplicated samples, and readiness boundaries."""

import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path

from tools.evaluation_corpus import CorpusError, main, validate


ROOT = Path(__file__).resolve().parents[1]


class EvaluationCorpusTests(unittest.TestCase):
    def setUp(self):
        self.corpus = json.loads((ROOT / "fixtures/evaluation/synthetic-seoul.json").read_text())

    def test_synthetic_example_is_valid_but_never_real_road_evidence(self):
        for case in self.corpus["cases"]:
            case["status"] = "reviewed"
            case["review"] = {"expectation": "synthetic test", "evidence_reference": "test fixture"}
        result = validate(self.corpus)
        self.assertFalse(result["ready_for_m0_measurement"])
        self.assertEqual(result["counts"]["route"]["reviewed_open_data"], 0)
        self.assertEqual(result["counts"]["match"]["synthetic"], 1)

    def test_invalid_coordinates(self):
        for value in (True, "37.5", float("nan"), float("inf"), 91, 37.1):
            with self.subTest(value=value):
                corpus = copy.deepcopy(self.corpus)
                corpus["cases"][0]["input"]["origin"]["latitude"] = value
                with self.assertRaises(CorpusError):
                    validate(corpus)

    def test_invalid_bbox(self):
        for bbox in ([127, 37, 126, 38], [126, 37, 127, 37], [126, 37, 127, 91], [126, 37, 127, 38, 39]):
            with self.subTest(bbox=bbox):
                self.corpus["region"]["bbox"] = bbox
                with self.assertRaises(CorpusError):
                    validate(self.corpus)

    def test_duplicate_cases_do_not_inflate_quota(self):
        self.corpus["cases"].append(copy.deepcopy(self.corpus["cases"][0]))
        with self.assertRaisesRegex(CorpusError, "duplicate case id"):
            validate(self.corpus)
        self.corpus["cases"][-1]["id"] = "different-id"
        with self.assertRaisesRegex(CorpusError, "duplicate evaluation input"):
            validate(self.corpus)

    def test_unknown_and_duplicate_sources(self):
        self.corpus["cases"][0]["source_id"] = "missing"
        with self.assertRaisesRegex(CorpusError, "unknown source"):
            validate(self.corpus)
        self.corpus["sources"].append(copy.deepcopy(self.corpus["sources"][0]))
        with self.assertRaisesRegex(CorpusError, "duplicate source"):
            validate(self.corpus)

    def test_review_requires_evidence_and_resolved_rights(self):
        case = self.corpus["cases"][0]
        case["status"] = "reviewed"
        with self.assertRaises(CorpusError):
            validate(self.corpus)
        case["review"] = {"expectation": "turn restriction", "evidence_reference": " "}
        with self.assertRaises(CorpusError):
            validate(self.corpus)
        case["review"]["evidence_reference"] = "review record"
        self.corpus["sources"][0]["redistribution"] = "unresolved"
        with self.assertRaisesRegex(CorpusError, "redistribution"):
            validate(self.corpus)

    def test_stationary_samples_allowed_but_time_must_increase(self):
        samples = self.corpus["cases"][1]["input"]["samples"]
        samples[1]["latitude"] = samples[0]["latitude"]
        samples[1]["longitude"] = samples[0]["longitude"]
        validate(self.corpus)  # A red light is not automatically bad evidence.
        for elapsed in (0, -1):
            samples[1]["elapsed_s"] = elapsed
            with self.assertRaises(CorpusError):
                validate(self.corpus)

    def test_malformed_shapes_fail_as_corpus_errors(self):
        for change in (
            lambda c: c.update(schema_version="9"),
            lambda c: c.update(cases={}),
            lambda c: c["cases"][0].update(kind=[]),
            lambda c: c["cases"][0].update(status="approved"),
            lambda c: c["cases"][0].update(review={}),
            lambda c: c["cases"][0]["input"].update(destination=c["cases"][0]["input"]["origin"]),
        ):
            corpus = copy.deepcopy(self.corpus)
            change(corpus)
            with self.subTest(change=change), self.assertRaises(CorpusError):
                validate(corpus)

    def test_readiness_threshold_and_uncertain_exclusion(self):
        self.corpus["sources"][0]["kind"] = "open_data"
        templates = self.corpus["cases"]
        self.corpus["cases"] = []
        for kind_index, kind in enumerate(("route", "match")):
            for index in range(100):
                case = copy.deepcopy(templates[kind_index])
                case.update(id=f"{kind}-{index}", status="reviewed",
                            review={"expectation": "test-only review", "evidence_reference": "test-only evidence"})
                if kind == "route":
                    case["input"]["origin"]["latitude"] += index * 0.00001
                else:
                    case["input"]["samples"][0]["latitude"] += index * 0.00001
                self.corpus["cases"].append(case)
        self.assertTrue(validate(self.corpus)["ready_for_m0_measurement"])
        self.corpus["cases"][-1]["status"] = "uncertain"
        del self.corpus["cases"][-1]["review"]
        self.assertFalse(validate(self.corpus)["ready_for_m0_measurement"])
        self.assertEqual(validate(self.corpus)["counts"]["match"]["reviewed_open_data"], 99)

    def test_cli_exit_codes_and_nonstandard_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "corpus.json"
            path.write_text(json.dumps(self.corpus))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path)]), 0)
            self.assertEqual(len(json.loads(output.getvalue())["corpus_sha256"]), 64)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(path), "--require-ready"]), 1)
            for contents in ('{"schema_version":"0.1","schema_version":"0.2"}', 'NaN', '{', '[]'):
                path.write_text(contents)
                with self.subTest(contents=contents), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(main([str(path)]), 2)


if __name__ == "__main__":
    unittest.main()
