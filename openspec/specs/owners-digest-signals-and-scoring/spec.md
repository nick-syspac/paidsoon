# owners-digest-signals-and-scoring Specification

## Purpose

Define how Owner's Digest normalises module findings into shared signals, filters them by entitlement and materiality, ranks them deterministically, and combines overlapping issues into an explainable owner-facing priority list.
## Requirements
### Requirement: Owner's Digest SHALL consume a shared digest signal contract

The system SHALL normalise participating module findings into a shared Owner's Digest signal model that includes source module, severity, summary text, financial impact where available, recommended action, and drill-down context.

#### Scenario: PaidSoon contributes an overdue finding

- **WHEN** the receivables module identifies a materially overdue invoice issue
- **THEN** Owner's Digest receives a signal containing the source module, severity, summary, financial impact, and the relevant invoice drill-down reference

#### Scenario: A module has no material findings for the period

- **WHEN** a contributing module has no digest-worthy findings in the requested period
- **THEN** it returns no signal for that concern
- **AND** Owner's Digest does not create filler or placeholder items for that module

### Requirement: Owner's Digest SHALL include only entitled and operationally available module signals

The system SHALL only evaluate signals from modules available to the tenant's subscription and currently operational for that tenant. It SHALL omit non-entitled modules rather than presenting broken, fabricated, or inaccessible digest sections.

#### Scenario: Tenant lacks MarginGuard entitlement

- **WHEN** Owner's Digest is generated for a tenant without MarginGuard access
- **THEN** MarginGuard signals are excluded from the digest
- **AND** the digest does not show a missing-data warning for MarginGuard solely because the tenant is not entitled to it

#### Scenario: Tenant upgrades to broader FinOps coverage

- **WHEN** the tenant gains new module entitlements before a future reporting period
- **THEN** the next digest evaluates those newly entitled module providers
- **AND** prior digests remain unchanged

### Requirement: Owner's Digest SHALL rank findings with deterministic severity and materiality rules

The system SHALL assign each signal a deterministic priority using central severity, materiality, urgency, trend, and actionability rules. The same inputs SHALL always produce the same ordering, status semantics, and section placement.

#### Scenario: Critical cash issue outranks a savings opportunity

- **WHEN** a cash-risk signal and a savings-opportunity signal are both present in the same digest
- **THEN** the cash-risk signal is ranked ahead of the savings opportunity
- **AND** the higher-ranked issue appears in the attention section before the opportunity section

#### Scenario: Change falls below the configured materiality threshold

- **WHEN** a finding's financial impact and change magnitude are below the tenant's minimum materiality settings
- **THEN** the finding is excluded from the surfaced digest items

### Requirement: Owner's Digest SHALL correlate overlapping negative signals

The system SHALL correlate materially overlapping findings that describe the same underlying issue and SHALL present them as one owner-facing alert while preserving links back to contributing modules.

#### Scenario: Cash pressure is detected by multiple modules

- **WHEN** CashPlan, CommitGuard, and RunwayGuard each identify the same near-term liquidity risk
- **THEN** Owner's Digest combines them into one consolidated attention item
- **AND** the item preserves drill-down access to the contributing module details

#### Scenario: Distinct issues share the same module

- **WHEN** a single module emits two separate findings with different entities or business meaning
- **THEN** Owner's Digest keeps them as separate items when correlation rules do not identify them as the same underlying issue

### Requirement: Owner's Digest SHALL calculate an explainable overall business status

The system SHALL calculate an overall status of Healthy, Watch, Action Required, or Critical from the ranked signal set and key metrics, and it SHALL provide owner-facing explanation for that status.

#### Scenario: No significant issues are present

- **WHEN** the digest has no critical items and no warnings outside configured tolerances
- **THEN** the overall status is Healthy
- **AND** the summary explains that no significant issues require attention for the period

#### Scenario: Immediate liquidity risk is present

- **WHEN** the digest includes a critical cash, runway, tax, or overdue-risk issue that breaches the configured critical rule set
- **THEN** the overall status is Critical
- **AND** the summary explains which conditions caused the status

### Requirement: Owner's Digest SHALL include DepositGuard cash-protection signals when available
When DepositGuard is entitled and operational for a tenant, Owner's Digest SHALL ingest DepositGuard signals for deposit collection progress, overdue requests, and commencement-blocked jobs.

#### Scenario: DepositGuard contributes mixed outcomes
- **WHEN** a tenant has paid deposits, overdue requests, and blocked jobs in the digest period
- **THEN** Owner's Digest includes those DepositGuard signals in ranking and summary calculations

#### Scenario: DepositGuard is unavailable for tenant
- **WHEN** Owner's Digest runs for a tenant without DepositGuard operational availability
- **THEN** DepositGuard signals are omitted without marking the digest as failed

