# Delta for Routing

## REMOVED Requirements

### Requirement: Current Valhalla routing endpoints
The system SHALL no longer expose `/api/v1/valhalla/route` or `/api/v1/valhalla/height`.

Reason: Valhalla routing and elevation move behind the provider-neutral routing plugin API.

## ADDED Requirements

### Requirement: Valhalla routing plugin cutover
The system SHALL provide Valhalla as a first-party `routing` plugin with `route.v1` and `elevation.v1` capabilities.

#### Scenario: Routing through Valhalla plugin
- GIVEN Valhalla is configured as the active routing engine
- WHEN the Trail Editor requests a route
- THEN the frontend calls the host routing API
- AND the host invokes the Valhalla `route.v1` plugin capability
- AND the response contains editor-compatible route segments.

#### Scenario: Elevation through Valhalla plugin
- GIVEN Valhalla is configured as the active elevation engine
- WHEN the Trail Editor requests elevation correction
- THEN the frontend calls the host elevation API
- AND the host invokes the Valhalla `elevation.v1` plugin capability.

### Requirement: Built-in phase-one routing defaults
The system SHALL include hard-coded phase-one defaults for `hike`, `bike_balanced`, and `car` until persistent mapping administration is implemented.

#### Scenario: Pedestrian migration
- GIVEN existing editor behavior used Valhalla `pedestrian`
- WHEN phase one routing defaults are applied
- THEN the Wanderer intent is `hike`
- AND Valhalla uses `pedestrian` costing with hiking-compatible defaults.

#### Scenario: Bicycle migration
- GIVEN existing editor behavior used Valhalla `bicycle`
- WHEN phase one routing defaults are applied
- THEN the Wanderer intent is `bike_balanced`
- AND Valhalla uses `bicycle` costing.

#### Scenario: Auto migration
- GIVEN existing editor behavior used Valhalla `auto`
- WHEN phase one routing defaults are applied
- THEN the Wanderer intent is `car`
- AND Valhalla uses `auto` costing.

### Requirement: Phase-one segment and polyline compatibility
The system SHALL enforce the routing segment contract and canonical polyline convention during the Valhalla cutover.

#### Scenario: Segment-compatible route output
- GIVEN a route request with adjacent anchor pairs
- WHEN Valhalla returns a route candidate
- THEN the host returns one segment per adjacent anchor pair
- AND each segment has geometry or a valid shape range.

#### Scenario: Canonical encoded polyline
- GIVEN a route candidate includes encoded geometry
- WHEN the host decodes the geometry
- THEN it decodes as Google encoded polyline with factor `1e6`
- AND each point is ordered as `[lat, lon]`.
