## Purpose

Define the canonical RunwayGuard behavior that turns available financial inputs into an explainable operating-runway forecast for small-business owners.

## ADDED Requirements

### Requirement: RunwayGuard calculates usable operating cash
The system MUST calculate usable cash by excluding protected balances from bank cash, including tax reserves and committed near-term obligations.

#### Scenario: Protected cash is excluded from usable cash
- **WHEN** a tenant has bank cash, TaxBuffer reserves, and other protected balances
- **THEN** RunwayGuard returns usable cash that excludes all protected balances before runway is calculated

### Requirement: RunwayGuard prefers forecast timelines over burn-rate fallback
The system MUST calculate runway from CashPlan forecast timelines when available and MUST use a clearly labeled fallback estimate only when forecast data is unavailable.

#### Scenario: CashPlan forecast exists
- **WHEN** a valid CashPlan forecast timeline exists for the configured horizon
- **THEN** RunwayGuard uses the forecast timeline to determine projected exhaustion date and runway duration

#### Scenario: CashPlan forecast is unavailable
- **WHEN** forecast timeline data is missing or incomplete
- **THEN** RunwayGuard provides a fallback estimate and labels the result as estimate-based with reduced confidence

### Requirement: Runway status bands are policy-configured
The system MUST classify runway using centrally configured threshold policies and MUST NOT hard-code status thresholds in distributed logic.

#### Scenario: Threshold policy changes
- **WHEN** tenant or plan policy updates runway thresholds
- **THEN** subsequent runway status calculations use the updated policy without code changes

### Requirement: Sustainable forecasts are represented explicitly
The system MUST return a sustainable-within-horizon status when projected usable cash does not fall to zero within the selected forecast window.

#### Scenario: No projected cash exhaustion within horizon
- **WHEN** all projected usable cash points remain above zero through the horizon
- **THEN** RunwayGuard reports sustainable-within-forecast-horizon without synthetic extreme runway values

### Requirement: Runway output is auditable and explainable
The system MUST return major input components and adjustment factors used in the runway calculation so users can inspect why a runway value was produced.

#### Scenario: Owner opens runway details
- **WHEN** a user requests calculation details
- **THEN** the system shows opening cash, protected deductions, inflow assumptions, outflow assumptions, and resulting runway metrics

### Requirement: Missing-data behavior is explicit
The system MUST identify missing critical inputs and MUST provide low-confidence messaging with actionable setup guidance instead of fabricating unavailable financial values.

#### Scenario: Expense data is missing
- **WHEN** runway calculation lacks required expense signals
- **THEN** RunwayGuard reports missing-data limitations and avoids inventing a burn rate
