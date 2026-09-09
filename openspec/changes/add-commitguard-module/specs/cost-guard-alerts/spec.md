## ADDED Requirements

### Requirement: Cost Guard alerts SHALL link commitment-impact context to CommitGuard
Where a cost increase corresponds to an active commitment, the system SHALL expose linkage context so users can move from anomaly analysis to commitment impact without duplicating analysis logic.

#### Scenario: Supplier commitment increases
- **WHEN** Cost Guard identifies a sustained increase for a supplier with a mapped commitment
- **THEN** the alert includes a navigable reference to the related CommitGuard commitment impact view
