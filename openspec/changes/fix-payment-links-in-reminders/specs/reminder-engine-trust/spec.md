## MODIFIED Requirements

### Requirement: Reminder email includes payment link when URL is available
When a `TrackedInvoice` row has a non-null `paymentUrl`, the system SHALL include a "Pay invoice →" hyperlink in the body of every reminder email sent for that invoice. When `paymentUrl` is null or empty, the template token resolves to an empty string and no link is rendered. The reminder engine SHALL preserve the payment URL through the invoice-to-template pipeline without silently dropping it.

#### Scenario: Stripe-connected invoice with hosted invoice URL
- **WHEN** a Stripe-connected invoice is ingested and `hosted_invoice_url` is present
- **THEN** the invoice's `paymentUrl` field is populated with the hosted invoice URL
- **AND** when a reminder email is sent for that invoice, it contains a "Pay invoice →" link pointing to that URL

#### Scenario: Payment URL is missing from the invoice model
- **WHEN** the invoice model has no usable payment URL
- **THEN** the reminder email renders without a payment CTA
- **AND** the template does not throw or produce malformed output

#### Scenario: CSV-imported invoice with payment_url column
- **WHEN** an invoice is imported via CSV/XLSX with a non-empty, valid `payment_url` value
- **THEN** the invoice's `paymentUrl` field is populated with that URL
- **AND** the reminder engine passes it through to the email template with no silent loss
