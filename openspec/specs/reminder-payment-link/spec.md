# reminder-payment-link Specification

## Purpose
Ensures that reminder emails include a direct "Pay invoice →" hyperlink when a payment URL
is known for the invoice — either the Stripe-hosted invoice page or a custom URL supplied
during CSV/XLSX import.
## Requirements
### Requirement: Reminder email includes payment link when URL is available
When a `TrackedInvoice` row has a non-null `paymentUrl`, the system SHALL include a
"Pay invoice →" hyperlink in the body of every reminder email sent for that invoice.
When `paymentUrl` is null or empty, the template token resolves to an empty string and
no link is rendered.

#### Scenario: Stripe-connected invoice with hosted invoice URL
- **WHEN** a Stripe-connected invoice is ingested and `hosted_invoice_url` is present
- **THEN** the invoice's `paymentUrl` field is populated with the hosted invoice URL
- **AND** when a reminder email is sent for that invoice, it contains a "Pay invoice →" link pointing to that URL

#### Scenario: Stripe-connected invoice without hosted invoice URL
- **WHEN** a Stripe-connected invoice is ingested and `hosted_invoice_url` is absent
- **THEN** the invoice's `paymentUrl` field is null
- **AND** the reminder email is sent without a payment link

#### Scenario: CSV-imported invoice with payment_url column
- **WHEN** an invoice is imported via CSV/XLSX with a non-empty, valid `payment_url` value
- **THEN** the invoice's `paymentUrl` field is populated with that URL
- **AND** when a reminder email is sent for that invoice, it contains a "Pay invoice →" link pointing to that URL

#### Scenario: CSV-imported invoice without payment_url column
- **WHEN** an invoice is imported via CSV/XLSX with no `payment_url` value
- **THEN** the invoice's `paymentUrl` field is null
- **AND** the reminder email is sent without a payment link

#### Scenario: Invoices already in the database before this change
- **WHEN** a `TrackedInvoice` row exists with `paymentUrl = null` (pre-migration)
- **THEN** reminder emails for that invoice are sent without a payment link, maintaining previous behaviour

