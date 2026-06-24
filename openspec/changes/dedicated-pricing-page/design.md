## Context

Currently the "View plans" button in the landing page nav and the hero CTA both route directly to `/sign-up`. The landing page has a full `#pricing` section, but it is not linked from the nav — visitors must scroll the entire page to reach it. The `OnboardingPlanPicker` component (shown after email confirmation) defaults to `"solo"` regardless of which plan the visitor clicked on the landing page.

The `/sign-up` and `/sign-in` routes are protected by the live-mode gate in `middleware.ts` (`shouldBlockAuthEntry`). The `/pricing` route is a new public page — it is not an auth-entry path and therefore requires no middleware changes.

Plan data exists in two parallel places today: `pricingPlans` in `app/page.tsx` (marketing copy) and `PLANS` in `OnboardingPlanPicker.tsx` (functional). These are kept separate by intent: the landing page copy is marketing-first; the onboarding picker is functional.

## Goals / Non-Goals

**Goals:**
- Create `/pricing` as a standalone, crawlable public page
- Point all "View plans" / "Start with Starter" / per-plan CTAs from the landing page to `/pricing`
- Carry the user's plan selection from `/pricing` into `OnboardingPlanPicker` via `localStorage`

**Non-Goals:**
- Annual/monthly pricing toggle
- FAQ section or social proof on `/pricing`
- Passing plan context through the auth callback URL (too brittle)
- Changing the onboarding API or database schema
- Removing the `#pricing` section from the landing page

## Decisions

### D1 — `localStorage` for plan pre-selection (not URL params)

The plan selection intent must survive the full auth flow: `/pricing` → `/sign-up` → email confirmation → `/auth/callback` → `/onboarding`. A URL query param (`?plan=solo`) is lost at the `supabase.auth.signUp()` call because Supabase controls the `emailRedirectTo` redirect chain.

`localStorage` is client-side, persists across the redirect chain within the same browser, and requires no changes to the auth flow, callback route, or API.

**Key:** `preselectedPlan` | **Values:** `"starter" | "solo" | "small_business"` | **Cleared:** after `OnboardingPlanPicker` reads it on mount.

**Alternative considered:** Encoding plan in the `emailRedirectTo` path (e.g., `/auth/callback?plan=solo`). Rejected — fragile if the user opens the confirmation email in a different browser, and adds complexity to the callback route.

### D2 — `/pricing` as a Server Component (no `"use client"`)

The pricing page is purely presentational — static plan data, no auth state, no interactivity. It should be a Server Component. The CTA buttons that write to `localStorage` and navigate to `/sign-up` are the only interactive element; these are extracted into a small `"use client"` `PricingCTA` component, keeping the page itself a Server Component.

**Alternative considered:** Make the whole page a Client Component. Rejected — unnecessary; Server Components render faster and are SEO-friendlier.

### D3 — Plan data stays duplicated (no shared constant)

The `pricingPlans` array in `app/page.tsx` and the `PLANS` array in `OnboardingPlanPicker.tsx` serve different purposes (marketing copy vs. functional tier IDs). Merging them would couple UI copy to billing logic. Instead, `/pricing` uses its own `pricingPlans` array (same shape as the landing page copy) — copy can diverge independently of billing logic.

## Risks / Trade-offs

- **`localStorage` is browser-specific** → If a user clicks a plan on mobile and confirms their email on desktop, the pre-selection is lost and onboarding defaults to `"solo"`. Acceptable — the onboarding picker remains visible and easy to change.
- **Plan data duplication** → Copy drift between landing page, `/pricing`, and onboarding picker is possible. Low risk given the slow cadence of plan changes; acceptable given the decoupling benefit.
- **`localStorage` not available during SSR** → `OnboardingPlanPicker` is already `"use client"`, so `localStorage` access on mount is safe. No risk.

## Migration Plan

1. Create `app/pricing/page.tsx` (new file — no rollback concern)
2. Update `app/page.tsx` hrefs (three link targets change — trivially reversible)
3. Update `OnboardingPlanPicker.tsx` to read `preselectedPlan` on mount

No database migrations, no environment variable changes, no API changes. Rollback is a one-line revert of the href changes.
