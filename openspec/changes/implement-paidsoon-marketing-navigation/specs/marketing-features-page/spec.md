## ADDED Requirements

### Requirement: Features page SHALL explain all core PaidSoon capabilities
The `/features` page SHALL contain a dedicated section for each of the following capabilities: automated invoice reminders, configurable reminder schedules, AI-assisted reminder wording, promise-to-pay tracking, dispute handling and pause, debtor dashboard, weekly debtor summary reports, accountant/client visibility, custom branding, and security and audit trail.

#### Scenario: All feature sections are present
- **WHEN** a visitor loads `/features`
- **THEN** sections for automated reminders, reminder schedules, AI rewrite, promise-to-pay, dispute handling, debtor dashboard, weekly reports, accountant visibility, branding, and audit trail are all visible

### Requirement: Features page SHALL link to the pricing page
The `/features` page SHALL contain at least one CTA linking to `/pricing`.

#### Scenario: Pricing CTA is present
- **WHEN** a visitor views `/features`
- **THEN** at least one link or button routing to `/pricing` is visible

### Requirement: Features page SHALL have unique page metadata
The `/features` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the features page is rendered server-side
- **THEN** the `<title>` tag contains a unique features-specific title
- **THEN** the `<meta name="description">` contains a relevant description
