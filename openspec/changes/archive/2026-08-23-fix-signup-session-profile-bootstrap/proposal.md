## Why

New users who sign up with email/password and receive an immediate Supabase
session (email confirmation disabled/auto-confirmed — the local dev default,
and possibly production) are sent straight to `/dashboard` without ever having
a `user_profiles` row created. `createUserProfile()` only runs from
`/auth/callback` (OAuth / email-confirmation-link path) and
`/api/billing/checkout`, not from the immediate-session branch of
`/api/auth/sign-up/route.ts`, and not from `/api/auth/sign-in/route.ts`. The
first user-facing write for such an account (e.g. importing invoices) then
fails with a foreign key violation (`invoice_import_batches_user_id_fkey`)
because no `user_profiles` row exists to satisfy the FK. The same gap also
means any account that ends up with a valid Supabase session but a missing
profile (e.g. local dev DB reset, seed/test tooling) has no self-healing path
back to a working state.

## What Changes

- `/api/auth/sign-up/route.ts` calls `createUserProfile(data.user.id)` before
  returning `status: "session"` (the immediate-session branch), matching what
  `/auth/callback` already does for the email-confirmation branch.
- `/api/auth/sign-in/route.ts` calls `createUserProfile(user.id)` (idempotent
  upsert, no-op for existing profiles) after a successful password sign-in, so
  any authenticated session is guaranteed to have a matching profile before
  reaching `/dashboard`.
- No changes to `createUserProfile()` itself — it is already an idempotent
  upsert and safe to call on every sign-in/sign-up.

## Capabilities

### New Capabilities
- `user-profile-bootstrap`: every path that establishes an authenticated
  Supabase session (email/password sign-up with immediate session, email
  confirmation callback, OAuth callback, password sign-in) guarantees a
  matching `user_profiles` row exists before the request completes.

### Modified Capabilities
(none — no existing capability spec currently documents sign-up/sign-in
profile bootstrap behavior)

## Impact

- `app/api/auth/sign-up/route.ts` — add `createUserProfile` call in the
  immediate-session branch.
- `app/api/auth/sign-in/route.ts` — add `createUserProfile` call after
  successful password authentication.
- No schema, migration, or RLS changes required.
- No changes to `/auth/callback` or `/api/billing/checkout` (already correct).
