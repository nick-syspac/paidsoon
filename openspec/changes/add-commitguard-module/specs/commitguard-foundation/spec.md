## Purpose

Define CommitGuard as a tenant-scoped commitment ledger that captures obligations, source confidence, and lifecycle state so businesses can distinguish committed cash from free cash.

## ADDED Requirements

### Requirement: CommitGuard SHALL maintain a tenant-scoped commitment register
The system SHALL store each commitment with tenant ownership, commitment metadata, recurrence metadata, and lifecycle status while preserving historical records for ended or cancelled commitments.

#### Scenario: User creates a commitment
- **WHEN** an authenticated user creates a commitment in CommitGuard
- **THEN** the commitment is persisted under the active tenant context and is not visible to other tenants

#### Scenario: Commitment is cancelled
- **WHEN** a commitment is cancelled
- **THEN** the system retains commitment history and marks status as non-active rather than hard-deleting financial history

### Requirement: CommitGuard SHALL classify commitment evidence and confidence
The system SHALL track commitment source and confidence and SHALL distinguish confirmed commitments from probable and potential commitments in calculations and user-facing summaries.

#### Scenario: User confirms a detected commitment
- **WHEN** a user confirms a system-detected commitment
- **THEN** the commitment confidence becomes CONFIRMED and the commitment is treated as confirmed in forecast summaries

#### Scenario: Low-confidence commitment exists
- **WHEN** a commitment has LOW confidence
- **THEN** the summary view identifies it as potential and does not silently blend it into confirmed totals without confidence labeling
