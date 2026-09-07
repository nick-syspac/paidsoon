## ADDED Requirements

### Requirement: Pricing page SHALL render plan comparisons from canonical plan configuration
The pricing page SHALL render plan names, prices, and included capabilities from the canonical subscription-plan configuration and SHALL NOT use hardcoded plan marketing data that can drift from billing behavior.

#### Scenario: Pricing data is rendered
- **WHEN** a visitor opens `/pricing`
- **THEN** each published customer-selectable plan card SHALL display plan title, billing amount, and key included capabilities sourced from canonical plan configuration.

#### Scenario: Plan catalog changes
- **WHEN** canonical plan pricing or included capability flags are updated
- **THEN** pricing presentation SHALL reflect those updates without requiring independent hardcoded copy updates for core plan fields.

### Requirement: Pricing CTAs SHALL map to real purchase and signup paths
Pricing page actions SHALL direct visitors to existing account-creation or checkout flows supported by the current product configuration.

#### Scenario: Visitor selects a plan CTA
- **WHEN** a visitor clicks a plan action on `/pricing`
- **THEN** the destination SHALL resolve to an implemented signup or checkout route for that plan flow.

#### Scenario: Non-checkout plan is presented
- **WHEN** a plan does not support direct self-serve checkout
- **THEN** the pricing page SHALL present the correct contact-led call to action rather than a checkout action.
