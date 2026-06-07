# Delta for Routing

## ADDED Requirements

### Requirement: Parallel routing by canonical intent
The system SHALL support parallel routing across multiple engines only for the same canonical Wanderer intent.

#### Scenario: Comparable parallel request
- GIVEN the user plans a `gravel` route
- WHEN multiple engines are selected for parallel routing
- THEN each engine is invoked for the `gravel` intent
- AND no engine is invoked with an unrelated intent such as road cycling.

### Requirement: Desired variant curation
The system SHALL return at most the user-requested `desiredVariants` final candidates after host curation.

#### Scenario: Candidate curation
- GIVEN multiple engines return multiple native alternatives
- WHEN the host aggregates candidates
- THEN it filters invalid or poor candidates
- AND uses elevation, summary metrics, warnings, geometry diversity, and policy to select final candidates
- AND returns no more than `desiredVariants`.

### Requirement: Parallel partial failure handling
The system SHALL preserve successful candidates when other parallel engines fail.

#### Scenario: One engine fails
- GIVEN two engines are selected for parallel routing
- WHEN one engine returns a usable candidate and the other times out
- THEN the host responds with HTTP `200`
- AND includes the successful candidate
- AND includes the timeout in `engineErrors`.
