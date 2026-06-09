# Change: routing-round-trip

> **Phase 6 (optional add-on)** · depends on: an engine declaring `supportsRoundTrip` (after Phase 4) · Round-trip / loop generation from a start point and a target distance.

## Why

Loop generation ("plan me a ~40 km gravel loop from here") is a core feature of competitive route planners and cannot be expressed by point-to-point anchor routing. It is an additive, optional routing capability that does not change anchored routing.

## What Changes

**Round-trip routing capability**
- From: Routing is only point-to-point through user anchors.
- To: The host can request a closed round-trip route from a start point and a target distance from engines that declare `supportsRoundTrip`.
- Reason: Loop planning is a competitiveness feature and a distinct routing operation.
- Impact: New request type, discovery gating, and an editor entry point; the generated loop becomes a normal editable anchored route.

**Engine-gated exposure**
- From: Round-trip does not exist.
- To: Round-trip UI and requests are offered only when at least one enabled engine supports it.
- Reason: Not all engines can generate loops.
- Impact: The `supportsRoundTrip` discovery flag drives availability; without it the feature is hidden.

## Out of Scope

- Multi-engine round-trip comparison beyond the existing variant model.
- Popularity/scenic weighting of generated loops (separate roadmap item).
- Changing anchored segment/via routing behavior.
