# Tasks

## 1. Re-home settings routes to top-level namespace

- [x] 1.1 Create `app/settings/layout.tsx` and move/re-home `app/dashboard/settings/*` pages into `app/settings/*`, then verify `npm run lint` passes and `/settings/account` renders while authenticated.
- [x] 1.2 Remove `app/dashboard/settings/*` route files after the move, then verify `/dashboard/settings/account` returns not found and `/settings/account` remains reachable.

## 2. Update canonical navigation and destination mappings

- [x] 2.1 Update `lib/settings/navigation.ts` and related settings route constants from `/dashboard/settings/*` to `/settings/*`, then verify settings nav links and active states work on `/settings/account`, `/settings/connections`, and `/settings/cash-plan`.
- [x] 2.2 Update dashboard shell and user-menu links that point to settings, then verify the top navigation and profile menu open settings at `/settings/*` and no dashboard rail appears on settings pages.

## 3. Rewrite redirects and integration return paths

- [x] 3.1 Update billing/access guard redirects and subscription resolution paths to `/settings/subscription`, then verify gated dashboard flows redirect to `/settings/subscription`.
- [x] 3.2 Update Stripe/Xero/MYOB connect and callback redirect destinations to `/settings/connections`, then verify each callback path preserves query parameters and lands on `/settings/connections`.
- [x] 3.3 Keep `/settings/stripe` and `/settings/integrations` helper redirects targeting `/settings/connections`, then verify both helper routes preserve query strings.

## 4. Validate cutover and document behavior changes

- [x] 4.1 Run a repository search for `/dashboard/settings` in `app/`, `components/`, and `lib/`, then verify zero remaining references.
- [x] 4.2 Update relevant product/docs references to the new `/settings/*` namespace (including any routing examples), then verify changed docs match shipped routes.
- [x] 4.3 Run targeted regression checks (`npm run lint` and key authenticated route smoke checks) and verify dashboard pages still load under `/dashboard/*` while settings pages load under `/settings/*` only.
