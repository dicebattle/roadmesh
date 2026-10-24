import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fixture } from "./helpers.js";
import { loadGraphBundle, type GraphBundle } from "../tools/graph_bundle.js";
import type { GraphFixture, EdgeMapping } from "../tools/graph_evidence.js";
import type { Observation } from "../tools/vehicle_simulator.js";
import type { MatchingEnvelope } from "../tools/matching_evidence.js";

const archive = fixture<{ files: Record<string, string> }>(
  "fixtures/simulation/p02-reference.json",
);
const archivedJson = (name: string): unknown =>
  JSON.parse(Buffer.from(archive.files[name]!, "base64").toString("utf8"));
export const unitBundle: GraphBundle = {
  directory: "unit-only",
  manifest: archivedJson("manifest.json") as Record<string, unknown>,
  manifestSha256: "unit-only",
  graphId: String(
    (archivedJson("manifest.json") as Record<string, unknown>).graph_id,
  ),
  fixture: archivedJson("fixture.json") as GraphFixture,
  edges: archivedJson("edge-map.json") as EdgeMapping[],
};
export interface ProbeCase {
  request: { shape: { lon: number; lat: number; time: number }[] };
  response: unknown;
}
export const probes = fixture<{ cases: Record<string, ProbeCase> }>(
  "tests/fixtures/p04-probe.json",
).cases;
export function probeObservations(name: string): Observation[] {
  return probes[name]!.request.shape.map((point, index) => ({
    sample_id: `probe:${name}:${index}`,
    vehicle_id: name,
    offset_ms: Math.round(point.time * 1000),
    event_time_utc: new Date(
      Date.parse("2026-01-01T00:00:00Z") + Math.round(point.time * 1000),
    ).toISOString(),
    longitude: point.lon,
    latitude: point.lat,
    accuracy_m: name === "baseline-noisy" ? 3 : 0.01,
    source_class: "SYNTHETIC",
  }));
}
export function matchingEnvelope(
  observations = probeObservations("baseline-clean"),
): MatchingEnvelope {
  return {
    schema_version: "0.1",
    matching_id: "unit-matching",
    graph_id: unitBundle.graphId,
    observations,
  };
}
export function restoreGraph(directory: string): GraphBundle {
  mkdirSync(directory);
  for (const [path, encoded] of Object.entries(archive.files)) {
    const destination = join(directory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.from(encoded, "base64"));
  }
  return loadGraphBundle(directory);
}
export function midpointObservations(): Observation[] {
  return Array.from({ length: 21 }, (_, index) => ({
    sample_id: `midpoint:parallel-midpoint:${index}`,
    vehicle_id: "parallel-midpoint",
    offset_ms: index * 1000,
    event_time_utc: new Date(
      Date.parse("2026-01-01T00:00:00Z") + index * 1000,
    ).toISOString(),
    longitude: Number((0.0001 + index * 0.00009).toFixed(9)),
    latitude: 0.00005,
    accuracy_m: 6,
    source_class: "SYNTHETIC",
  }));
}
