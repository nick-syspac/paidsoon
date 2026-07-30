## Why

PaidSoon's plans are sold on invoice volume, but the system does not measure invoice volume.
The `chasedInvoicesPerMonth` limit is enforced as a *concurrent* cap on invoices in `pending`
or `snoozed` status, never resets, and causes over-limit invoices to be silently discarded at
ingest — they are never created, so the customer cannot see them at all.

Worse, the cap is applied on only two of three ingest paths. The accounting sync used by MYOB
and Xero applies no limit whatsoever, so an accounting-connected customer on any tier
currently has an unlimited plan.

The commercial model requires a different meaning: an invoice consumes allowance once, when
its first reminder is sent; the allowance resets each billing period; every synced invoice
stays visible regardless of plan; and reaching the cap pauses *new* chases while sequences
already in flight run to completion.

## What Changes

- **BREAKING** The chased-invoice allowance changes from a concurrent cap on active invoices
  to a per-billing-period count of invoices that have entered follow-up.
- **BREAKING** Invoices are no longer discarded at ingest when the account is at its limit.
  Every synced invoice is created and visible; the limit governs whether follow-up begins,
  not whether the invoice exists.
- Allowance is consumed at first reminder send. Stage 2 and stage 3 reminders never consume
  allowance and are never blocked, so a sequence already under way always completes.
- The allowance period is anchored to the subscription billing period. Accounts in trial use
  the trial window as their first period.
- Accounts are warned at 80% of their allowance and told they have reached capacity at 100%.
- Invoices that cannot start follow-up because the account is at capacity are held in an
  explicit waiting state, are visible on the dashboard, and begin follow-up automatically
  when the next period starts.
- The accounting sync path is brought under the same entitlement rules as the Stripe Connect
  and catch-up paths, closing the unlimited-plan hole.
- No overage charging is introduced.

## Capabilities

### New Capabilities

- `chase-volume-entitlement`: how invoice-chasing allowance is counted, when it is consumed,
  how the period is anchored, what happens at 80% and 100% of allowance, and how invoices
  above the allowance are represented.

### Modified Capabilities

- `subscription-plan-tiers`: the chased-invoice allowance requirement is amended to delegate
  enforcement semantics to `chase-volume-entitlement` rather than implying a concurrent cap.

## Impact

**Entitlement logic**
- `lib/billing.ts` — `getInvoiceLimitForTier` and `DEFAULT_INVOICE_LIMIT`; new period
  resolution and usage-counting helpers.

**Ingest paths — the limit check is removed from all three**
- `app/api/webhooks/stripe-connect/route.ts`
- `lib/email/catchup.ts`
- `lib/providers/accounting/sync.ts` — currently has no check at all

**Send path — the limit check is added here**
- `app/api/cron/send-emails/route.ts` — stage 1 sends consume and are gated by allowance;
  stage 2 and 3 are unaffected.

**Data**
- `prisma/schema.prisma` — `TrackedInvoice` gains a state representing "synced but awaiting
  allowance"; the invoice state machine and its RLS policies must accommodate it.
- Usage is derived from `EmailLog` rather than stored, so no counter column is introduced.

**Presentation**
- `app/dashboard/page.tsx` — usage indicator, 80% warning, at-capacity notice, and rendering
  of invoices awaiting allowance.
- `lib/dashboardUpsell.ts` — `isNearLimit` and the near-limit messaging now describe a
  period-based allowance.
- `components/dashboard/**` — invoice list must represent the waiting state.

**Depends on**
- `restore-three-tier-pricing` supplies the allowance values (10 / 50 / 200) and the tier
  identifiers this change enforces against.

## Non-goals

- Overage charging or paid top-ups.
- Changing the allowance values themselves.
- Hard limits on seats or connected invoice sources.
- Reminder scheduling, timing, or template behaviour.
