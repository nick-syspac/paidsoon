## ADDED Requirements

### Requirement: Runbook index lists all available runbooks
The system SHALL provide a page at `/admin/runbooks` that lists all registered runbooks with their title, associated diagnostic ID, and severity. Each entry SHALL link to `/admin/runbooks/[slug]`.

#### Scenario: Admin navigates to runbook index
- **WHEN** an admin navigates to `/admin/runbooks`
- **THEN** a list of all runbooks is displayed, each with a title and link to the full runbook

---

### Requirement: Individual runbook page renders prose content
The system SHALL provide a page at `/admin/runbooks/[slug]` that renders the full prose content of the runbook for that slug. Content SHALL include: what the issue is, why it happens, how to diagnose it further, and the recommended resolution steps. The page SHALL link back to the runbook index.

#### Scenario: Admin views a runbook
- **WHEN** an admin navigates to `/admin/runbooks/custom-from-unverified`
- **THEN** the full prose runbook for that diagnostic is rendered

#### Scenario: Unknown slug returns 404
- **WHEN** an admin navigates to `/admin/runbooks/[slug]` with an unregistered slug
- **THEN** a 404 page is rendered

---

### Requirement: Diagnostic issue cards link to their runbook
Each diagnostic issue card rendered on the tenant detail view SHALL include a "View runbook →" link that navigates to `/admin/runbooks/[slug]` for the diagnostic's associated runbook.

#### Scenario: Issue card shows runbook link
- **WHEN** a diagnostic issue card is rendered on the tenant detail page
- **THEN** a "View runbook →" link is visible that navigates to the correct runbook page

---

### Requirement: MVP runbooks cover all implemented diagnostics
The system SHALL ship with a runbook registered for each of the following diagnostic slugs: `custom-from-unverified`, `trial-lapsed`, `stripe-connect-disconnected`, `sync-stale`, `no-invoices-tracked`. Each runbook SHALL include at minimum: a one-sentence description of the issue, the probable cause, and the recommended resolution step (including which corrective action to use, if applicable).

#### Scenario: All diagnostic slugs have runbooks
- **WHEN** the runbook registry is evaluated at runtime
- **THEN** each of the five MVP diagnostic slugs resolves to a non-null runbook object
