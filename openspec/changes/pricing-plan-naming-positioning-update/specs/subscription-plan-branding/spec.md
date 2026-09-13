## ADDED Requirements

### Requirement: Public plan naming remains aligned with the catalog

The system SHALL render the public customer-facing plan label for the stable internal `solo` tier as `Business Control` while retaining the internal identifier `solo` in code, data, Stripe mappings, and billing logic.

#### Scenario: Customer views plan pricing
- **WHEN** a customer opens the public pricing page
- **THEN** the plan cards SHALL display: Essentials, Business Control, Small Business, and Business Pro in that order
- **AND** Small Business SHALL remain visually highlighted as the Most popular plan
- **AND** the tier prices SHALL remain unchanged at A$15, A$29, A$69, and A$149 per month inclusive of GST

#### Scenario: Existing subscription remains compatible
- **WHEN** a user already has a `solo` subscription
- **THEN** the system SHALL continue to resolve the subscription using the stable internal identifier `solo`
- **AND** the system SHALL display the customer-facing label `Business Control` without requiring a database migration or Stripe configuration change

#### Scenario: Customer-facing copy stays aligned
- **WHEN** a customer views plan descriptions, upgrade prompts, or settings labels
- **THEN** the copy SHALL reference `Business Control` rather than `Solo`
- **AND** any mention of `Solo` in customer-facing surfaces SHALL be treated as a bug unless it is a deliberate technical reference to the stable internal identifier
