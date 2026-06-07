# Change: routing-plugin-valhalla-cutover

> **Phase 1 of 5** · depends on: – · Valhalla cutover: hard removal of the `/api/v1/valhalla/*` endpoints and frontend rename to generic routing.

## Why

Routing is currently coupled directly to Valhalla-specific frontend models, stores, and `/api/v1/valhalla/*` endpoints. The first routing-plugin change should move Valhalla behind the new `routing` plugin type while preserving the current editor behavior as closely as possible.

## What Changes

**Valhalla routing integration**
- From: Frontend and backend call Valhalla-specific endpoints and types directly.
- To: Valhalla is registered as the first first-party `routing` plugin with `route.v1` and `elevation.v1`.
- Reason: Establish the routing plugin seam with the provider already used today.
- Impact: Breaking internal API change; old `/api/v1/valhalla/*` endpoints are removed immediately.

**Frontend naming**
- From: Editor code uses `valhalla_*` concepts for routing behavior.
- To: Editor code uses `routing_*` concepts and calls host routing endpoints.
- Reason: The editor should not know whether a route came from Valhalla, BRouter, GraphHopper, or a future provider.
- Impact: Frontend refactor with no intended UX regression.

**Default intents and preferences**
- From: The current editor uses Valhalla transport modes and Valhalla option names.
- To: Phase 1 uses built-in, hard-coded defaults for `hike`, `bike_balanced`, and `car`, with current tuning options mapped to canonical preferences.
- Reason: Phase 1 needs intents/preferences for compatibility, but persistent admin/user mappings come later.
- Impact: No profile administration yet.

## Out of Scope

- BRouter.
- User-uploaded native profiles.
- Persistent intent/profile/mapping administration.
- Multi-engine parallel routing and variant curation.
