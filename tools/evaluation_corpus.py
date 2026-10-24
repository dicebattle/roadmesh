"""Validate RouteLens M0 evaluation inputs; never claim routing quality."""

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path


class CorpusError(ValueError):
    """An input does not satisfy the evaluation-corpus contract."""


def record(value, path, required, optional=()):
    if not isinstance(value, dict):
        raise CorpusError(f"{path}: expected an object")
    if set(required) - value.keys():
        raise CorpusError(f"{path}: missing required fields")
    if value.keys() - set(required) - set(optional):
        raise CorpusError(f"{path}: unexpected fields")


def text(value, path):
    if not isinstance(value, str) or not value.strip():
        raise CorpusError(f"{path}: expected non-empty text")


def identifier(value, path):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", value):
        raise CorpusError(f"{path}: expected a lowercase identifier (1–80 characters)")


def number(value, path, low, high):
    if type(value) not in (int, float) or not low <= value <= high or not math.isfinite(value):
        raise CorpusError(f"{path}: expected a finite number within the allowed range")


def array(value, path, minimum=1):
    if not isinstance(value, list) or len(value) < minimum:
        raise CorpusError(f"{path}: expected an array with at least {minimum} items")


def choice(value, path, choices):
    if not isinstance(value, str) or value not in choices:
        raise CorpusError(f"{path}: unsupported value")


def point(value, path, bbox, sample=False):
    fields = ("latitude", "longitude", "elapsed_s", "accuracy_m") if sample else ("latitude", "longitude")
    record(value, path, fields)
    west, south, east, north = bbox
    number(value["latitude"], path + ".latitude", south, north)
    number(value["longitude"], path + ".longitude", west, east)
    if sample:
        number(value["elapsed_s"], path + ".elapsed_s", 0, 86400)
        number(value["accuracy_m"], path + ".accuracy_m", 0.01, 10000)
    return float(value["latitude"]), float(value["longitude"])


def validate(corpus):
    """Return readiness counts after structural and semantic validation.

    Review metadata is an assertion by a human, not verified ground truth.
    Synthetic and uncertain cases never count toward the real-road quota.
    """
    record(corpus, "corpus", ("schema_version", "region", "sources", "cases"))
    if corpus["schema_version"] != "0.1":
        raise CorpusError("schema_version: unsupported version")
    region = corpus["region"]
    record(region, "region", ("id", "bbox"))
    identifier(region["id"], "region.id")
    bbox = region["bbox"]
    array(bbox, "region.bbox", 4)
    if len(bbox) != 4:
        raise CorpusError("region.bbox: expected west, south, east, north")
    for index, limit in enumerate((180, 90, 180, 90)):
        number(bbox[index], f"region.bbox[{index}]", -limit, limit)
    if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
        raise CorpusError("region.bbox: bounds must increase; antimeridian regions are not supported")

    array(corpus["sources"], "sources")
    sources = {}
    for index, source in enumerate(corpus["sources"]):
        path = f"sources[{index}]"
        record(source, path, ("id", "kind", "reference", "license", "redistribution"))
        identifier(source["id"], path + ".id")
        if source["id"] in sources:
            raise CorpusError(path + ": duplicate source id")
        choice(source["kind"], path + ".kind", ("synthetic", "open_data"))
        choice(source["redistribution"], path + ".redistribution", ("allowed", "unresolved"))
        text(source["reference"], path + ".reference")
        text(source["license"], path + ".license")
        sources[source["id"]] = source

    array(corpus["cases"], "cases")
    counts = {kind: {"total": 0, "reviewed_open_data": 0, "synthetic": 0,
                     "draft": 0, "uncertain": 0} for kind in ("route", "match")}
    seen_ids, seen_inputs, unresolved_sources = set(), set(), set()
    for index, case in enumerate(corpus["cases"]):
        path = f"cases[{index}]"
        record(case, path, ("id", "kind", "source_id", "status", "input"), ("review",))
        identifier(case["id"], path + ".id")
        if case["id"] in seen_ids:
            raise CorpusError(path + ": duplicate case id")
        seen_ids.add(case["id"])
        choice(case["kind"], path + ".kind", counts)
        choice(case["status"], path + ".status", ("draft", "reviewed", "uncertain"))
        identifier(case["source_id"], path + ".source_id")
        if case["source_id"] not in sources:
            raise CorpusError(path + ": unknown source id")
        source = sources[case["source_id"]]
        if source["redistribution"] != "allowed":
            unresolved_sources.add(source["id"])
        data = case["input"]
        if case["kind"] == "route":
            record(data, path + ".input", ("origin", "destination"))
            start = point(data["origin"], path + ".input.origin", bbox)
            end = point(data["destination"], path + ".input.destination", bbox)
            if start == end:
                raise CorpusError(path + ": origin and destination must differ")
            fingerprint = ("route", start, end)
        else:
            record(data, path + ".input", ("samples",))
            array(data["samples"], path + ".input.samples", 2)
            trace = []
            previous_time = -1
            for sample_index, sample in enumerate(data["samples"]):
                location = point(sample, f"{path}.input.samples[{sample_index}]", bbox, sample=True)
                if sample["elapsed_s"] <= previous_time:
                    raise CorpusError(path + ": sample elapsed_s must strictly increase")
                previous_time = sample["elapsed_s"]
                trace.append((*location, float(sample["elapsed_s"]), float(sample["accuracy_m"])))
            fingerprint = ("match", tuple(trace))
        if fingerprint in seen_inputs:
            raise CorpusError(path + ": duplicate evaluation input, even if ids differ")
        seen_inputs.add(fingerprint)

        if case["status"] == "reviewed":
            review = case.get("review")
            record(review, path + ".review", ("expectation", "evidence_reference"))
            text(review["expectation"], path + ".review.expectation")
            text(review["evidence_reference"], path + ".review.evidence_reference")
            if source["redistribution"] != "allowed":
                raise CorpusError(path + ": reviewed cases require resolved redistribution rights")
        elif "review" in case:
            raise CorpusError(path + ": review must be absent until status is reviewed")

        count = counts[case["kind"]]
        count["total"] += 1
        if source["kind"] == "synthetic":
            count["synthetic"] += 1
        elif case["status"] == "reviewed":
            count["reviewed_open_data"] += 1
        if case["status"] in ("draft", "uncertain"):
            count[case["status"]] += 1

    blockers = [f"{kind}: {count['reviewed_open_data']}/100 reviewed open-data cases"
                for kind, count in counts.items() if count["reviewed_open_data"] < 100]
    if unresolved_sources:
        blockers.append("referenced sources have unresolved redistribution rights")
    return {"schema_version": "0.1", "region_id": region["id"], "counts": counts,
            "ready_for_m0_measurement": not blockers, "blockers": blockers}


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CorpusError("JSON: duplicate object key")
        result[key] = value
    return result


def reject_constant(_):
    raise CorpusError("JSON: NaN and Infinity are not permitted")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", type=Path)
    parser.add_argument("--require-ready", action="store_true",
                        help="exit 1 unless both real-road case quotas are met")
    args = parser.parse_args(argv)
    try:
        raw = args.corpus.read_bytes()
        corpus = json.loads(raw, object_pairs_hook=unique_keys, parse_constant=reject_constant)
        report = validate(corpus)
        report["corpus_sha256"] = hashlib.sha256(raw).hexdigest()
    except (OSError, ValueError, UnicodeError, RecursionError) as error:
        print(f"Invalid corpus: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    return 1 if args.require_ready and not report["ready_for_m0_measurement"] else 0


if __name__ == "__main__":
    sys.exit(main())
