## MODIFIED Requirements

### Requirement: Public pricing surfaces SHALL describe module availability through the canonical plan catalog
The pricing page and any public plan-comparison surface SHALL describe module availability, plan fit, upgrade positioning, and public price signals using the canonical subscription plan catalog and centralized entitlement logic. Any metadata or structured offer data exposed on those public surfaces SHALL match the current public catalog and SHALL NOT retain retired tier names or stale prices.

#### Scenario: Pricing matrix reflects current module availability
- **WHEN** a visitor compares plans on the pricing page
- **THEN** the module and feature inclusions shown for each plan match the current canonical plan catalog and entitlement behavior
- **AND** the comparison does not rely on retired tier names or stale module bundles

#### Scenario: Metadata and structured pricing reflect the live catalog
- **WHEN** a crawler or visitor reads the pricing page metadata or structured data
- **THEN** the public prices and plan names match the current canonical catalog
- **AND** retired or superseded pricing values do not appear in that metadata output

#### Scenario: Contact-only plan remains excluded from self-serve selection
- **WHEN** a pricing or plan-comparison surface references Accountant Partner
- **THEN** it may describe the plan as contact-only context
- **AND** it does not present Accountant Partner as a self-serve selectable checkout option
