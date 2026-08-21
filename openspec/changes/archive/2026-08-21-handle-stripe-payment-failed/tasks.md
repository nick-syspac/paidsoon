## 1. Webhook handler

- [x] 1.1 Add a `case "invoice.payment_failed":` branch to the `switch` in
      `app/api/webhooks/stripe-billing/route.ts`
- [x] 1.2 Look up the `UserProfile` by `stripeCustomerId` matching the
      failed invoice's `customer` field, mirroring the existing lookup
      pattern in `customer.subscription.updated`/`.deleted`
- [x] 1.3 Update `UserProfile.subscriptionStatus` to `"past_due"` when a
      matching profile is found; make no changes when none is found and
      still return a 200 response

## 2. Tests

- [x] 2.1 Create a route-level test file for `stripe-billing` webhook
      events (none currently exists) covering `invoice.payment_failed`
- [x] 2.2 Add a test asserting `subscriptionStatus` becomes `"past_due"`
      and `subscriptionTier` is unchanged for a matching customer
- [x] 2.3 Add a test asserting a 200 response and no DB writes for an
      event with no matching `UserProfile`
- [x] 2.4 Run `npm run test` and confirm the full suite passes

## 3. Documentation

- [x] 3.1 Update `docs/DDD.md` and `docs/HLD.md` to remove the "not
      implemented" notes for `invoice.payment_failed` once this ships

## 4. Verification

- [x] 4.1 Run `npm run lint` and `npx tsc --noEmit` and confirm no new
      errors are introduced
