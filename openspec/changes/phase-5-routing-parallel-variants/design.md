# Design: routing-parallel-variants

## Overview

Enable multi-engine and multi-variant routing for the same canonical Wanderer intent.

## Key Decisions

- Parallel comparison is only defined within the same canonical intent key.
- Mixed intents are not comparable parallel routing.
- `desiredVariants` is the final UI target count, not per-engine alternative count.
- The host may reduce effective variants for short segments or policy limits.
- The host can request bounded native alternatives from each engine.
- Candidate IDs are host-generated and include provenance.
- Partial success returns usable candidates plus `engineErrors`.
- Elevation is ranking-relevant and applied to a bounded prefiltered shortlist.

## References

- `openspec/design/routing-plugin.md`
