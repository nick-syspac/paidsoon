## MODIFIED Requirements

### Requirement: Public pricing surfaces SHALL describe module availability through the canonical plan catalog
The pricing page and any public plan-comparison surface SHALL describe module availability, plan fit, and upgrade positioning using the canonical subscription plan catalog and centralized entitlement logic. The pricing page SHALL include an intent selector asking which financial control problem the visitor wants to address first and SHALL map each intent to a recommended starting plan narrative.

#### Scenario: Pricing matrix reflects current module availability
- **WHEN** a visitor compares plans on the pricing page
- **THEN** the module and feature inclusions shown for each plan match the current canonical plan catalog and entitlement behavior
- **AND** the comparison does not rely on retired tier names or stale module bundles

#### Scenario: Visitor uses intent selector before plan comparison
- **WHEN** a visitor indicates they want to prioritize invoice collection, unnecessary spend reduction, cash visibility, or complete control
- **THEN** the pricing surface presents a recommended plan framing for that intent
- **AND** the recommendation preserves canonical entitlement truth instead of hard-coded divergent promises

#### Scenario: Contact-only plan remains excluded from self-serve selection
- **WHEN** a pricing or plan-comparison surface references Accountant Partner
- **THEN** it may describe the plan as contact-only context
- **AND** it does not present Accountant Partner as a self-serve selectable checkout option