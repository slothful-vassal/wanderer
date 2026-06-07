# Delta for Routing

## ADDED Requirements

### Requirement: BRouter routing plugin
The system SHALL provide BRouter as a first-party `routing` plugin implementing `route.v1`.

#### Scenario: BRouter route request
- GIVEN BRouter is configured as the active routing engine
- WHEN the user requests a route for a mapped Wanderer intent
- THEN the host invokes the BRouter `route.v1` capability
- AND returns normalized route candidates using the host route response contract.

### Requirement: BRouter native profile support
The system SHALL support BRouter native profiles through built-in profile keys, `.brf` uploads, and generated `.brf` profiles.

#### Scenario: Uploaded `.brf` profile
- GIVEN a user uploads a valid BRouter `.brf` profile within host limits
- WHEN the user selects that profile for routing
- THEN the host passes the profile content to the BRouter plugin for that invocation
- AND no other plugin is required to understand `.brf`.

#### Scenario: Generated `.brf` profile
- GIVEN a Wanderer preference maps to a BRouter template parameter
- WHEN the host generates a BRouter profile
- THEN it uses bounded, validated template placeholders
- AND stores the generated native profile as host-owned data.

### Requirement: Separate routing and elevation composition
The system SHALL support BRouter for routing with a separate elevation plugin for height correction.

#### Scenario: BRouter route with Valhalla elevation
- GIVEN BRouter is selected for routing and Valhalla is selected for elevation
- WHEN the route candidate lacks usable heights
- THEN the host invokes Valhalla `elevation.v1`
- AND returns the BRouter geometry enriched with normalized elevation status.
