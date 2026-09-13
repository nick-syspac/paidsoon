## Why

PaidSoon currently mixes Stripe billing state with locally calculated trial state (`trialEndsAt`), which can create stale access decisions, duplicate subscription attempts, and inconsistent user messaging. Moving trial lifecycle authority fully to Stripe now reduces billing risk and aligns checkout, webhook, entitlement, and UI behavior to a single source of truth.

PaidSoon also uses legacy internal tier identifiers (`starter`, `solo`) that no longer match the canonical plan naming direction. Renaming these identifiers to `essentials` and `business_control` across runtime code, tests, seeds, and schema defaults is required so tier semantics stay consistent throughout billing, gating, and UI flows.

## What Changes

- Rename internal plan identifiers from `starter` to `essentials` and from `solo` to `business_control` across application code, tests, seed scripts, and schema defaults.
- Add compatibility normalization so legacy persisted or incoming tier values (`starter`, `solo`) resolve to the new identifiers (`essentials`, `business_control`) without breaking existing accounts or webhooks.
- Update `POST /api/billing/checkout` so eligible new subscriptions are created with Stripe-managed trial configuration (`trial_period_days`) and metadata, while preserving existing plan-to-price mapping and contact-only plan restrictions.
- Prevent duplicate subscription creation by rejecting checkout initiation when an active or trialing subscription already exists for the user.
- Reuse existing Stripe customers and avoid creating any local trial-expiry timestamps during checkout.
- Extend Stripe billing webhook handling to include `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.trial_will_end` with idempotent processing and out-of-order protection.
- Persist Stripe-sourced subscription fields on `UserProfile` (where supported by schema), including customer/subscription identifiers, status, tier, trial/billing dates, cancellation flags, and effective price ID.
- Refactor trial/access guards across dashboard and server routes to use Stripe-synchronized status and dates (`trialing`, `active`, `past_due`, `incomplete`, `unpaid`, `canceled`) instead of account-age or locally computed trial expiration logic.
- Update billing/account UI to show Stripe-backed subscription state (plan, status, trial end, first payment date/current period end, and cancellation-at-period-end indicators) and explicit warning states for `past_due`, `incomplete`, and `unpaid`.
- Remove obsolete local trial-calculation and auto-expiry logic, including outdated tests that only validate date arithmetic detached from Stripe lifecycle events.
- Add and update tests for checkout session creation with trials, plan-to-price correctness, secret-key non-exposure, webhook idempotency/order handling, and status-based access decisions.
- Keep existing Stripe Price ID environment variables and plan pricing unchanged while remapping them to the renamed internal identifiers.

## Capabilities

### New Capabilities
- `stripe-authoritative-trial-lifecycle`: Defines checkout and subscription lifecycle behavior where Stripe is authoritative for trial start/end, first billing date, and subscription state transitions.
- `stripe-billing-state-reconciliation`: Defines idempotent webhook-driven synchronization of Stripe subscription state into `UserProfile`, including duplicate delivery safety and out-of-order event protection.
- `stripe-status-based-access-control`: Defines subscription access outcomes and warning states based on Stripe-backed statuses rather than local trial date calculations.

### Modified Capabilities
- `subscription-plan-tiers`: internal tier identifiers, default-tier behavior, and plan-selector normalization are updated to use `essentials` and `business_control` while preserving existing plan names, pricing, and feature limits.
- `subscription-downgrade-scheduling`: Existing checkout and webhook persistence requirements must be aligned with Stripe-authoritative trial/state fields and duplicate-subscription protections.
- `subscription-payment-failure-handling`: Payment failure handling remains `past_due`-based but is expanded to fit the broader Stripe status matrix and reconciliation safeguards.
- `admin-diagnostics-engine`: Trial-lapse diagnostics must evaluate Stripe-synchronized trial fields/statuses, not independently calculated local expiry rules.
- `admin-corrective-actions`: Trial corrective workflows must be updated to avoid local-only trial extension semantics that conflict with Stripe authority.

## Impact

- Billing routes: `app/api/billing/checkout/route.ts`, `app/api/billing/checkout/success/route.ts`, `app/api/billing/cancel/route.ts`, and related billing helpers in `lib/billing/**`.
- Billing webhook: `app/api/webhooks/stripe-billing/route.ts` and Stripe helper modules.
- Access and guard surfaces: dashboard layout and any middleware/server action/API checks that currently depend on local trial-expiry calculations.
- Plan and entitlement layer: internal tier IDs are renamed (`essentials`, `business_control`) with legacy alias support; plan names, pricing, feature limits, and Stripe Price IDs remain intact.
- Data layer: `prisma/schema.prisma` and migration(s) only if required to store Stripe-native subscription fields not already represented.
- Tests: webhook route tests, checkout route tests, subscription/access gating tests, and retirement/refactor of local trial-arithmetic-only tests.
- Documentation/runbooks: billing architecture and env-var guidance for Stripe trial period configuration and webhook event coverage.
