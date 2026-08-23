## ADDED Requirements

### Requirement: Marketing CTA SHALL reflect launch mode
The primary marketing call-to-action (desktop nav, mobile nav, and homepage hero) SHALL be
labelled "Request early access" and link to `/contact` when launch mode is not-live, and SHALL
be labelled "Start Free Trial" and link to `/sign-up` when launch mode is live.

#### Scenario: CTA in not-live mode
- **WHEN** launch mode is not-live and a user views the marketing nav or homepage hero
- **THEN** the primary CTA reads "Request early access" and navigates to `/contact`

#### Scenario: CTA in live mode
- **WHEN** launch mode is live and a user views the marketing nav or homepage hero
- **THEN** the primary CTA reads "Start Free Trial" and navigates to `/sign-up`
