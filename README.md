<div align="center">

# RouteLens

**Shared traffic data. Distributed route calculation. Verifiable local experiments.**

[English](README.md) · [한국어](README.ko.md) · [Project handbook](wiki/index.md) · [Roadmap](docs/11-local-pilot.md)

[![Checks](https://github.com/dicebattle/routelens/actions/workflows/fast-checks.yml/badge.svg)](https://github.com/dicebattle/routelens/actions/workflows/fast-checks.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

</div>

RouteLens is an open-source project derived from **Metro Lens**. The intended system turns verified driving observations into shared traffic data, then lets independent routing nodes calculate routes using the same map and traffic version.

**Today, the local prototype simulates GPS on actual Seoul roads, durably ingests and matches observations, aggregates at least five contributors, and signs and publishes traffic snapshots. A separate consumer verifies them before an immutable speed file changes actual Valhalla routes. Exact expiry restores default routing.** Two independent persistent nodes now activate verified generations, reject stale results and restore baseline routing at expiry. A local gateway independently selects the accepted version and switches to the other approved node after a failure. A local browser client now calculates actual routes, draws their original geometry and clears results when the accepted traffic changes or expires.

The complete implemented pipeline passed334 fresh assertions and285 unit tests. The gateway preserves responsive deadlines with an owned worker thread. The actual client adds English/Korean controls,390px layout, cancellation, expiry and unavailable-service handling. Earlier failed runs remain preserved.

## Watch the current simulation

[![Recorded Seoul routes: baseline, congestion detour and exact expiry](docs/media/demo.gif)](docs/media/demo.mp4)

[Watch/download the MP4](docs/media/demo.mp4) · [Captured test report](research/pilot/2026-10-25-p11/report.md) · [Recording provenance](docs/media/latest.json)

This102.8-second recording shows the actual route client sending requests to the gateway and native nodes. A2.119km/147.404s baseline changes to a2.412km/184.731s detour after signed synthetic traffic is published. A short interior segment shows100% accepted coverage. Killing nodeA switches the next request to nodeB; exact420s expiry removes the old route, and recalculation restores baseline. When both nodes stop, the client shows unavailable status without an old route line. The fresh full run retains the Seoul vehicle/GPS/ingestion pipeline and passes all **334 assertions**. Roads are actual OSM; vehicles, speeds and GPS are synthetic. This does not establish real-driving accuracy, live traffic or every Seoul road.

## What you can run today

| Capability | What is actually checked |
| --- | --- |
| **P01 — deterministic scenarios** | Seeded replay, event order, failed/skipped assertions and output preservation |
| **P02 — real routing graph** | Fresh Seoul graph from a pinned OSM source; 79 directed scene edges. Tiny-city retains 22-edge legal/forbidden-turn regression |
| **P03 — vehicle and GPS simulation** | Independent trajectories, speed/wait schedules, bounded noise, exact missing-sample intervals and stable sample identities |
| **P04 — map matching** | Real map snapping, observed traversal boundaries, gap/ambiguity exclusions and identical full/split/overlap results |
| **P05 — durable ingestion and recovery** | Committed receipt, duplicate/conflict handling, ordered trip finalization, fenced workers, real crash recovery and deletion read-back |
| **P06 — traffic aggregation** | Five-contributor minimum, median full duration including signal waits, duplicate/PARKED exclusion, strict availability deadline, transactional revocation and expiry |
| **P07 — signed publication** | Standard Ed25519 JWS, exact HTTP bytes, scoped local public keys, durable consumer order, key rotation, tamper/replay rejection and expiry |
| **P08 — accepted traffic routing** | Immutable graph-specific speed files, actual detour, automatic expiry, concurrent generation, real process/database faults and stale-result refusal |
| **P09 — persistent routing nodes** | Two independent nodes, native daemon reuse, request leases, bounded generation draining, durable restart and actual fault recovery |
| **P10 — route gateway** | Independent accepted-version authority, one matching-node retry, actual primary kill,12s shared deadline,4s node budget and public route coverage |
| **P11 — actual route client** | MapLibre local roads, real gateway requests, exact rendered geometry, freshness invalidation, cancellation, English/Korean and390px browser checks |
| **Integrated evidence** | Fresh tiny regression (48), Seoul graph/simulation/matching (35), durable ingestion (34), aggregation (34), publication (55), traffic routing (32), persistent nodes (32), gateway (32) and client (32): **334 assertions**, with source/artifact hashes |
| **Replay report** | Offline Seoul playback, baseline/live/expired route comparison and actual recovery evidence; English/Korean controls and source links |

Synthetic observations never count toward the separate **100 route / 100 map-matching real-road evaluation**. The geographic validator currently has no reviewed real-road corpus.

## Run the whole implemented pipeline

Requirements: **Node.js 22 or 24**, npm, curl, and Docker with Linux containers. Initial preparation downloads the pinned engine/Osmium and a 289.9 MB dated South Korea OSM file, verifies its SHA-256, then caches only the source. Every run builds a fresh Seoul graph with networking disabled (2 CPU / 4 GiB limits). P05–P11 automatically start pinned PostgreSQL containers with dedicated volumes and loopback ports, plus separate API, worker and engine processes, then remove their owned resources. No external database, Cloudflare account, map API key or real GPS trace is needed.

```sh
git clone https://github.com/dicebattle/routelens.git
cd routelens
npm ci
npm run build
npx playwright install chromium
npm run simulation:check -- --output data/my-first-run
npm run report:serve -- data/my-first-run
```

To use the actual client after a successful full run, start a fresh interactive fixture with `npm run pilot:serve -- --graph data/my-first-run/seoul/graph --output data/my-client` and open its printed URL. It stops after15minutes; synthetic traffic expires naturally. On Linux, install browser system dependencies with `npx playwright install --with-deps chromium`.

For the archived report, open the loopback URL printed by the server with `/report.html` appended. The server stops after 15 minutes. Use a **new output directory** for every run; existing evidence is never overwritten.

For offline source reuse, add `--source /path/to/south-korea-261023.osm.pbf` with the exact pinned SHA-256. The default source cache is `data/seoul-source-cache`; `ROUTELENS_SOURCE_CACHE` overrides its location. `npm run simulation:tiny -- --output data/tiny-only` runs the small regression alone. See the [Seoul module guide](wiki/modules/seoul-simulation.md).

For automated checks:

```sh
npm test
npm run media:check
```

`media:check` verifies that the published recording still matches the implementation, report and asset hashes. After changing runtime behavior, regenerate the integration report and recapture the demo before publishing. See the [evidence workflow](docs/17-simulation-evidence-delivery.md).

## Built here, reused upstream

```mermaid
flowchart LR
  F[Pinned actual Seoul OSM source] --> O[Osmium · regional extraction]
  O --> V[Valhalla · real graph and routing]
  V --> G[Verified graph bundle]
  S[Authored paths and speed schedules] --> P[RouteLens · vehicle simulation]
  G --> P
  P --> T[Independent trajectory truth]
  P --> N[Noisy GPS and explicit omissions]
  T --> R[Captured replay and test report]
  G --> M[Valhalla · map matching]
  N --> I[RouteLens · durable HTTP receipt]
  I --> D[PostgreSQL · trips and fenced jobs]
  D --> W[RouteLens · worker and crash recovery]
  W --> M
  M --> A[RouteLens · observed timing and exclusions]
  A --> C[PostgreSQL · atomic traversal commit]
  C --> U[RouteLens · deadline and contributor median]
  U --> Q[Unsigned candidate · expiry and revocation]
  Q --> J[jose · Ed25519 JWS]
  J --> H[RouteLens · immutable HTTP publication]
  H --> K[RouteLens · verified durable consumer]
  K --> B[RouteLens · immutable traffic file and expiry]
  B --> X[Valhalla · actual traffic-aware route]
  G --> X
  X --> Y[RouteLens · same-version gateway and one retry]
  Y --> R
```

RouteLens owns the contracts, orchestration, simulation, ingestion/worker coordination, traffic-file adapter and evidence checks. **PostgreSQL** supplies durable transactions, row locks and uniqueness; RouteLens defines completion, commit ownership and deletion rules. **Valhalla** builds graphs, prepares traffic archives, calculates routes and performs map matching; **Osmium** extracts the Seoul envelope and converts OSM files. **jose** provides standard JWS signing and verification; RouteLens owns trust scope, exact artifact validation and durable order. The client uses **MapLibre** for local map rendering and **esbuild** for its TypeScript bundle; persistent node activation and approved-node gateway selection are implemented. [Build-or-reuse decisions](docs/03-build-or-reuse.md).

The planned production design has a managed ingestion path and approved independent routing nodes. It keeps raw location data out of public peer-to-peer distribution. A Cloudflare deployment and an independently installable PostgreSQL/HTTP path are planned; neither is required for the current local simulation.

## Evidence before completion

Each module follows **design → implementation → direct execution → inspected evidence → bilingual record → push**. The main agent owns design and review; implementation is delegated according to [repository instructions](AGENTS.md). AI assistance is recorded with the actual checks and limits, not used as a quality claim.

- [Latest integrated test report](research/pilot/2026-10-25-p11/report.md)
- [Current implementation and remaining goal](docs/18-goal-progress.md)
- [Append-only work log](wiki/log.md)
- [P01–P14 module contracts](docs/11-local-pilot.md)
- [Architecture](docs/02-architecture.md) · [Protocol](docs/04-protocol.md) · [Privacy and trust](docs/07-privacy-and-trust.md)

**Next: P12 whole-scenario gaps**, followed by local Cloudflare parity and final integration CI. P11 is locally verified; hosted delivery follows. P10 serves authenticated local requests through two approved nodes; public enrollment, signed node responses and explicit base_only requests remain unsupported. P09 keeps native engines alive, while P08 remains the lower-level reference. Local synthetic success does not establish production latency or availability. Previously downloaded artifacts cannot be recalled from offline consumers; expiry, a newer received version or configured key revocation limits their use. Production authentication, continuous GPS ingestion and forensic deletion from WAL/backups remain unimplemented. The evidence viewer remains separate from the actual local route client. Turn-by-turn guidance and real mobile driving remain unimplemented.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [development workflow](docs/12-development-workflow.md). Main is protected; changes must pass required checks. Keep vehicle observations synthetic and all datasets lawfully redistributable with their source licenses, preserve prior evidence, and explain why a change exists in English and Korean.

The map uses © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright), via [Geofabrik](https://download.geofabrik.de/asia/south-korea.html), snapshot 2026-10-23. The extraction envelope includes Seoul and adjacent boundary roads; it is not an exact administrative polygon. The viewer displays 1,268 selected geometries from 149,857 exported records; these are not full car-road counts. Derived map data retains ODbL; see [NOTICE](NOTICE).

Project code and documentation use [Apache-2.0](LICENSE). Upstream tools and datasets retain their own licenses. [Security policy](SECURITY.md) · [Governance](GOVERNANCE.md).
