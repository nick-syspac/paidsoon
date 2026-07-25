## MODIFIED Requirements

### Requirement: Canonical subscription tiers and pricing

The system SHALL define exactly three customer-selectable subscription tiers with fixed
monthly prices in Australian dollars, inclusive of GST: Starter at $9/month, Solo at
$19/month, and Small Business at $39/month. The system SHALL additionally define one
contact-only tier, Accountant Partner, which has no fixed price. Tier identifiers SHALL be
`starter`, `solo`, `small_business`, and `accountant_partner`.

#### Scenario: Plan catalog is requested

- **WHEN** the application loads subscription plan metadata for checkout or plan display
- **THEN** it returns Starter ($9/month), Solo ($19/month), and Small Business ($39/month)
  with the stable identifiers `starter`, `solo`, and `small_business`, plus Accountant
  Partner with no fixed price

#### Scenario: Displayed price is presented to a customer

- **WHEN** a plan price is shown on any customer-facing surface
- **THEN** the amount is stated in Australian dollars and identified as inclusive of GST

#### Scenario: Checkout is started for a tier

- **WHEN** a customer starts Stripe Checkout for a tier
- **THEN** the amount charged equals the price displayed for that tier on the pricing page

### Requirement: Tier invoice-chasing limits

The system SHALL define a monthly chased-invoice allowance per tier: Starter 10, Solo 50,
and Small Business 200. Accountant Partner SHALL have no fixed allowance. Enforcement
semantics for these allowances are defined by the `chase-volume-entitlement` capability.

#### Scenario: Plan allowance is requested

- **WHEN** the application reads the chased-invoice allowance for a tier
- **THEN** it returns 10 for Starter, 50 for Solo, and 200 for Small Business

#### Scenario: Allowance is displayed on the pricing page

- **WHEN** the pricing page renders tier volume limits
- **THEN** the displayed figures match the allowances defined in the plan catalog

### Requirement: Tier user seat limits

The system SHALL define internal-user seat limits by tier: Starter 1 user, Solo 1 user, and
Small Business 3 users. Where the seat capability is not yet implemented, the system SHALL
present the limit as forthcoming rather than as available.

#### Scenario: User invite exceeds plan seat cap

- **WHEN** an account admin invites a user that would exceed the active tier seat limit
- **THEN** the system rejects the invite and provides a plan-limit upgrade message

#### Scenario: Seat allowance is displayed before seats are implemented

- **WHEN** the pricing page renders the Small Business seat allowance while multi-user seats
  are not implemented
- **THEN** the allowance is labelled as forthcoming and is not presented as an available
  capability

### Requirement: Tier Stripe account connection limits

The system SHALL limit every customer-selectable tier to one connected invoice source,
whether that source is a Stripe Connect account or an accounting connection. Accountant
Partner SHALL be exempt from this limit.

#### Scenario: Additional invoice source connection over limit

- **WHEN** an account on Starter, Solo, or Small Business attempts to connect a second
  invoice source
- **THEN** the system denies the connection and explains the plan limit

#### Scenario: Contact-only tier connects multiple sources

- **WHEN** an account on Accountant Partner connects more than one invoice source
- **THEN** the system permits the connection

### Requirement: Tier-specific reminder and template capabilities

The system SHALL gate reminder sequence and template capabilities by tier as follows: Starter
includes the standard Friendly, Firm and Final Notice sequence on the default schedule, and
permits editing of business name, signature and payment details only; Solo includes one fully
customisable sequence with custom timing and fully editable templates; Small Business
includes multiple templates, customer-specific wording, and customer-group timing. Where a
capability is not yet implemented, the system SHALL present it as forthcoming rather than as
available.

#### Scenario: User accesses reminder/template features for their tier

- **WHEN** a user opens reminder and template settings
- **THEN** only the capabilities included in the account's active tier are available for
  configuration and use

#### Scenario: Starter user edits a template

- **WHEN** a Starter user opens the template editor
- **THEN** only business name, signature and payment details are editable, and the remaining
  template body is presented as an upgrade capability

### Requirement: Tier-specific branding, sender identity, and AI capabilities

The system SHALL gate sender identity and AI capabilities by tier as follows: Starter sends
from the PaidSoon system address with a customer-supplied reply-to address; Solo adds a
custom sender name alongside the custom reply-to address; Small Business adds a verified
custom from-address or domain, permitted only when the domain is verified with the email
provider. AI reminder rewriting SHALL be available on Solo and Small Business and SHALL NOT
be available on Starter.

#### Scenario: Starter user configures sending identity

- **WHEN** a Starter user saves email settings
- **THEN** the system stores the reply-to address and continues to send from the PaidSoon
  system address

#### Scenario: Small Business user configures an unverified custom from-address

- **WHEN** a Small Business user sets a custom from-address whose domain is not verified with
  the email provider
- **THEN** the system falls back to the PaidSoon system address for sending

#### Scenario: Starter user attempts AI rewrite

- **WHEN** a Starter user requests an AI rewrite of a reminder message
- **THEN** the system blocks the action and presents an upgrade path

### Requirement: Core follow-up capabilities available on every paid tier

The system SHALL make the core invoice follow-up workflow available on every
customer-selectable tier without gating: invoice synchronisation and overdue detection, the
Friendly/Firm/Final Notice progression, automatic stopping when an invoice is paid,
promise-to-pay tracking, dispute pause, the debtor dashboard, and reminder activity history.

#### Scenario: Starter user views the debtor dashboard

- **WHEN** a Starter user opens the debtor dashboard
- **THEN** the dashboard renders their overdue invoices and reminder activity history without
  an upgrade prompt for access

#### Scenario: Follow-up email is sent for a Starter user

- **WHEN** a follow-up email is sent on behalf of a Starter-tier user
- **THEN** the email includes a promise-to-pay link, because promise-to-pay tracking is
  available on every paid tier

## ADDED Requirements

### Requirement: Tier visibility

The system SHALL mark each tier as either publicly listed or contact-only. Contact-only tiers
SHALL NOT appear in customer-facing plan listings, plan pickers, or upgrade recommendations,
and SHALL remain resolvable by identifier for administrative and support purposes.

#### Scenario: Pricing page renders plan listings

- **WHEN** the pricing page or the onboarding plan picker renders available plans
- **THEN** only publicly listed tiers are shown, and Accountant Partner is excluded

#### Scenario: Highest public tier reaches its allowance

- **WHEN** an account on the highest publicly listed tier approaches its chased-invoice
  allowance
- **THEN** the system does not recommend upgrading to a contact-only tier

#### Scenario: Support views an account on a contact-only tier

- **WHEN** an administrator views an account whose tier is contact-only
- **THEN** the tier resolves to its full plan definition, including name and limits

### Requirement: Displayed plan information derives from the canonical catalog

The system SHALL derive every displayed plan name, price, and limit from the canonical plan
catalog. Plan names, prices, and limits SHALL NOT be independently declared by presentation
code.

#### Scenario: A plan price changes in the catalog

- **WHEN** a plan's price is changed in the canonical plan catalog
- **THEN** the pricing page, its page metadata, and the onboarding plan picker all reflect the
  new price with no further edits

#### Scenario: Most-popular plan is highlighted

- **WHEN** the pricing page renders plan cards
- **THEN** the plan marked as most popular in the catalog is highlighted, and no presentation
  code independently designates a different plan

### Requirement: Unimplemented capabilities are presented as forthcoming

The system SHALL NOT present a capability as available on any tier unless that capability is
implemented. Capabilities that are planned but not implemented SHALL be labelled as
forthcoming wherever they appear in plan listings.

#### Scenario: Plan listing includes a planned capability

- **WHEN** a plan listing includes a capability that is not yet implemented, such as the
  weekly debtor summary, CSV export, approval mode, customer suppression, multi-user seats,
  or customer-specific sequences
- **THEN** the capability is labelled as forthcoming and is not shown as an included feature

#### Scenario: A planned capability is implemented

- **WHEN** a previously forthcoming capability becomes implemented
- **THEN** enabling it for the intended tiers requires only a change to the canonical plan
  catalog

## REMOVED Requirements

### Requirement: Tier-specific dashboard visibility

**Reason**: The debtor dashboard is part of the core follow-up promise and is no longer gated
by tier. Dashboard availability is now covered by "Core follow-up capabilities available on
every paid tier".

**Migration**: Remove tier conditions from dashboard rendering. Accounts on every
customer-selectable tier see the payment status and overdue invoice views.
