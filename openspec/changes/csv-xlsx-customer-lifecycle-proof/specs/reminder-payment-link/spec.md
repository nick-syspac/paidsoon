## MODIFIED Requirements

### Requirement: Reminder email includes payment link when URL is available
When a `TrackedInvoice` row has a non-null `paymentUrl`, the system SHALL include a "Pay invoice →" hyperlink in the body of every reminder email sent for that invoice. When `paymentUrl` is null or empty, the template token resolves to an empty string and no link is rendered. Imported CSV/XLSX invoices are subject to the same requirement while they remain overdue.

#### Scenario: Stripe-connected invoice with hosted invoice URL
- **WHEN** a Stripe-connected invoice is ingested and `hosted_invoice_url` is present
- **THEN** the invoice's `paymentUrl` field is populated with the hosted invoice URL
- **AND** when a reminder email is sent for that invoice, it contains a "Pay invoice →" link pointing to that URL

#### Scenario: CSV-imported invoice with payment_url column
- **WHEN** an invoice is imported via CSV/XLSX with a non-empty, valid `payment_url` value
- **THEN** the invoice's `paymentUrl` field is populated with that URL
- **AND** when a reminder email is sent for that invoice while it remains overdue, it contains a "Pay invoice →" link pointing to that URL

#### Scenario: Imported invoice is paid before the next reminder cycle
- **WHEN** a CSV/XLSX imported invoice is marked paid or otherwise fully reconciled
- **THEN** the system suppresses reminder generation for that invoice in the next cycle
- **AND** no reminder email is sent for that invoice even if a payment URL was previously present

#### Scenario: CSV-imported invoice without payment_url column
- **WHEN** an invoice is imported via CSV/XLSX with no `payment_url` value
- **THEN** the invoice's `paymentUrl` field is null
- **AND** the reminder email is sent without a payment link
