## ADDED Requirements

### Requirement: How It Works page SHALL explain the end-to-end workflow
The `/how-it-works` page SHALL present the complete PaidSoon workflow in a step-by-step format covering at least: (1) connect accounting software, (2) import unpaid invoices, (3) configure reminder templates and schedule, (4) PaidSoon sends reminders automatically, (5) promise-to-pay and disputes are tracked, (6) weekly debtor summary is delivered.

#### Scenario: All six workflow steps are present
- **WHEN** a visitor loads `/how-it-works`
- **THEN** at least six numbered or sequenced steps describing the full workflow are visible

### Requirement: How It Works page SHALL include a primary CTA
The `/how-it-works` page SHALL include at least one CTA linking to `/pricing` or `/sign-up` (via `/pricing`).

#### Scenario: CTA is present
- **WHEN** a visitor views `/how-it-works`
- **THEN** at least one CTA routing to `/pricing` is visible

### Requirement: How It Works page SHALL have unique page metadata
The `/how-it-works` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the how-it-works page is rendered server-side
- **THEN** the `<title>` tag contains a unique page-specific title
