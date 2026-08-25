## 1. Billing webhook contract

- [x] 1.1 Confirm the `invoice.payment_failed` event maps to a known Stripe customer and `UserProfile` lookup.
- [x] 1.2 Update the webhook so that a matched customer transitions to `subscriptionStatus: "past_due"` without changing the tier.
- [x] 1.3 Ensure the webhook safely exits without mutation when the customer cannot be resolved.

## 2. Regression coverage

- [x] 2.1 Add or update a test for the matched customer path asserting the `past_due` state change.
- [x] 2.2 Add or update a test for the unmatched customer path asserting no DB mutation and a 200 response.
- [x] 2.3 Verify the tests reflect the current product contract that feature access remains tied to the unchanged tier until cancellation.

## 3. Release validation

- [x] 3.1 Run the focused Stripe billing webhook tests.
- [x] 3.2 Confirm the webhook behavior matches the spec for payment failures and unknown customers.
- [x] 3.3 Confirm the release criterion is met: failed Stripe invoices produce a clear billing state transition without unsafe account mutation.
