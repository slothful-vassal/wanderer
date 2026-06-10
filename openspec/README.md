# OpenSpec

This directory contains OpenSpec/OSPX planning artifacts for wanderer.

- `specs/` describes the current accepted system behavior (the living, normative spec).
- `changes/` contains proposed changes, one folder per implementation phase.
- `changes/archive/` is reserved for completed and archived changes.
- `design/` holds internal design rationale and target narratives. These are not normative; on any conflict `specs/` and `changes/` win.

The routing plugin target architecture is documented in `design/routing-plugin.md`. A shorter user-facing overview of the same target state lives in `design/routing-plugin-user-summary.md`. The active routing changes intentionally mirror the phases from the architecture document. These design docs are temporary references and will be removed once the routing phases are implemented and manually validated.

## Routing phases

Change names are prefixed with the capability and phase as `<capability>-phase-N-` so changes group by project and `openspec list --sort name` returns a project's phases together in implementation order. The same mapping is mirrored as a marker line at the top of each `proposal.md`. Implement in this order:

| Phase | Change | Depends on |
| --- | --- | --- |
| 1 | `routing-phase-1-plugin-valhalla-cutover` | – (cutover) |
| 2 | `routing-phase-2-host-contracts` | Phase 1 |
| 3 | `routing-phase-3-intents-profiles-mappings` | Phase 1 |
| 4 | `routing-phase-4-plugin-brouter` | Phase 3 |
| 5 | `routing-phase-5-parallel-variants` | Phase 4 (needs ≥2 engines) |
| 6 (optional add-on) | `routing-phase-6-round-trip` | an engine with `supportsRoundTrip` (after Phase 4) |

Phase 6 is an optional additive capability (round-trip / loop generation), not part of the linear 1–5 core sequence; it can land whenever a supporting engine is available.

Note: `openspec list` defaults to recency order — use `openspec list --sort name` to see the phases in order.
