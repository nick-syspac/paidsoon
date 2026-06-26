## ADDED Requirements

### Requirement: Pricing page SHALL display three plan tiers with revised pricing
The `/pricing` page SHALL display three plan tiers: Starter (A$19/mo), Business (A$49/mo), and Accountant Partner (Contact us). Each tier SHALL include a name, price or contact CTA, description, and feature list.

#### Scenario: All three plan tiers are visible
- **WHEN** a visitor loads `/pricing`
- **THEN** Starter, Business, and Accountant Partner plan cards are all visible

#### Scenario: Starter plan price is A$19/mo
- **WHEN** a visitor views the Starter plan card
- **THEN** the price displayed is A$19 per month

#### Scenario: Business plan price is A$49/mo
- **WHEN** a visitor views the Business plan card
- **THEN** the price displayed is A$49 per month

#### Scenario: Accountant Partner shows contact CTA
- **WHEN** a visitor views the Accountant Partner plan card
- **THEN** a "Contact us" or equivalent CTA is displayed instead of a numeric price

### Requirement: Pricing page SHALL include trust and trial messaging
The `/pricing` page SHALL include messaging that free trial is available, there are no lock-in contracts, and the subscription can be cancelled at any time.

#### Scenario: Free trial messaging is visible
- **WHEN** a visitor views the pricing page
- **THEN** text indicating a free trial is available is visible

#### Scenario: No lock-in messaging is visible
- **WHEN** a visitor views the pricing page
- **THEN** text indicating no lock-in contracts and cancel anytime is visible

### Requirement: Pricing page SHALL include a feature comparison section
The `/pricing` page SHALL include a table or comparison grid showing which features are included in each plan tier.

#### Scenario: Feature comparison is present
- **WHEN** a visitor scrolls through the pricing page
- **THEN** a section comparing features across Starter, Business, and Accountant Partner is visible

### Requirement: Pricing page SHALL have unique page metadata
The `/pricing` page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: Metadata is set
- **WHEN** the pricing page is rendered server-side
- **THEN** the `<title>` tag contains a pricing-specific title
