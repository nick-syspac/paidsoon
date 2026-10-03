## MODIFIED Requirements

### Requirement: Single platform subscription with four public plans

The system SHALL present PaidSoon as one platform subscription with four public plans: Essentials, Solo, Small Business, and Business Pro. The system SHALL NOT create separate product subscriptions for SpendLeak, CostGuard, or CashPlan.

#### Scenario: Customer reviews public pricing
- **WHEN** a customer opens the public pricing page
- **THEN** they see one platform subscription with four increasingly capable tiers, each including the PaidSoon platform and the appropriate feature bundle

### Requirement: Bundle access by tier

The system SHALL allocate module access by tier in a progressive ladder, with each tier unlocking additional capabilities while preserving one platform subscription.

#### Scenario: Essentials plan is reviewed
- **WHEN** a customer views Essentials
- **THEN** they see PaidSoon essentials, a monthly SpendLeak snapshot, limited CostGuard alerts, and a read-only 30-day cash outlook
- **AND** they do not see CashPlan interactivity or full-cost-control capabilities as included items

#### Scenario: Solo plan is reviewed
- **WHEN** a customer views Solo
- **THEN** they see full PaidSoon automation, SpendLeak monitoring, basic CostGuard, and an interactive 30-day CashPlan

#### Scenario: Small Business plan is reviewed
- **WHEN** a customer views Small Business
- **THEN** they see full platform access with deeper SpendLeak analysis, stronger CostGuard controls, team permissions, and a 13-week CashPlan

#### Scenario: Business Pro plan is reviewed
- **WHEN** a customer views Business Pro
- **THEN** they see the governance-heavy, multi-entity version of the platform with advanced workflows, approvals, enterprise reporting, and extended planning scenarios

### Requirement: Public pricing and beta founder pricing are separated

The system SHALL support a public launch pricing set distinct from founder pricing for beta customers. Founder pricing remains available to current beta users and is not presented as the public price ladder.

#### Scenario: Public launch pricing is displayed
- **WHEN** the public marketing site renders pricing
- **THEN** it shows the public launch amounts for the four plans and does not imply the founder pricing is the current public pricing

### Requirement: Plan limits and usage allowances

The system SHALL describe the four plans with consistent monthly invoice quotas, user limits, and connection/entity limits.

#### Scenario: Essentials usage is displayed
- **WHEN** Essentials is presented in the public plan table
- **THEN** the system shows the correct chase allowance and core plan limits consistently as "chased per month" rather than mixing other wording

#### Scenario: Higher plans are displayed
- **WHEN** Solo, Small Business, or Business Pro are displayed
- **THEN** the system reflects the plan's higher invoice, user, and entity limits without claiming unlimited invoices in the wrong context

### Requirement: Tier naming and communication consistency

The system SHALL use one consistent tier naming scheme across the product, marketing pages, Stripe configuration, and documentation: Essentials, Solo, Small Business, Business Pro.

#### Scenario: Tier names are displayed across surfaces
- **WHEN** a customer sees a plan name in any product or marketing surface
- **THEN** the system uses the same name and avoids historical aliases such as Starter or Business Pro in the wrong plan context

### Requirement: Comparison tables represent product breadth, not just invoice features

The system SHALL compare PaidSoon, SpendLeak, CostGuard, and CashPlan capabilities in the plan comparison table instead of describing only invoice reminders.

#### Scenario: Comparison table is rendered
- **WHEN** the pricing comparison table is shown
- **THEN** it highlights the four-module platform differences across the tiers and includes the realistic product breadth that customers expect to compare

### Requirement: Contact-only tier remains separate

The system SHALL keep Accountant Partner outside the public customer-selectable pricing ladder. It remains a contact-only channel plan rather than a standard business tier.

#### Scenario: Public plan list is rendered
- **WHEN** the system displays the public plan list
- **THEN** only Essentials, Solo, Small Business, and Business Pro appear as customer-selectable tiers
