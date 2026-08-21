# invoice-payment-ledger Specification

## Purpose
Gives every invoice an auditable history of payment events instead of a single static amount, so partial payments are visible and spreadsheet re-uploads reconcile against reality instead of silently overwriting the invoice total.
## Requirements
### Requirement: Payment events are recorded as an append-only ledger
The system SHALL record every payment against an invoice as a separate `InvoicePayment` record with a positive `amount`, `currency`, `source`, and `recordedAt`, rather than mutating a single running total in place.

#### Scenario: Manual payment recorded
- **WHEN** a user records a payment of $1,000 against an invoice with a $3,000 outstanding balance
- **THEN** a new `InvoicePayment` record for $1,000 is created and the invoice's computed outstanding balance becomes $2,000

### Requirement: Outstanding balance is derived, not stored
The system SHALL compute an invoice's outstanding balance as its original `amountDue` minus the sum of all its `InvoicePayment` amounts, at read time, rather than persisting a separately-maintained running total.

#### Scenario: Invoice with no payments
- **WHEN** an invoice has no `InvoicePayment` records
- **THEN** its computed outstanding balance equals its `amountDue`

#### Scenario: Invoice with multiple partial payments
- **WHEN** an invoice with `amountDue` of $10,000 has two `InvoicePayment` records of $3,000 and $4,000
- **THEN** its computed outstanding balance is $3,000

### Requirement: Invoice is marked paid when fully covered
The system SHALL set an invoice's status to `paid` when the sum of its `InvoicePayment` records equals or exceeds its `amountDue`.

#### Scenario: Final payment clears the balance
- **WHEN** a payment is recorded that brings the total paid to equal or exceed `amountDue`
- **THEN** the invoice's status becomes `paid`

### Requirement: Spreadsheet re-upload reconciles rather than overwrites
The system SHALL, when a re-uploaded CSV/XLSX row matches an existing invoice by external identifier, compare the file's reported outstanding balance to the invoice's currently computed outstanding balance instead of overwriting `amountDue`.

#### Scenario: Re-upload shows the invoice was fully paid
- **WHEN** a re-uploaded row's reported outstanding balance is $0 and the invoice's previously computed outstanding balance was $2,400
- **THEN** an `InvoicePayment` of $2,400 is recorded with `source = "import_reconciliation"` and the invoice's status becomes `paid`

#### Scenario: Re-upload shows a partial payment was made
- **WHEN** a re-uploaded row's reported outstanding balance is $1,000 and the invoice's previously computed outstanding balance was $2,400
- **THEN** an `InvoicePayment` of $1,400 is recorded with `source = "import_reconciliation"`

#### Scenario: Re-upload shows no change
- **WHEN** a re-uploaded row's reported outstanding balance matches the invoice's currently computed outstanding balance
- **THEN** no `InvoicePayment` record is created

#### Scenario: Re-upload shows the outstanding balance increased
- **WHEN** a re-uploaded row's reported outstanding balance is higher than the invoice's currently computed outstanding balance
- **THEN** no `InvoicePayment` record is created, `amountDue` is not changed, and the invoice is flagged as an import anomaly for manual review rather than auto-applied or rejected outright

