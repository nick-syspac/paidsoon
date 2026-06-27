## ADDED Requirements

### Requirement: Legal pages SHALL not contain raw placeholder text
All legal and policy pages (`/privacy`, `/terms`, `/cookies`, `/security`, `/acceptable-use`) SHALL contain substantive draft text in every section. No section SHALL render a `[PLACEHOLDER]` string, "[see footer]", or "not legally binding" in the page body.

#### Scenario: Visitor loads Privacy Policy
- **WHEN** a visitor navigates to `/privacy`
- **THEN** all sections contain prose text — no `[PLACEHOLDER]` strings
- **THEN** the ABN is shown as `12 657 226 125` not `[see footer]`
- **THEN** the page does not say the content is "not legally binding"

#### Scenario: Visitor loads Terms of Service
- **WHEN** a visitor navigates to `/terms`
- **THEN** "Use of the service", "Subscription and billing", and "Limitation of liability" sections each contain substantive draft text
- **THEN** the page does not say the content is "not legally binding"

#### Scenario: Visitor loads Cookie Policy
- **WHEN** a visitor navigates to `/cookies`
- **THEN** the "Managing cookies" section contains complete text
- **THEN** the page does not say the content is "not legally binding"

#### Scenario: Visitor loads Security page
- **WHEN** a visitor navigates to `/security`
- **THEN** the "Infrastructure" section describes the actual stack (Vercel, Supabase, Stripe Connect)
- **THEN** additional sections (Access control, Audit logging, Responsible disclosure) are present

#### Scenario: Visitor loads Acceptable Use Policy
- **WHEN** a visitor navigates to `/acceptable-use`
- **THEN** the "Enforcement" section describes consequences and actions
- **THEN** an "Email reminder rules" section is present

### Requirement: Legal pages SHALL carry a draft review notice
All legal pages SHALL include a visible header notice stating the content is a draft pending legal review. The notice SHALL NOT say the content is "not legally binding" or include `[PLACEHOLDER]` text.

#### Scenario: Visitor reads the draft notice
- **WHEN** a visitor loads any legal or policy page
- **THEN** a notice is visible that reads "Draft — pending legal review" or similar wording
- **THEN** the notice does not include `[PLACEHOLDER]` text

### Requirement: ABN SHALL appear correctly on the Privacy Policy page
The privacy policy page SHALL show the ABN as `12 657 226 125` (Syspac Pty Ltd) wherever the business identity is stated.

#### Scenario: Privacy page ABN display
- **WHEN** a visitor loads `/privacy`
- **THEN** the business ABN reads `12 657 226 125`
- **THEN** no `[see footer]` placeholder text is visible
