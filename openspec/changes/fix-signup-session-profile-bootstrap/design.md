## Context

`createUserProfile(userId)` ([lib/actions/auth.ts](../../../lib/actions/auth.ts))
already exists and is an idempotent upsert (`userProfile.upsert` +
`schedule.upsert`, keyed on `userId`). It is currently called from exactly two
places: `app/auth/callback/route.ts` (OAuth / email-confirmation-link code
exchange) and `app/api/billing/checkout/route.ts`. The immediate-session
branch of `app/api/auth/sign-up/route.ts` and all of
`app/api/auth/sign-in/route.ts` never call it, which is the gap this change
closes. See proposal.md - Why for the observed failure (invoice import FK
violation on a brand-new signup).

## Goals / Non-Goals

**Goals:**
- Every code path that can hand a client a valid, usable Supabase session
  calls `createUserProfile` before that path's response is returned.
- No behavior change for the already-correct paths (`/auth/callback`,
  `/api/billing/checkout`).

**Non-Goals:**
- Not changing `createUserProfile`'s fields, trial logic, or upsert shape.
- Not adding a global defensive check inside `withUserContext` or a shared
  route guard — this change closes the two known entry-point gaps directly
  rather than restructuring the auth/data-access layer. A structural guard
  can be considered separately if more gaps surface.
- Not changing anything about how `/auth/callback` or checkout behave.

## Decisions

- **Fix at the two entry points (sign-up, sign-in), not one shared guard.**
  `createUserProfile` is already idempotent and cheap (two upserts inside a
  single transaction), so calling it directly in both route handlers is a
  small, low-risk change. Alternative considered: push the check into
  `withUserContext` so *any* future route is automatically covered. Rejected
  for this change because it would touch a much wider blast radius
  (every RLS-scoped transaction in the app) to fix a problem that has two
  concrete, known entry points; revisit as a follow-up if a third gap is
  found.
- **Sign-in calls `createUserProfile` unconditionally on every successful
  password sign-in**, rather than first checking whether a profile exists and
  only calling it if missing. Alternative considered: `SELECT` first, then
  `upsert` only on a cache miss. Rejected — the upsert is already a single
  cheap round trip and doing a conditional check first is strictly more
  round trips for the common case (profile already exists) with no
  behavioral benefit.
- **No change to the OAuth/email-confirmation `/auth/callback` path** — it
  already calls `createUserProfile` correctly today.

## Risks / Trade-offs

- [Risk] Calling `createUserProfile` on every password sign-in adds two extra
  upsert queries to the sign-in hot path → Mitigation: both upserts are
  primary-key/unique-indexed lookups (`userId`) inside one transaction;
  negligible latency cost, and this is the same call already made on every
  OAuth sign-in today.
- [Risk] `createUserProfile` uses `prismaAdmin`, which bypasses RLS →
  Mitigation: this is the existing, already-reviewed pattern used by
  `/auth/callback` and checkout for exactly this bootstrap purpose; no new
  RLS-bypass surface is introduced.

## Migration Plan

- Code-only change, no schema migration. Deploy as a normal release; no
  rollback complexity beyond reverting the two route changes.
