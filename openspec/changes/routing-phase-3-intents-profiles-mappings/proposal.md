# Change: routing-phase-3-intents-profiles-mappings

> **Phase 3 of 5** · depends on: Phase 1 · Lift the hard-coded phase-1 defaults into persistent, administrable intents/mappings/profiles.

## Why

Phase 1 hard-codes built-in defaults so Valhalla can move first. To support users, admins, BRouter, and future engines, routing intents and native profile mappings need host-owned persistence and resolution.

## What Changes

**Intent and mapping persistence**
- From: Built-in phase-one defaults are hard-coded.
- To: `routing_settings`, `routing_intents`, `routing_profile_mappings`, and `routing_profiles` persist settings, intents, mappings, and native profile data.
- Reason: Users and admins need configurable routing behavior without making plugins own persistence.
- Impact: New persistence model and mapping resolver.

**Admin and built-in defaults**
- From: New users have no defined routing defaults; engine selection is implicit.
- To: Routing settings resolve user over admin over built-in defaults (live fallback), including default engines, default intent, instance-category-to-intent defaults, and feature exposure gates.
- Reason: New users must route well out of the box without setup, and admins need to control the default and the feature surface on shared/public instances.
- Impact: `routing_settings` gains scope (`builtin`/`admin`/`user`), instance-category-to-intent defaults keyed by actual category records, and an `exposed_features` gate; the resolver consults admin and built-in fallbacks.

**Effective controls**
- From: The frontend has local provider-specific routing controls.
- To: The host resolves which standard preferences are effective for the active intent and engine selection.
- Reason: Parallel and multi-provider routing need comparable controls.
- Impact: New host resolver endpoint or settings-derived UI metadata.

**Provider-native advanced controls**
- From: Provider-specific options are either hard-coded in Valhalla UI or hidden inside native profiles.
- To: The host can ask one engine/profile for its advanced controls and persist submitted values as `native_config` or generated profile metadata.
- Reason: Advanced users need engine-specific tuning without polluting the canonical Wanderer preference model.
- Impact: New native-control resolver and per-engine advanced UI surface.

## Out of Scope

- BRouter runtime integration.
- BRouter-specific `.brf` parameter extraction beyond generic metadata plumbing.
- Multi-engine fan-out and variant curation.
