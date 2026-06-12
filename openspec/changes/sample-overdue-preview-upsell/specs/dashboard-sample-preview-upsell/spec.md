## ADDED Requirements

### Requirement: Locked dashboard uses sample overdue preview
The system SHALL render a sample-only overdue dashboard preview for users who do not have access to the overdue or payment-status dashboard modules.

#### Scenario: Starter user opens overdue dashboard
- **WHEN** a Starter-tier user opens the dashboard route where overdue module access is gated
- **THEN** the system renders a clearly labeled sample preview instead of real overdue invoice rows

### Requirement: Locked state does not expose live premium invoice data
The system SHALL prevent rendering of the user's live overdue or payment-status records in locked dashboard states.

#### Scenario: User without access has tracked invoices
- **WHEN** a user without dashboard entitlement has real tracked invoices in storage
- **THEN** the locked-state UI still renders sample rows only and hides live invoice rows

### Requirement: Adaptive recommendation suggests next tier
The system SHALL recommend the next plan tier in the locked dashboard state based on current subscription tier.

#### Scenario: Starter user sees recommendation
- **WHEN** a Starter user is shown the locked dashboard preview
- **THEN** the recommendation CTA targets Solo

#### Scenario: Solo user sees recommendation
- **WHEN** a Solo user is shown a locked premium dashboard capability
- **THEN** the recommendation CTA targets Small Business

### Requirement: Near-limit context increases recommendation relevance
The system SHALL apply near-limit recommendation messaging when usage is close to current plan limits or when user intent targets unavailable features.

#### Scenario: Usage near threshold
- **WHEN** a user's tracked usage reaches the configured near-limit threshold for their current plan
- **THEN** the recommendation message includes near-limit urgency language

#### Scenario: Gated feature intent
- **WHEN** a user attempts a gated feature not included in their current plan
- **THEN** the recommendation message prioritizes the plan tier that unlocks that feature

### Requirement: Locked preview clearly indicates sample data
The system SHALL label preview content as example/sample data so users do not confuse it with real records.

#### Scenario: Locked preview rendered
- **WHEN** the sample dashboard preview is displayed
- **THEN** the UI includes clear copy indicating that the rows are sample data shown before upgrade
