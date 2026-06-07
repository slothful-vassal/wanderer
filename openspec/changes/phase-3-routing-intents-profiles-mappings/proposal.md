# Change: routing-intents-profiles-mappings

> **Phase 3 von 5** · hängt ab von: Phase 1 · Hebt die fest verdrahteten Phase-1-Defaults in persistente, administrierbare Intents/Mappings/Profile.

## Why

Phase 1 hard-codes built-in defaults so Valhalla can move first. To support users, admins, BRouter, and future engines, routing intents and native profile mappings need host-owned persistence and resolution.

## What Changes

**Intent and mapping persistence**
- From: Built-in phase-one defaults are hard-coded.
- To: `routing_settings`, `routing_intents`, `routing_profile_mappings`, and `routing_profiles` persist settings, intents, mappings, and native profile data.
- Reason: Users and admins need configurable routing behavior without making plugins own persistence.
- Impact: New persistence model and mapping resolver.

**Effective controls**
- From: The frontend has local provider-specific routing controls.
- To: The host resolves which standard preferences are effective for the active intent and engine selection.
- Reason: Parallel and multi-provider routing need comparable controls.
- Impact: New host resolver endpoint or settings-derived UI metadata.

## Out of Scope

- BRouter runtime integration.
- Multi-engine fan-out and variant curation.
