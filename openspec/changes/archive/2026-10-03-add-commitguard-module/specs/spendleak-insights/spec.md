## ADDED Requirements

### Requirement: SpendLeak insights SHALL expose commitment linkage metadata
When a SpendLeak insight concerns a supplier tied to an active commitment, the system SHALL surface that commitment linkage so users can distinguish avoidable waste from currently committed obligations.

#### Scenario: Potentially unused subscription is still committed
- **WHEN** SpendLeak flags a potentially unused subscription with a mapped active commitment
- **THEN** insight output includes a link or indicator that the cost is currently tracked as committed cash in CommitGuard
