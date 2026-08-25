# subscription-plan-tiers Specification

## Purpose
TBD - created by archiving change update-subscription-plan-tiers. Update Purpose after archive.
## Requirements
### Requirement: Canonical subscription tiers and pricing
The system SHALL define exactly three paid subscription tiers with fixed monthly prices: Starter at $9/month, Solo at $19/month, and Small Business at $39/month.

#### Scenario: Plan catalog is requested
- **WHEN** the application loads subscription plan metadata for checkout or plan display
- **THEN** it returns Starter ($9/month), Solo ($19/month), and Small Business ($39/month) with stable internal plan identifiers

### Requirement: Tier invoice-chasing limits

The system SHALL define a monthly chased-invoice allowance per tier: Starter 10, Solo 50, and
Small Business 200. Accountant Partner SHALL have no fixed allowance. The allowance SHALL be
consumed once per invoice at its first reminder, measured over the account's current billing
period, and reaching it SHALL pause new chases without interrupting sequences already in
progress, as defined by the `chase-volume-entitlement` capability.

#### Scenario: Plan allowance is requested

- **WHEN** the application reads the chased-invoice allowance for a tier
- **THEN** it returns 10 for Starter, 50 for Solo, and 200 for Small Business

#### Scenario: Allowance is displayed on the pricing page

- **WHEN** the pricing page renders tier volume limits
- **THEN** the displayed figures match the allowances defined in the plan catalog

#### Scenario: User reaches monthly chased-invoice limit

- **WHEN** an account at a given tier has consumed its tier allowance within the current
  billing period
- **THEN** new invoices are not chased until the next period, and the account is shown an
  upgrade path

### Requirement: Tier user seat limits
The system SHALL define user-seat limits by tier: Starter allows 1 user, Solo allows 1 user, and Small Business allows up to 3 users. While Team seats are not implemented, these limits SHALL be presented as plan context only and Team invite workflows SHALL remain non-actionable.

#### Scenario: User invite exceeds plan seat cap
- **WHEN** Team seats are implemented and an account admin invites a user that would exceed the active tier seat limit
- **THEN** the system rejects the invite and provides a plan-limit upgrade message

#### Scenario: Team settings is opened while Team seats are unimplemented
- **WHEN** an authenticated user opens Team settings and the `team_seats` feature is marked unimplemented
- **THEN** Team settings shows coming-soon status and does not allow sending team invites

#### Scenario: Team invite API is called while Team seats are unimplemented
- **WHEN** a request is made to execute Team invite actions while `team_seats` is unimplemented
- **THEN** the system returns a feature-unavailable response rather than a success response

#### Scenario: Team seats are implemented in a future release
- **WHEN** `team_seats` is marked implemented and enabled for the active tier
- **THEN** Team invite workflows may become actionable and enforce the seat limit for that tier

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

The system SHALL gate branding, sender identity, tone settings, AI rewrite, and promise-to-pay tracking by tier as follows: Starter includes Paid Soon branding and excludes AI customisation, custom email sender, and promise-to-pay tracking; Business allows use of the account's own email address, includes customer tone settings (friendly, firm, final notice), basic AI rewrite of reminder messages, and promise-to-pay tracking; Accountant Partner includes all Business capabilities plus promise-to-pay tracking.

#### Scenario: User attempts to use unavailable premium capability

- **WHEN** a user attempts to use a feature not included in the active tier (such as AI rewrite on Starter or promise-to-pay tracking on Starter)
- **THEN** the system blocks the action and presents an upgrade path

#### Scenario: Business user email includes promise-to-pay link

- **WHEN** a follow-up email is sent on behalf of a Business-tier or Accountant Partner-tier user
- **THEN** the email includes a promise-to-pay link because `promise_to_pay_tracking` is enabled for those tiers

### Requirement: Tier-specific dashboard visibility
The system SHALL expose dashboard capabilities by tier such that Solo includes a basic payment status dashboard and Small Business includes an overdue invoice dashboard.

#### Scenario: Dashboard modules render for active tier
- **WHEN** a user visits dashboard views tied to payment status or overdue invoices
- **THEN** only the dashboard modules included in the active tier are shown

### Requirement: Accounting integrations are gated to Solo and above
The system SHALL restrict access to accounting provider connections (Xero, MYOB) to users
on the Solo or Small Business subscription tier. Users on the Starter tier SHALL see an
upgrade prompt when they attempt to initiate an accounting connection and SHALL NOT be able
to start an OAuth flow.

#### Scenario: Starter user attempts to connect an accounting provider
- **WHEN** a user on the Starter tier navigates to the integrations settings page and clicks any "Connect" button for an accounting provider
- **THEN** the system displays a plan upgrade prompt explaining that accounting integrations require Solo or higher, and does NOT initiate an OAuth redirect

#### Scenario: Solo user connects Xero
- **WHEN** a user on the Solo tier clicks "Connect Xero"
- **THEN** the system initiates the OAuth flow without presenting an upgrade prompt

#### Scenario: Small Business user connects MYOB
- **WHEN** a user on the Small Business tier clicks "Connect MYOB"
- **THEN** the system initiates the OAuth flow without presenting an upgrade prompt

#### Scenario: Feature check via hasPlanFeature
- **WHEN** `hasPlanFeature(tier, 'accountingIntegrations')` is called
- **THEN** it returns `true` for `'solo'` and `'small_business'` tiers and `false` for `'starter'` and legacy `'free'`

### Requirement: Reply-to entitlement starts at Solo
The system SHALL treat custom Reply-to as a Solo-and-above sender-identity capability. Starter SHALL NOT include the `custom_reply_to` entitlement.

#### Scenario: Feature check for Reply-to capability
- **WHEN** the system checks plan capability for `custom_reply_to`
- **THEN** it returns false for Starter and true for Solo, Small Business, and Accountant Partner

#### Scenario: Starter customer views sender-identity inclusions
- **WHEN** Starter plan sender-identity inclusions are presented on product surfaces
- **THEN** custom Reply-to is shown as unavailable on Starter

