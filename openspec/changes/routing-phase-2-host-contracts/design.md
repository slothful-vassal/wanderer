# Design: routing-host-contracts

## Overview

Harden the host-owned routing API and validation layer around the contracts already introduced by the Valhalla cutover.

## Key Decisions

- The host owns candidate IDs, provenance, error aggregation, HTTP status mapping, limits, and route/elevation status normalization.
- Plugin output is validated before reaching the frontend.
- Partial success returns `200` with candidates and `engineErrors`.
- A formally valid but non-routable request returns `422`.
- Provider-wide total failures return `502` or `504`.

## References

- `openspec/design/routing-plugin.md`
