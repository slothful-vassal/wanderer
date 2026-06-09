# Change: routing-plugin-brouter

> **Phase 4 of 5** · depends on: Phase 3 · BRouter as the second engine: single-engine routing + separate elevation engine, native/`.brf` profiles.

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

**Curated first-party BRouter presets**
- From: BRouter would otherwise expose only raw native profiles.
- To: Wanderer ships curated first-party `.brf` presets mapped to the canonical intents (`hike`, `bike_balanced`, `gravel`, `car`, …), tuned so each intent feels consistently good.
- Reason: The engine must be transparent to the user — picking "Hiking" should just work, regardless of whether Valhalla or BRouter is behind it. Goal is consistent quality per intent, not identical routes.
- Impact: A maintained preset content set (not just code) is a deliverable of this phase and needs upkeep as data/engine evolve.

**BRouter advanced controls**
- From: BRouter tuning is only available by selecting or uploading whole `.brf` files.
- To: BRouter may expose advanced controls for first-party templates or `.brf` files with explicit parameter metadata.
- Reason: BRouter profile parameters can be powerful, but arbitrary profile semantics should not be guessed.
- Impact: Safe parameter extraction/template metadata for known profiles; arbitrary uploads remain selectable/editable files without invented sliders.

## Out of Scope

- Multi-engine parallel fan-out and final variant curation.
- Translating `.brf` into Valhalla options or any shared native profile language.
