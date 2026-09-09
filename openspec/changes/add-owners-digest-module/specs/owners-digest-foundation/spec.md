# owners-digest-foundation

## Purpose

Define the tenant-scoped persistence and snapshot contract for Owner's Digest so each reporting period produces an explainable executive briefing with reliable history, provider completeness metadata, and retry-safe generation behavior.

## ADDED Requirements

### Requirement: Owner's Digest snapshots SHALL be tenant-scoped and historically stable

The system SHALL persist Owner's Digest snapshots per tenant, frequency, and reporting period. Historical digest views SHALL return the stored snapshot for that period and SHALL NOT recalculate items, metrics, status, or summary text from newer financial data.

#### Scenario: User opens a previous weekly digest

- **WHEN** an authorised user opens a digest from an earlier reporting period
- **THEN** the system returns the stored status, summary, items, metrics, and generation timestamps for that snapshot
- **AND** later changes in invoices, spend, tax, or settings do not silently alter that historical digest

#### Scenario: New tenant has no previous digest

- **WHEN** a tenant generates Owner's Digest for the first time
- **THEN** the system stores a current-period snapshot without inventing previous-period comparisons
- **AND** the digest labels the output as a current business snapshot rather than a week-over-week change report

### Requirement: Owner's Digest generation SHALL be idempotent per reporting period

The system SHALL maintain exactly one canonical digest snapshot per tenant, frequency, and reporting period. Scheduled retries or duplicate generation requests for the same period SHALL NOT create duplicate snapshots or duplicate email sends.

#### Scenario: Scheduled generation retries the same weekly period

- **WHEN** the same tenant-period digest job is triggered more than once because of a retry or overlapping scheduler dispatch
- **THEN** the system reuses or updates the canonical current-period digest record according to the defined regeneration policy
- **AND** the history list shows one digest entry for that period

#### Scenario: Manual refresh runs shortly after an automatic generation

- **WHEN** an authorised user requests a refresh for the current open reporting period
- **THEN** the system records that regeneration against the same canonical current-period digest identity
- **AND** previously closed periods remain immutable

### Requirement: Owner's Digest SHALL record data freshness and provider completeness

Each generated digest SHALL capture the underlying data-as-of timestamp and provider execution completeness so owners can distinguish complete snapshots, stale-source warnings, and partial-generation results.

#### Scenario: One enabled provider is stale

- **WHEN** an enabled source module has data older than the freshness threshold at digest-generation time
- **THEN** the digest records the provider as stale
- **AND** the user-facing digest includes a warning that some figures may be out of date

#### Scenario: One enabled provider fails during generation

- **WHEN** one provider fails while other providers succeed
- **THEN** the digest still persists a partial snapshot from successful providers
- **AND** the stored completeness metadata identifies the failed provider without fabricating its findings

### Requirement: Owner's Digest records SHALL remain tenant-isolated

Owner's Digest settings, snapshots, items, metrics, and generation metadata SHALL only be readable or mutable within the authenticated tenant context.

#### Scenario: User requests another tenant's digest identifier

- **WHEN** a user attempts to load a digest snapshot outside their tenant scope
- **THEN** the system denies access before returning snapshot or metric details

#### Scenario: Generation job processes multiple tenants

- **WHEN** background generation iterates across tenants
- **THEN** each tenant's snapshot, items, and settings are read and written within that tenant's own security context
