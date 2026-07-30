## Why

The "View plans" CTA on the landing page currently links directly to `/sign-up`, forcing potential customers into a registration flow before they have had a chance to compare plans. A dedicated `/pricing` page gives visitors a clear, crawlable destination to evaluate the three tiers — and carries their intent (selected plan) into the sign-up and onboarding flow.

## What Changes

- New public route `/pricing` — a standalone pricing page with the three plan cards (Starter, Solo, Small Business), plan descriptions, feature lists, and per-plan CTA buttons.
- "View plans" nav button on the landing page (`app/page.tsx`) links to `/pricing` instead of `/sign-up`.
- "Start with Starter" hero CTA on the landing page links to `/pricing` instead of `/sign-up`.
- The existing `#pricing` scroll-anchor section on the landing page remains; its per-plan CTA buttons are updated to link to `/pricing` as well (consistent destination, plan context is then carried from `/pricing`).
- Each plan CTA on `/pricing` stores the selected plan tier in `localStorage` before navigating to `/sign-up`, so `OnboardingPlanPicker` can pre-select the right tier.
- `OnboardingPlanPicker` reads `preselectedPlan` from `localStorage` on mount and clears it after use.

## Capabilities

### New Capabilities

- `pricing-page`: A dedicated public `/pricing` page displaying all subscription tiers with CTAs that carry plan selection intent into the sign-up and onboarding flow.

### Modified Capabilities

- `live-mode-auth-gating`: The `/pricing` route must be publicly accessible regardless of `LIVE` mode (it is not an auth-entry path, so the existing `shouldBlockAuthEntry` logic already allows it — confirming this is not blocked is part of implementation verification, not a spec change).

## Impact

- **New file**: `app/pricing/page.tsx` (Server Component, no auth required)
- **Modified**: `app/page.tsx` — nav href, hero CTA href, and `#pricing` section plan CTA hrefs
- **Modified**: `components/onboarding/OnboardingPlanPicker.tsx` — reads `preselectedPlan` from `localStorage` on mount
- **No auth flow changes**, no API changes, no database changes, no middleware changes
- `/pricing` is a public Server Component; it does not require Supabase auth context
