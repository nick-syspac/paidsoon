## Purpose

Define the MarginGuard dashboard behaviors that present explainable profitability, trend, and risk insights in accessible first-use and ongoing states.

## ADDED Requirements

### Requirement: MarginGuard dashboard SHALL present explainable summary metrics
The dashboard SHALL display gross margin, gross profit, margin at risk, customers below target, alert count, and completeness/confidence, each traceable to underlying data and formulas.

#### Scenario: Summary card explains value lineage
- **WHEN** a user opens MarginGuard dashboard
- **THEN** each summary metric has supporting calculation detail available in the UI or API response

### Requirement: MarginGuard dashboard SHALL provide trend analysis with targets
The dashboard SHALL provide period-based trend views for revenue, direct costs, gross profit, and gross margin percent with target lines and optional previous-period comparison.

#### Scenario: Trend period switch
- **WHEN** user switches from 30 days to 12 months
- **THEN** chart and summary values refresh consistently for the selected period and comparison baseline

### Requirement: MarginGuard dashboard SHALL provide actionable empty states
The dashboard SHALL present non-empty onboarding guidance when required revenue/cost data is missing or incomplete.

#### Scenario: First-use empty state
- **WHEN** no eligible revenue and cost records are available
- **THEN** dashboard shows actions for connecting sources, importing data, classifying costs, and setting targets
