# cost-guard-detection Specification

## Purpose

Define the signal-detection layer for Cost Guard: the deterministic rules and historical comparisons that create material cost-risk alerts.

## Requirements

### Requirement: Cost Guard SHALL detect supplier and category drift
The system SHALL compare current supplier and category spend against historical averages and detect material increases using both percentage and dollar variance thresholds.

#### Scenario: Supplier has materially increased this month
- **WHEN** the current period supplier spend exceeds the recent baseline by a configured threshold
- **THEN** the system creates a supplier-increase alert with the baseline, actual amount, and variance

#### Scenario: Category is trending above baseline
- **WHEN** the current category spend rises above the configured percentage and dollar thresholds
- **THEN** the system creates a category increase alert and surfaces it in the dashboard summary

### Requirement: Cost Guard SHALL detect new and unusual spend
The system SHALL flag new suppliers, unusually large invoices, and duplicate or suspicious charges based on historical and transactional evidence.

#### Scenario: New supplier appears with large spend
- **WHEN** a supplier has no previous history and the spend exceeds the configured threshold
- **THEN** the system creates a `NEW_SUPPLIER` alert

#### Scenario: Duplicate charges are detected
- **WHEN** the same supplier, amount, invoice number, or reference pattern repeats within a suspicious window
- **THEN** the system creates a `POSSIBLE_DUPLICATE` alert with the matching transaction evidence

### Requirement: Cost Guard SHALL detect spend acceleration
The system SHALL identify if spending is materially accelerating faster than the normal monthly pattern before the budget is exceeded.

#### Scenario: Spend velocity increases above normal
- **WHEN** current month-to-date spend exceeds the usual pace for the same point in the month
- **THEN** the system creates a `SPEND_VELOCITY` alert and shows the projected impact

### Requirement: Cost Guard SHALL include recurring-cost changes
The system SHALL treat recurring commitments from SpendLeak as expected recurring costs and generate alerts when actual recurring spend moves beyond configured thresholds.

#### Scenario: Subscription price increases unexpectedly
- **WHEN** a recurring commitment increases above the configured ratio or dollar threshold
- **THEN** the system creates a recurring-cost increase alert with both expected and actual amounts

## Acceptance Criteria

- Supplier and category drift detection exists and is explainable
- New supplier, duplicate, and unusual invoice rules are supported
- Spend velocity and recurring-cost alerts use the shared financial and SpendLeak data
- Alerts include deterministic thresholds and baseline context
- Detection is idempotent against repeated syncs
