## 1. Data model

- [x] 1.1 Add `firstChasedAt DateTime?` to `TrackedInvoice` in `prisma/schema.prisma` with an index on `(userId, firstChasedAt)`
- [x] 1.2 Add `subscriptionCurrentPeriodStart DateTime?` to `UserProfile`
- [x] 1.3 Generate the migration with `npx prisma migrate dev`
- [x] 1.4 Update `prisma/rls-policies.sql` if the new columns require policy changes, then run `npm run verify-rls`
- [x] 1.5 Write a backfill that sets `firstChasedAt` from the earliest `EmailLog.sentAt` per invoice for rows with `currentStage > 0`, and reports any such row that resolved no timestamp
- [x] 1.6 Backfill `subscriptionCurrentPeriodStart` for accounts with an active subscription, leaving it null where unknown so the fallback applies

## 2. Entitlement helpers

- [x] 2.1 Add a period resolver in `lib/billing.ts` returning `{ start, end }` for an account: billing period, then trial window, then calendar month in Australia/Melbourne
- [x] 2.2 Add a usage counter that counts `TrackedInvoice` rows for a user with `firstChasedAt` inside the resolved period
- [x] 2.3 Add a helper returning allowance, usage, remaining, and whether the account is at or above the 80% threshold, reusing `isNearLimit` from `lib/dashboardUpsell.ts` as the single threshold definition
- [x] 2.4 Ensure the helpers work under both `prismaAdmin` and `withUserContext` by accepting a client, and never issue concurrent queries on a shared transaction client
- [x] 2.5 Update `resolveCheckoutCompletion` in `lib/billing.ts` and the billing webhook to persist `subscriptionCurrentPeriodStart` from the Stripe invoice `period_start`

## 3. Send-path enforcement

- [x] 3.1 In `app/api/cron/send-emails/route.ts`, compute each account's allowance usage once per pass rather than per invoice
- [x] 3.2 Gate sending on `currentStage === 0` — where the account has no remaining allowance, skip the invoice and leave its state untouched so it is retried
- [x] 3.3 Allow invoices with `currentStage > 0` through unconditionally so sequences in progress always complete
- [x] 3.4 Set `firstChasedAt` in the same update that advances `currentStage` after the first successful send
- [x] 3.5 Increment the in-pass usage figure after each first send so a single pass cannot exceed the allowance
- [x] 3.6 Add held-invoice and per-account usage counts to the cron response so the held condition is observable

## 4. Remove ingest-time gating

- [x] 4.1 Remove the active-count limit check from `app/api/webhooks/stripe-connect/route.ts` so invoices are always created
- [x] 4.2 Remove the active-count limit check from `lib/email/catchup.ts`
- [x] 4.3 Confirm `lib/providers/accounting/sync.ts` creates invoices unconditionally and is now covered by the send-path gate — this closes the path that previously had no limit at all
- [x] 4.4 Land tasks 3 and 4 in a single commit so the product is never briefly unlimited

## 5. Dashboard

- [x] 5.1 Replace the concurrent-count usage figure in `app/dashboard/page.tsx` with period usage from the new helper
- [x] 5.2 Display usage as consumed against allowance for the current period, with the period end date
- [x] 5.3 Show a warning at 80% of allowance
- [x] 5.4 Show an at-capacity notice stating that new chases resume next period and that sequences under way continue
- [x] 5.5 Derive the held condition for invoices — `pending`, `currentStage === 0`, due, and account at capacity — and label those rows in the invoice list
- [x] 5.6 Update the near-limit messaging in `lib/dashboardUpsell.ts` to describe a period allowance rather than a capacity figure

## 6. Tests

- [x] 6.1 Test that allowance is consumed once at first chase and not by later stages
- [x] 6.2 Test that an invoice never chased consumes no allowance
- [x] 6.3 Test the period resolver across all three cases: active subscription, trialing, and neither
- [x] 6.4 Test that usage resets when the period rolls over
- [x] 6.5 Test that a sequence already in progress completes while the account is at capacity
- [x] 6.6 Test that a single cron pass cannot exceed the allowance
- [x] 6.7 Test the 80% threshold boundary at just below, exactly at, and above
- [x] 6.8 Test that period arithmetic uses whole calendar days in Australia/Melbourne, including an invoice due late in the day
- [x] 6.9 Run `npm run test` and `npm run lint`

## 7. Seed and verification

- [x] 7.1 Extend `scripts/seed-preview.ts` with an account at capacity and an invoice held for allowance
- [x] 7.2 Assert the held scenario in `scripts/verify-seed.ts`
- [x] 7.3 Run `npm run db:seed && npm run verify-seed`

## 8. Documentation

- [x] 8.1 Document the allowance model in `docs/DDD.md`: consumed once at first chase, billing-period anchored, invoices always visible
- [x] 8.2 Record in `docs/DDD.md` that `EmailLog.stage` is not a reliable indicator of a first chase, because tone escalation can promote the first email to stage 2
- [x] 8.3 Update the tier-limit description in `.github/instructions/billing.instructions.md`
- [x] 8.4 Note the new held state and the cron's held-invoice counts in `docs/runbooks/vercel.md`

## 9. Verification

- [x] 9.1 Confirm an account at capacity still receives stage 2 and stage 3 reminders for invoices already in flight
- [x] 9.2 Confirm invoices synced beyond the allowance are visible on the dashboard and are chased automatically after the period rolls over
- [x] 9.3 Confirm an accounting-connected account is now subject to the same allowance as a Stripe Connect account
