## MODIFIED Requirements

### Requirement: Integration cards MUST show current availability state
The system SHALL display a normalized availability state for each supported integration across every user-facing surface that references integration status, including the homepage integrations preview, `/integrations`, the `/roadmap` available list, `/faq`, marketing documentation, and any provider-specific integration landing page index. All such surfaces SHALL agree with each other for a given provider at all times. When an available integration is presented as a selectable marketing destination, that surface SHALL link to the provider's canonical landing page.

#### Scenario: MYOB Business is available
- **WHEN** a user opens any surface that lists integration cards or integration status
- **THEN** MYOB Business is shown with an Available status state

#### Scenario: Xero is available
- **WHEN** a user opens any surface that lists integration cards or integration status
- **THEN** Xero is shown with an Available status state

#### Scenario: QuickBooks Online is planned
- **WHEN** a user opens any surface that lists integration cards or integration status
- **THEN** QuickBooks Online is shown with a Planned or equivalent coming-soon status state, not Available or Early access

#### Scenario: Homepage integrations preview matches /integrations
- **WHEN** a user compares the homepage integrations preview against the `/integrations` page
- **THEN** the availability state shown for each provider is identical on both surfaces

#### Scenario: Roadmap "Available" list includes both live accounting integrations
- **WHEN** a user views the `/roadmap` available list
- **THEN** the list includes both Xero and MYOB Business, not MYOB alone

#### Scenario: Available integrations link to provider destinations
- **WHEN** a user selects an available integration from a marketing surface
- **THEN** the link resolves to that provider's canonical landing page rather than a generic placeholder or dead end
