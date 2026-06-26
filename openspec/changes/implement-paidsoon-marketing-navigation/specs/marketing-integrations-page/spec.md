## ADDED Requirements

### Requirement: Integrations page SHALL list all integrations with accurate availability status
The `/integrations` page SHALL display cards or entries for: Stripe Connect (available), MYOB (coming soon), Xero (coming soon), QuickBooks (coming soon). Integrations not yet implemented MUST be labelled "Coming soon". No integration SHALL be described as available unless it is implemented in the codebase.

#### Scenario: Stripe Connect is displayed as available
- **WHEN** a visitor loads `/integrations`
- **THEN** Stripe Connect is listed with an "Available" or active status indicator

#### Scenario: MYOB is labelled coming soon
- **WHEN** a visitor views the integrations page
- **THEN** MYOB is displayed with a "Coming soon" label

#### Scenario: Xero is labelled coming soon
- **WHEN** a visitor views the integrations page
- **THEN** Xero is displayed with a "Coming soon" label

#### Scenario: QuickBooks is labelled coming soon
- **WHEN** a visitor views the integrations page
- **THEN** QuickBooks is displayed with a "Coming soon" label

### Requirement: Integrations page SHALL link to the contact page for integration requests
The `/integrations` page SHALL include a CTA or note encouraging visitors to contact PaidSoon to request additional integrations, routing to `/contact`.

#### Scenario: Integration request CTA is present
- **WHEN** a visitor views `/integrations`
- **THEN** a link or button routing to `/contact` for integration enquiries is visible

### Requirement: Integrations page SHALL have unique page metadata
The `/integrations` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the integrations page is rendered server-side
- **THEN** the `<title>` tag contains an integrations-specific title
