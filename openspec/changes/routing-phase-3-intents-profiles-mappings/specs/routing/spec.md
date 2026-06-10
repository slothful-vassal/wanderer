# Delta for Routing

## ADDED Requirements

### Requirement: Persistent routing intents and mappings
The system SHALL persist routing intents, settings, profile mappings, and provider-native user profiles in host-owned storage.

#### Scenario: Routing persistence collections exist
- GIVEN Phase 3 is implemented
- WHEN the backend stores routing configuration
- THEN it provides host-owned persistence for `routing_settings`, `routing_intents`, `routing_profile_mappings`, and `routing_profiles`
- AND those records reference existing users and plugin instances instead of being stored inside plugin metadata.

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

### Requirement: Admin and built-in routing defaults
The system SHALL resolve routing settings as user over admin over built-in defaults, so that new and non-customizing users route on admin- or product-defined defaults without per-user setup.

#### Scenario: New user inherits admin defaults
- GIVEN an admin has set instance-wide routing defaults
- AND a new user has no own routing settings record
- WHEN the user plans a route
- THEN the host uses the admin defaults for engine, intent, routing mode, and preferences.

#### Scenario: Live fallback after admin change
- GIVEN a user has not overridden the default routing engine
- WHEN the admin changes the instance default engine
- THEN the change applies to that user immediately
- AND users who set their own engine are unaffected.

#### Scenario: Scalar defaults replace
- GIVEN builtin, admin, and user settings all define a scalar default such as `default_intent`
- WHEN the host resolves effective routing settings
- THEN the nearest user, admin, or builtin value wins as a whole.

#### Scenario: Selection lists replace
- GIVEN admin settings define comparison engines
- AND user settings define their own `compare_instances`
- WHEN the host resolves effective routing settings
- THEN the user `compare_instances` list replaces the admin list
- AND the lists are not additively merged.

#### Scenario: Preference maps deep-merge
- GIVEN builtin settings define multiple `default_preferences`
- AND admin settings override one preference key
- AND user settings override another preference key
- WHEN the host resolves effective routing settings
- THEN the effective preferences contain inherited builtin keys
- AND admin keys override builtin keys
- AND user keys override admin and builtin keys only for the keys explicitly set by the user.

#### Scenario: Trail category maps to initial intent
- GIVEN admin or user settings define `route_category_intent_defaults`
- AND the user creates or edits a trail with an existing category record
- WHEN the routing UI initializes its intent
- THEN the host uses the mapped intent as the initial selection
- AND the user can change the intent without changing the trail category.

#### Scenario: Built-in category mappings only seed existing standard categories
- GIVEN Wanderer ships suggested category-to-intent defaults
- AND an instance has only some of the standard category records
- WHEN the host initializes routing category defaults
- THEN it creates mappings only for standard category records that exist in the instance
- AND it does not create hidden or fixed category enum values.

#### Scenario: Category without routing mapping
- GIVEN a trail category such as `Climbing`, `Skiing`, or `Canoeing` has no `route_category_intent_defaults` entry
- WHEN the routing UI initializes its intent
- THEN the host either falls back to `default_intent` or starts without auto-routing according to host/UI policy
- AND the missing category mapping is not treated as a configuration error.

#### Scenario: Admin gates exposed features
- GIVEN an admin disables an optional feature such as parallel comparison, via mode, or profile upload
- WHEN a user opens the routing UI
- THEN that feature is not offered
- AND a user cannot enable it
- AND segment routing and the single-best-route default path remain available.

#### Scenario: Feature gates are upper bounds
- GIVEN an admin exposes only a subset of optional routing features
- AND a user setting attempts to enable an unexposed feature
- WHEN the host resolves effective routing settings
- THEN the unexposed feature remains disabled
- AND only features allowed by admin policy can be user-enabled.

### Requirement: Effective routing controls
The system SHALL compute effective standard routing controls from intent, engine selection, and plugin-declared preference support.

#### Scenario: Comparable parallel controls
- GIVEN multiple engines are selected for the same intent
- WHEN the frontend requests effective controls
- THEN the host returns only controls that are comparable or explicitly marked as partial
- AND excludes provider-native advanced controls from the standard UI.

### Requirement: Provider-native advanced control discovery
The system SHALL resolve provider-native advanced controls for one concrete engine/profile selection separately from standard Wanderer preferences.

#### Scenario: Advanced controls for one engine
- GIVEN a user opens advanced settings for a selected routing engine and native profile
- WHEN the frontend requests native controls
- THEN the host returns the control groups declared or derived by that plugin for that profile
- AND marks each control with its storage target such as `native_config` or generated profile metadata.

#### Scenario: Advanced controls are not comparable by default
- GIVEN multiple engines are selected for parallel routing
- WHEN the standard editor controls are resolved
- THEN provider-native advanced controls are not merged across engines
- AND are shown only inside the per-engine advanced section
- AND any provider-native option that should become comparable must first be modeled as a canonical Wanderer preference.

## REMOVED Requirements

### Requirement: Built-in phase-one routing defaults
The system SHALL no longer rely on hard-coded phase-one routing defaults.

Reason: The `hike`, `bike_balanced`, and `car` defaults are migrated into host-owned `routing_intents` and `routing_profile_mappings` with admin and user resolution, replacing the temporary hard-coded phase-one behavior.
