# OpenSpec

This directory contains OpenSpec/OSPX planning artifacts for wanderer.

- `specs/` describes the current accepted system behavior (the living, normative spec).
- `changes/` contains proposed changes, one folder per implementation phase.
- `changes/archive/` is reserved for completed and archived changes.
- `design/` holds internal design rationale and target narratives. These are not normative; on any conflict `specs/` and `changes/` win.

The routing plugin target architecture is documented in `design/routing-plugin.md`. The active routing changes intentionally mirror the phases from that document. That design doc is a temporary reference and will be removed once the routing phases are implemented and manually validated.

## Routing phases

Change names are prefixed with `phase-N-` so the phase is visible in the name itself and `openspec list --sort name` returns them in implementation order. The same mapping is mirrored as a marker line at the top of each `proposal.md`. Implement in this order:

| Phase | Change | Depends on |
| --- | --- | --- |
| 1 | `phase-1-routing-plugin-valhalla-cutover` | – (cutover) |
| 2 | `phase-2-routing-host-contracts` | Phase 1 |
| 3 | `phase-3-routing-intents-profiles-mappings` | Phase 1 |
| 4 | `phase-4-routing-plugin-brouter` | Phase 3 |
| 5 | `phase-5-routing-parallel-variants` | Phase 4 (needs ≥2 engines) |
| 6 (optional add-on) | `phase-6-routing-round-trip` | an engine with `supportsRoundTrip` (after Phase 4) |

Phase 6 is an optional additive capability (round-trip / loop generation), not part of the linear 1–5 core sequence; it can land whenever a supporting engine is available.

Note: `openspec list` defaults to recency order — use `openspec list --sort name` to see the phases in order.
