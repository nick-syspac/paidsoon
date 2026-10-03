# Spec Delta

## ADDED Requirements

### Requirement: Cost Guard category analysis uses confirmed canonical categories
The system SHALL use tenant-confirmed PaidSoon spending categories for category-level spend analysis and SHALL distinguish unclassified or unconfirmed amounts from confirmed category totals.

#### Scenario: Cost Guard summarizes classified spend
- **WHEN** Cost Guard returns category-level spend for a tenant
- **THEN** it groups eligible imported bills and bank transactions by the shared PaidSoon category rather than by provider account display name

#### Scenario: Cost Guard has unclassified spend
- **WHEN** imported spend has no confirmed PaidSoon category
- **THEN** Cost Guard reports the unclassified amount separately and does not silently include it in a confirmed category

#### Scenario: Category changes affect analysis without changing source records
- **WHEN** a user changes a PaidSoon category assignment
- **THEN** subsequent Cost Guard category analysis reflects the updated assignment while preserving source accounting fields and category-change audit history

#### Scenario: Cost Guard preserves source and currency boundaries
- **WHEN** Cost Guard summarizes bills and bank transactions in one or more currencies
- **THEN** it returns separate source-type and currency totals without converting currencies or combining bills with payments into a potentially duplicated total

#### Scenario: Cost Guard excludes inflows, transfers, and uncertain assignments from confirmed spend
- **WHEN** a record is an inflow, identified transfer, unknown-direction transaction, or unconfirmed suggestion
- **THEN** it is not included in a confirmed spending-category total and unresolved or excluded records remain separately traceable