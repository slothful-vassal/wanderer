# Routing

## Purpose

This spec describes Wanderer's routing and elevation behavior: how the Trail Editor obtains routes and elevation data, and how that behavior moves from the direct Valhalla integration to the provider-neutral routing plugin architecture. The target architecture is documented in `openspec/design/routing-plugin.md`.

## Requirements

### Requirement: Current Valhalla routing endpoints
The system SHALL expose the current Valhalla-backed routing and height behavior through the existing `/api/v1/valhalla/*` endpoints until the routing plugin cutover is implemented.

#### Scenario: Route calculation
- GIVEN the Trail Editor requests auto-routing
- WHEN the frontend calls `/api/v1/valhalla/route`
- THEN the backend proxies the request to Valhalla
- AND the frontend converts the returned route into editor GPX segments.

#### Scenario: Elevation correction
- GIVEN a route or line needs elevation data
- WHEN the frontend calls `/api/v1/valhalla/height`
- THEN the backend proxies the request to Valhalla
- AND the frontend applies returned heights to GPX points.

### Requirement: Segment-oriented trail editing
The Trail Editor SHALL keep route editing based on GPX track segments.

#### Scenario: Editing a routed section
- GIVEN a trail has multiple anchor pairs
- WHEN the user inserts, edits, deletes, crops, or reorders route anchors
- THEN the editor updates the affected GPX `trkseg` entries by segment index.
