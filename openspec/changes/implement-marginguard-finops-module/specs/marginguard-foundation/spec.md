## Purpose

Define MarginGuard's canonical financial calculations and confidence model so profitability metrics are deterministic, explainable, and tenant-safe across dashboard, API, and background jobs.

## ADDED Requirements

### Requirement: MarginGuard SHALL compute core margin metrics from canonical records
The system SHALL compute gross profit and gross margin from canonical revenue and direct cost records, and SHALL compute contribution margin only when variable-cost classification coverage meets configured completeness thresholds.

#### Scenario: Gross margin computed with complete data
- **WHEN** a tenant has revenue and direct costs within the selected period
- **THEN** MarginGuard returns revenue, direct cost, gross profit, and gross margin percent using deterministic formulas and no floating-point money storage

#### Scenario: Contribution margin withheld for low completeness
- **WHEN** variable-cost classifications are below the minimum completeness threshold
- **THEN** MarginGuard marks contribution margin as unavailable and returns a completeness/confidence explanation

### Requirement: MarginGuard SHALL handle non-standard values safely
The system SHALL handle zero revenue, negative revenue, credits/refunds, missing costs, and null source fields without runtime failure and SHALL expose explicit status states instead of misleading percentages.

#### Scenario: Zero revenue period
- **WHEN** period revenue equals zero
- **THEN** MarginGuard returns gross profit value and a non-computable margin percent state with an explanatory reason

#### Scenario: Negative revenue due to credits
- **WHEN** net revenue is negative because credits exceed invoices
- **THEN** MarginGuard returns negative gross profit and sets status to warning or critical according to configured thresholds

### Requirement: MarginGuard SHALL expose deterministic data completeness and confidence
The system SHALL publish margin data completeness as a percentage and SHALL map completeness to confidence states (`high`, `medium`, `low`, `insufficient_data`) using deterministic rules.

#### Scenario: Completeness below minimum confidence
- **WHEN** required classification and mapping coverage falls below the configured minimum
- **THEN** MarginGuard reports `insufficient_data` and suppresses high-confidence profitability recommendations
