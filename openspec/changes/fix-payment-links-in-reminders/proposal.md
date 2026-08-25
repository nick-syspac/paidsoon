## Why

The core invoice-chasing flow currently sends reminder emails without a usable payment action. In the send path, the application passes `paymentUrl: invoice.paymentUrl ?? undefined` into template generation even though the Stripe provider already normalizes `hosted_invoice_url` into the invoice data model. This creates a paid-customer trust issue: the workflow looks complete, but the customer receives a chase email with no effective payment CTA.

## What Changes

- Wire the invoice payment URL into the reminder-email construction path so the rendered email contains a real Pay invoice link when the invoice has a hosted payment URL.
- Preserve sanitization and token interpolation so the link is inserted only when a valid value is available.
- Add explicit tests covering both populated and absent payment URLs to prevent regressions.
- Ensure the customer-facing reminder email content is safe and informative even when the provider has no hosted invoice URL.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `invoice-reminder-email-delivery`: ensure the email includes a valid payment action when the invoice has an externally hosted payment URL.
- `reminder-engine-trust`: protect against silent loss of the payment CTA during reminder generation, template interpolation, or provider normalization.

## Impact

- Affected code:
  - `lib/email/send.ts`
  - `lib/providers/stripe.ts`
  - `lib/email/templates.ts`
  - relevant email tests in `tests/`
- Affected systems:
  - invoice chase flow, reminder template rendering, Stripe payment URL mapping
- No schema migration required.
- This is a functional bug fix with customer-facing release impact.

## Release Criteria

- A reminder email created from an invoice with `paymentUrl` set contains a valid `Pay invoice` link in both HTML and text output.
- A reminder email created from an invoice without a payment URL omits the link cleanly without breaking the template.
- A regression test covers the exact failure mode from the release audit.
