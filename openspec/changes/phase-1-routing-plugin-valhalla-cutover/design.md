# Design: routing-plugin-valhalla-cutover

## Overview

Introduce the `routing` plugin type by moving the current Valhalla integration behind first-party plugin capabilities. This is a hard cutover: the old Valhalla endpoints are removed, and the frontend is renamed to generic routing concepts in the same change.

## Key Decisions

- Valhalla implements `route.v1` and `elevation.v1`.
- Phase 1 includes only built-in, host-owned default intent mappings for `hike`, `bike_balanced`, and `car`.
- `modeOfTransport: "pedestrian"` migrates to Wanderer intent `hike`.
- The route output must already satisfy the segment contract: one segment per adjacent anchor pair.
- Encoded geometry must already use the canonical polyline convention: Google encoded polyline, factor `1e6`, decoded as `[lat, lon]`.
- No compatibility adapter is built for `/api/v1/valhalla/*`.

## References

- `openspec/design/routing-plugin.md`
