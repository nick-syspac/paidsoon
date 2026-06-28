## ADDED Requirements

### Requirement: Safe data correction tools are bounded
The system SHOULD allow admins to merge duplicate customers, archive duplicate invoices, restore archived invoices, correct customer email, update invoice reminder state, reset tenant onboarding step, clear stuck sync cursor, manually link provider customer to a PaidSoon customer, remove bad imported file, roll back the last import where technically possible, and export tenant data. The system MUST NOT expose unrestricted SQL editing through the admin UI.

#### Scenario: Duplicate customer merge is supported
- **WHEN** an admin identifies a duplicate customer pair
- **THEN** the console can merge them through a validated workflow

#### Scenario: SQL editing is not available
- **WHEN** an admin opens the correction tools
- **THEN** there is no raw SQL editor or general-purpose database browser
