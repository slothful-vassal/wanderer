# Design: routing-intents-profiles-mappings

## Overview

Move routing defaults from hard-coded phase-one behavior into host-owned collections and resolver logic.

## Key Decisions

- Wanderer intents are the authoritative comparison language.
- Native provider profiles remain provider dialects.
- Mappings bridge Wanderer intents to provider-native profiles or config.
- Plugin-declared built-in profiles are discovered, not materialized.
- User uploads and generated profiles are materialized as `routing_profiles`.
- Effective controls are computed by the host.

## References

- `openspec/design/routing-plugin.md`
