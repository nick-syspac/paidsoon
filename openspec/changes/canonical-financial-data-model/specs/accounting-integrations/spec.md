## MODIFIED Requirements

### Requirement: Accounting sync persists invoices through the canonical financial layer
The system SHALL synchronize accounting-provider invoices, contacts, and payment facts into the
canonical financial tables (`FinancialInvoice`, `FinancialContact`, `FinancialPayment`) with full
source provenance, and SHALL maintain chasing workflow records as references to canonical
invoices rather than as copies of invoice data. Provider-specific mapping tables
(`ProviderInvoiceMapping`, `ProviderContactMapping`) SHALL be retired in favor of provenance
fields on the canonical records.

#### Scenario: Xero or MYOB sync upserts canonical records
- **WHEN** an accounting sync run processes invoices for a connected organisation
- **THEN** invoice facts are upserted into `financial_invoices` keyed by
  `(userId, sourceSystem, sourceId)`
- **THEN** a linked `TrackedInvoice` carries only chasing workflow state

#### Scenario: Incremental sync uses canonical provenance
- **WHEN** an incremental sync requests records modified after a watermark
- **THEN** the watermark is tracked against canonical `sourceUpdatedAt` / connection sync
  metadata, not a separate provider-mapping table
