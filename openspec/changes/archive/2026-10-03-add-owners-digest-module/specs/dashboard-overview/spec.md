# dashboard-overview delta for add-owners-digest-module

## ADDED Requirements

### Requirement: Dashboard overview SHALL include an Owner's Digest executive summary entry point

The dashboard overview SHALL surface a compact Owner's Digest summary for entitled tenants so owners can see the overall status, top issue count, and a small set of key figures before opening the full digest.

#### Scenario: Entitled tenant opens the dashboard overview

- **WHEN** an entitled user views the main dashboard overview
- **THEN** the overview includes an Owner's Digest summary showing the current overall status and a concise attention summary
- **AND** selecting the summary navigates to the full Owner's Digest module

#### Scenario: Current digest has no significant issues

- **WHEN** the latest digest status is Healthy with no material issues requiring attention
- **THEN** the overview summary communicates that the business is on track
- **AND** it does not duplicate the full digest sections inline
