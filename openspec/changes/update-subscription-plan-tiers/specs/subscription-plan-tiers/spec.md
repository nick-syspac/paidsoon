## ADDED Requirements

### Requirement: Canonical subscription tiers and pricing
The system SHALL define exactly three paid subscription tiers with fixed monthly prices: Starter at $9/month, Solo at $19/month, and Small Business at $39/month.

#### Scenario: Plan catalog is requested
- **WHEN** the application loads subscription plan metadata for checkout or plan display
- **THEN** it returns Starter ($9/month), Solo ($19/month), and Small Business ($39/month) with stable internal plan identifiers

### Requirement: Tier invoice-chasing limits
The system SHALL enforce monthly chased-invoice limits by tier: Starter allows up to 10 chased invoices per month, Solo allows up to 30 chased invoices per month, and Small Business allows up to 100 chased invoices per month.

#### Scenario: User reaches monthly chased-invoice limit
- **WHEN** an account at a given tier attempts to chase an invoice after reaching that tier limit in the current billing month
- **THEN** the system blocks the action and indicates that an upgrade is required to increase limit capacity

### Requirement: Tier user seat limits
The system SHALL enforce user-seat limits by tier: Starter allows 1 user, Solo allows 1 user, and Small Business allows up to 3 users.

#### Scenario: User invite exceeds plan seat cap
- **WHEN** an account admin invites a user that would exceed the active tier seat limit
- **THEN** the system rejects the invite and provides a plan-limit upgrade message

### Requirement: Tier Stripe account connection limits
The system SHALL enforce connected Stripe account limits by tier: Starter allows 1 connected Stripe account, Solo allows 1 connected Stripe account, and Small Business allows up to 3 connected Stripe accounts.

#### Scenario: Additional Stripe account connection over limit
- **WHEN** an account attempts to connect another Stripe account beyond its tier allowance
- **THEN** the system denies the connection and explains the plan limit

### Requirement: Tier-specific reminder and template capabilities
The system SHALL gate reminder sequence and template capabilities by tier as follows: Starter includes basic email reminders and does not include custom templates; Solo includes email reminder sequences and basic templates; Small Business includes custom reminder templates.

#### Scenario: User accesses reminder/template features for their tier
- **WHEN** a user opens reminder and template settings
- **THEN** only the capabilities included in the account's active tier are available for configuration and use

### Requirement: Tier-specific branding, sender identity, and AI capabilities
The system SHALL gate branding, sender identity, tone settings, and AI rewrite by tier as follows: Starter includes Paid Soon branding and excludes AI customization; Solo allows use of the account's own email address and excludes AI rewrite/tone settings; Small Business includes customer tone settings (friendly, firm, final notice) and basic AI rewrite of reminder messages.

#### Scenario: User attempts to use unavailable premium capability
- **WHEN** a user attempts to use a feature not included in the active tier (such as AI rewrite on Starter or Solo)
- **THEN** the system blocks the action and presents an upgrade path

### Requirement: Tier-specific dashboard visibility
The system SHALL expose dashboard capabilities by tier such that Solo includes a basic payment status dashboard and Small Business includes an overdue invoice dashboard.

#### Scenario: Dashboard modules render for active tier
- **WHEN** a user visits dashboard views tied to payment status or overdue invoices
- **THEN** only the dashboard modules included in the active tier are shown
