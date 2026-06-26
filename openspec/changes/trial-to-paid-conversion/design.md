## Context

The `signup-trial-onboarding` change introduced a 14-day free trial with DB-only trial state (no Stripe subscription until payment). Trial users are tracked via `subscriptionStatus: "trialing"` and `trialEndsAt` on `UserProfile`.

Two conversion paths were wired up in `app/dashboard/layout.tsx` but neither reaches a working checkout:

1. **Trial expiry gate** → `redirect("/billing/checkout?plan=<tier>&reason=trial_expired")` — `/billing/checkout` is a page that does not exist. Users hit a 404.
2. **TrialBanner "Add payment" CTA** → `/dashboard/settings/subscription?plan=<tier>` — the subscription settings page ignores the `plan` param and has no checkout trigger.

The underlying API (`POST /api/billing/checkout`) and Stripe webhook (`checkout.session.completed`) are correctly implemented and functional. The gap is entirely in the UI layer: no page exists to bridge trial users to the Stripe Checkout flow.

## Goals / Non-Goals

**Goals:**
- Create a `/billing/checkout` page that trial users land on and are forwarded to Stripe Checkout.
- Fix the TrialBanner CTA to point to `/billing/checkout` (not the settings page).
- Ensure both the "voluntarily add payment" path and the "trial expired, must pay" path work end-to-end.

**Non-Goals:**
- Changing `POST /api/billing/checkout` or any webhook logic.
- Adding a Stripe-managed trial (payment method required at signup). Trial remains DB-only.
- Changing the plan selection UI (users chose their plan at onboarding).
- Email reminders during trial (separate concern).
- Allowing trial users to switch plans before paying (out of scope — use existing plan-switching flow post-payment).

## Decisions

### D1: `/billing/checkout` is a server component that fetches and redirects — no intermediate UI

**Decision:** `app/billing/checkout/page.tsx` is a server component that:
1. Reads `?plan` from `searchParams` (falls back to user's current `subscriptionTier` if absent).
2. Makes an internal `POST /api/billing/checkout` call with the plan.
3. Redirects the browser to the Stripe Checkout URL returned by the API.
4. Renders a brief loading message while the redirect resolves.

**Rationale:** Minimises friction. The user clicks "Add payment", confirms their intent in one action, and is immediately at the Stripe-hosted form. An intermediate "are you sure?" page adds cognitive load with no benefit — the user has already expressed intent by clicking.

**Alternative considered:** Client component with a "Continue to payment" button that calls the API. Rejected — requires an extra click and JavaScript hydration for what is a simple server-side redirect.

**Trade-off:** If the API call fails (e.g. `STRIPE_STARTER_PRICE_ID` env var not configured), the user sees an error page rather than silently staying in the app. This is acceptable — the error is actionable for the developer and correctly signals misconfiguration.

### D2: The server component calls the billing API as an internal fetch, not via a direct Stripe call

**Decision:** The `/billing/checkout` page POSTs to `/api/billing/checkout` (the existing route) rather than calling Stripe directly.

**Rationale:** All Stripe customer creation and session creation logic already lives in the API route, including idempotent customer creation and the existing-subscriber upgrade branch. Duplicating that logic in the page would create drift risk. Reusing the route keeps a single code path for all checkout initiations.

**Implementation note:** The fetch must use the full absolute URL (`process.env.NEXT_PUBLIC_APP_URL`). It must forward the user's session cookie so the API can authenticate via `supabase.auth.getUser()`. In a Next.js App Router server component, this is done by passing `cookies()` as a header.

### D3: TrialBanner checkoutUrl fixed to `/billing/checkout?plan=<tier>`

**Decision:** Change `checkoutUrl` in `app/dashboard/layout.tsx` from `/dashboard/settings/subscription?plan=${tier}` to `/billing/checkout?plan=${tier}`.

**Rationale:** The subscription settings page is for managing an existing subscription. A trial user has no subscription to manage — they need to create one. Sending them to settings is confusing and broken. The new `/billing/checkout` page is the correct target.

### D4: Subscription settings page passes `plan` param to `SubscriptionClient` for display only

**Decision:** The subscription page reads the `plan` query param and passes it as `preselectedTier` to `SubscriptionClient`. The component uses it to highlight the plan card but does **not** auto-trigger checkout.

**Rationale:** Users who land on `/dashboard/settings/subscription` (e.g. from a bookmark) should see their trial plan highlighted so context is clear. Auto-triggering checkout without an explicit click would be unexpected. The actual checkout trigger is the new `/billing/checkout` page.

## Risks / Trade-offs

- **Forwarding auth cookies from a server component**: The internal fetch to `/api/billing/checkout` must correctly forward the session. If the cookie forwarding is incorrect, users get a 401 from the API. Mitigation: use `next/headers` `cookies()` to build the `Cookie` header explicitly, matching the pattern used in existing server components.

- **Double customer creation race**: If a user clicks "Add payment" twice quickly, two concurrent requests could try to create a Stripe customer. Mitigation: `POST /api/billing/checkout` already handles this — it checks `profile.stripeCustomerId` and only creates a customer if one doesn't exist. The Stripe customer ID is written back before session creation, so concurrent requests will find the same customer on retry.

- **Trial-expired redirect loop**: If the Stripe Checkout session creation fails after trial expiry, the user is stuck: dashboard redirects to `/billing/checkout`, which errors, with no escape. Mitigation: the checkout page must render a user-visible error with a "contact support" message and a link back to `/dashboard` (which will re-trigger the gate, but at least it's not a blank 404).

## Migration Plan

No schema changes, no data migrations. Deploying the new page and the layout fix is sufficient. Existing trial users with already-expired trials will immediately benefit — on next dashboard visit they redirect to a working checkout page instead of a 404.
