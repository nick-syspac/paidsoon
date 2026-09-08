## Purpose

Define commitment lifecycle management so users can create, maintain, and safely transition obligations without losing financial traceability.

## ADDED Requirements

### Requirement: CommitGuard SHALL support commitment lifecycle actions
The system SHALL support create, edit, pause, resume, cancel, confirm, and classification updates for commitments with validated input and tenant ownership checks.

#### Scenario: User edits commitment amount
- **WHEN** a user updates a commitment amount
- **THEN** the commitment record is updated, audit history captures the change, and subsequent forecasts use the new value

#### Scenario: Unauthorized tenant access
- **WHEN** a user attempts to mutate another tenant's commitment
- **THEN** the request is denied and no cross-tenant data is disclosed

### Requirement: CommitGuard SHALL preserve auditable history for lifecycle transitions
The system SHALL record auditable events for key lifecycle transitions including creation, amount/date/recurrence changes, confirmation, pause, cancel, and essentiality changes.

#### Scenario: Commitment is paused
- **WHEN** a user pauses an active commitment
- **THEN** the system stores a pause transition event and future active-horizon calculations exclude paused intervals

#### Scenario: Commitment is confirmed from detection queue
- **WHEN** a detected commitment is confirmed
- **THEN** the system records confirmation origin and transition details in the audit stream
