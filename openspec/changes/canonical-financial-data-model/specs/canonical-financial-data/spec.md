## ADDED Requirements

### Requirement: Canonical financial records SHALL carry source provenance
The system SHALL store normalized financial records (invoices, contacts, payments) in canonical
tables where every record identifies its origin via `sourceSystem`, `sourceId`,
`sourceUpdatedAt`, and `syncedAt`, and preserves the original provider payload as
`rawSourceData` for traceability. A canonical record SHALL NOT exist without a complete
provenance triple (`sourceSystem`, `sourceId`, source timestamp where the provider supplies one).

#### Scenario: Sync stores provenance on every record
- **WHEN** any ingestion path (Xero, MYOB, Stripe, CSV/XLSX) writes a financial record
- **THEN** the record carries `sourceSystem`, `sourceId`, and `syncedAt`
- **THEN** `rawSourceData` retains the source payload needed to trace or re-derive the record

#### Scenario: Idempotent re-sync
- **WHEN** an ingestion path re-processes a source record that has not changed
- **THEN** exactly one canonical record exists per `(userId, sourceSystem, sourceId)` key
- **THEN** chasing workflow state on the linked `TrackedInvoice` is not reset or duplicated

### Requirement: All ingestion paths SHALL write to the canonical layer
The system SHALL route every source of financial data — accounting-provider syncs, Stripe invoice
sync, and CSV/XLSX imports — through the canonical financial tables. An ingestion adapter's
responsibility SHALL be limited to synchronizing source records into the canonical model; feature
logic SHALL NOT live in adapters.

#### Scenario: Accounting sync writes canonical records
- **WHEN** a connected Xero or MYOB organisation is synced
- **THEN** invoice, contact, and payment facts are upserted into the canonical tables
- **THEN** chasing workflow records reference the canonical invoice rather than duplicating its
  data

#### Scenario: CSV import writes canonical records
- **WHEN** a CSV/XLSX invoice import batch is finalized
- **THEN** staging rows become canonical invoices and contacts with `sourceSystem` of `csv`
- **THEN** the imported invoices are indistinguishable in shape from provider-synced invoices

### Requirement: Chasing workflow state SHALL be separated from invoice facts
The system SHALL keep chasing-owned state (status, reminder stage, schedule, snooze, dispute,
promise linkage) on `TrackedInvoice` and source-owned invoice facts (amounts, currency, dates,
payment URL, customer identity) on the canonical record. User-facing reads of invoice facts SHALL
go through the canonical layer under `withUserContext` so RLS applies.

#### Scenario: Dashboard reads invoice facts from the canonical record
- **WHEN** a user views the dashboard or invoice list
- **THEN** amounts, due dates, and customer identity are read from the canonical invoice via the
  chasing record's reference
- **THEN** no user-facing read bypasses `withUserContext`

#### Scenario: Provider quirks stop at the adapter boundary
- **WHEN** chasing or dashboard code consumes invoice data
- **THEN** it reads normalized canonical fields only, never `rawSourceData` or
  provider-specific payload shapes

### Requirement: Canonical and spend-side tables SHALL share one provenance vocabulary
The system SHALL use the same provenance field naming (`sourceSystem`, `sourceId`,
`sourceUpdatedAt`, `syncedAt`) across receivables and spend-side normalized tables. Currency
values SHALL always come from the source system; normalized financial tables SHALL NOT define a
default currency.

#### Scenario: Spend foundation tables align to the shared vocabulary
- **WHEN** the schema migration is applied
- **THEN** `imported_bills`, `imported_bank_transactions`, and `supplier_profiles` expose the
  same provenance vocabulary as the canonical receivables tables
- **THEN** no normalized financial table supplies a default currency value
