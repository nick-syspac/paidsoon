## Purpose

Define cross-module integration contracts so RunwayGuard reuses existing FinOps data products and acts as the system-level cash resilience guardrail.

## ADDED Requirements

### Requirement: PaidSoon receivables feed inflow confidence
The system MUST incorporate receivable status, due dates, overdue aging, dispute state, and payment-promises into RunwayGuard inflow reliability weighting.

#### Scenario: Disputed invoices in forecast inflows
- **WHEN** invoices are disputed or high-overdue risk
- **THEN** RunwayGuard applies reduced confidence weighting and excludes them from high-reliability inflow buckets

### Requirement: TaxBuffer reserves are treated as protected cash
The system MUST consume TaxBuffer reserve outputs as protected cash and exclude them from usable operating cash unless policy explicitly allows otherwise.

#### Scenario: TaxBuffer reserve exists
- **WHEN** runway is calculated for a tenant with tax reserves
- **THEN** tax reserve amounts are excluded from usable cash

### Requirement: SpendLeak and CostGuard savings expose runway impact
The system SHALL translate identified, planned, and realised savings states into runway-impact insights without claiming unrealized savings as already achieved.

#### Scenario: Identified recurring savings not yet realized
- **WHEN** savings are marked identified but not realized
- **THEN** runway recommendations report potential impact as an estimate and not as current-state improvement

### Requirement: CommitGuard can request commitment impact from RunwayGuard
The system MUST provide a reusable interface that calculates runway impact for proposed commitments and returns before/after runway outcomes.

#### Scenario: CommitGuard pre-approval check
- **WHEN** CommitGuard evaluates a proposed commitment
- **THEN** RunwayGuard returns current runway, post-commitment runway, delta runway days, and resulting risk status

### Requirement: MarginGuard adjustments can influence runway assumptions
The system SHALL accept MarginGuard forecast adjustments as scenario inputs when available rather than recomputing margin analytics inside RunwayGuard.

#### Scenario: Margin deterioration signal received
- **WHEN** MarginGuard provides a forecast adjustment for reduced margins
- **THEN** RunwayGuard applies the adjustment to projected inflow/outflow assumptions and recalculates runway
