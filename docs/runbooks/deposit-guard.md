# DepositGuard Operations Runbook

This runbook covers DepositGuard reminder dispatch and payment-provider operations for local, preview, and production environments.

Current scope reflects shipped MVP behavior:

- Deposit requests and lifecycle tracking are live.
- Reminder scheduling and dispatch are live.
- Public payment request links are live.
- Manual payment recording is live.
- Stripe connected-account collection and advanced reconciliation are planned and setup-dependent.

## 1. Operational flows

### 1.1 Reminder scheduling

Deposit reminders are scheduled when a deposit request is created or reseeded from settings-driven policy.

Primary paths:

- `lib/depositGuard/reminders.ts` builds schedules and seeds rows in `deposit_reminders`.
- `lib/depositGuard/requests.ts` calls reminder seeding during request creation.

### 1.2 Reminder dispatch

Worker/internal dispatch endpoint:

- `POST /api/internal/jobs/send-deposit-reminder`
- Auth: `Authorization: Bearer INTERNAL_JOBS_SECRET`
- Body: `{ "reminderId": "<id>" }`

Dispatch behavior:

- Skips reminders for paid/cancelled/expired/failed requests.
- Skips reminders not yet due.
- Marks reminder rows with `sent`, `failed`, `skipped`, or `cancelled` status.
- Emits `deposit_guard_events` rows for sent reminders.

Core handler:

- `lib/depositGuard/reminderDelivery.ts`

### 1.3 Payment-provider webhook ingestion

Webhook endpoint:

- `POST /api/webhooks/deposit-payments?provider=stripe_connect`

Behavior:

- Verifies Stripe signature before acknowledging.
- Persists idempotent delivery rows in `deposit_payment_webhook_events`.
- Returns `{ received: true }` style acknowledgements for supported or safely ignored events.

Core handler:

- `lib/depositGuard/payments/webhooks.ts`
- Provider implementation: `lib/depositGuard/payments/stripeConnectProvider.ts`

## 2. Environment variables

DepositGuard reuses existing environment variables from the central matrix in `docs/runbooks/README.md`.

Required for reminder dispatch:

- `INTERNAL_JOBS_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`

Required for Stripe webhook verification:

- `STRIPE_SECRET_KEY`
- `STRIPE_DEPOSIT_WEBHOOK_SECRET` (optional override)
- Fallback: `STRIPE_CONNECT_WEBHOOK_SECRET` when `STRIPE_DEPOSIT_WEBHOOK_SECRET` is unset

## 3. Provider readiness and planned scope

Provider status for `paymentProviderDefault`:

- `manual_external_link`: operational MVP path.
- `stripe_connect`: accepted by configuration and webhook plumbing, but request creation returns `setup_required` until connected-account collection is enabled.

The planned Stripe path must stay labelled planned in operator and marketing docs until checkout/session creation and reconciliation are production-ready.

## 4. Troubleshooting

### 4.1 Internal reminder dispatch returns 401

Likely cause:

- Missing or mismatched `INTERNAL_JOBS_SECRET` between caller and app.

Actions:

1. Compare caller secret and deployment secret value source.
2. Rotate secret in both systems if drift is suspected.
3. Retry the call with one reminder id.

### 4.2 Reminder status remains `failed` with `send_failed`

Likely causes:

- Missing/invalid `RESEND_API_KEY`.
- `RESEND_FROM_EMAIL` sender not valid for the environment.

Actions:

1. Verify `RESEND_*` values in runtime env.
2. Trigger one reminder through internal job endpoint.
3. Confirm `providerMessageId` appears on success.

### 4.3 Reminder status is `skipped` with `missing_recipient_email`

Likely cause:

- Deposit request's customer contact has no email.

Actions:

1. Update customer contact email in the dashboard data path.
2. Re-issue the request or manually trigger reminder rescheduling if policy changed.

### 4.4 Payment webhook returns 400 `Invalid signature`

Likely causes:

- Missing `stripe-signature` header.
- Wrong webhook secret.
- Payload was transformed before verification.

Actions:

1. Ensure raw body is forwarded and signature header is preserved.
2. Verify `STRIPE_DEPOSIT_WEBHOOK_SECRET` or fallback `STRIPE_CONNECT_WEBHOOK_SECRET`.
3. Replay one Stripe test event.

### 4.5 Provider returns `setup_required`

Likely cause:

- `stripe_connect` payment request creation is not enabled for the MVP path.

Actions:

1. Use `manual_external_link` for current operations.
2. Track Stripe connected-account rollout under the DepositGuard Phase 2 change plan.
