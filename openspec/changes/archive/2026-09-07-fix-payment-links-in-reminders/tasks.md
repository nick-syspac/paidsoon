## 1. Payment URL Normalization and Pass-through

- [x] 1.1 Audit Stripe and CSV/XLSX ingestion paths to confirm `paymentUrl` is populated from `hosted_invoice_url` / `payment_url` and normalized to null when empty or whitespace-only.
- [x] 1.2 Update shared reminder-template variable construction to treat whitespace-only `paymentUrl` as absent before rendering `paymentLink` and `paymentLinkText`.
- [x] 1.3 Verify canonical invoice flattening and reminder send paths preserve `financialInvoice.paymentUrl` without fallback to provider-specific metadata.

## 2. Reminder Rendering Behavior

- [x] 2.1 Ensure HTML reminder rendering includes "Pay invoice ->" only when a normalized payment URL exists.
- [x] 2.2 Ensure plain-text reminder rendering includes only the raw payment URL (no anchor markup) when available and empty output when not available.
- [x] 2.3 Confirm behavior is consistent for both default templates and custom user templates using existing tokens.

## 3. Regression Tests and Verification

- [x] 3.1 Add or update unit tests covering payment-link rendering for present, null, empty, and whitespace-only payment URL inputs.
- [x] 3.2 Add or update source-mapping tests for Stripe (`hosted_invoice_url`) and CSV/XLSX (`payment_url`) to verify `paymentUrl` survives to reminder rendering inputs.
- [x] 3.3 Run targeted test files and full suite smoke checks (`npm run test`) to validate no reminder rendering regressions.
