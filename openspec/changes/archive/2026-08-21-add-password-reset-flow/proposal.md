## Why

No self-service password-reset path exists anywhere in the app: there is no
`/forgot-password` route and no call to Supabase's `resetPasswordForEmail`
anywhere in `app/(auth)/**`. A user who forgets their password has no
recovery option today, which is a hard support/churn cost once the product
is publicly live. Flagged as release blocker B-4 in `docs/go-live-to-do.md`.

## What Changes

- Add a "Forgot password?" entry point on the sign-in page.
- Add a `/forgot-password` page that collects an email address and calls
  Supabase `resetPasswordForEmail()` to send a reset link.
- Add a `/reset-password` page that completes the flow: it consumes the
  Supabase recovery session established by the emailed link and lets the
  user set a new password via `supabase.auth.updateUser()`.
- Extend the pre-launch `LIVE` gate (`lib/liveMode.ts`) so `/forgot-password`
  is blocked pre-launch the same way `/sign-in`/`/sign-up` are, since it is
  also an auth-entry surface; `/reset-password` remains reachable regardless
  of `LIVE` since it is only usable with a valid emailed recovery token.

## Capabilities

### New Capabilities
- `password-reset-flow`: defines the self-service password-recovery
  behavior for users who cannot sign in.

### Modified Capabilities
(none)

## Impact

- `app/(auth)/sign-in/page.tsx` (add entry point link)
- New: `app/(auth)/forgot-password/`, `app/(auth)/reset-password/`
- `lib/liveMode.ts` (`isAuthEntryPath`)
- `lib/supabase/client.ts` / `lib/supabase/server.ts` (existing clients,
  no new client needed)
- `tests/` (new tests for the reset flow and updated `liveMode` tests)
