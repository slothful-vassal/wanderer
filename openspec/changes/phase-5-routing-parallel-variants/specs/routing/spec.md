# Delta for Routing

## ADDED Requirements

### Requirement: Parallel routing by canonical intent
The system SHALL support parallel routing across multiple engines only for the same canonical Wanderer intent.

#### Scenario: Comparable parallel request
- GIVEN the user plans a `gravel` route
- WHEN multiple engines are selected for parallel routing
- THEN each engine is invoked for the `gravel` intent
- AND no engine is invoked with an unrelated intent such as road cycling.

### Requirement: Desired variant curation
The system SHALL return at most the user-requested `desiredVariants` final candidates after host curation, and SHALL apply curation per routing mode.

#### Scenario: Candidate curation
- GIVEN multiple engines return multiple native alternatives
- WHEN the host aggregates candidates
- THEN it filters invalid or poor candidates
- AND uses elevation, summary metrics, warnings, geometry diversity, and policy to select final candidates
- AND returns no more than `desiredVariants`.

#### Scenario: Curation in segment mode
- GIVEN the routing mode is `segment`
- WHEN the host curates candidates
- THEN `desiredVariants` applies per anchor-pair segment
- AND the host may additionally assemble whole-route candidates from selected segment choices.

#### Scenario: Curation in via mode
- GIVEN the routing mode is `via`
- WHEN the host curates candidates
- THEN `desiredVariants` applies to whole-route candidates returned per engine for the ordered anchor list.

### Requirement: Separate curated and candidate-set endpoints
The system SHALL expose separate host endpoints for the curated human editor response and the broader advanced/programmatic candidate set.

#### Scenario: Curated route endpoint
- GIVEN the frontend calls `POST /api/v1/plugins/routing/route`
- WHEN the host returns candidates
- THEN the response contains the final curated human UI candidates
- AND contains no more than `desiredVariants`.

#### Scenario: Broader candidate-set endpoint
- GIVEN an advanced, debug, or programmatic consumer calls `POST /api/v1/plugins/routing/route-candidates`
- WHEN the host returns candidates
- THEN the response may contain a broader bounded candidate set than the human UI endpoint
- AND every candidate is host-normalized, validated, namespaced, and carries required provenance
- AND the response is not an unfiltered provider raw dump.

#### Scenario: Candidate-set endpoint is gated
- GIVEN `route-candidates` is not enabled for the current user by role or `exposed_features`
- WHEN the user calls `POST /api/v1/plugins/routing/route-candidates`
- THEN the host rejects the request
- AND the normal curated `route` endpoint remains available.

### Requirement: Single best route by default
The system SHALL return one best route by default and SHALL produce variants or parallel comparison only on explicit user request.

#### Scenario: Default request returns one route
- GIVEN a user routes without requesting variants
- WHEN the host responds
- THEN `desiredVariants` is `1`
- AND the response contains a single best candidate
- AND no parallel fan-out is performed.

#### Scenario: Variants only on explicit request
- GIVEN a user explicitly asks for variants or engine comparison
- WHEN the host routes
- THEN it may return up to `desiredVariants` candidates and fan out to multiple engines.

### Requirement: Engine-neutral candidate presentation
The system SHALL present candidates without requiring the user to know which engine produced them; provider/profile provenance is retained internally but is not part of the primary comparison.

#### Scenario: Provenance is secondary
- GIVEN the host returns one or more candidates
- WHEN the editor displays them
- THEN it foregrounds engine-neutral metrics (distance, duration, elevation, warnings)
- AND exposes provider/profile (and per-segment origin for composed candidates) only in a details view.

### Requirement: Cross-engine segment composition
The system SHALL support composing an accepted route from complete anchor-pair segments produced by different routing engines.

#### Scenario: Different engines win different segments
- GIVEN a route has anchors A, B, and C
- AND engine A returns the best candidate for segment A -> B
- AND engine B returns the best candidate for segment B -> C
- WHEN the host curates segment candidates
- THEN it may return a composed candidate using engine A for A -> B and engine B for B -> C
- AND labels the composed candidate as `segment_composed`
- AND each segment retains its own provider/profile provenance
- AND the composition boundary is the existing anchor B.

#### Scenario: Single engine segment candidate is labeled
- GIVEN the routing mode is `segment`
- AND a candidate is produced by one engine for all requested anchor-pair segments
- WHEN the host returns the candidate
- THEN it labels the candidate as `segment_single_engine`.

#### Scenario: Mid-segment splicing is not performed
- GIVEN two engines return different geometries for the same anchor-pair segment
- WHEN the host composes candidates
- THEN it must not cut and splice provider geometries inside that segment
- AND it must choose complete segment candidates bounded by the requested anchors.

### Requirement: User-selected routing mode
The system SHALL treat segment routing and via routing as a user-selected, mutually exclusive routing mode, not as an additive per-engine candidate type. Segment routing is the mandatory baseline; via routing is offered only when at least one enabled and configured engine declares `supportsViaRouting`.

#### Scenario: Via mode offered only when available
- GIVEN no enabled engine declares `supportsViaRouting`
- WHEN the user opens routing settings
- THEN only `segment` mode is offered.

#### Scenario: Routing in via mode
- GIVEN the routing mode is `via`
- AND a selected engine declares `supportsViaRouting`
- AND the user has anchors A, B, and C
- WHEN the host routes
- THEN it sends A, B, and C to that engine as one ordered route request
- AND labels returned candidates as `via_route`.

#### Scenario: Parallel via uses only via-capable engines
- GIVEN the routing mode is `via` and the engine mode is `parallel`
- WHEN the host selects engines for the comparison
- THEN only engines that declare `supportsViaRouting` participate
- AND segment and via routing are not mixed within one parallel request.

#### Scenario: Default fallback when via becomes unavailable
- GIVEN the stored default routing mode is `via`
- AND the only via-capable engine is disabled or unreachable
- WHEN the host resolves the effective routing mode
- THEN it falls back to `segment` routing
- AND returns a `routing_mode_fallback` warning so the UI can inform the user.

#### Scenario: Explicit via request is not silently downgraded
- GIVEN the user explicitly selected `via` for the current request
- AND no selected via-capable engine can answer
- WHEN the host resolves the effective routing mode
- THEN it does not return a segment route silently
- AND it either returns HTTP `422` with error code `routing_mode_unavailable` or the UI asks for confirmation before retrying as `segment`.

### Requirement: Anchor-driven recompute
The system SHALL recompute routing only when the anchor list changes, and SHALL treat intent/profile/engine/preference changes and imported routes as non-triggering by default.

#### Scenario: Go-forward intent change
- GIVEN a route already has routed segments
- WHEN the user changes the intent, profile, engine, or a preference
- THEN existing segments are not re-routed
- AND the new setting applies only to subsequently created or explicitly re-routed segments.

#### Scenario: Re-route affordance for known mismatches
- GIVEN a route already has routed segments with known routing provenance
- AND at least one existing segment differs from the active planning settings
- WHEN the user changes the active planning settings
- THEN the UI MAY offer to re-route the existing mismatching segments with the active settings
- AND the user MAY keep the heterogeneous route unchanged.

#### Scenario: Provenance is stored outside GPX
- GIVEN the user accepts a routed candidate
- WHEN the host persists the route
- THEN segment routing provenance is stored as host-owned trail metadata per routed segment
- AND GPX `trkseg` is not the authoritative storage for routing provenance.

#### Scenario: Exported GPX re-import loses provenance
- GIVEN a Wanderer route with known segment routing provenance is exported as GPX
- WHEN that GPX is imported again
- THEN the imported route has unknown routing provenance
- AND it is treated as inert until an anchor is changed.

#### Scenario: Unknown provenance does not nag
- GIVEN a route has imported or legacy segments with unknown routing provenance
- WHEN the user changes the active planning settings
- THEN unknown provenance alone does not trigger repeated re-route prompts.

#### Scenario: Imported route stays inert
- GIVEN a route is imported or loaded
- WHEN it is shown in the editor
- THEN the host does not re-route it and adds no alternatives
- AND routing only resumes when an anchor is changed.

### Requirement: Parallel partial failure handling
The system SHALL preserve successful candidates when other parallel engines fail.

#### Scenario: One engine fails
- GIVEN two engines are selected for parallel routing
- WHEN one engine returns a usable candidate and the other times out
- THEN the host responds with HTTP `200`
- AND includes the successful candidate
- AND includes the timeout in `engineErrors`.
