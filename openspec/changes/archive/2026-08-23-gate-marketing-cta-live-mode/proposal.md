## Why

The marketing site's primary call-to-action ("Request early access" → `/contact`, shown in
the nav and homepage hero) is hardcoded and does not check `LIVE`. The archived
`2026-06-29-replace-marketing-placeholders` change deliberately swapped the original
"Start Free Trial" CTA for this beta-only one and explicitly noted it should be "reverted
when `LIVE=true` is set for production" — that reversal was never implemented. With
go-live readiness now at 81/100 and most P0 blockers resolved, the CTA should switch
automatically based on launch mode instead of requiring a manual code change on cutover day.

## What Changes

- `app/(marketing)/layout.tsx` computes `isLiveMode()` (server component) and passes a
  `liveMode` prop to `MarketingNav`.
- `components/marketing/MarketingNav.tsx` (desktop and mobile CTA) renders "Request early
  access" → `/contact` when `liveMode` is `false`, and "Start Free Trial" → `/sign-up` when
  `liveMode` is `true`.
- `app/(marketing)/page.tsx` hero CTA calls `isLiveMode()` directly (already a server
  component) and applies the same conditional label/href.
- No changes to the not-live banner, sign-in/sign-up gating, or `proxy.ts` — those already
  key off `isLiveMode()` correctly.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `live-mode-auth-gating`: adds a requirement that the marketing nav and homepage hero CTA
  SHALL reflect launch mode — "Request early access" → `/contact` when not-live, "Start Free
  Trial" → `/sign-up` when live.

## Impact

- **Files changed**: `app/(marketing)/layout.tsx`, `components/marketing/MarketingNav.tsx`,
  `app/(marketing)/page.tsx`.
- **No API, database, auth, or billing changes.** No new dependencies.
- Affects only marketing-site presentation; `/sign-up` and `/contact` routes themselves are
  unchanged.
