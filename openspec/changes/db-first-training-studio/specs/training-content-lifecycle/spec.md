## ADDED Requirements

### Requirement: Guides follow Draft, Review, Publish workflow

Every guide SHALL move through explicit lifecycle states: `draft`, `review`, and `published`.

#### Scenario: Draft is submitted for review
- **WHEN** an authorized editor submits a draft guide for review
- **THEN** the guide state transitions from `draft` to `review`
- **AND** the transition is persisted with actor and timestamp metadata

#### Scenario: Review item is published
- **WHEN** an authorized publisher approves a guide in `review` state
- **THEN** the guide state transitions from `review` to `published`
- **AND** the published revision becomes the reader-visible version

#### Scenario: Invalid state transition is rejected
- **WHEN** a request attempts an unsupported transition (for example `published` to `review` without restore/unpublish policy)
- **THEN** the system rejects the request and leaves the guide unchanged

### Requirement: Only published guides are reader-visible

Reader-facing help/training surfaces SHALL return only `published` guides.

#### Scenario: Draft or review guide is requested by slug
- **WHEN** a reader requests a guide that is not in `published` state
- **THEN** the reader API does not expose the guide as visible content
