## 1. Schema & Migration

- [x] 1.1 Add `trialEndsAt DateTime? @map("trial_ends_at")` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.2 Add `onboardingCompletedAt DateTime? @map("onboarding_completed_at")` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.3 Run `npx prisma migrate dev --name add-trial-onboarding-fields` to generate the migration
- [x] 1.4 Update `prisma/rls-policies.sql` to confirm no new policies are needed (fields are on existing `user_profiles` table)
- [x] 1.5 Run `npm run verify-rls` to confirm RLS isolation is intact

## 2. Bootstrap Logic

- [x] 2.1 Update `createUserProfile` in `lib/actions/auth.ts` to set `subscriptionStatus: "trialing"` and `trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)` in the `create` block (leave `update: {}` unchanged)

## 3. Auth Callback Routing

- [x] 3.1 Update `app/auth/callback/route.ts` to fetch the profile after `createUserProfile` and check `onboardingCompletedAt`
- [x] 3.2 If `onboardingCompletedAt` is null AND `subscriptionStatus === "trialing"`, redirect to `/onboarding`; otherwise redirect to `next` param (`/dashboard`)

## 4. Onboarding API Route

- [x] 4.1 Create `app/api/onboarding/route.ts` with a `PATCH` handler
- [x] 4.2 Validate request body with Zod: `{ tier: z.enum(["starter", "solo", "small_business"]) }`
- [x] 4.3 Authenticate with `supabase.auth.getUser()`; return 401 if not authenticated
- [x] 4.4 Write `subscriptionTier` and `onboardingCompletedAt: new Date()` via `withUserContext`
- [x] 4.5 Return `{ ok: true }` on success

## 5. Onboarding Page

- [x] 5.1 Create `app/onboarding/page.tsx` as a server component; redirect to `/sign-in` if no user, redirect to `/dashboard` if `onboardingCompletedAt` is set
- [x] 5.2 Create `components/onboarding/OnboardingPlanPicker.tsx` as a `"use client"` component rendering three plan cards (Starter £9, Solo £19, Small Business £39) with a "Start 14-day free trial" CTA on each
- [x] 5.3 On plan selection, call `PATCH /api/onboarding` with chosen tier, then `router.push("/dashboard")`
- [x] 5.4 Add "No credit card required" and trial duration messaging to the page

## 6. Dashboard Layout — Trial Banner & Gate

- [x] 6.1 Update `app/dashboard/layout.tsx` to fetch `{ subscriptionStatus, trialEndsAt, subscriptionTier }` from the user's profile in the server component
- [x] 6.2 If `subscriptionStatus === "trialing"` and `trialEndsAt` is past, redirect to `/billing/checkout?plan=<tier>&reason=trial_expired`
- [x] 6.3 If `subscriptionStatus === "trialing"` and `trialEndsAt` is in the future, render a `TrialBanner` component above dashboard content showing days remaining and an "Add payment" link
- [x] 6.4 Create `components/dashboard/TrialBanner.tsx` client component that accepts `daysRemaining: number` and `checkoutUrl: string`

## 7. Stripe Webhook — Clear Trial on Payment

- [x] 7.1 In `app/api/webhooks/stripe-billing/route.ts`, handle `checkout.session.completed`: set `subscriptionStatus: "active"` and `trialEndsAt: null` for the user when a successful checkout completes
- [x] 7.2 Confirm the existing `checkout.session.completed` handler already sets `subscriptionStatus`; if so, add only the `trialEndsAt: null` clear

## 8. Tests

- [x] 8.1 Add unit tests in `tests/` for the trial expiry logic (date comparison, days-remaining calculation)
- [x] 8.2 Add a test that `createUserProfile` produces `subscriptionStatus: "trialing"` and a `trialEndsAt` 14 days in the future
- [x] 8.3 Add a test that the onboarding route rejects invalid tier values

## 9. Documentation

- [x] 9.1 Add `trialEndsAt` and `onboardingCompletedAt` to the `UserProfile` model section in `docs/DDD.md`
- [x] 9.2 Add `PATCH /api/onboarding` to the API routes section in `docs/DDD.md`
- [x] 9.3 Confirm no new environment variables are introduced (none expected)
