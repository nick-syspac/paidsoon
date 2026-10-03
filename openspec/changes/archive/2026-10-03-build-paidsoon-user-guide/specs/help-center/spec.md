## ADDED Requirements

### Requirement: Help center MUST provide a structured user guide journey
The help center SHALL provide a clearly structured user guide journey that helps a new customer move from account setup to daily operation without relying on external support. The journey SHALL be organized into stable guide sections and exposed through help navigation.

#### Scenario: User guide sections are visible in help navigation
- **WHEN** a user opens the help center navigation
- **THEN** they SHALL see guide sections for onboarding, billing and subscription, invoice workflows, integrations, and account/settings

#### Scenario: User can complete setup using the guide alone
- **WHEN** a new user follows onboarding and first-workflow guide pages in order
- **THEN** the guide SHALL provide enough instructions to connect Stripe, import or sync invoices, and configure reminders without requiring undocumented steps

### Requirement: User guide content MUST map to shipped capabilities
Each user guide page SHALL map to implemented behavior in the product and MUST identify the affected plan or entitlement where relevant. Pages SHALL avoid describing scaffolded or planned behavior as available.

#### Scenario: Guide page references an unimplemented feature
- **WHEN** a guide page claims that a feature is available but that feature is listed in `UNIMPLEMENTED_FEATURES`
- **THEN** that guide page SHALL be rejected from publication until the claim is corrected

#### Scenario: Plan-gated action is documented with eligibility
- **WHEN** a guide page describes an action that requires a higher plan feature
- **THEN** the page SHALL explicitly state the minimum eligible plan tier or feature gate for that action

### Requirement: User guide pages MUST include verification and maintenance metadata
User guide pages SHALL include ownership and recency metadata so the team can maintain accuracy over time. The content workflow SHALL support a repeatable verification pass.

#### Scenario: Page lacks verification metadata
- **WHEN** a new or updated guide page is prepared for publication
- **THEN** it SHALL include `lastVerified` and an owner identifier before it is accepted

#### Scenario: Stale content is detectable
- **WHEN** the team runs the guide maintenance review
- **THEN** pages with outdated `lastVerified` dates SHALL be identifiable for revalidation and update
