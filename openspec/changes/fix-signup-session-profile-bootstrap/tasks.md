## 1. Sign-up route

- [x] 1.1 In `app/api/auth/sign-up/route.ts`, import `createUserProfile` from
      `@/lib/actions/auth` and call `await createUserProfile(data.user.id)`
      in the immediate-session branch (`if (data.session) { ... }`) before
      returning the `{ ok: true, status: "session" }` response.
- [x] 1.2 Confirm the "check-email" branch is left untouched (that path is
      already covered by `/auth/callback` once the user clicks the
      confirmation link).

## 2. Sign-in route

- [x] 2.1 In `app/api/auth/sign-in/route.ts`, import `createUserProfile` from
      `@/lib/actions/auth` and call `await createUserProfile(user.id)` after a
      successful `supabase.auth.signInWithPassword()` call, before returning
      the success response.
- [x] 2.2 Verify this does not disrupt the existing diagnostic tracing spans
      in that route (wrap the call consistently with how other operations in
      the route are traced, if the route's tracing convention expects it).

## 3. Tests

- [x] 3.1 Add/extend a test for `app/api/auth/sign-up/route.ts` asserting that
      `createUserProfile` is called when Supabase returns an immediate
      session, and is NOT called (or is deferred) on the check-email branch.
      Mock `@/lib/supabase/server` and `@/lib/actions/auth` per existing
      convention (see `tests/auth-sign-in-tracing.test.ts` for the
      server-client mocking pattern used in this repo).
- [x] 3.2 Add/extend a test for `app/api/auth/sign-in/route.ts` asserting that
      `createUserProfile` is called after a successful password sign-in.
- [x] 3.3 Add a test asserting `createUserProfile` is idempotent (calling it
      twice for the same `userId` does not error and does not create a
      duplicate `UserProfile`/`Schedule` row) — mock `prismaAdmin` per
      existing convention, do not hit a real database.

## 4. Verification

- [x] 4.1 Run `npm run test` and confirm all tests pass.
- [x] 4.2 Run `npm run lint` and `tsc --noEmit` (or the repo's standard
      typecheck command) and confirm no new errors in the changed files.
- [ ] 4.3 Manually verify locally: sign up a new user with email confirmation
      disabled, confirm a `user_profiles` row exists immediately, then
      exercise a write path that previously failed (e.g. invoice import
      upload) and confirm it now succeeds.
