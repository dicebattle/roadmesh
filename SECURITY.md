# Security

There are no supported production releases yet. The evaluation-input validator is a local development tool, not a deployed navigation service. Do not submit real driving data to this public repository.

For a sensitive report, use the repository's private vulnerability reporting channel if enabled. If it is unavailable, open only a minimal issue requesting a private contact method; do not include the vulnerability details, credentials, or location records in that issue.

Future releases must verify artifact signatures and expiry, isolate routing processes, restrict node endpoints, remove location data from logs, and test key revocation. The [privacy and trust plan](docs/07-privacy-and-trust.md) describes the intended boundaries; those controls are not implemented yet.
