# Spec Delta

## Purpose

Provide tenant-owned, owner-attested cash inputs with explicit currency and freshness so CommitGuard can assess cash protection without inventing balances or depending on another module's entitlement.

## ADDED Requirements

### Requirement: Owners SHALL maintain explicit dated cash inputs
The system SHALL let an authorized owner save or clear a signed gross cash balance, supported currency, and balance-as-of date. It SHALL identify the balance as owner-entered, not bank-verified, and keep cash inputs outside portable module-settings exports.

#### Scenario: Owner records a balance
- **WHEN** an authenticated owner saves a balance of 500000 cents in AUD with today's balance date
- **THEN** the balance is available only within that tenant and all CommitGuard consumers use the same saved cash context
- **AND** the view identifies its owner-entered origin, currency, and date

#### Scenario: Invalid or cross-tenant balance update
- **WHEN** a request contains an unsupported currency, unsafe integer amount, future balance date, or another tenant's identity
- **THEN** the request is rejected without changing another tenant's cash context

#### Scenario: Owner clears balance
- **WHEN** an owner clears the cash balance
- **THEN** commitments remain intact and free cash becomes unavailable until a valid balance is supplied

### Requirement: Cash availability SHALL distinguish missing and stale inputs
Cash SHALL be fresh through seven elapsed UTC calendar days after its balance date. Older balances SHALL remain visible as stale but SHALL NOT produce an actionable free-cash amount or cash-risk notification. Legacy currency-less snapshots SHALL NOT be treated as attested balances.

#### Scenario: Freshness boundary
- **WHEN** the balance date is seven UTC calendar days before evaluation
- **THEN** the balance is fresh
- **AND** on the eighth day it is stale and free cash is unavailable with an update-balance action

#### Scenario: Missing balance and unrelated feature entitlement
- **WHEN** a tenant has CommitGuard access but no saved balance or no Tax Buffer access
- **THEN** cash input remains usable independently of Tax Buffer access, and a missing balance is labeled missing rather than zero or low-buffer risk

### Requirement: Currency incompatibility SHALL prevent false consolidation
Commitments SHALL remain grouped by source currency with no FX conversion. Consolidated free cash SHALL be unavailable when active in-horizon commitments or required protection inputs cannot be expressed in the saved balance currency; compatible component totals SHALL remain visible with explicit exclusions.

#### Scenario: Mixed commitment currencies
- **WHEN** AUD cash has both AUD and USD commitments inside the selected horizon
- **THEN** the system displays separate AUD and USD totals and an unsupported-currency reason instead of adding their cents or labeling the sum AUD

#### Scenario: Unknown tax currency
- **WHEN** enabled tax protection has no validated currency
- **THEN** consolidated free cash is unavailable and the missing protection context is identified rather than silently excluded

#### Scenario: Balance currency changes
- **WHEN** the owner changes cash currency from AUD to USD while retaining an AUD expense basis or positive fixed buffer
- **THEN** the stored inputs retain AUD and free cash reports incompatible protection until explicit re-attestation
- **AND** clearing the balance does not relabel those retained amounts

#### Scenario: Zero or negative cash
- **WHEN** an owner explicitly saves zero or a negative balance with valid currency and date
- **THEN** it is a valid known cash amount rather than a missing input