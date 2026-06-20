---
applyTo: "**/lib/billing*,**/lib/subscriptionPlans*,**/app/api/billing/**,**/app/api/webhooks/stripe-billing/**"
---

# Billing Instructions — PaidSoon

## Billing Provider

- Stripe (`stripe@22.1.1`) with API version `"2026-05-27.dahlia"`.
- Do not change the API version string — it must match the installed Stripe type definitions.
- Stripe is used for: subscription billing (Checkout + Customer Portal) and invoice data (Connect OAuth).
- Both are confirmed implemented in the codebase.

## Subscription Tiers

Three tiers defined in `lib/subscriptionPlans.ts` (source of truth):

| Tier | Price | Invoice Limit | Seats | Connect Accounts |
|------|-------|---------------|-------|------------------|
| `starter` | £9/mo | 10/month | 1 | 1 |
| `solo` | £19/mo | 30/month | 1 | 1 |
| `small_business` | £39/mo | 100/month | 3 | 3 |

**Legacy tier names:** `"free"` maps to `"starter"`, `"pro"` maps to `"solo"` — handled by backward-compat logic in `lib/subscriptionPlans.ts`.

## Feature Checks

- Use `hasPlanFeature(tier, feature)` from `lib/billing.ts` for feature flag checks.
- Use `requireFeature(userId, feature)` in route handlers — returns `403` if not entitled.
- Available feature flags (defined in `lib/subscriptionPlans.ts`):
  - `basic_email_reminders`, `email_reminder_sequence`, `basic_templates`
  - `custom_reminder_templates` (small_business only)
  - `own_email_address` (solo+)
  - `ai_rewrite`, `tone_settings` (small_business only — scaffolded, not fully implemented)
  - `payment_status_dashboard`, `overdue_invoice_dashboard` (solo+)
- Never add or change features without updating `lib/subscriptionPlans.ts`.

## Stripe Price IDs

- Stored as env vars — never hardcoded:
  - `STRIPE_STARTER_PRICE_ID`
  - `STRIPE_SOLO_PRICE_ID`
  - `STRIPE_SMALL_BUSINESS_PRICE_ID`
  - `STRIPE_PRO_PRICE_ID` (legacy fallback mapping to Solo)
- These must be set in all Vercel environments that use billing.

## Checkout Flow

- Route: `POST /api/billing/checkout`
- Creates or reuses a Stripe Customer for the user.
- Creates a Checkout Session with the requested price ID.
- Passes `metadata: { userId, selectedTier }` to the session for webhook correlation.
- Returns the Checkout URL.

## Customer Portal

- Route: `POST /api/billing/portal`
- Creates a Stripe Billing Portal session.
- Returns the portal URL.
- Users can manage/cancel subscriptions from the portal.

## Webhook Safety

- Billing webhook: `POST /api/webhooks/stripe-billing`
- MUST verify signature against `STRIPE_BILLING_WEBHOOK_SECRET` before processing.
- Handles:
  - `checkout.session.completed` → update `UserProfile.subscriptionTier`
  - `customer.subscription.updated` → update tier + status
  - `customer.subscription.deleted` → downgrade to `starter`
- All webhook DB writes use `prismaAdmin` (RLS bypass is intentional).
- Return `200` quickly for unhandled event types — never return `4xx` for unknown events from Stripe.

## Subscription Status Rules

- `subscriptionStatus` on `UserProfile` can be: `active`, `cancelled`, `past_due`.
- Only downgrade a user's tier when Stripe sends an explicit webhook event.
- Never downgrade programmatically based on payment failures without a corresponding Stripe event.
- If `subscriptionStatus` becomes `past_due`, features remain available until the subscription is actually cancelled (grace period is Stripe's responsibility).

## Idempotency

- Stripe webhooks may be delivered multiple times. Use `event.id` or `event.data.object.id` to detect duplicates.
- Checkout completion: use `checkout.session.id` to avoid applying the same checkout twice.
- All billing DB updates should be idempotent (upsert or check-before-update).

## Test Mode vs Live Mode

- Use Stripe test keys (`sk_test_...`) in development and preview environments.
- Use Stripe live keys (`sk_live_...`) in production only.
- Test webhooks locally with the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing`.
- Never use live keys in development or commit any Stripe keys to source control.

## Connect Stripe Credentials

- Stripe Connect is used for reading invoices (not for billing).
- Connect webhook: `POST /api/webhooks/stripe-connect`
- Verified against `STRIPE_CONNECT_WEBHOOK_SECRET` (separate from billing webhook secret).
- See `.github/instructions/backend-api.instructions.md` for webhook security rules.
