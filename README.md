<div align="center">

# RouteLens

**Shared traffic data. Distributed route calculation. Verifiable local experiments.**

[English](README.md) · [한국어](README.ko.md) · [Project handbook](wiki/index.md) · [Roadmap](docs/11-local-pilot.md)

[![Checks](https://github.com/dicebattle/routelens/actions/workflows/fast-checks.yml/badge.svg)](https://github.com/dicebattle/routelens/actions/workflows/fast-checks.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

</div>

RouteLens is an open-source project derived from **Metro Lens**. The intended system turns verified driving observations into shared traffic data, then lets independent routing nodes calculate routes using the same map and traffic version.

**Today, the local prototype builds a real Valhalla graph, simulates vehicles, and produces GPS observations with controlled noise and missing samples.** Traffic aggregation, live updates, distributed-node failover and a navigation app are still on the roadmap.

## Watch the current simulation

[![Recorded RouteLens simulation: true trajectories, GPS observations and missing samples](docs/media/demo.gif)](docs/media/demo.mp4)

[Watch/download the MP4](docs/media/demo.mp4) · [Captured test report](research/pilot/2026-10-24-p03/report.md) · [Recording provenance](docs/media/latest.json)

This is a recording of an actual generated report from a fresh integrated run. It shows fictional roads, three simulated vehicles, a five-second wait, bounded GPS noise and ten scheduled missing observations. It does **not** show live traffic or completed GPS map matching.

## What you can run today

| Capability | What is actually checked |
| --- | --- |
| **P01 — deterministic scenarios** | Seeded replay, event order, failed/skipped assertions and output preservation |
| **P02 — real routing graph** | Valhalla graph generation, 22 directed edges, legal alternatives, forbidden-turn detours, one-way and disconnected-road errors |
| **P03 — vehicle and GPS simulation** | Independent trajectories, speed/wait schedules, bounded noise, exact missing-sample intervals and stable sample identities |
| **Integrated evidence** | Fresh corpus → P01 → Docker/Valhalla P02 → P03 → replay and invalid-input checks, with source and artifact hashes |
| **Replay report** | Offline map playback, time/vehicle controls, English/Korean text and links to actual stage evidence |

Synthetic observations never count toward the separate **100 route / 100 map-matching real-road evaluation**. The geographic validator currently has no reviewed real-road corpus.

## Run the whole implemented pipeline

Requirements: **Node.js 22 or 24**, npm, and Docker with Linux containers. Initial image preparation downloads the pinned engine and Osmium package; graph operations then run with networking disabled. No Cloudflare account, map API key or real GPS trace is needed.

```sh
git clone https://github.com/dicebattle/routelens.git
cd routelens
npm ci
npm run build
npm run simulation:check -- --output data/my-first-run
npm run report:serve -- data/my-first-run
```

Open the loopback URL printed by the server with `/report.html` appended. The server stops after 15 minutes. Use a **new output directory** for every run; existing evidence is never overwritten.

For automated checks:

```sh
npm test
npm run media:check
```

`media:check` verifies that the published recording still matches the implementation, report and asset hashes. After changing runtime behavior, regenerate the integration report and recapture the demo before publishing. See the [evidence workflow](docs/17-simulation-evidence-delivery.md).

## Built here, reused upstream

```mermaid
flowchart LR
  F[Authored synthetic OSM] --> O[Osmium · PBF conversion]
  O --> V[Valhalla · real graph and routing]
  V --> G[Verified graph bundle]
  S[Authored paths and speed schedules] --> P[RouteLens · vehicle simulation]
  G --> P
  P --> T[Independent trajectory truth]
  P --> N[Noisy GPS and explicit omissions]
  T --> R[Captured replay and test report]
  N --> R
```

RouteLens owns the contracts, orchestration, simulation and evidence checks. **Valhalla** builds graphs and calculates routes and will provide map matching; **Osmium** converts OSM files. The planned client uses **MapLibre**; trusted traffic publication and node selection remain RouteLens responsibilities. [Build-or-reuse decisions](docs/03-build-or-reuse.md).

The planned production design has a managed ingestion path and approved independent routing nodes. It keeps raw location data out of public peer-to-peer distribution. A Cloudflare deployment and an independently installable PostgreSQL/HTTP path are planned; neither is required for the current local simulation.

## Evidence before completion

Each module follows **design → implementation → direct execution → inspected evidence → bilingual record → push**. The main agent owns design and review; implementation is delegated according to [repository instructions](AGENTS.md). AI assistance is recorded with the actual checks and limits, not used as a quality claim.

- [Latest integrated test report](research/pilot/2026-10-24-p03/report.md)
- [Current implementation and remaining goal](docs/18-goal-progress.md)
- [Append-only work log](wiki/log.md)
- [P01–P14 module contracts](docs/11-local-pilot.md)
- [Architecture](docs/02-architecture.md) · [Protocol](docs/04-protocol.md) · [Privacy and trust](docs/07-privacy-and-trust.md)

**Next: P04 real GPS map matching and ambiguity exclusion**, followed by durable ingestion, traffic aggregation/publication, real speed-file consumption and two-node failover. An evidence replay viewer is not the finished navigation client. Local synthetic success does not establish Korean road accuracy, mobile battery behavior or production reliability.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [development workflow](docs/12-development-workflow.md). Main is protected; changes must pass required checks. Keep fixtures synthetic and distributable, preserve prior evidence, and explain why a change exists in English and Korean.

Project code and documentation use [Apache-2.0](LICENSE). Upstream tools and datasets retain their own licenses. [Security policy](SECURITY.md) · [Governance](GOVERNANCE.md).
