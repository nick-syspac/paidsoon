## Purpose

Define cross-module data contracts so MarginGuard uses canonical PaidSoon FinOps data and contributes normalized margin status without creating duplicate sources of truth.

## ADDED Requirements

### Requirement: MarginGuard SHALL consume canonical FinOps records
The system SHALL derive revenue and payment context from canonical invoice/payment sources and derive costs from canonical spend/cost sources.

#### Scenario: Canonical invoice usage
- **WHEN** MarginGuard builds a customer profitability view
- **THEN** revenue values are sourced from canonical invoice records and payment behavior context is included when available

### Requirement: MarginGuard SHALL integrate with existing module boundaries
The system SHALL expose normalized margin status and summary metrics for FinOps overview while keeping ownership boundaries of PaidSoon, SpendLeak, CostGuard, CommitGuard, CashPlan, and Tax Buffer intact.

#### Scenario: FinOps summary integration
- **WHEN** main FinOps dashboard loads module summaries
- **THEN** MarginGuard summary appears through existing summary composition pathways without introducing parallel aggregation systems
