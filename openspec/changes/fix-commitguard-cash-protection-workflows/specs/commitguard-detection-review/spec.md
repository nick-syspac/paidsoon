# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL detect candidate commitments with deterministic rules
The detection service SHALL infer candidates from repeat supplier intervals, amount variance, and configurable minimum occurrence counts. Detection SHALL require module enablement, recurring-detection opt-in, and current entitlement; it SHALL support on-demand runs and durable successful spend-ingestion handoffs using outgoing, non-duplicated, currency-preserving evidence.

#### Scenario: Strong monthly recurrence signal
- **WHEN** at least three payments from the same supplier recur at approximately monthly intervals within configured tolerance
- **THEN** the system creates a detected commitment candidate with inferred recurrence and confidence metadata

#### Scenario: Evidence below threshold
- **WHEN** recurring evidence does not meet configured minimum rules
- **THEN** no candidate is created

#### Scenario: Detection disabled
- **WHEN** an ingestion handoff or manual request executes after detection is disabled or access is removed
- **THEN** it creates no candidate and reports the disabled or access-denied state

#### Scenario: Completed spend ingestion
- **WHEN** a successful accounting spend sync or completed spreadsheet spend import commits
- **THEN** enabled entitled detection receives durable deduplicated work that can recover from enqueue failure independently of import success
- **AND** failed or partial syncs do not automatically trigger detection

#### Scenario: Incoming or duplicated payment evidence
- **WHEN** imported rows contain incoming bank transactions, multiple connections, or bills already represented by bank payments
- **THEN** incoming rows are excluded, source scopes remain distinct, and repeated economic evidence does not inflate occurrence counts

### Requirement: CommitGuard SHALL support a review queue with rejection memory
Detected candidates SHALL enter a tenant-scoped review queue supporting confirm, ignore, edit, and not-a-commitment. Rejected or ignored candidates SHALL remain suppressed unless materially new evidence is present; converted candidates SHALL retain their original conversion, and the suggested due date SHALL follow observed recurrence rather than the review date.

#### Scenario: User rejects candidate
- **WHEN** a user marks a detected item as not a commitment
- **THEN** the system records rejection context and suppresses repeat suggestions unless new evidence passes configured change criteria

#### Scenario: User confirms candidate
- **WHEN** a user confirms a detected candidate
- **THEN** the candidate becomes an active commitment and confidence is marked CONFIRMED

#### Scenario: Candidate correction before confirmation
- **WHEN** an owner edits an inferred amount, category, frequency, or next due date in the review UI
- **THEN** the validated correction is persisted and used by subsequent confirmation

#### Scenario: Converted candidate is edited or rejected
- **WHEN** a client attempts to reopen, ignore, or reject an already converted candidate
- **THEN** the operation returns a conflict and directs the owner to the existing commitment

#### Scenario: Material evidence and delayed review
- **WHEN** two new distinct observations or a change of at least the greater of 500 cents and 15 percent in typical amount follows a rejection
- **THEN** the candidate may re-enter review with the new evidence identified
- **AND** confirmation uses the next observed-schedule occurrence on or after today, not one period after the confirmation date