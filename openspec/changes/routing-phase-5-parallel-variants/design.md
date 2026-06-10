# Design: routing-parallel-variants

## Overview

Enable multi-engine and multi-variant routing for the same canonical Wanderer intent.

## Key Decisions

- Parallel comparison is only defined within the same canonical intent key.
- Mixed intents are not comparable parallel routing.
- The default path returns one best route; `desiredVariants` defaults to `1`. Variants, including multi-engine variants, are opt-in and run only on explicit user action, never automatically.
- `desiredVariants` is the final UI target count, not per-engine alternative count.
- Candidates are presented engine-neutrally: the user need not know which engine produced a route; provider/profile provenance is internal.
- Two consumers, different endpoints: `POST /api/v1/plugins/routing/route` returns the small finally-curated human UI response, while `POST /api/v1/plugins/routing/route-candidates` returns a broader but still bounded, host-normalized comparable candidate set for advanced, debug, or programmatic/agent consumers. Both use the same internal pipeline and plugin contracts; `route-candidates` is not a provider raw dump and is gated by role or `exposed_features` to avoid becoming a public fan-out amplifier. The chat layer itself is out of scope here.
- Richer normalized candidate metadata (surface, way-type, quality breakdown) is on the roadmap as optional output fields, valued especially by an agent consumer.
- The host may reduce effective variants for short segments or policy limits.
- The host can request bounded native alternatives from each engine.
- Routing mode is a user-selected, mutually exclusive choice (`segment` or `via`), defaulted via user settings. `segment` is the mandatory baseline; `via` is offered only when at least one enabled, configured engine declares `supportsViaRouting`.
- Effective mode is resolved at request time. If the stored default resolves to `via` but no via-capable engine is available or reachable, the host may fall back to `segment` and emits a `routing_mode_fallback` warning.
- An explicit per-request user choice of `via` is not silently downgraded. If no selected via-capable engine can answer, the request fails or the UI confirms a retry as `segment`.
- Segment mode: each adjacent anchor pair is routed and selected independently. Via mode: the full ordered anchor list is routed in one request per engine.
- Under `parallel` + `via`, only via-capable engines participate; segment and via are not mixed in one parallel request.
- Routing is recomputed only on anchor-list changes; intent/profile/engine/preference changes are go-forward by default and imported routes are inert.
- Users may deliberately keep heterogeneous routes. If existing routed segments have provenance that differs from the active planning settings, the UI may offer a one-time re-route action for those existing segments instead of blocking the change.
- Candidate IDs are host-generated and include provenance.
- Segment-level candidates are first-class: each adjacent anchor pair may have variants from multiple engines.
- A normal single-engine segment candidate is labeled `segment_single_engine`.
- A host-composed candidate may combine complete anchor-pair segments from different engines; composition exists only in `segment` mode and is labeled `segment_composed`.
- A via-route candidate represents one engine's full ordered-anchor calculation and is labeled `via_route`.
- Cross-engine composition is allowed only at user anchor boundaries, not by cutting and splicing provider geometry inside a segment.
- Composed candidates and persisted routed segments must preserve per-segment provenance (intent, routing mode, preferences, engine, plugin instance, native profile, native config, optional profile revision).
- Persisted segment provenance lives in host-owned trail metadata, not as authoritative GPX `trkseg` extensions. Exported GPX that is later imported again has unknown routing provenance and stays inert until an anchor is changed.
- Partial success returns usable candidates plus `engineErrors`.
- Elevation is ranking-relevant and applied to a bounded prefiltered shortlist.

## References

- `openspec/design/routing-plugin.md`
