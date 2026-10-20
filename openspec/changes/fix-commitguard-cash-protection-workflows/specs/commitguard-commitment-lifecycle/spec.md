# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL support commitment lifecycle actions
The system SHALL support create, edit, pause, resume, cancel, confirm, and classification updates for commitments with validated input and tenant ownership checks. Repeated actions SHALL be safe, cancelled or expired commitments SHALL NOT be resumed, and manual creation and detection conversion SHALL obey the same atomic tracked-commitment allowance.

#### Scenario: User edits commitment amount
- **WHEN** a user updates a commitment amount
- **THEN** the commitment record is updated, audit history captures the change, and subsequent forecasts use the new value

#### Scenario: Unauthorized tenant access
- **WHEN** a user attempts to mutate another tenant's commitment
- **THEN** the request is denied and no cross-tenant data is disclosed

#### Scenario: Concurrent creation at plan limit
- **WHEN** manual creation and candidate confirmation race for the final allowed tracked-commitment slot
- **THEN** at most one new commitment is created and the other request receives the existing allowance error without partial conversion

#### Scenario: Candidate confirmation is retried
- **WHEN** sequential or concurrent confirmation requests target the same candidate
- **THEN** exactly one commitment and one conversion audit transition are persisted and retries return the original commitment identity

#### Scenario: Invalid lifecycle transition
- **WHEN** an owner requests resume for a cancelled or expired commitment
- **THEN** the request returns a conflict and neither status nor cancellation history is changed

#### Scenario: Approved pause and resume sources
- **WHEN** an owner pauses an active, upcoming, ending, or review commitment
- **THEN** its status becomes paused and pausedAt is set
- **AND** repeating pause while paused returns success with null audit and no writes
- **AND** pause from cancelled or expired and resume from any status other than paused return 409
- **AND** resume from paused sets active and clears pausedAt

#### Scenario: Approved cancel sources
- **WHEN** an owner cancels any non-expired, non-cancelled commitment
- **THEN** its status becomes cancelled and cancelledAt is set
- **AND** repeating cancel while cancelled returns success with null audit and no writes
- **AND** cancelling expired returns 409 without changing history

#### Scenario: Confirmation preserves lifecycle status
- **WHEN** an owner confirms an active, upcoming, ending, or review commitment
- **THEN** confidence becomes confirmed without changing status or lifecycle timestamps
- **AND** an already-confirmed retry in those statuses returns success with null audit and no writes
- **AND** confirm from paused, cancelled, or expired returns 409 even when already confirmed

#### Scenario: Editing boundaries and archived records
- **WHEN** an owner submits descriptive, schedule, renewal, or classification edits for a cancelled or expired commitment
- **THEN** those edits remain allowed without reopening its lifecycle
- **AND** PATCH containing lifecycle status is rejected with 400 even if unchanged
- **AND** all mutations of archived records return 409 including otherwise no-op actions
- **AND** no archive action is offered
- **AND** unrelated edits preserve legacy custom recurrence while supported recurrence repair remains allowed

#### Scenario: Competing mutations re-read locked state
- **WHEN** updates or lifecycle requests compete for one tenant-owned commitment
- **THEN** tenant serialization and a commitment row lock precede re-reading and validating its current state
- **AND** duplicate pause, cancel, confirm, or identical PATCH requests create at most one mutation audit
- **AND** missing and foreign commitment IDs both return 404 without disclosing tenant data

### Requirement: CommitGuard SHALL preserve auditable history for lifecycle transitions
The system SHALL record auditable events for key lifecycle transitions including creation, amount/date/recurrence changes, confirmation, pause, cancel, and essentiality changes. Audit entries SHALL retain changed-field before/after values and SHALL NOT be duplicated for no-op retries.

#### Scenario: Commitment is paused
- **WHEN** a user pauses an active commitment
- **THEN** the system stores a pause transition event and future active-horizon calculations exclude paused intervals

#### Scenario: Commitment is confirmed from detection queue
- **WHEN** a detected commitment is confirmed
- **THEN** the system records confirmation origin and transition details in the audit stream

#### Scenario: Renewal or classification is edited
- **WHEN** renewal, notice-period, recurrence, confidence, or essentiality values change
- **THEN** the audit identifies the changed values and the next summary and forecast use the committed revision

#### Scenario: Changed-field audit is atomic and complete
- **WHEN** dates, recurrence, renewal, notice period, auto-renew, confidence, essentiality, or lifecycle timestamps change
- **THEN** the audit includes only changed fields with before/after values and ISO date strings
- **AND** failure to persist the audit rolls back the mutation
- **AND** conflicts and no-op retries leave audit history and updatedAt unchanged