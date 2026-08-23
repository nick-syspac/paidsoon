## Context

See proposal.md for motivation. `isLiveMode()` (`lib/liveMode.ts`) reads `process.env.LIVE`
and is already used server-side in `app/layout.tsx` (not-live banner) and `proxy.ts`
(sign-in/sign-up gating). The marketing CTA in `MarketingNav.tsx` and the homepage hero
does not currently consult it at all — it's a static string left over from the
`2026-06-29-replace-marketing-placeholders` beta change.

`MarketingNav.tsx` is a `"use client"` component (the whole file, including the mobile menu
state), so it cannot call `isLiveMode()` directly — that would read `process.env.LIVE` in
the browser bundle, which only works for `NEXT_PUBLIC_`-prefixed vars in Next.js, and `LIVE`
is deliberately not prefixed that way (it must stay server-only). `app/(marketing)/page.tsx`
(homepage) is a server component, so it can call `isLiveMode()` directly.

## Goals / Non-Goals

**Goals:**
- Marketing CTA (nav desktop, nav mobile, homepage hero) switches label/href based on
  `isLiveMode()`, matching the not-live banner and auth-entry gating.
- No behavior change when `LIVE` is unset or `false` (current production default) — CTA
  continues to read "Request early access" → `/contact`.

**Non-Goals:**
- No changes to `/sign-up`, `/contact`, or `/pricing` page content/flow.
- No changes to the not-live banner or `proxy.ts` auth-entry gating logic.
- No env-var-driven feature flagging beyond the existing `LIVE` variable.

## Decisions

- **Pass `liveMode` as a prop from `MarketingLayout` to `MarketingNav`**, rather than
  converting `MarketingNav` to a server component or introducing a new client-side env
  check. This mirrors the exact pattern `app/layout.tsx` already uses (`isLiveMode()` computed
  server-side, boolean passed down) and avoids exposing `LIVE` to the client bundle via a
  `NEXT_PUBLIC_` alias. Alternative considered: split `MarketingNav` back into a server
  wrapper + client mobile-menu sub-component (the original intended design per
  `implement-paidsoon-marketing-navigation/design.md`); rejected as unnecessary scope
  creep for this change — a single boolean prop is a minimal, additive change to the
  existing client component's props.
- **Homepage hero computes `isLiveMode()` directly** since `page.tsx` is already a server
  component — no prop plumbing needed there.
- **Label/href pairs are hardcoded per mode** ("Request early access"/`/contact` vs. "Start
  Free Trial"/`/sign-up`) rather than pulled from a config map, since there are only two
  states and this matches how `PLAN_CTA_LABEL` and similar small literal maps are already
  used elsewhere in the marketing code — no new abstraction needed for two fixed values.

## Risks / Trade-offs

- [Risk] `MarketingNav` prop drilling means any other consumer rendering it directly (outside
  `MarketingLayout`) would need to pass `liveMode` too → Mitigation: confirmed via reference
  search that `MarketingLayout` is the only render site.
- [Risk] Divergence between homepage's direct `isLiveMode()` call and nav's prop-based
  approach could drift out of sync if one is edited without the other → Mitigation: both
  covered by the same new spec requirement/scenarios, and a single follow-up task verifies
  both surfaces manually in each mode.
