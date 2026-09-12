## 1. Baseline audit and schema readiness

- [ ] 1.1 Inventory current billing/trial fields and logic in `UserProfile`, checkout, checkout-success, webhook, dashboard guards, and admin trial actions.
- [ ] 1.2 Confirm existing plan catalog, plan names, entitlements, and plan-to-price env mappings remain unchanged.
- [ ] 1.3 Add Prisma schema fields (nullable) only if missing for required Stripe projection (`price_id`, `cancel_at_period_end`, `latest_stripe_event_created_at`) and generate migration.
- [ ] 1.4 Update `prisma/rls-policies.sql` only if new billing columns require policy adjustments.

## 2. Checkout trial authority migration

- [ ] 2.1 Update `app/api/billing/checkout/route.ts` to set Stripe-managed trial config (`subscription_data.trial_period_days`) from `STRIPE_TRIAL_PERIOD_DAYS` for eligible self-serve plans.
- [ ] 2.2 Preserve existing per-plan Stripe Price ID selection logic, including non-checkout handling for contact-only tiers.
- [ ] 2.3 Reuse existing Stripe customer IDs and prevent duplicate active/trialing subscription creation before creating new checkout sessions.
- [ ] 2.4 Remove checkout-time local trial expiry writes and metadata keys that conflict with webhook reconciliation.
- [ ] 2.5 Ensure checkout response/output never exposes `STRIPE_SECRET_KEY` or other server-only secrets.

## 3. Checkout-success reconciliation hardening

- [ ] 3.1 Update `app/api/billing/checkout/success/route.ts` to reconcile Stripe subscription state without setting local trial-expiry heuristics.
- [ ] 3.2 Persist Stripe-backed subscription fields from retrieved session/subscription snapshot (status, trial end, current period, tier, IDs) using existing user ownership safeguards.
- [ ] 3.3 Ensure reconciliation is idempotent and safe when webhook already applied the same update.

## 4. Webhook lifecycle and idempotency

- [ ] 4.1 Keep strict Stripe signature verification and explicit failure response for invalid signatures in `app/api/webhooks/stripe-billing/route.ts`.
- [ ] 4.2 Add/confirm handlers for required events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.
- [ ] 4.3 Implement durable event deduplication using stored Stripe event IDs and return success for already-processed events.
- [ ] 4.4 Implement out-of-order protection using `event.created` watermark so stale events cannot overwrite newer subscription state.
- [ ] 4.5 Resolve user identity through metadata, `stripe_customer_id`, and `stripe_subscription_id` fallbacks when metadata is absent.
- [ ] 4.6 Persist Stripe lifecycle projection fields (`stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `trial_end`, `current_period_end`, `price_id`, `cancel_at_period_end`, `subscriptionTier`) via `prismaAdmin`.
- [ ] 4.7 Add safe diagnostics for webhook processing outcomes without logging secrets or payment instrument details.

## 5. Access-control and guard refactor

- [ ] 5.1 Refactor subscription guards in dashboard layout, middleware/proxy checks, server actions, and API routes to use Stripe-backed status matrix.
- [ ] 5.2 Enforce status outcomes: `trialing` and `active` grant access; `past_due` retains access with warning; `incomplete` blocks full access; `unpaid` and `canceled` revoke access.
- [ ] 5.3 Remove account-age and local `trialEndsAt` arithmetic as an authoritative access-control source.
- [ ] 5.4 Update `lib/billing.ts` allowance/trial window logic to avoid local trial-expiry authority conflicts while keeping allowance period behavior consistent.

## 6. Billing and account UI updates

- [ ] 6.1 Update billing/account views to display Stripe-backed current plan, status, trial end, first/next billing date, and cancellation-at-period-end state.
- [ ] 6.2 Add status-specific billing warnings for `past_due`, `incomplete`, and `unpaid`.
- [ ] 6.3 Remove or refactor UI copy/components that infer trial-active state from local date ranges only.

## 7. Admin and operational trial controls

- [ ] 7.1 Update admin diagnostics (`trial-lapsed`) to rely on Stripe-synchronized status/date fields, not locally synthesized trial state.
- [ ] 7.2 Update admin extend-trial corrective action to extend trial through Stripe subscription APIs and synchronize resulting values back to `UserProfile`.

## 8. Tests and verification

- [ ] 8.1 Add route test: checkout creates Stripe subscription session with configured trial days for eligible plans.
- [ ] 8.2 Add route test: each current plan maps to the correct Stripe Price ID and no cross-plan fallback occurs.
- [ ] 8.3 Add security test: checkout path never exposes Stripe secret key.
- [ ] 8.4 Add route test: duplicate active/trialing subscription checkout requests are rejected.
- [ ] 8.5 Add integration-style route test: checkout completion links Stripe customer and subscription IDs.
- [ ] 8.6 Add webhook test: subscription created stores `trialing` status and `trial_end`.
- [ ] 8.7 Add webhook test: subscription update changes plan, status, dates, and cancel-at-period-end flag.
- [ ] 8.8 Add webhook test: subscription deletion revokes access state and applies downgrade side effects safely.
- [ ] 8.9 Add webhook test: `invoice.paid` transitions/reinforces active billing state.
- [ ] 8.10 Add webhook test: `invoice.payment_failed` sets billing warning/past-due state.
- [ ] 8.11 Add webhook test: duplicate webhook delivery is idempotent.
- [ ] 8.12 Add webhook test: older webhook events cannot overwrite newer state.
- [ ] 8.13 Add webhook test: missing metadata resolves through Stripe customer/subscription IDs.
- [ ] 8.14 Add access test: `trialing` status grants trial access.
- [ ] 8.15 Add access test: `canceled` and `unpaid` statuses revoke access.
- [ ] 8.16 Add regression test suite for existing users/subscriptions to ensure no destructive state changes.

## 9. Docs and rollout checks

- [ ] 9.1 Update `docs/DDD.md` billing section to describe Stripe-authoritative trial/status behavior and expanded webhook coverage.
- [ ] 9.2 Update `docs/runbooks/README.md` and Stripe runbook entries for required env vars (`STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `STRIPE_TRIAL_PERIOD_DAYS`).
- [ ] 9.3 Validate `npm run lint`, `npm run test`, `npx tsc --noEmit`, and `next build` pass after implementation.
- [ ] 9.4 Validate Stripe test-mode flow with Stripe CLI event replay fixtures for lifecycle and idempotency scenarios.
