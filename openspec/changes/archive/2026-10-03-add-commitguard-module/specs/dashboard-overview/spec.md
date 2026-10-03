## ADDED Requirements

### Requirement: Overview SHALL include CommitGuard cash-position summary
The dashboard overview SHALL display CommitGuard contributed metrics for committed cash and free cash alongside receivables and other FinOps summary signals.

#### Scenario: User has CommitGuard data
- **WHEN** a tenant has active commitment forecasts
- **THEN** overview renders committed cash and free-cash summary values with status context

#### Scenario: User has no CommitGuard setup
- **WHEN** no commitments or detection setup exists
- **THEN** overview renders a clear empty/setup state rather than zero-values that imply commitments were fully evaluated
