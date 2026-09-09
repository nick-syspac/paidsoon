## Purpose

Define scenario and simulation behavior that lets owners and integrated modules evaluate how assumption changes alter runway outcomes before decisions are made.

## ADDED Requirements

### Requirement: Standard runway scenarios are available
The system SHALL provide Base, Conservative, and Stress scenarios using policy-defined assumption adjustments and compare their runway outcomes.

#### Scenario: Scenario comparison
- **WHEN** a user views scenario analysis
- **THEN** the system returns runway duration and status for Base, Conservative, and Stress scenarios

### Requirement: Custom scenario inputs are validated and simulated
The system MUST validate custom scenario parameters server-side and return recalculated runway outcomes immediately after accepted input changes.

#### Scenario: Custom scenario with revenue decrease and payment delay
- **WHEN** a user submits a valid custom scenario reducing revenue and delaying customer payments
- **THEN** the system returns updated runway days, minimum cash, and projected cash-out date

### Requirement: Simulation APIs are reusable across modules
The system MUST expose reusable runway impact operations that return delta runway days, projected minimum cash change, updated cash-out date, and resulting runway status.

#### Scenario: Other module requests runway impact
- **WHEN** an internal module submits a simulation request with assumption adjustments
- **THEN** RunwayGuard returns structured impact fields suitable for module-level decisioning

### Requirement: Scenario outputs distinguish facts from estimates
The system MUST label scenario results as assumption-driven estimates and MUST not represent simulated outcomes as guaranteed financial results.

#### Scenario: Scenario result presentation
- **WHEN** simulation output is returned to UI
- **THEN** scenario assumptions and estimate disclaimers are included with the result
