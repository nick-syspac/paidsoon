## 1. Checkout Page

- [x] 1.1 Create `app/billing/checkout/page.tsx` as a server component: authenticate with `supabase.auth.getUser()`, redirect to `/sign-in` if unauthenticated
- [x] 1.2 Read `plan` from `searchParams`; if absent, fetch user's current `subscriptionTier` from `UserProfile` via `withUserContext` as fallback
- [x] 1.3 Fetch `POST /api/billing/checkout` with the resolved plan tier, forwarding the session cookie via `next/headers` `cookies()`
- [x] 1.4 On success, call `redirect(url)` to send the user to the Stripe Checkout URL
- [x] 1.5 On API error, render a user-visible error message with a "Return to dashboard" link (do not throw an unhandled error or show a blank 404)

## 2. Fix Trial Banner CTA

- [x] 2.1 In `app/dashboard/layout.tsx`, change the `checkoutUrl` passed to `TrialBanner` from `/dashboard/settings/subscription?plan=${tier}` to `/billing/checkout?plan=${tier}`

## 3. Subscription Settings — Pre-selected Plan Display

- [x] 3.1 In `app/dashboard/settings/subscription/page.tsx`, read the `plan` query param from `searchParams` and pass it as `preselectedTier` to `SubscriptionClient`
- [x] 3.2 In `components/settings/SubscriptionClient.tsx`, accept an optional `preselectedTier?: SubscriptionTier` prop and use it to visually highlight the matching plan card (display only — do not auto-trigger checkout)

## 4. Tests

- [x] 4.1 Add a unit test in `tests/` that the `/billing/checkout` page correctly falls back to the user's `subscriptionTier` when no `plan` param is given (test the fallback logic in isolation)
- [x] 4.2 Add a test verifying that the dashboard layout's `checkoutUrl` for a trialing user resolves to `/billing/checkout?plan=<tier>` (not the settings page)

## 5. Documentation

- [x] 5.1 Add `GET /billing/checkout` to the UI routes section in `docs/DDD.md` with a brief description of its role in the trial-to-paid flow
