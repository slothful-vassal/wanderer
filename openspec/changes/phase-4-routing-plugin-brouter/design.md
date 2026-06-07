# Design: routing-plugin-brouter

## Overview

Add BRouter as the second first-party routing plugin. BRouter focuses on `route.v1`; elevation may come from Valhalla or another `elevation.v1` plugin.

## Key Decisions

- BRouter native profiles are provider dialects.
- `.brf` uploads are stored by the host and passed to the plugin only for invocations.
- Generated `.brf` profiles are built from safe templates and bounded placeholders.
- Single-engine BRouter routing with separate Valhalla elevation is part of this phase.
- Multi-engine fan-out waits for the parallel variants phase.

## References

- `openspec/design/routing-plugin.md`
