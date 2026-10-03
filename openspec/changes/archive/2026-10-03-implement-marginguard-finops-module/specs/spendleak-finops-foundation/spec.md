## ADDED Requirements

### Requirement: SpendLeak foundation SHALL expose margin-relevant cost semantics
The shared FinOps foundation SHALL provide SpendLeak cost/category signals in a canonical form that MarginGuard can consume without duplicate spend records.

#### Scenario: Spend category reused by MarginGuard
- **WHEN** MarginGuard evaluates direct-cost attribution
- **THEN** it can consume SpendLeak category metadata from canonical records without copying transactions
