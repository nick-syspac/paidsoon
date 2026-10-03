# spendleak-ingestion Specification

## Purpose
Define the read-only spend-side ingestion layer that turns accounting-provider spend history into normalized data SpendLeak can analyze.

## Requirements

### Requirement: SpendLeak shall ingest spend-side accounting data as read-only normalized records
The system SHALL import the spend-side accounting data required for SpendLeak analyses from connected accounting sources into normalized read models. Imported records SHALL preserve source references, provenance, and sync timestamps so findings can be traced back to the source system.

#### Scenario: Connected organisation sync imports spend-side data
- **WHEN** a connected Xero or MYOB organisation is synced for SpendLeak
- **THEN** the system stores normalized bill, bank-transaction, supplier, and expense-account data needed for initial SpendLeak analysis
- **THEN** each stored record retains provider identifiers and source timestamps needed to trace the record back to the source system

#### Scenario: Spend-side sync remains read-only
- **WHEN** a user reviews SpendLeak data or findings
- **THEN** the UI and APIs do not expose any mutation of provider bills, bank transactions, or suppliers through SpendLeak in this MVP

### Requirement: Spend-side sync shall be idempotent and refresh existing records
The system SHALL refresh spend-side records in place when the same provider source record is seen again for the same tenant. Re-running the same sync window SHALL not create duplicate spend records.

#### Scenario: Same bill is synced twice
- **WHEN** a sync run returns a bill that already exists for the same tenant and provider source identifier
- **THEN** the system updates the existing normalized record instead of inserting a duplicate

#### Scenario: Same spend window is reprocessed
- **WHEN** the same spend-side sync window is processed again
- **THEN** the resulting spend read models remain logically identical and no duplicate rows are created

### Requirement: Spend-side sync shall record freshness and failure state
The system SHALL record the latest successful spend-side sync time and any provider failure details needed to distinguish fresh, stale, partial, and empty states.

#### Scenario: Provider call fails during spend-side sync
- **WHEN** a provider API call fails during spend-side refresh
- **THEN** the system records the failure state and error context for later retry
- **AND** it does not mark the spend-side data as fresh

#### Scenario: No spend-side sync has completed yet
- **WHEN** a tenant has connected accounting sources but no completed spend-side sync has run
- **THEN** the system reports an initial-sync state instead of fabricated spend findings

### Requirement: Spend-side sync SHALL validate provider scope readiness
The system SHALL validate that connected provider grants include all required scopes for spend-side endpoints before treating spend ingestion as ready. If required scopes are missing, the system SHALL produce an explicit scope-upgrade-required state with retry-safe behavior and reconnect remediation guidance.

#### Scenario: MYOB spend ingestion encounters missing required scopes
- **WHEN** a MYOB spend-side sync attempt calls spend endpoints with a token grant that lacks one or more required spend scopes
- **THEN** the system records a spend-side partial failure classified as scope-upgrade-required
- **AND** it does not classify the connection as globally revoked based on that spend-side failure alone
- **AND** it surfaces reconnect guidance for obtaining the missing scopes

#### Scenario: MYOB spend ingestion resumes after reconnect with full scopes
- **WHEN** a tenant reconnects MYOB and grants the required spend-read scopes
- **THEN** subsequent spend-side sync attempts ingest bills, bank transactions, suppliers, and expense accounts normally
- **AND** previously reported scope-upgrade-required state is cleared after successful spend sync

#### Scenario: MYOB banking ingestion uses canonical transaction families
- **WHEN** spend-side sync retrieves MYOB banking transaction data
- **THEN** the system SHALL use documented MYOB Business banking endpoint families rather than non-canonical transaction endpoints
- **AND** it SHALL normalize endpoint-specific payload fields into the internal spend transaction model before persistence

#### Scenario: Unsupported MYOB purchase bill subtype does not cause perpetual partial failures
- **WHEN** a MYOB tenant does not support a purchase bill subtype path
- **THEN** spend bill ingestion SHALL avoid unsupported subtype requests in its contract
- **AND** bills ingestion SHALL continue for supported purchase bill subtypes without deterministic 404 failures on every sync
