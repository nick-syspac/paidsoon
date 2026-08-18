# Subscription Plan Tiers Delta For QuickBooks

## ADDED Requirements

### Requirement: Tier-specific access to accounting providers includes QuickBooks Online
The system SHALL apply the existing accounting integration entitlement rules to QuickBooks Online. Any tier allowed to connect supported accounting providers SHALL also be allowed to connect QuickBooks, and disallowed tiers SHALL receive the same upgrade path.

#### Scenario: Eligible tier starts a QuickBooks connection
- **WHEN** a user on a tier with accounting integrations enabled requests a QuickBooks connection
- **THEN** the system allows the QuickBooks OAuth flow to start without additional provider-specific gating

#### Scenario: Starter tier attempts to connect QuickBooks
- **WHEN** a Starter-tier user requests a QuickBooks connection
- **THEN** the system blocks the action and presents the existing accounting-integrations upgrade messaging

#### Scenario: Existing feature checks evaluate QuickBooks availability
- **WHEN** plan-gating logic determines whether the user may access accounting integrations
- **THEN** the same entitlement result applies consistently to Xero, MYOB, and QuickBooks connection actions