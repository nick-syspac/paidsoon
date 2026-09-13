## ADDED Requirements

### Requirement: DepositGuard marketing claims MUST separate shipped MVP behavior from planned expansions
Marketing pages that reference DepositGuard SHALL describe only currently implemented customer-facing capabilities as available and SHALL label future integrations or advanced workflows as planned.

#### Scenario: MVP capability is promoted
- **WHEN** marketing copy references DepositGuard deposit requests, reminders, or commencement protection
- **THEN** those claims match implemented MVP behavior and available routes

#### Scenario: Planned integration is referenced
- **WHEN** marketing copy references Stripe Connect customer payments, advanced reconciliation, or broader quote automation that is not yet operational
- **THEN** the copy labels those items as planned, coming soon, or setup-required and not currently live
