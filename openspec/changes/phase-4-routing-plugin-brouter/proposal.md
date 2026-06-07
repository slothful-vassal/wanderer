# Change: routing-plugin-brouter

> **Phase 4 von 5** · hängt ab von: Phase 3 · BRouter als zweite Engine: Single-Engine-Routing + separate Elevation-Engine, native/`.brf`-Profile.

## Why

BRouter validates that the routing plugin abstraction works for a profile- and `.brf`-based engine, not only Valhalla's costing-options model.

## What Changes

**BRouter plugin**
- From: Valhalla is the only first-party routing plugin.
- To: BRouter is added as a first-party routing plugin with `route.v1`.
- Reason: Validate the provider-neutral contract against a structurally different engine.
- Impact: New routing provider and native profile handling.

**BRouter profiles**
- From: User-native profile uploads are not exercised by a provider.
- To: BRouter supports native profile selection, `.brf` upload, and generated `.brf` profiles from templates.
- Reason: Advanced users need BRouter's native profile model.
- Impact: Upload validation and generated-profile storage become active features.

## Out of Scope

- Multi-engine parallel fan-out and final variant curation.
- Translating `.brf` into Valhalla options or any shared native profile language.
