# owners-digest-dashboard Specification

## Purpose

Define the executive dashboard experience for Owner's Digest so an authorised user can understand the business's most important financial changes, risks, opportunities, and next actions in under a minute across desktop and mobile.

## Requirements

### Requirement: Owner's Digest SHALL provide a dedicated authenticated dashboard surface

The system SHALL provide an authenticated Owner's Digest route within the dashboard area and SHALL treat it as a first-class FinOps module with the same session and tenant protections as other dashboard modules.

#### Scenario: Authorised user opens Owner's Digest

- **WHEN** an authorised user navigates to the Owner's Digest dashboard route
- **THEN** the system renders the current digest briefing with executive summary, ranked sections, and last-generated metadata

#### Scenario: Unauthenticated request targets Owner's Digest

- **WHEN** a request is made to the Owner's Digest route without a valid session
- **THEN** the system applies the existing dashboard authentication behavior and does not reveal consolidated financial information

### Requirement: Owner's Digest SHALL emphasize prioritised actions and drill-down paths

The current digest view SHALL surface a compact executive summary, a needs-attention section, opportunity and positive-change sections when materially present, and key numbers. Actionable items SHALL include recommended action text, source module labeling, and a deep link to the relevant module or record.

#### Scenario: Digest contains actionable items

- **WHEN** the current digest includes one or more ranked issues
- **THEN** the default attention section shows the highest-priority owner actions first
- **AND** each actionable item includes why it matters and a view-details path back to the source module

#### Scenario: Digest contains meaningful positive changes

- **WHEN** the period includes material improvements such as better runway or reduced overdue balances
- **THEN** the digest surfaces them in a distinct positive-changes section
- **AND** trivial improvements are omitted

### Requirement: Owner's Digest SHALL support historical snapshot browsing

The system SHALL provide a digest history list and a historical digest view that open the stored snapshot for a selected reporting period.

#### Scenario: User opens digest history

- **WHEN** an authorised user views the Owner's Digest history surface
- **THEN** the system lists prior digests by reporting date and overall status

#### Scenario: User opens a historical digest

- **WHEN** the user selects a prior digest entry
- **THEN** the system renders the stored snapshot for that reporting period instead of recalculating today's view

### Requirement: Owner's Digest SHALL communicate freshness, empty states, and degraded completeness

The dashboard SHALL display data-as-of information and clear empty or degraded states for missing history, missing source data, and partial provider failures.

#### Scenario: Tenant has no connected financial data

- **WHEN** the tenant lacks the source data required to produce a meaningful digest
- **THEN** the dashboard shows a setup-oriented empty state explaining what data connection or import is needed

#### Scenario: Digest generated with partial provider failure

- **WHEN** one enabled provider failed but the digest still generated from other providers
- **THEN** the dashboard shows that the digest is partial and identifies that some module data was unavailable
