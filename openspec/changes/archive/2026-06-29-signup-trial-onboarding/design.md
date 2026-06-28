## Context

PaidSoon currently creates user profiles immediately on auth callback with `subscriptionTier: "starter"` and no `subscriptionStatus` set (the schema default is `"active"`). This means new users land in the dashboard with active starter features but no payment has been taken and no plan has been consciously chosen. There is no trial concept, no onboarding step, and no payment gate.

The subscription-plan-switching change (currently in progress) is establishing the correct Stripe primitives for switching between plans for existing subscribers. This change is complementary: it handles getting users onto a subscription in the first place.

Key constraints from the codebase:
- Auth flow: Supabase email/OAuth → `/auth/callback` → `createUserProfile` → redirect
- Billing: Stripe Checkout (`mode: "subscription"`) for new subscribers via `/api/billing/checkout`
- DB: `UserProfile.subscriptionStatus` and `UserProfile.subscriptionTier` are the live subscription state
- No Stripe subscription exists until the user goes through checkout — the DB is the trial state store

## Goals / Non-Goals

**Goals:**
- Introduce a 14-day free trial with no credit card required at signup.
- Add a one-time `/onboarding` plan picker so users choose their plan intent before accessing the dashboard.
- Gate the dashboard after trial expiry and redirect to checkout with the chosen plan pre-filled.
- Show a persistent trial countdown banner in the dashboard during the trial window.
- Preserve the existing blurred/locked UX for features above the user's chosen trial plan tier.

**Non-Goals:**
- Stripe-managed trials (`trial_period_days` on subscription). Trial state is DB-only; no payment method required upfront.
- Free tier / permanent free access.
- Trial extension or pausing.
- Email sequences during trial (separate concern).
- Changing how existing subscribers interact with billing.

## Decisions

### D1: Trial state stored in DB only, not Stripe

**Decision:** Track the trial in a new `trialEndsAt DateTime?` field on `UserProfile`. No Stripe subscription is created until the user pays at the end of the trial.

**Rationale:** Stripe trials require a payment method upfront (or a subscription with `trial_end` set, which still requires a customer and payment source). Since the goal is "no credit card required", the trial is entirely DB-side. The existing `/api/billing/checkout` route (new subscriber path) is called exactly as today when the user pays — no special trial-to-paid upgrade path needed.

**Alternative considered:** Stripe-managed trial with `trial_period_days`. Rejected — requires a payment method at signup, which increases friction and contradicts the product decision.

### D2: `createUserProfile` sets `subscriptionStatus: "trialing"` and `trialEndsAt: now + 14 days`

**Decision:** Change the bootstrap in `lib/actions/auth.ts` to write `subscriptionStatus: "trialing"` and `trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)` for new users. The upsert's `update: {}` means returning users are unaffected.

**Rationale:** The `upsert` is already idempotent — `update: {}` means the trial fields are only written on first creation. Returning users (e.g. signing in again after email verify) keep their existing status unchanged.

### D3: Auth callback redirects new users to `/onboarding`, returning users to `/dashboard`

**Decision:** After `createUserProfile`, check `profile.subscriptionStatus`. If `"trialing"` AND `profile.subscriptionTier` is still the default (i.e. no plan chosen yet), redirect to `/onboarding`. Otherwise redirect to `/dashboard`.

**Implementation note:** A cleaner signal is a dedicated `onboardingCompletedAt DateTime?` field, but to avoid an extra migration, we can use `subscriptionTier` as the proxy: if it equals the raw schema default (`"free"` / `"starter"`) after upsert, onboarding hasn't been done. This is fragile. The cleaner approach is an `onboardingCompletedAt` field.

**Decision:** Add `onboardingCompletedAt DateTime?` to `UserProfile`. Auth callback redirects to `/onboarding` if this field is null; otherwise to `/dashboard`.

**Alternative considered:** Using `subscriptionTier` as a proxy for onboarding completion. Rejected — ambiguous and breaks if the default tier name changes.

### D4: `/onboarding` is a protected server page with a `PATCH /api/onboarding` action

**Decision:** `app/onboarding/page.tsx` is a server component that:
1. Requires auth (redirect to `/sign-in` if not authenticated).
2. Redirects to `/dashboard` if `onboardingCompletedAt` is already set (idempotent).
3. Renders a client component with three plan cards and a "Start trial" CTA.

A new `PATCH /api/onboarding` route accepts `{ tier: SubscriptionTier }`, validates it with Zod, and writes `subscriptionTier` + `onboardingCompletedAt: now` to `UserProfile` via `withUserContext`.

**Rationale:** Using a proper API route (rather than a Server Action) keeps the pattern consistent with all other settings routes in the codebase.

### D5: Trial expiry gate lives in `app/dashboard/layout.tsx`

**Decision:** The dashboard layout server component fetches `{ subscriptionStatus, trialEndsAt }` from the profile. If `subscriptionStatus === "trialing"` and `trialEndsAt < now`, it redirects to `/billing/checkout?plan=<tier>&reason=trial_expired`.

**Rationale:** The layout runs on every dashboard page load, making it the natural gate. Middleware-level enforcement would require reading DB state at the edge, adding latency and complexity. The layout approach is consistent with how auth redirects already work (`if (!user) redirect("/sign-in")`).

**Trade-off:** A direct URL visit to `/dashboard/settings/stripe` by a trial-expired user would briefly render before the server redirect. This is acceptable — the layout check happens server-side before any HTML is sent.

### D6: Trial banner rendered in `app/dashboard/layout.tsx`

**Decision:** The same layout fetch that checks expiry also computes `daysRemaining`. If `subscriptionStatus === "trialing"` and `trialEndsAt > now`, a banner is rendered above the dashboard content: "X days left in your free trial — [Add payment]".

**Rationale:** Single DB fetch for both banner and gate logic. The "Add payment" link goes to `/billing/checkout?plan=<tier>`.

### D7: `/billing/checkout` accepts `plan` query param for pre-fill

**Decision:** The existing `POST /api/billing/checkout` already accepts `{ tier }` in the body. The subscription settings page (`/dashboard/settings/subscription`) already passes `tier`. The checkout redirect from the trial gate and banner uses the same route with the user's chosen tier.

No API changes needed — the existing checkout route handles new subscribers correctly.

## Risks / Trade-offs

- **Trial bypass via direct URL**: A user could manually navigate to `/dashboard` after trial expiry and potentially see content for the fraction of a second before the server redirect fires. Mitigation: server-side redirect in layout runs before HTML is sent; no client-side state to exploit.

- **`trialEndsAt` timezone handling**: Stored as UTC in Postgres. All comparisons are `new Date()` (UTC). No timezone risk as long as no client-side date math is used.

- **Onboarding skip**: A user who signs up via Google OAuth and closes the tab before completing `/onboarding` will remain in `subscriptionStatus: "trialing"` with no plan chosen and `onboardingCompletedAt: null`. Every subsequent sign-in will redirect them to `/onboarding`. This is the intended behaviour — they must choose a plan before accessing the dashboard.

- **Schema migration in production**: Adding `trialEndsAt` and `onboardingCompletedAt` as nullable fields is non-breaking. Existing users keep `null` for both fields; the dashboard layout treats `null` `trialEndsAt` as "no trial, don't gate".

## Open Questions

- Should existing users (created before this change, `subscriptionStatus: "active"`) be unaffected by all trial logic? **Yes — `trialEndsAt: null` means no gate, no banner.**
- Should the trial banner appear on every dashboard page including settings? Reasonable default: yes, it's in the layout.
- Should "starter" still be the default `subscriptionTier` written by `createUserProfile`, with `/onboarding` overriding it? Or should `createUserProfile` write no tier and let onboarding write the first one? The latter is cleaner but requires the dashboard to handle a null tier gracefully. **Recommendation: keep `subscriptionTier: "starter"` as the bootstrap default; `/onboarding` overwrites it.**
