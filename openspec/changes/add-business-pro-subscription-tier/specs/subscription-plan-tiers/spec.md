## MODIFIED Requirements

### Requirement: Canonical subscription tiers and pricing
The system SHALL define exactly four paid public subscription tiers with fixed monthly prices: Starter at $9/month, Solo at $19/month, Small Business at $39/month, and Business Pro at $99/month.

#### Scenario: Plan catalog is requested
- **WHEN** the application loads subscription plan metadata for checkout or plan display
- **THEN** it returns Starter ($9/month), Solo ($19/month), Small Business ($39/month), and Business Pro ($99/month) with stable internal plan identifiers

### Requirement: Tier invoice-chasing limits

The system SHALL define a monthly chased-invoice allowance per tier: Starter 10, Solo 50, Small Business 200, and Business Pro 1000. Accountant Partner SHALL have no fixed allowance. The allowance SHALL be consumed once per invoice at its first reminder, measured over the account's current billing period, and reaching it SHALL pause new chases without interrupting sequences already in progress, as defined by the `chase-volume-entitlement` capability.

#### Scenario: Plan allowance is requested

- **WHEN** the application reads the chased-invoice allowance for a tier
- **THEN** it returns 10 for Starter, 50 for Solo, 200 for Small Business, and 1000 for Business Pro

#### Scenario: Allowance is displayed on the pricing page

- **WHEN** the pricing page renders tier volume limits
- **THEN** the displayed figures match the allowances defined in the plan catalog

#### Scenario: User reaches monthly chased-invoice limit

- **WHEN** an account at a given tier has consumed its tier allowance within the current
  billing period
- **THEN** new invoices are not chased until the next period, and the account is shown an
  upgrade path

### Requirement: Tier user seat limits
The system SHALL define user-seat limits by tier: Starter allows 1 user, Solo allows 1 user, Small Business allows up to 3 users, and Business Pro allows up to 10 users. While Team seats are not implemented, these limits SHALL be presented as plan context only and Team invite workflows SHALL remain non-actionable.

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

### Requirement: Accounting integrations are gated to Solo and above
The system SHALL restrict access to accounting provider connections (Xero, MYOB) to users
on the Solo, Small Business, or Business Pro subscription tier. Users on the Starter tier SHALL see an
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
- **THEN** it returns `true` for `'solo'`, `'small_business'`, and `'business_pro'` tiers and `false` for `'starter'` and legacy `'free'`

### Requirement: Subscription plan selector defaults to the current plan
The subscription settings plan selector SHALL highlight the user's current subscription tier when no valid public-plan selection intent is present.

An explicit `plan` query parameter SHALL override the initial highlight only when it identifies a public, customer-selectable tier. Missing, invalid, or contact-only values SHALL be treated as no selection intent and SHALL NOT fall back to Starter.

After the page loads, an explicit user selection SHALL take precedence over both query-based selection intent and the current tier.

#### Scenario: Normal settings navigation highlights current plan
- **WHEN** a Solo subscriber opens Settings → Subscription without a `plan` query parameter
- **THEN** Solo is highlighted in the plan selector
- **AND** Starter is not selected by default

#### Scenario: Valid public-plan deep link overrides initial highlight
- **WHEN** a Solo subscriber opens Settings → Subscription with `?plan=small_business`
- **THEN** Small Business is highlighted initially
- **AND** the user's current plan remains displayed as Solo

#### Scenario: Valid Business Pro deep link overrides initial highlight
- **WHEN** a Small Business subscriber opens Settings → Subscription with `?plan=business_pro`
- **THEN** Business Pro is highlighted initially
- **AND** the user's current plan remains displayed as Small Business

#### Scenario: Invalid plan intent falls back to current plan
- **WHEN** a Solo subscriber opens Settings → Subscription with an unknown `plan` value
- **THEN** Solo is highlighted
- **AND** the unknown value is not normalized to Starter

#### Scenario: Contact-only plan intent falls back to current plan
- **WHEN** a Solo subscriber opens Settings → Subscription with `?plan=accountant_partner`
- **THEN** Solo is highlighted
- **AND** the contact-only plan is not selected or exposed in the public plan selector

#### Scenario: User selection has highest precedence
- **WHEN** the selector initially highlights a plan from the current tier or a valid `plan` query parameter
- **AND** the user selects a different public plan
- **THEN** the newly selected plan is highlighted
