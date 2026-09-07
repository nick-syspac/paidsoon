## ADDED Requirements

### Requirement: Marketing claims SHALL remain implementation-truthful across full funnel pages
Every customer-facing claim on homepage, module pages, platform overview, pricing, integrations, FAQ, security, and supporting product pages SHALL reflect currently implemented behavior, enabled integrations, and active conversion routes.

#### Scenario: Feature state is not implemented
- **WHEN** a marketing page references a scaffolded or planned capability
- **THEN** the page SHALL label that capability as planned or coming soon and SHALL NOT describe it as currently available.

#### Scenario: Conversion promise is displayed near CTA
- **WHEN** a marketing page shows a qualifying CTA support statement (for example trial, card requirement, cancellation, or onboarding speed)
- **THEN** the statement SHALL be shown only if it matches current implementation and routing behavior.

### Requirement: Module positioning copy SHALL preserve role boundaries
Marketing copy SHALL describe each module using its intended role and SHALL NOT collapse distinct module responsibilities into overlapping or contradictory promises.

#### Scenario: Visitor compares SpendLeak and CostGuard
- **WHEN** a visitor reviews both module descriptions
- **THEN** SpendLeak SHALL be described as recurring-expense and waste review, while CostGuard SHALL be described as active category-level cost monitoring and exception detection.

#### Scenario: Visitor compares PaidSoon and CashPlan
- **WHEN** a visitor reviews receivables and planning sections
- **THEN** PaidSoon SHALL be described as invoice follow-up and payment-timing control support, while CashPlan SHALL be described as forward cash-position planning support.
