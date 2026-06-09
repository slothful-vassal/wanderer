# Delta for Routing

## ADDED Requirements

### Requirement: Host route response contract
The system SHALL return host-owned route responses with normalized candidates, provenance, warnings, and per-engine errors.

#### Scenario: Partial engine success
- GIVEN multiple engines are requested
- WHEN at least one engine returns a usable candidate and another engine fails
- THEN the host responds with HTTP `200`
- AND includes successful candidates
- AND includes the failed engine in `engineErrors`.

### Requirement: Routing HTTP status mapping
The system SHALL map routing failures to stable HTTP statuses.

#### Scenario: Invalid client request
- GIVEN a routing request has invalid structure or coordinates
- WHEN the host validates the request
- THEN it responds with HTTP `400`.

#### Scenario: Valid request cannot be resolved
- GIVEN a routing request is structurally valid
- WHEN no usable candidate remains because mappings, required preferences, or candidate validation fail
- THEN the host responds with HTTP `422`.

#### Scenario: Provider total failure
- GIVEN no usable candidate remains because all providers fail
- WHEN the failures are provider, connector, or plugin errors
- THEN the host responds with HTTP `502` or `504` depending on timeout dominance.

### Requirement: Routing conformance validation
The system SHALL validate segment structure, polyline convention, limits, and elevation status before returning route candidates to the frontend.

#### Scenario: Segment-compatible route output
- GIVEN a route request with adjacent anchor pairs
- WHEN a plugin returns a route candidate
- THEN the host returns one segment per adjacent anchor pair
- AND each segment has its own geometry.

#### Scenario: Canonical encoded polyline
- GIVEN a route candidate includes encoded geometry
- WHEN the host decodes the geometry
- THEN it decodes as Google encoded polyline with factor `1e6`
- AND each point is ordered as `[lat, lon]`.

#### Scenario: Invalid candidate geometry
- GIVEN a plugin returns a candidate with invalid geometry
- WHEN the host validates the plugin output
- THEN the candidate is discarded
- AND an appropriate structured error is recorded.

## REMOVED Requirements

### Requirement: Phase-one segment and polyline compatibility
The system SHALL no longer track segment and polyline compatibility as a separate phase-one requirement.

Reason: The segment contract and canonical polyline convention are now part of the general routing conformance validation that applies to every provider, not only the Valhalla cutover.
