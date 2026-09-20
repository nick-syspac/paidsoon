# InvoiceGuard Operations Runbook

This runbook covers InvoiceGuard, the receivables-control module within PaidSoon, across local, preview, and production environments.

Current scope reflects shipped behavior:

- Overdue invoice intake is live from Stripe Connect, accounting syncs, and CSV/XLSX import.
- Automated reminder sequencing is live.
- Promise-to-pay, arrangement, dispute, snooze, pause, resume, and manual resolve flows are live.
- Weekly debtor summary delivery is live.
- Reminder sending depends on plan allowance only at first-chase send time; invoice tracking itself is not gated.

## 1. Operational flows

### 1.1 Invoice intake and tracking

InvoiceGuard creates and maintains `TrackedInvoice` rows from three operator-relevant intake paths:

- Stripe Connect webhook intake via `POST /api/webhooks/stripe-connect`.
- Catch-up scanning via `runCatchUpScan()` in `lib/email/catchup.ts`.
- Accounting-provider and spreadsheet import ingestion paths that persist canonical financial invoices before they are chased.

Primary paths:

- `app/api/webhooks/stripe-connect/route.ts`
- `lib/email/catchup.ts`
- `lib/providers/accounting/sync.ts`
- `app/api/invoice-imports/**`

Operational notes:

- `invoice.overdue` creates or refreshes tracked invoice state.
- `invoice.paid` marks tracked invoices paid.
- Intake is idempotent and intentionally not blocked by chase-volume allowance.

### 1.2 Reminder sequencing and cron dispatch

Primary scheduler endpoint:

- `GET /api/cron/send-emails`
- Auth: `Authorization: Bearer CRON_SECRET`

Flow in one pass:

1. Run catch-up scanning for missing overdue invoices.
2. Resume invoices whose snooze window elapsed.
3. Mark broken promises and expired or broken arrangements.
4. Exclude invoices with active promises or active arrangements from the send queue.
5. Select `pending` invoices due to send.
6. Enforce chase-volume allowance only when an invoice is about to receive its first reminder.
7. Send via Resend, persist `EmailLog`, and advance `currentStage` / `nextEmailAt`.

Primary paths:

- `app/api/cron/send-emails/route.ts`
- `lib/email/send.ts`
- `lib/email/sendReminderForInvoice.ts`
- `lib/email/deliveryGuard.ts`
- `lib/billing.ts`

### 1.3 Manual lifecycle actions

Dashboard operators and end users can transition invoice workflow state through session-authenticated routes under `app/api/invoices/[id]/**`.

Implemented actions:

- `pause`
- `resume`
- `snooze`
- `resolve`
- `dispute`
- `resolve-dispute`

Operational notes:

- `dispute` stores an optional note and moves the invoice to `disputed`.
- `resolve-dispute` returns the invoice to `pending` and updates or clears the note.
- All actions run through `withUserContext`, re-check invoice ownership, and return 404 when the invoice is not accessible to the caller.

### 1.4 Promise-to-pay and arrangement suppression

Public promise capture and internal sweep jobs materially affect whether reminders continue.

Primary paths:

- `POST /api/promise/[token]`
- `POST /api/arrangements`
- `POST /api/arrangements/[id]/status`
- `POST /api/internal/jobs/promise-arrangement-sweep`
- `POST /api/internal/jobs/catchup-snooze-sweep`

Operational behavior:

- Active promises suppress reminder sends until kept, broken, or superseded.
- Active arrangements suppress reminder sends until fulfilled, expired, broken, or cancelled.
- The sweep jobs convert overdue promises and elapsed arrangements into actionable states for later cron passes.

### 1.5 Weekly debtor summary delivery

InvoiceGuard also includes a weekly owner-facing debtor summary flow.

Primary paths:

- `POST /api/internal/jobs/send-weekly-debtor-summary`
- `lib/email/sendWeeklyDebtorSummary.ts`
- `lib/email/weeklyDebtorSummary.ts`

Operational notes:

- Delivery is idempotent per tenant and week through `WeeklyDebtorSummaryDelivery`.
- This summary goes to the freelancer or owner, not to the debtor.

## 2. Environment variables

InvoiceGuard reuses existing environment variables from the central matrix in `docs/runbooks/README.md`.

Required for reminder cron and direct reminder delivery:

- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `SUPABASE_SECRET_KEY`

Required for Railway-triggered internal jobs:

- `INTERNAL_JOBS_SECRET`

Required when Stripe is a source of overdue invoices:

- `STRIPE_SECRET_KEY`
- `STRIPE_CONNECT_WEBHOOK_SECRET`
- `STRIPE_CONNECT_CLIENT_ID`

Required when Xero or MYOB are connected as invoice sources:

- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`
- `XERO_REDIRECT_URI`
- `MYOB_CLIENT_ID`
- `MYOB_CLIENT_SECRET`
- `MYOB_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`

Setup for those external systems remains centralized in `stripe.md`, `myob.md`, `supabase.md`, `resend.md`, and `railway.md`.

## 3. Operational boundaries

Allowance and gating rules:

- Invoice intake is not blocked by plan allowance.
- First reminder sends are held when the account has no remaining chase allowance for the current period.
- Stage 2 and stage 3 reminders for an already-started sequence are not re-gated by allowance.

Current provider boundaries:

- Stripe Connect overdue and paid webhooks are operational.
- Accounting-provider syncs and spreadsheet import can feed InvoiceGuard tracking.
- Team-invite scaffolding is unrelated and should not be treated as an InvoiceGuard operational dependency.

## 4. Troubleshooting

### 4.1 Cron pass returns 401 or never sends

Likely causes:

- Missing or incorrect `CRON_SECRET`.
- Cron not running because the deployment is Preview, not Production.

Actions:

1. Confirm the request carries `Authorization: Bearer CRON_SECRET`.
2. Confirm the target environment is Production if relying on scheduled Vercel cron.
3. For local or preview testing, trigger the route manually as documented in `vercel.md`.

### 4.2 Invoices appear on the dashboard but never start chasing

Likely causes:

- The account is at chase-volume capacity for new first sends.
- The invoice has an active promise, arrangement, dispute, pause, or snooze state.

Actions:

1. Check the cron response's `held` and `usageByAccount` output.
2. Verify invoice state in the dashboard or DB: `pending`, `paused`, `snoozed`, `disputed`, or `sequence_complete`.
3. Verify there is no active promise or arrangement suppressing sends.

### 4.3 Promise-to-pay link submissions are not affecting reminder state

Likely causes:

- The invoice has no valid `p2pToken` yet because no reminder has been sent.
- The promise-arrangement sweep has not run since the promised date elapsed.

Actions:

1. Confirm a first reminder has been sent and the invoice has a persisted `p2pToken`.
2. Confirm `POST /api/promise/[token]` succeeds for the token in the email.
3. If the promise is overdue, run the internal promise-arrangement sweep and re-check invoice state.

### 4.4 Stripe overdue invoices are not being tracked

Likely causes:

- Stripe Connect webhook delivery failed or signature verification is using the wrong secret.
- The tenant has not completed the Stripe Connect OAuth flow.

Actions:

1. Verify `STRIPE_CONNECT_WEBHOOK_SECRET` and raw-body signature forwarding.
2. Check webhook delivery logs in Stripe.
3. Confirm the tenant has a valid InvoiceConnection and completed Stripe Connect onboarding.
4. Run catch-up scanning or accounting sync if recovery from missed webhook delivery is needed.

### 4.5 Weekly debtor summary does not send

Likely causes:

- `INTERNAL_JOBS_SECRET` mismatch between caller and app.
- Missing or invalid Resend configuration.
- The delivery row for the current week already exists and the send is being deduplicated.

Actions:

1. Verify `INTERNAL_JOBS_SECRET` and `RESEND_*` configuration.
2. Check the current week's `WeeklyDebtorSummaryDelivery` row for `sent` or `failed` status.
3. Retry one internal-job call only after confirming the current week has not already been delivered successfully.