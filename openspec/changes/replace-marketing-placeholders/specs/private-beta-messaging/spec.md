## ADDED Requirements

### Requirement: Private-beta banner SHALL communicate beta status and early access path
The top-of-page site banner displayed in not-live mode SHALL say "PaidSoon is currently in private beta. Public sign-up is opening soon — contact us if you would like early access." It SHALL NOT say "This site is not live yet. Sign in and sign up are currently disabled."

#### Scenario: Visitor loads site in not-live mode
- **WHEN** launch mode is not-live and a visitor loads any page
- **THEN** the top banner reads "PaidSoon is currently in private beta. Public sign-up is opening soon — contact us if you would like early access."
- **THEN** the banner does not say "This site is not live yet" or "Sign in and sign up are currently disabled"

#### Scenario: No banner in live mode
- **WHEN** launch mode is live and a visitor loads any page
- **THEN** no beta banner is rendered (existing behaviour — unchanged)

### Requirement: Navigation primary CTA SHALL reflect beta state
In not-live mode, the navigation primary call-to-action button SHALL be labelled "Request early access" and link to `/contact`. It SHALL NOT be labelled "Start Free Trial" or link to `/pricing` when sign-up is not available.

#### Scenario: Visitor sees nav CTA in not-live mode
- **WHEN** launch mode is not-live and a visitor views the marketing nav (desktop)
- **THEN** the primary button reads "Request early access" and navigates to `/contact`

#### Scenario: Visitor sees nav CTA on mobile in not-live mode
- **WHEN** launch mode is not-live and a visitor opens the mobile navigation
- **THEN** the primary button reads "Request early access" and navigates to `/contact`

### Requirement: Homepage hero CTA SHALL reflect beta state
In not-live mode, the homepage hero primary call-to-action SHALL be labelled "Request early access" and link to `/contact`. It SHALL NOT be labelled "Start Free Trial".

#### Scenario: Visitor reads homepage hero in not-live mode
- **WHEN** launch mode is not-live and a visitor loads the homepage
- **THEN** the primary hero CTA reads "Request early access" and navigates to `/contact`

## MODIFIED Requirements

### Requirement: Not-live banner SHALL be displayed in not-live mode
The system SHALL render a prominent top-of-page banner indicating the site is in private beta whenever launch mode is not-live. The banner text SHALL be "PaidSoon is currently in private beta. Public sign-up is opening soon — contact us if you would like early access."

#### Scenario: Not-live banner visible
- **WHEN** launch mode is not-live and a user loads the app
- **THEN** a top banner is shown with the private-beta messaging

#### Scenario: Not-live banner hidden in live mode
- **WHEN** launch mode is live and a user loads the app
- **THEN** no not-live banner is rendered
