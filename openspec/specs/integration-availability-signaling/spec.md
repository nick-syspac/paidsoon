# integration-availability-signaling Specification

## Purpose
Define how PaidSoon communicates integration availability in user-facing integration lists so readiness is clear, consistent, and actionable for customers evaluating accounting connectivity options.
## Requirements
### Requirement: Integration cards MUST show current availability state
The system SHALL display a normalized availability state for each supported integration across every user-facing surface that references integration status — including the homepage integrations preview, `/integrations`, the `/roadmap` "Available" list, `/faq`, and marketing `/docs` — and the state SHALL reflect the product's current supported status. All such surfaces SHALL agree with each other for a given provider at all times.

#### Scenario: MYOB Business is available
- **WHEN** a user opens any surface that lists integration cards or integration status
- **THEN** MYOB Business is shown with an Available status state

#### Scenario: Xero is available
- **WHEN** a user opens any surface that lists integration cards or integration status
- **THEN** Xero is shown with an Available status state

#### Scenario: QuickBooks Online is planned
- **WHEN** a user opens any surface that lists integration cards or integration status
- **THEN** QuickBooks Online is shown with a Planned (or equivalent "coming soon") status state, not Available or Early access

#### Scenario: Homepage integrations preview matches /integrations
- **WHEN** a user compares the homepage integrations preview against the `/integrations` page
- **THEN** the availability state shown for each provider is identical on both surfaces

#### Scenario: Roadmap "Available" list includes both live accounting integrations
- **WHEN** a user views the `/roadmap` "Available / Private beta" list
- **THEN** the list includes both Xero and MYOB Business, not MYOB alone

### Requirement: Integration card copy MUST match availability state
The system SHALL present status badge labels and descriptive copy that are semantically consistent with each integration's availability state, on every surface listed above.

#### Scenario: Available integrations do not present pre-release messaging
- **WHEN** an integration has an Available status state on any surface
- **THEN** its badge and descriptive copy on that surface do not contain planned, early-access, or other pre-release language

#### Scenario: FAQ answer matches integration availability
- **WHEN** a user reads the `/faq` answer describing supported accounting software
- **THEN** the answer states Xero and MYOB Business are available and does not describe either as planned or early access

### Requirement: Integration availability status SHALL be derived from a single shared source
The system SHALL define each provider's availability state and status copy in exactly one shared location, and every marketing surface that displays integration status SHALL read from that shared source rather than maintaining an independent, hand-written copy of the status.

#### Scenario: Provider status changes once, reflects everywhere
- **WHEN** a provider's availability state is updated in the shared source
- **THEN** every marketing surface that displays that provider's status reflects the update without requiring a separate edit on each page

