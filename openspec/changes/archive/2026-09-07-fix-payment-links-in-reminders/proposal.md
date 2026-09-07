## Why

Reminder emails currently fail to consistently include payment links even when an invoice has a valid payment URL. This directly reduces collection efficiency and trust in automated follow-ups, so we need to close the gap before further reminder automation work.

## What Changes

- Ensure payment URLs are preserved from invoice ingestion through reminder email template rendering.
- Include a "Pay invoice ->" link in reminder emails whenever `TrackedInvoice.paymentUrl` is non-empty.
- Keep reminder output stable when no payment URL exists by rendering no CTA link and avoiding malformed template output.
- Cover Stripe-ingested and CSV/XLSX-imported invoices with deterministic behavior.

## Capabilities

### New Capabilities
- `reminder-engine-trust`: Defines payment-link rendering guarantees for reminder emails and end-to-end payment URL preservation.

### Modified Capabilities
- None.

## Impact

- Affected systems: invoice ingestion, reminder rendering pipeline, and email template token mapping.
- Likely code areas: `lib/invoiceImport/`, `lib/invoices/`, `lib/email/`, and reminder send paths in API/cron flows.
- Validation/testing: add or update tests to assert payment URL persistence and conditional CTA rendering for Stripe and CSV/XLSX sources.
