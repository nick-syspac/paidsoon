## ADDED Requirements

### Requirement: Homepage SHALL include a hero section with primary CTA
The homepage (`/`) SHALL render a hero section above the fold containing a value proposition headline, a supporting subheading, a primary `Start Free Trial` CTA (routing to `/pricing`), and a secondary CTA (routing to `/how-it-works` or anchoring to a page section).

#### Scenario: Hero is visible on load
- **WHEN** a visitor loads `/`
- **THEN** the hero headline, supporting text, and primary CTA are visible without scrolling on a standard desktop viewport

#### Scenario: Primary CTA routes to /pricing
- **WHEN** a visitor clicks `Start Free Trial` in the hero
- **THEN** they are routed to `/pricing`

### Requirement: Homepage SHALL include a problem section
The homepage SHALL render a section that articulates the core problem: businesses waste time manually chasing overdue invoices, follow-ups are inconsistent, and cash flow suffers.

#### Scenario: Problem section content is present
- **WHEN** a visitor scrolls to the problem section
- **THEN** at least three problem statements relating to invoice collection pain points are visible

### Requirement: Homepage SHALL include a solution section
The homepage SHALL render a section explaining PaidSoon's solution: automated monitoring of unpaid invoices, escalating reminder emails, and promise-to-pay / dispute tracking.

#### Scenario: Solution section content is present
- **WHEN** a visitor scrolls to the solution section
- **THEN** content describing automated reminders and debtor tracking is visible

### Requirement: Homepage SHALL include a how-it-works preview
The homepage SHALL render a condensed how-it-works section with at least four steps: connect accounting software, configure schedule, PaidSoon monitors invoices, customers receive reminders.

#### Scenario: How-it-works steps are visible
- **WHEN** a visitor scrolls to the how-it-works section
- **THEN** at least four workflow steps are displayed
- **THEN** a "See how it works" or equivalent link routes to `/how-it-works`

### Requirement: Homepage SHALL include feature highlights
The homepage SHALL display highlight cards or icons for at least six features: automated invoice reminders, reminder templates, promise-to-pay tracking, dispute pause, debtor dashboard, and weekly debtor summary.

#### Scenario: Feature highlights are visible
- **WHEN** a visitor scrolls to the features section
- **THEN** at least six feature highlights are displayed
- **THEN** a "See all features" or equivalent link routes to `/features`

### Requirement: Homepage SHALL include an integrations section
The homepage SHALL display a section listing accounting and payment integrations. Unimplemented integrations SHALL be labelled "Coming soon".

#### Scenario: Integrations section is visible
- **WHEN** a visitor scrolls to the integrations section
- **THEN** Stripe Connect is displayed as available
- **THEN** MYOB, Xero, and QuickBooks are displayed with a "Coming soon" label

### Requirement: Homepage SHALL include a pricing preview
The homepage SHALL display a pricing preview section showing the three plan names and prices (Starter $19/mo, Business $49/mo, Accountant Partner — Contact us) with a link to `/pricing`.

#### Scenario: Pricing preview renders plan names
- **WHEN** a visitor scrolls to the pricing preview
- **THEN** Starter, Business, and Accountant Partner plan names are visible

### Requirement: Homepage SHALL include a trust section
The homepage SHALL render a trust section that references "Australian owned and operated", "Syspac Pty Ltd", and secure invoice data handling.

#### Scenario: Trust section content is present
- **WHEN** a visitor scrolls to the trust section
- **THEN** at least one of the trust statements is visible

### Requirement: Homepage SHALL include a final CTA section
The homepage SHALL include a closing call-to-action section with a `Start Free Trial` button routing to `/pricing`.

#### Scenario: Final CTA is present at page bottom
- **WHEN** a visitor reaches the bottom of the homepage
- **THEN** a `Start Free Trial` or equivalent CTA is visible routing to `/pricing`

### Requirement: Homepage SHALL have unique page metadata
The homepage SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the homepage is rendered server-side
- **THEN** the `<title>` tag contains a unique page title
- **THEN** the `<meta name="description">` contains a relevant description
