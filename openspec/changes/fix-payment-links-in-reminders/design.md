## Context

See proposal.md for motivation. The reminder pipeline already accepts an invoice object with a `paymentUrl` field at template render time, and the template layer already supports a `{{paymentLink}}` token. The observed failure mode is a mismatch between the invoice data model and the send path: the runtime invoice object is available, but the actual URL can be dropped before it reaches the template and the email body ends up without a customer action.

## Goals / Non-Goals

**Goals:**
- Ensure the reminder pipeline preserves a valid payment URL through the model-to-template boundary.
- Keep the reminder content safe when the invoice has no payment URL.
- Cover the regression with a test that exercises both populated and absent payment URL states.

**Non-Goals:**
- Reworking the reminder sequence or billing logic beyond the payment CTA.
- Adding a new payment provider or custom email render mechanism.
- Backfilling historical invoice rows that were created before the fix.

## Decisions

### Preserve the canonical payment URL on the invoice model

**Chosen:** The system should pass a single canonical `paymentUrl` value from the normalized invoice model into the reminder template, and the caller should treat it as optional rather than required.

**Rationale:** This keeps the contract explicit and matches the existing template behavior, where a null or empty value resolves to no link instead of a broken render.

**Alternative considered:** Doing a live provider lookup at send time. Rejected because it couples the reminder send path to external data-fetch operations and introduces unnecessary latency and failure risk.

### Keep the payment link token safe by default

**Chosen:** The template system should resolve `paymentLink` to an empty string when no valid URL exists, rather than trying to construct a link from missing data.

**Rationale:** This matches the existing design for optional email links and keeps the rendered reminder body valid even when the invoice did not include a payment URL.

**Alternative considered:** Rendering a placeholder or broken URL. Rejected because it creates a misleading or broken customer experience.

### Validate the integration with a concrete regression test

**Chosen:** Add a test around the reminder send or template render that checks both the populated and empty URL cases.

**Rationale:** The issue is customer-visible and may silently regress if the template or normalization path falls out of sync.

**Alternative considered:** Only testing the low-level helper without exercising the reminder path. Rejected because it would miss the actual failure mode at the user-facing layer.

## Risks / Trade-offs

- [Risk] Historical invoice rows may still lack payment data if they were created before the model was populated.
  - Mitigation: Treat the URL as optional and keep the reminder content valid when the value is null.

- [Risk] Some invoices may include an invalid URL string.
  - Mitigation: Only render the link when the value is non-empty and valid at the template boundary.

- [Risk] The reminder template could still produce inconsistent output between HTML and text versions.
  - Mitigation: Use the same guard logic for both output variants and test both.

## Migration Plan

1. Validate the invoice normalization and send path for the URL field.
2. Confirm the template uses the same guard logic for populated and empty values.
3. Add regression tests covering both outcomes.
4. Ship the fix as a targeted reminder-flow correction; no database migration is required.
5. Rollback is straightforward: revert the payment-url propagation change while leaving the template optional-token behavior in place.

## Open Questions

- Is the current `paymentUrl` source guaranteed to be valid for every Stripe invoice that exposes a hosted payment page, or should the app additionally validate the URL before rendering?
- Should the same payment-link guarantee also be tested for CSV/XLSX-imported invoices once that import path is formally validated in production?
