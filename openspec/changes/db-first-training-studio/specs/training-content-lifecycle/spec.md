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

### Requirement: Lifecycle audit actions are persistable in PostgreSQL

Lifecycle transition audit actions SHALL be backed by matching PostgreSQL enum values in `AdminAuditAction`.

#### Scenario: Training lifecycle action is logged
- **WHEN** the system records a lifecycle audit event such as `training_content_created`, `training_content_updated`, `training_submitted_for_review`, `training_published`, or `training_restored`
- **THEN** the corresponding `AdminAuditEvent` insert is accepted by PostgreSQL without enum rejection
- **AND** migration SQL includes `ALTER TYPE "AdminAuditAction" ADD VALUE ...` for each newly introduced lifecycle action
