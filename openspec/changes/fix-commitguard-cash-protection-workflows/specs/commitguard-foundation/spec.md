# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL classify commitment evidence and confidence
The system SHALL track commitment source and confidence and SHALL distinguish confirmed commitments from probable and potential commitments in calculations and user-facing summaries. Monetary partitions SHALL preserve currency, and summaries SHALL identify which confidence classes reduce protected cash.

#### Scenario: User confirms a detected commitment
- **WHEN** a user confirms a system-detected commitment
- **THEN** the commitment confidence becomes CONFIRMED and the commitment is treated as confirmed in forecast summaries

#### Scenario: Low-confidence commitment exists
- **WHEN** a commitment has LOW confidence
- **THEN** the summary view identifies it as potential and does not silently blend it into confirmed totals without confidence labeling

#### Scenario: Protection includes uncertain commitments
- **WHEN** confirmed, probable, and potential active commitments exist in the selected horizon
- **THEN** all three classes contribute to conservative commitment protection, with separately labeled currency-specific amounts and an explicit inclusion explanation

## ADDED Requirements

### Requirement: Detection origin SHALL remain traceable
A detected commitment SHALL preserve tenant-owned source evidence and one durable conversion identity. Legacy converted candidates without an unambiguous origin link SHALL require review rather than creating another commitment or guessing a historical match.

#### Scenario: Converted candidate is inspected
- **WHEN** an owner inspects a converted candidate
- **THEN** the original candidate, evidence origin, and resulting commitment are identifiable without exposing another tenant's source records

#### Scenario: Legacy conversion is ambiguous
- **WHEN** a converted historical candidate has no recoverable unique commitment link
- **THEN** confirmation reports that reconciliation is required and creates no commitment