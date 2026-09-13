## ADDED Requirements

### Requirement: Dashboard overview SHALL surface DepositGuard commencement and payment risk signals
For tenants with DepositGuard access, the overview SHALL include summary-level signals for blocked jobs, overdue deposit requests, and near-term DepositGuard actions requiring owner attention.

#### Scenario: Tenant has blocked jobs and overdue requests
- **WHEN** the dashboard overview loads for a tenant with blocked DepositGuard jobs and overdue deposit requests
- **THEN** the overview includes visible DepositGuard attention summaries
- **AND** each summary links to the relevant DepositGuard filtered view

#### Scenario: Tenant has no DepositGuard operational access
- **WHEN** the dashboard overview loads for a tenant in DepositGuard preview mode
- **THEN** operational risk counts are not exposed from unauthorized data
- **AND** the overview may show a non-operational upgrade prompt instead
