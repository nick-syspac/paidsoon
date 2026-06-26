## Why

New users are dropped directly into the dashboard on the "starter" tier with no subscription, no plan selection, and no payment — making it unclear that PaidSoon is a paid product. Adding a 14-day free trial with an onboarding plan picker gives users time to experience real value (connecting Stripe, seeing overdue invoices, watching email sequences fire) before committing, while capturing plan intent and keeping the payment path frictionless.

## What Changes

- New `trialEndsAt` field on `UserProfile` — tracks when the 14-day trial expires.
- `createUserProfile` sets `subscriptionStatus: "trialing"` and `trialEndsAt: now + 14 days` on new account creation (instead of no status).
- Auth callback redirects new users to `/onboarding` instead of `/dashboard`.
- New `/onboarding` page — one-time plan picker ("Start your 14-day free trial, no card required"). Saves chosen `subscriptionTier` to profile and redirects to `/dashboard`.
- Dashboard layout gains a trial banner ("X days left in your trial — Add payment to continue").
- Dashboard layout gains a trial expiry gate — when `trialEndsAt` is past and `subscriptionStatus` is still `"trialing"`, redirect to `/billing/checkout` with the user's chosen plan pre-filled.
- Existing `LockedDashboardPreview` / `UpgradeBanner` machinery continues to gate features above the user's chosen trial plan tier.

## Capabilities

### New Capabilities

- `trial-onboarding`: The end-to-end signup → trial → plan picker → dashboard entry flow, including the 14-day trial lifecycle (banner, expiry gate, checkout redirect).

### Modified Capabilities

- `subscription-plan-tiers`: The new `"trialing"` subscription status and `trialEndsAt` field extend the existing plan tier model; the dashboard must account for trial state when deciding what to show/gate.

## Impact

- **Schema**: `UserProfile` gets a new `trialEndsAt DateTime?` field → new Prisma migration required.
- **`lib/actions/auth.ts`**: `createUserProfile` updated to set `subscriptionStatus: "trialing"` and `trialEndsAt`.
- **`app/auth/callback/route.ts`**: Redirect logic updated — new users go to `/onboarding`, returning users go to `/dashboard`.
- **`app/onboarding/page.tsx`** (new): Plan picker page, server-rendered, protected.
- **`app/api/onboarding/route.ts`** (new): `PATCH` endpoint to save chosen plan tier to profile.
- **`app/dashboard/layout.tsx`**: Trial banner + expiry gate added.
- **`prisma/schema.prisma`** + new migration.
- **`prisma/rls-policies.sql`**: No new tables; existing `user_profiles` RLS policy covers the new field.
- No changes to the Stripe checkout flow — new subscribers already use the existing `/api/billing/checkout` route.
- No credit card required during trial — Stripe subscription is created only at trial-end checkout.
