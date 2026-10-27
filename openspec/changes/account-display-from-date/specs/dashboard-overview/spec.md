# Spec Delta

## ADDED Requirements

### Requirement: Overview business summaries respect account display eligibility

The overview SHALL apply the account-display-cutoff policy to financial counts, totals, severity inputs, module summaries, and linked invoice subsets. Existing tier gates and actual chase-allowance usage SHALL remain unchanged. Incomplete history-dependent results SHALL not appear as healthy zeroes.

#### Scenario: Excluded records do not affect overview severity

- **WHEN** only pre-cutoff invoices or derived findings drive an overdue, broken-promise, held-invoice, or financial-module signal
- **THEN** those records SHALL NOT contribute to the displayed signal or linked subset
- **AND** clicking the summary SHALL preserve the same cutoff in the destination

#### Scenario: Historical chasing still consumes allowance

- **WHEN** an already-chased invoice becomes excluded
- **THEN** real allowance consumption SHALL remain counted and the Chase allowance card SHALL continue to show actual billing-period usage

#### Scenario: Truncated financial summary

- **WHEN** the cutoff removes required history or the current snapshot was produced under another revision
- **THEN** the overview SHALL show insufficient data or rebuilding status rather than a misleading complete or healthy result

#### Scenario: Blank setting and entitlement gates

- **WHEN** the account has an untouched blank cutoff
- **THEN** existing overview behavior SHALL remain unchanged
- **AND** an active cutoff SHALL NOT expose a module that the account is not entitled to access
