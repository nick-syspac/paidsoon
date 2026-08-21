## 1. Forgot-password request page

- [ ] 1.1 Add `app/(auth)/forgot-password/page.tsx` with an email-input
      form
- [ ] 1.2 Wire the form to call `supabase.auth.resetPasswordForEmail(email,
      { redirectTo: <origin>/reset-password })` via the browser client
      (`lib/supabase/client.ts`)
- [ ] 1.3 Show a generic confirmation message regardless of whether the
      email matched an account
- [ ] 1.4 Add a "Forgot password?" link from `app/(auth)/sign-in/page.tsx`
      to `/forgot-password`

## 2. Reset-password completion page

- [ ] 2.1 Add `app/(auth)/reset-password/page.tsx` that reads the Supabase
      recovery session established by the emailed link
- [ ] 2.2 Add a new-password form that calls
      `supabase.auth.updateUser({ password })`
- [ ] 2.3 Handle the invalid/expired-link case by showing an error and a
      link back to `/forgot-password`
- [ ] 2.4 On success, redirect to `/sign-in` (or `/dashboard` if Supabase
      leaves the user signed in) consistent with existing auth redirect
      conventions

## 3. Pre-launch gating

- [ ] 3.1 Extend `isAuthEntryPath()` in `lib/liveMode.ts` to also match
      `/forgot-password`
- [ ] 3.2 Update/add tests for `lib/liveMode.ts` covering the new path

## 4. Tests

- [ ] 4.1 Add tests for the forgot-password request flow (stubbing
      Supabase, no real emails sent)
- [ ] 4.2 Add tests for the reset-password completion flow, including the
      invalid/expired-link case
- [ ] 4.3 Run `npm run test` and confirm the full suite passes

## 5. Verification

- [ ] 5.1 Run `npm run lint` and `npx tsc --noEmit` and confirm no new
      errors are introduced
