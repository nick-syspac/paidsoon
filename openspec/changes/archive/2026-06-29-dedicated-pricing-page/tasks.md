## 1. Create /pricing page

- [x] 1.1 Create `app/pricing/page.tsx` as a Server Component with `pricingPlans` data (Starter, Solo, Small Business)
- [x] 1.2 Create `components/pricing/PricingCTA.tsx` as a `"use client"` component that writes `preselectedPlan` to `localStorage` and navigates to `/sign-up`
- [x] 1.3 Render plan cards on `/pricing` using `PricingCTA` for each plan's CTA button, with Solo visually distinguished as recommended

## 2. Update landing page CTAs

- [x] 2.1 Update "View plans" nav button href in `app/page.tsx` from `/sign-up` to `/pricing`
- [x] 2.2 Update "Start with Starter" hero CTA href in `app/page.tsx` from `/sign-up` to `/pricing`
- [x] 2.3 Update all per-plan CTA buttons in the `#pricing` section of `app/page.tsx` from `/sign-up` to `/pricing`

## 3. Update OnboardingPlanPicker

- [x] 3.1 In `OnboardingPlanPicker.tsx`, read `preselectedPlan` from `localStorage` on mount, validate it against known tier IDs, set it as the initial `selectedTier`, and remove the key from `localStorage`

## 4. Verify

- [x] 4.1 Confirm `/pricing` renders in both `LIVE=true` and `LIVE=false` environments without redirect
- [x] 4.2 Confirm clicking a plan CTA on `/pricing` sets `localStorage.preselectedPlan` correctly before navigating to `/sign-up`
- [x] 4.3 Confirm `OnboardingPlanPicker` pre-selects the correct tier when `preselectedPlan` is set in `localStorage`, and defaults to `"solo"` when it is absent or invalid
