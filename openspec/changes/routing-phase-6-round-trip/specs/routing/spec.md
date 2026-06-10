# Delta for Routing

## ADDED Requirements

### Requirement: Round-trip routing
The system SHALL support round-trip (loop) generation from a start point and a target distance, gated by the `supportsRoundTrip` engine capability.

#### Scenario: Generate a loop
- GIVEN an enabled engine declares `supportsRoundTrip`
- AND the user provides a start point, a target distance, and an intent
- WHEN the user requests a round-trip route
- THEN the host invokes the engine's round-trip capability
- AND returns a closed-route candidate using the host route response contract

#### Scenario: Materialize accepted loop
- GIVEN the user accepts a round-trip candidate
- WHEN the host materializes the candidate
- THEN it creates a normal anchored route
- AND keeps the user's start point as the first anchor
- AND represents loop closure with the same start anchor rather than a duplicate end anchor
- AND creates bounded synthetic edit anchors along the geometry
- AND creates routed segments between adjacent anchors.

#### Scenario: Synthetic anchors are host-owned
- GIVEN a round-trip plugin returns optional suggested anchors
- WHEN the host materializes the candidate
- THEN the host validates the suggested anchors
- AND may replace them with anchors derived from geometry
- AND caps the synthetic anchor count to avoid flooding the editor.

#### Scenario: Round-trip provenance is retained
- GIVEN the host materializes a round-trip candidate
- WHEN it persists the generated route
- THEN generated segments keep normal routing provenance
- AND retain round-trip metadata such as source, target distance, direction, seed, and request id when available.

#### Scenario: Round-trip unavailable
- GIVEN no enabled engine declares `supportsRoundTrip`
- WHEN the user opens routing
- THEN round-trip is not offered.
