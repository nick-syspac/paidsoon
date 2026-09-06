## Context

See proposal.md for motivation. The current billing webhook already handles checkout and subscription lifecycle changes, and the failed-payment event is the remaining edge in the customer billing flow. The production concern is not whether the event is received, but whether it results in a consistent customer state without accidentally mutating the wrong account or leaving the system in an ambiguous paid state.

## Goals / Non-Goals

**Goals:**
- Ensure `invoice.payment_failed` transitions a matched customer into a documented past-due state.
- Keep the webhook idempotent and safe when the Stripe customer cannot be mapped to a `UserProfile`.
- Preserve the existing tier and feature-eligibility rules until an explicit cancellation or downgrade event occurs.

**Non-Goals:**
- Reworking the feature-gating model itself.
- Making billing downgrades or cancellations depend on a failed invoice event.
- Introducing a new persistence model solely for failure metadata.

## Decisions

### Keep the state transition narrow and explicit

**Chosen:** The system updates only `subscriptionStatus` to `"past_due"` when the failed invoice is matched to a known customer profile.

**Rationale:** This matches the project’s current billing semantics: failed renewals are treated as a payment problem, not a tier downgrade. It keeps the failed-payment event separate from cancellation logic and avoids silently changing entitlements.

**Alternative considered:** Changing the tier or revoking features immediately. Rejected because the product design and existing spec explicitly treat feature access as unchanged until a `customer.subscription.deleted` event.

### Fail closed for unknown Stripe customers

**Chosen:** The webhook returns a `200` response and performs no mutation when no `UserProfile` matches the invoice customer.

**Rationale:** A billing failure event for an unmapped customer should not cause a DB mutation against the wrong account. This keeps the webhook safe and prevents accidental cross-account side effects.

**Alternative considered:** Creating a fallback customer record or guess-based match. Rejected because it would create data corruption risk.

### Keep the handler logic event-specific

**Chosen:** The payment-failure logic remains isolated in the `invoice.payment_failed` branch of the webhook switch, rather than being bundled into broader subscription-update handling.

**Rationale:** This is a distinct Stripe event with a distinct state transition and a dedicated risk profile. Isolating it makes the behavior easier to test and easier to reason about during Stripe API changes.

**Alternative considered:** Treating payment failures as a variant of `customer.subscription.updated`. Rejected because that would broaden the contract and obscure the customer-state boundary.

## Risks / Trade-offs

- [Risk] The Stripe customer ID may not be present or may not match a `UserProfile` in the first release.
  - Mitigation: The webhook exits safely and does not mutate unrelated data.

- [Risk] A past-due state can be ambiguous if operators expect an immediate entitlement change.
  - Mitigation: Keep the status semantics explicit and documented in the spec; preserve the existing tier until a separate cancellation event.

- [Risk] The webhook path may be exercised by future invoice types beyond renewals.
  - Mitigation: Keep the event-specific branch narrow and validate the exact invoice type during implementation.

## Migration Plan

1. Update the billing webhook branch for `invoice.payment_failed` to follow the documented state transition.
2. Keep the tier unchanged and preserve existing entitlement logic for uncovered payment failures.
3. Add a regression test for both the matched and unmatched customer paths.
4. Deploy behind the usual Stripe webhook rollout and verify the live event payload shape in staging.
5. Rollback is straightforward: revert the webhook branch to the previous state while retaining the existing customer subscription logic.

## Open Questions

- None at this stage; the event contract and customer-state boundary are already defined in the proposal and spec.
