# Change: routing-parallel-variants

> **Phase 5 of 5** · depends on: Phase 4 (needs ≥2 engines) · Parallel fan-out + variant curation for the same intent.

## Why

Once at least two routing engines are available, Wanderer can offer comparable alternatives from one or more engines for the same canonical intent.

## What Changes

**Parallel routing**
- From: The host routes through one selected routing engine at a time.
- To: The host can fan out the same intent to multiple routing engines and aggregate partial successes.
- Reason: Users can compare provider-specific route suggestions without changing the planning intent.
- Impact: More provider requests, stricter rate limiting, and candidate provenance are required.

**Variant curation**
- From: The frontend receives a single route or provider-native alternatives.
- To: The host returns at most `desiredVariants` final candidates selected by quality, elevation, and geometric diversity.
- Reason: Users choose how many meaningful variants they want, not how many native alternatives each provider should compute.
- Impact: New candidate selection and UI comparison behavior.

## Out of Scope

- Cross-engine route stitching.
- Translating native profile formats between engines.
