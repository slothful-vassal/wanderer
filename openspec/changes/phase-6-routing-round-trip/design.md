# Design: routing-round-trip

## Overview

Add round-trip (loop) generation as an optional, discovery-gated routing operation, separate from anchored point-to-point routing.

## Key Decisions

- Round-trip is a distinct request type, not a `routingMode`; it does not affect segment/via routing of anchored routes.
- Gated by the `supportsRoundTrip` discovery flag; offered only when at least one enabled engine supports it.
- Request inputs: start anchor, target distance, intent, and optional direction/seed and preferences. There is no ordered anchor list.
- The engine returns a normal candidate (geometry + summary); round-trip is a generator, not a permanent route type.
- Accepting a round-trip candidate materializes it into a normal anchored route with synthetic edit anchors and one routed segment per adjacent anchor pair.
- The host owns materialization. Plugins may provide optional suggested anchors, but the host validates them and may derive anchors from geometry instead.
- The user's start point remains the first anchor. The loop closure is represented by the same anchor, not by a duplicate end anchor.
- Synthetic anchors are bounded: enough to make the loop editable, preferably at strong geometry changes or valid engine-suggested points, otherwise distributed by distance, capped to avoid flooding the editor.
- Generated segments keep normal routing provenance plus round-trip metadata (`source: "round_trip"`, synthetic anchor markers, optional request id, target distance, direction, and seed).
- Variant and elevation handling reuse the existing candidate model; no new curation machinery.

## References

- `openspec/design/routing-plugin.md` (see "Round-trip routing")
