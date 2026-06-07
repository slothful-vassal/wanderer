# Delta for Routing

## ADDED Requirements

### Requirement: Persistent routing intents and mappings
The system SHALL persist routing intents, settings, profile mappings, and provider-native user profiles in host-owned storage.

#### Scenario: Mapping resolution
- GIVEN a user requests routing with a Wanderer intent
- WHEN multiple mappings are available
- THEN the host resolves user instance mapping before user plugin mapping
- AND resolves admin instance mapping before admin plugin mapping
- AND uses plugin discovery defaults only after user and admin mappings.

### Requirement: Materialized and discovered native profiles
The system SHALL distinguish discovered plugin built-ins from materialized user, admin, and generated profiles.

#### Scenario: Built-in profile listing
- GIVEN a plugin declares built-in native profiles
- WHEN the host lists routing profiles
- THEN the host includes the built-ins from discovery
- AND does not materialize them as profile records.

#### Scenario: User profile upload
- GIVEN a user uploads a provider-native profile
- WHEN the host accepts the profile
- THEN it stores the profile as a host-owned `routing_profiles` record
- AND provides the content to the plugin only for concrete invocations.

### Requirement: Effective routing controls
The system SHALL compute effective standard routing controls from intent, engine selection, and plugin-declared preference support.

#### Scenario: Comparable parallel controls
- GIVEN multiple engines are selected for the same intent
- WHEN the frontend requests effective controls
- THEN the host returns only controls that are comparable or explicitly marked as partial
- AND excludes provider-native advanced controls from the standard UI.

## REMOVED Requirements

### Requirement: Built-in phase-one routing defaults
The system SHALL no longer rely on hard-coded phase-one routing defaults.

Reason: The `hike`, `bike_balanced`, and `car` defaults are migrated into host-owned `routing_intents` and `routing_profile_mappings` with admin and user resolution, replacing the temporary hard-coded phase-one behavior.
