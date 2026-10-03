## ADDED Requirements

### Requirement: Dashboard overview SHALL include Tax Buffer control-layer summary
The system SHALL include a Tax Buffer summary surface in the primary financial-operations overview alongside PaidSoon, SpendLeak, Cost Guard, and CashPlan signals.

#### Scenario: User opens dashboard overview
- **WHEN** the overview renders for an entitled user
- **THEN** it includes required reserve, reserved amount, reserve gap, and Tax Buffer status summary
- **THEN** selecting the summary navigates to the Tax Buffer module route

### Requirement: Dashboard overview SHALL expose a unified safe-to-spend metric
The system SHALL expose safe-to-spend output as a composited metric derived from available cash, committed obligations, and Tax Buffer reserve requirements.

#### Scenario: Tax reserve shortfall exists
- **WHEN** tax reserve requirements increase while committed obligations remain constant
- **THEN** safe-to-spend decreases accordingly in the overview summary
- **THEN** the view indicates that reserve status is under target rather than implying unrestricted cash availability
