# Spec Delta

## ADDED Requirements

### Requirement: FinOps modules consume shared spending categories without replacing their own classifications
The system SHALL expose tenant-confirmed PaidSoon spending categories to SpendLeak, Cost Guard category analysis, and MarginGuard while preserving each module's existing domain-specific classifications.

#### Scenario: SpendLeak groups confirmed spend
- **WHEN** SpendLeak summarizes imported spend by category
- **THEN** it groups eligible records by the shared PaidSoon category and retains traceability to their imported source records

#### Scenario: SpendLeak keeps source types and currencies distinct
- **WHEN** imported bills and bank transactions or multiple currencies are summarized
- **THEN** SpendLeak reports separate source-type and currency subtotals without converting currencies or implying a deduplicated combined total, and preserves assignments under their original category after a merge

#### Scenario: SpendLeak separates unresolved direction and assignment states
- **WHEN** an imported record is an inflow, has unknown direction, lacks a category, is unconfirmed, or is excluded
- **THEN** inflows are omitted from spend totals, unknown-direction and excluded records are reported separately, and unclassified or unconfirmed outflows remain outside confirmed category totals

#### Scenario: MarginGuard uses spend category context
- **WHEN** MarginGuard evaluates an imported cost
- **THEN** it may use the shared spending category as an input but continues to store and apply its separate cost class

#### Scenario: Unconfirmed classification reaches a FinOps module
- **WHEN** an imported record has only a Jev suggestion or a `Needs review` state
- **THEN** downstream summaries identify it as unconfirmed and do not present it as a confirmed category total

### Requirement: Spending categories do not determine tax treatment
The system SHALL keep spending-category confidence separate from tax-code and GST-treatment evidence used by Tax Buffer.

#### Scenario: Jev category suggests a tax-sensitive expense
- **WHEN** a transaction receives a high-confidence PaidSoon spending category but its source tax treatment is missing or ambiguous
- **THEN** Tax Buffer continues to mark tax treatment as unknown or estimated rather than inferring tax eligibility from the spending category