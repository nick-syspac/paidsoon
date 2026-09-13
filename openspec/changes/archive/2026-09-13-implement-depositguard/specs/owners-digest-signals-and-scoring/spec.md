## ADDED Requirements

### Requirement: Owner's Digest SHALL include DepositGuard cash-protection signals when available
When DepositGuard is entitled and operational for a tenant, Owner's Digest SHALL ingest DepositGuard signals for deposit collection progress, overdue requests, and commencement-blocked jobs.

#### Scenario: DepositGuard contributes mixed outcomes
- **WHEN** a tenant has paid deposits, overdue requests, and blocked jobs in the digest period
- **THEN** Owner's Digest includes those DepositGuard signals in ranking and summary calculations

#### Scenario: DepositGuard is unavailable for tenant
- **WHEN** Owner's Digest runs for a tenant without DepositGuard operational availability
- **THEN** DepositGuard signals are omitted without marking the digest as failed
