# Change: routing-parallel-variants

> **Phase 5 of 5** · depends on: Phase 4 (needs ≥2 engines) · Parallel fan-out + variant curation for the same intent.

## Why

Once at least two routing engines are available, Wanderer can offer comparable alternatives from one or more engines for the same canonical intent. Because the editor already works per anchor-pair segment, the host should also allow the accepted route to combine the best segment candidates from different engines at anchor boundaries.

## What Changes

**Parallel routing**
- From: The host routes through one selected routing engine at a time.
- To: The host can fan out the same intent to multiple routing engines and aggregate partial successes.
- Reason: Users can compare provider-specific route suggestions without changing the planning intent.
- Impact: More provider requests, stricter rate limiting, and candidate provenance are required.

**Variant curation**
- From: The frontend receives a single route or provider-native alternatives.
- To: The host returns at most `desiredVariants` final candidates selected by quality, elevation, and geometric diversity, including composed candidates made from segment-level choices across engines.
- Reason: Users choose how many meaningful variants they want, not how many native alternatives each provider should compute.
- Impact: New candidate selection and UI comparison behavior.

**Segment-level engine choice**
- From: One accepted route implicitly comes from one routing engine.
- To: Each anchor-pair segment can keep its own engine/profile provenance, so segment 1 may come from engine A while segment 2 comes from engine B.
- Reason: Wanderer's editor already materializes one GPX `trkseg` per anchor pair, making anchor boundaries natural composition points.
- Impact: The host must preserve segment-level provenance and must validate continuity at anchors.

**User-selected routing mode (segment or via)**
- From: Routing is modeled only as point-to-point anchor-pair routing.
- To: The user picks a routing mode (default via user settings). `segment` is the mandatory baseline; `via` routes the full ordered anchor list in one request per engine and is offered only when at least one enabled engine declares `supportsViaRouting`. The modes are mutually exclusive per route; cross-engine composition exists only in `segment` mode, and `parallel` + `via` uses only via-capable engines.
- Reason: Some engines can optimize a full route through intermediate points; this is a different routing strategy, not an extra candidate type layered on segment routing.
- Impact: The host distinguishes `segment_composed` from `via_route` candidates and gates the mode on availability. Stored defaults may fall back to `segment` with a `routing_mode_fallback` warning when no via-capable engine is available; explicit per-request `via` selections must fail or be confirmed before retrying as `segment`.

## Out of Scope

- Mid-segment geometry splicing between providers.
- Translating native profile formats between engines.
