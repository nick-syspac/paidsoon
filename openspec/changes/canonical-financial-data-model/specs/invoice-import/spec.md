## MODIFIED Requirements

### Requirement: Import commit finalizes staging rows into the canonical financial layer
The system SHALL convert validated CSV/XLSX staging rows into canonical `FinancialInvoice` and
`FinancialContact` records with `sourceSystem` of `csv` and stable import-derived `sourceId`
values, so spreadsheet-imported invoices share the same normalized shape and provenance
conventions as provider-synced invoices. The paused-import safety model and reminder-workflow
behavior SHALL remain unchanged.

#### Scenario: Committed import rows become canonical invoices
- **WHEN** a user commits a validated import batch
- **THEN** each staging row produces a canonical invoice and linked contact with `csv` provenance
- **THEN** re-committing or re-importing the same source rows does not create duplicates

#### Scenario: Imported invoices behave like synced invoices downstream
- **WHEN** imported invoices are enrolled in chasing
- **THEN** dashboard, reminder, export, and ledger behavior is identical in kind to
  provider-synced invoices because all read the same canonical shape
