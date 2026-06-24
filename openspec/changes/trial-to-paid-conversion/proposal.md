## Why

The 14-day free trial is implemented and tracked in the DB, but the user journey from "trial user" to "paying subscriber" is broken: the trial expiry gate redirects to a page that doesn't exist (`/billing/checkout`), and the TrialBanner's "Add payment" link leads to the subscription settings page which has no checkout trigger. Users whose trials expire hit a 404 and have no path to pay.

## What Changes

- Create `app/billing/checkout/page.tsx` — a server-rendered page that reads `?plan=<tier>` from the query string, calls `POST /api/billing/checkout`, and redirects the browser to the Stripe Checkout URL. Acts as the conversion page for both the expiry gate and the "Add payment" CTA.
- Fix the trial expiry redirect in `app/dashboard/layout.tsx` to point to the new page (already correctly targets `/billing/checkout?plan=<tier>&reason=trial_expired`).
- Fix the TrialBanner `checkoutUrl` in `app/dashboard/layout.tsx` to point to `/billing/checkout?plan=<tier>` instead of `/dashboard/settings/subscription?plan=<tier>`.
- Update `app/dashboard/settings/subscription/page.tsx` to read the `plan` query param and pass it to `SubscriptionClient` so the correct plan is pre-selected when a user arrives from the banner.

## Capabilities

### New Capabilities

- `trial-to-paid-checkout`: The page and flow that converts a trialing user to a paying subscriber — handles both the "Add payment during trial" path and the "trial expired, must pay to continue" gate.

### Modified Capabilities

- `subscription-plan-tiers`: The trial expiry gate and banner link are part of the subscription lifecycle. The checkout redirect URLs and the gate logic are changing behaviour (broken → working), which is a spec-level correction.

## Impact

- **`app/billing/checkout/page.tsx`** (new): Server component, reads `?plan` param, server-side fetch to `POST /api/billing/checkout`, redirects to Stripe Checkout URL. No client JS required.
- **`app/dashboard/layout.tsx`**: `checkoutUrl` passed to `TrialBanner` changed from `/dashboard/settings/subscription?plan=...` to `/billing/checkout?plan=...`. Expiry redirect already points to `/billing/checkout` (no change needed).
- **`app/dashboard/settings/subscription/page.tsx`**: Reads and forwards `plan` query param to `SubscriptionClient`.
- **`components/settings/SubscriptionClient.tsx`**: Accepts optional `preselectedTier` prop to highlight and/or auto-initiate checkout for a specific plan.
- No schema changes. No new environment variables. No changes to `POST /api/billing/checkout` itself.
