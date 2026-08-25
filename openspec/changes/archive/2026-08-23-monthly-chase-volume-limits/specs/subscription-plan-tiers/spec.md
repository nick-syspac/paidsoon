## MODIFIED Requirements

### Requirement: Tier invoice-chasing limits

The system SHALL define a monthly chased-invoice allowance per tier: Starter 10, Solo 50, and
Small Business 200. Accountant Partner SHALL have no fixed allowance. The allowance SHALL be
consumed once per invoice at its first reminder, measured over the account's current billing
period, and reaching it SHALL pause new chases without interrupting sequences already in
progress, as defined by the `chase-volume-entitlement` capability.

#### Scenario: Plan allowance is requested

- **WHEN** the application reads the chased-invoice allowance for a tier
- **THEN** it returns 10 for Starter, 50 for Solo, and 200 for Small Business

#### Scenario: Allowance is displayed on the pricing page

- **WHEN** the pricing page renders tier volume limits
- **THEN** the displayed figures match the allowances defined in the plan catalog

#### Scenario: User reaches monthly chased-invoice limit

- **WHEN** an account at a given tier has consumed its tier allowance within the current
  billing period
- **THEN** new invoices are not chased until the next period, and the account is shown an
  upgrade path
