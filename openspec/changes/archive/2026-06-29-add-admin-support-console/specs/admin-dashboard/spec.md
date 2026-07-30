## ADDED Requirements

### Requirement: Admin dashboard shows platform operational health
The system MUST present a protected admin dashboard that summarizes platform-wide operational health, including active tenants, trial tenants, paid tenants, failed billing count, invoice sync failures, email failures, reminders queued, failed jobs, worker status, Stripe webhook status, accounting integration health, and recent platform errors. The dashboard SHOULD highlight urgent issues requiring attention.

#### Scenario: Operational health summary is visible
- **WHEN** an authorized admin opens the dashboard
- **THEN** the dashboard shows the operational health metrics

#### Scenario: Urgent issues are highlighted
- **WHEN** the platform has failed jobs, invoice sync failures, or billing failures above zero
- **THEN** the dashboard visually emphasizes those problem areas

### Requirement: Admin dashboard remains masked and role-aware
The dashboard MUST avoid exposing raw secrets, plaintext OAuth tokens, and payment-sensitive data. Access SHOULD be filtered by admin role so read-only staff see the same health signals without privileged corrective controls.

#### Scenario: Sensitive data is omitted
- **WHEN** the dashboard renders integration or billing summaries
- **THEN** no raw tokens, API keys, or secret values are shown

#### Scenario: Read-only staff view the dashboard
- **WHEN** a Support Viewer opens the dashboard
- **THEN** they can inspect health signals but cannot access privileged action controls
