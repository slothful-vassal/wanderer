# Change: routing-host-contracts

> **Phase 2 of 5** · depends on: Phase 1 · Harden the host contracts: HTTP status, error codes, limits, elevation status, segment/polyline conformance + tests.

## Why

After the Valhalla cutover, the host routing contracts need to be hardened so later providers can plug in without rediscovering edge cases.

## What Changes

**Host routing contract**
- From: Phase 1 implements the minimum contract needed for Valhalla cutover.
- To: The host contract is fully specified and tested for status codes, error codes, limits, elevation status, segment validation, and polyline compliance.
- Reason: BRouter and parallel routing need provider-neutral behavior, not Valhalla assumptions.
- Impact: Mostly internal hardening and conformance tests.

## Out of Scope

- BRouter implementation.
- Persistent admin/user mapping UI.
- Parallel route curation.
