## Why

PaidSoon includes a Stripe billing webhook and tracks a `subscriptionStatus` field, but the release audit shows that the `invoice.payment_failed` handling is not robust enough for a product that bills customers. In a production release, failed card payments must have a defined customer and system impact: the account should move into a limited or past-due state, diagnostics should be recorded, and the operator must be able to detect the failure without manual DB edits.

## What Changes

- Define the production state transition for invoice failure events on the customer account.
- Enforce the correct subscription/billing status logic for failed Stripe invoices.
- Add explicit audit or status metadata so operators can reconcile the event with the customer lifecycle.
- Include safe fallback handling when a customer cannot be matched to a user profile.
- Add tests covering both the matched and unmatched customer scenarios.

## Capabilities

### New Capabilities
- `billing-failure-state-machine`: a predictable, documented post-failure state for customers whose invoices fail to pay.

### Modified Capabilities
- `stripe-billing-webhook-processing`: expand the event-handling contract beyond checkout and cancellation to include failed-payment events with clean customer state transitions.
- `subscription-entitlement-enforcement`: ensure failed payments do not silently leave the account in a paid state indefinitely.

## Impact

- Affected code:
  - `app/api/webhooks/stripe-billing/route.ts`
  - `lib/billing.ts` or adjacent entitlement logic if needed
  - related billing tests under `tests/`
- Affected systems:
  - Stripe billing, customer status, operator visibility
- No schema migration is required unless the product decides to persist a richer billing failure reason.
- This is a customer-impacting production correctness fix.

## Release Criteria

- A failed Stripe invoice results in a documented customer state change that aligns with the product’s billing policy.
- The webhook responds safely for unmatched customer IDs without mutating the wrong account.
- A regression test captures this exact failure mode before release.
