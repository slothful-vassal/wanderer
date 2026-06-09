# Tasks: routing-round-trip

- [ ] Add `supportsRoundTrip` discovery handling and availability gating.
- [ ] Add a round-trip request type (start, target distance, intent, optional direction/seed, preferences) to the host routing API.
- [ ] Implement round-trip in at least one engine adapter that declares support.
- [ ] Materialize accepted loops as normal anchored routes, not as a separate persistent route type.
- [ ] Generate bounded synthetic edit anchors from valid plugin suggestions or host geometry heuristics.
- [ ] Represent loop closure with the same start anchor instead of a duplicate end anchor.
- [ ] Create routed segments between adjacent anchors after materialization.
- [ ] Persist normal segment provenance plus round-trip metadata for generated segments.
- [ ] Add an editor entry point for round-trip, shown only when an engine supports it.
- [ ] Reuse existing candidate, elevation, and variant handling for round-trip results.
- [ ] Add tests for distance-target bounds, synthetic anchor limits, closure handling, provenance, and gating when no engine supports round-trip.
