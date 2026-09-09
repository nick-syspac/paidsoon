## Purpose

Provide deterministic scenario tools for price-to-target and cost-change modeling so users can test margin interventions before making operating decisions.

## ADDED Requirements

### Requirement: MarginGuard SHALL calculate required price for target margin
The system SHALL calculate required price from direct cost and target margin using deterministic arithmetic and validate impossible target values.

#### Scenario: Required price computed
- **WHEN** user provides direct cost and target margin below 100 percent
- **THEN** system returns required price, expected gross profit, and delta from current price

#### Scenario: Impossible target rejected
- **WHEN** user submits target margin greater than or equal to 100 percent
- **THEN** system rejects the request with validation error and no scenario record is persisted

### Requirement: MarginGuard SHALL model cost and volume changes
The system SHALL model cost and pricing changes and show resulting effects on gross profit, gross margin, and target variance.

#### Scenario: Supplier cost increase simulation
- **WHEN** user models a five percent direct-cost increase
- **THEN** system returns updated gross profit, gross margin, and variance versus target for the chosen period assumptions
