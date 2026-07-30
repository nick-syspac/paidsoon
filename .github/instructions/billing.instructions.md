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

Four tiers defined in `lib/subscriptionPlans.ts` (source of truth) — three public, customer-selectable tiers plus one hidden, contact-only tier:

| Tier | Visibility | Price (AUD, inc. GST) | Invoice Allowance/period | Seats | Connected Invoice Sources |
|------|------------|------------------------|---------------------------|-------|----------------------------|
| `starter` | public | $9/mo | 10 | 1 | 1 |
| `solo` | public ("Most Popular") | $19/mo | 50 | 1 | 1 |
| `small_business` | public | $39/mo | 200 | 3 (usable seats not yet implemented) | 1 |
| `accountant_partner` | contact-only (hidden from pricing page & upgrade recommendations) | contact-us (planned — not yet implemented) | unlimited | unlimited | unlimited |

**No legacy tier aliasing.** `normalizeSubscriptionTier` in `lib/subscriptionPlans.ts` returns `starter` for any value outside the four tiers above — there is no `LEGACY_TIER_MAP`. Use `getPublicPlans()` to get only the three customer-selectable tiers (for pricing pages, plan pickers, and upgrade recommendations); it excludes `accountant_partner`.

**Invoice allowance enforcement** (counting, resets, 80% warning, pausing at 100%) is defined by the `chase-volume-entitlement` capability, not by the catalog itself — see `changes/monthly-chase-volume-limits`.

## Feature Checks

- Use `hasPlanFeature(tier, feature)` from `lib/billing.ts` for feature flag checks.
- Use `requireFeature(userId, feature)` in route handlers — returns `403` if not entitled.
- Available feature flags (defined in `lib/subscriptionPlans.ts`):
  - `basic_email_reminders`, `basic_templates`, `paid_soon_branding`, `payment_status_dashboard`,
    `overdue_invoice_dashboard`, `accounting_integrations`, `promise_to_pay_tracking`,
    `dispute_pause` (all paid tiers — the core follow-up promise is never gated)
  - `email_reminder_sequence` (custom timing, solo+), `custom_reminder_templates` (solo+),
    `custom_sender_name` (solo+), `ai_rewrite`, `tone_settings` (solo+)
  - `custom_reply_to` (all paid tiers) and `verified_from_domain` (small_business+) —
    together with `custom_sender_name` these form the sender-identity ladder; there is no
    single `own_email_address` flag
  - `customer_specific_sequences`, `multi_template_customer_wording`, `weekly_summary_email`,
    `csv_export`, `approval_mode`, `contact_suppression`, `team_seats`, `multi_client_management`
    (planned — not yet implemented on any tier; check `isFeatureImplemented(feature)` /
    `UNIMPLEMENTED_FEATURES` before presenting these as available)
- Never add or change features without updating `lib/subscriptionPlans.ts`.

## Stripe Price IDs

- Stored as env vars — never hardcoded. Exactly three canonical variables, one per public tier:
  - `STRIPE_STARTER_PRICE_ID`
  - `STRIPE_SOLO_PRICE_ID`
  - `STRIPE_SMALL_BUSINESS_PRICE_ID`
  - `accountant_partner` has no Price ID — it is contact-us only, never sold through Stripe Checkout.
  - `STRIPE_BUSINESS_PRICE_ID` and `STRIPE_PRO_PRICE_ID` have been retired — do not reintroduce them.
- All three Prices must carry `tax_behavior: "inclusive"` (prices are GST-inclusive). This
  attribute is immutable once set — changing it requires creating a new Price object, not
  editing the existing one.
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
