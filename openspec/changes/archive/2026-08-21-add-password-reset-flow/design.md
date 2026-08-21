## Context

`app/(auth)/` currently contains only `sign-in/` and `sign-up/`. No
`/forgot-password` or `/reset-password` route exists, and there is no call
to Supabase's `resetPasswordForEmail` anywhere in the app. `proxy.ts` uses
`shouldBlockAuthEntry()` / `isAuthEntryPath()` from `lib/liveMode.ts`
(matching only `/sign-in` and `/sign-up` today) to redirect auth-entry pages
to `/` while `LIVE` is not enabled. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Give a user who forgot their password a self-service way to regain
  access, using Supabase Auth's built-in recovery mechanism.
- Keep the pre-launch `LIVE` gate's existing guarantee — no new
  auth-entry surface is reachable before public launch.

**Non-Goals:**
- Rate limiting the reset-request endpoint beyond what's already expected
  at the Vercel edge level for auth routes (per
  `.github/instructions/security.instructions.md` conventions) — no new
  bespoke rate limiter is introduced by this change.
- Changing sign-up, sign-in, or OAuth callback behavior.

## Decisions

- Use Supabase's standard recovery flow: `/forgot-password` calls
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: <app
  origin>/reset-password })`; `/reset-password` reads the recovery session
  Supabase establishes from the emailed link and calls
  `supabase.auth.updateUser({ password })`. No custom token generation or
  email sending is introduced — this reuses Supabase's own transactional
  email for the reset link, not `lib/email/send.ts` (that module is
  reserved for the reminder-email product feature, not auth transactional
  email).
- Always show the same generic confirmation message from
  `/forgot-password` regardless of whether the submitted email matches an
  account, to avoid leaking account existence (Supabase's
  `resetPasswordForEmail` itself does not error on an unknown email, so
  this is naturally achievable without extra logic).
- Extend `isAuthEntryPath()` in `lib/liveMode.ts` to also match
  `/forgot-password`, so `proxy.ts`'s existing gate covers it with no new
  gating logic. `/reset-password` is deliberately left out of that gate:
  it only does anything useful with a valid Supabase recovery
  session/token in the URL, so blocking it pre-launch would only break a
  legitimate reset attempt without closing any real exposure (an attacker
  without a valid token can't do anything there LIVE or not).
  Alternative considered: gate both routes — rejected since gating
  `/reset-password` would strand a user who receives a legitimate reset
  email during controlled pre-launch testing.

## Risks / Trade-offs

- [Risk] `/reset-password` is reachable pre-launch (see decision above),
  technically widening the pre-launch surface slightly → Mitigation:
  the page is inert without a valid Supabase recovery session; this is the
  same trust boundary Supabase's own hosted recovery flow already relies
  on.
- [Risk] Client-side password validation (length/strength) can drift from
  whatever Supabase Auth enforces server-side → Mitigation: no new custom
  password-strength rules are introduced; rely on Supabase project auth
  settings as the source of truth and only add client-side checks that
  mirror them (non-empty, matches confirmation field).

## Migration Plan

- No database migration required — this uses Supabase Auth's built-in
  password-recovery mechanism, not new application tables.
- No environment variables are required beyond the Supabase config already
  present (`NEXT_PUBLIC_SUPABASE_URL`/publishable key).
