## ADDED Requirements

### Requirement: Tenant search supports operational lookup fields
The system MUST allow admins to search tenants by business name, owner email, tenant ID, connected accounting provider, and subscription status.

#### Scenario: Search by owner email returns matching tenants
- **WHEN** an admin searches for an owner email address
- **THEN** the tenant list returns matching tenant records only

#### Scenario: Search by provider narrows results
- **WHEN** an admin searches for tenants connected to MYOB
- **THEN** the tenant list returns only tenants with MYOB connections

### Requirement: Tenant detail shows a safe support snapshot
The system MUST show tenant detail data for business name, tenant ID, owner/admin users, subscription plan, trial status, billing status, accounting provider connection status, last successful sync, invoice count, overdue invoice count, reminder automation status, email sender status, recent errors, and support timeline. The page MUST omit raw credentials and MUST present only safe data needed for support.

#### Scenario: Tenant support snapshot is complete
- **WHEN** an admin opens a tenant detail page
- **THEN** the page includes the required support snapshot fields

#### Scenario: Secrets are not shown
- **WHEN** the tenant detail page renders integration information
- **THEN** access tokens, API keys, and plaintext credentials are not displayed

### Requirement: Tenant corrective actions are audited and bounded
Admins SHOULD be able to pause tenant automation, resume tenant automation, force invoice sync, resend onboarding email, transfer tenant owner, disable tenant, mark tenant as demo or internal, view the audit log, and export tenant support data. Any action that changes business state MUST be audited and MUST require confirmation and reason where the risk is material.

#### Scenario: Pause automation is available
- **WHEN** a Support Operator views tenant detail
- **THEN** they can pause automation for the tenant

#### Scenario: Transfer ownership requires audit and reason
- **WHEN** an admin transfers tenant ownership
- **THEN** the action is audited with before and after state plus a reason
