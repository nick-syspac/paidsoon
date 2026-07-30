## ADDED Requirements

### Requirement: Tenant-level feature overrides are supported
The system SHOULD allow admins to enable or disable tenant-level features, including MYOB integration, Xero integration, CSV import, AI rewrite, promise-to-pay, dispute pause, debtor summary, new reminder engine, beta UI, per-tenant email sender, and test mode.

#### Scenario: Feature override is visible
- **WHEN** an admin opens the feature override view for a tenant
- **THEN** the current tenant feature state is shown

### Requirement: Feature flag changes are audited
Feature flag changes MUST be audited and SHOULD require a reason when the change affects customer behavior or production support posture.

#### Scenario: Feature flag change is recorded
- **WHEN** an admin changes a tenant feature flag
- **THEN** the audit log captures the flag name, target tenant, and before and after values
