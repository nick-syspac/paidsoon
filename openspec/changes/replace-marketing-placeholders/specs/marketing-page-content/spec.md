## ADDED Requirements

### Requirement: Marketing pages SHALL contain production-ready draft prose
Every public marketing page SHALL render complete, substantive draft content in place of placeholder components or placeholder strings. No page SHALL display a `PlaceholderPage` amber banner, a `[PLACEHOLDER]` string, "Coming soon — this page is a placeholder", or "Content is being prepared".

#### Scenario: Visitor loads the About page
- **WHEN** a visitor navigates to `/about`
- **THEN** the page displays the PaidSoon company description, mission, and Syspac Pty Ltd details without any placeholder banner or placeholder text

#### Scenario: Visitor loads the Blog page
- **WHEN** a visitor navigates to `/blog`
- **THEN** the page displays article teasers and a call to contact without any placeholder banner

#### Scenario: Visitor loads the Careers page
- **WHEN** a visitor navigates to `/careers`
- **THEN** the page states there are no current openings and invites speculative contact without any placeholder banner

#### Scenario: Visitor loads the Roadmap page
- **WHEN** a visitor navigates to `/roadmap`
- **THEN** the page lists features available in private beta, planned next features, and later features without any placeholder banner

#### Scenario: Visitor loads the Help Centre page
- **WHEN** a visitor navigates to `/help`
- **THEN** the page displays getting-started steps, common tasks, and a support email link without any placeholder banner

#### Scenario: Visitor loads the Documentation page
- **WHEN** a visitor navigates to `/docs`
- **THEN** the page displays current documentation areas and a support email link without any placeholder banner

#### Scenario: Visitor loads the Release Notes page
- **WHEN** a visitor navigates to `/release-notes`
- **THEN** the page describes the private-beta scope and upcoming updates without any placeholder banner

#### Scenario: Visitor loads the FAQ page
- **WHEN** a visitor navigates to `/faq`
- **THEN** the page displays the full FAQ without the amber placeholder banner wrapping it

### Requirement: Integration names and statuses SHALL be accurate
The integrations page SHALL name integrations accurately (MYOB Business, QuickBooks Online) and use "Planned" as the status label for not-yet-available integrations instead of "Coming soon".

#### Scenario: Visitor views integrations page
- **WHEN** a visitor navigates to `/integrations`
- **THEN** Stripe Connect is shown with an "Available" / "Private beta" status
- **THEN** MYOB Business, Xero, and QuickBooks Online are each shown with a "Planned" status badge
- **THEN** the MYOB entry does not reference "AccountRight and Essentials"

### Requirement: Accountants page SHALL not contain TBA wording
The accountants page SHALL list partner benefits using complete descriptive copy with no "TBA" abbreviation.

#### Scenario: Accountant visits the partner page
- **WHEN** a visitor navigates to `/accountants`
- **THEN** partner benefits are listed with complete descriptions and no "details TBA" text

### Requirement: Contact page demo CTA SHALL use correct label and destination
The contact page SHALL use the label "Request a demo" and link to `/contact?type=demo` rather than "Book a demo" or `/contact?type=Sales`.

#### Scenario: Visitor clicks demo CTA
- **WHEN** a visitor views the contact page
- **THEN** the demo call-to-action is labelled "Request a demo →"
- **THEN** the demo link points to `/contact?type=demo`
