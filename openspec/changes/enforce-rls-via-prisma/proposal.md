## Why

The MVP design (D1 in `invoice-nudge-mvp/design.md`) commits to enforcing tenant isolation at the database layer via Supabase Row Level Security. The `user-auth` spec encodes this as a requirement: *"the RLS policy SHALL ensure only rows belonging to that user are returned, regardless of application-level filters."*

In the running system, this guarantee does not hold. Every server-side query goes through the Prisma client in `lib/prisma.ts`, which connects with the database owner role (`DATABASE_URL`). That role bypasses RLS, and `auth.uid()` is `NULL` in the session, so the policies declared in `prisma/rls-policies.sql` never fire. All tenant isolation today rests on every call site remembering to include `where: { userId: user.id }` — a single forgotten predicate is a cross-tenant leak.

The risk is not theoretical: the codebase has many `prisma.*.findFirst|findMany|update|delete` call sites across route handlers, server components, server actions, and the cron worker, and that surface will only grow.

## What Changes

- **MODIFIED**: `user-auth` — the RLS requirement is restated to make the enforcement mechanism explicit (Prisma must execute user-scoped queries inside a transaction that sets the Postgres `request.jwt.claims` and switches to the `authenticated` role), and a new requirement is added covering server-only contexts (cron, webhooks) that must use a clearly-marked escalated client.
- **New code**: a `withUserContext(userId, fn)` helper that opens a Prisma `$transaction`, runs `SELECT set_config('request.jwt.claims', ..., true)` and `SET LOCAL ROLE authenticated`, then executes the callback. All user-scoped DB access moves through it.
- **New code**: an explicit `prismaAdmin` (or `withServiceRole`) client used only by cron, webhook handlers, and the post-signup profile creation path — clearly named so escalations are grep-able.
- **Schema/infra**: a non-owner runtime connection role (Supabase `authenticator` or equivalent non-owner role) that Prisma's runtime `DATABASE_URL` connects as, so RLS actually applies. A separate `DIRECT_URL` (owner) is used for migrations only.
- **Tests / guardrails**: a small integration test that proves a query run inside `withUserContext('user-a')` cannot see `user-b`'s rows even when the `where` clause is omitted.
- **Residual migration scope**: finalize migration of remaining user-session paths still importing `prismaAdmin`, especially onboarding/auth callback, billing portal profile update, and OAuth nonce (`oauth_states`) connect/callback handlers.
- **Policy-aligned exceptions**: keep explicit, documented `prismaAdmin` usage for service-only inserts to `ai_usage_logs` and for public promise-token endpoints where no authenticated Supabase user exists.

## Capabilities

### Modified Capabilities

- `user-auth`: tenant-isolation requirement is restated against the actual enforcement mechanism, and a new requirement covers the service-role escape hatch.

### New Capabilities

None. This change reconciles existing capabilities with the design, it does not add product surface.

## Impact

- **Code touched**: every server-side `prisma.*` call site that runs in a user request context — dashboard pages, settings pages, `/api/invoices/[id]/*` routes, `/api/billing/*`, `/api/stripe/*`, `/api/settings/*`. The cron worker (`/api/cron/send-emails`) and Stripe webhooks remain on the admin client (correct, since they run without a user JWT).
- **Database**: runtime `DATABASE_URL` rotates to a non-owner role and `DIRECT_URL` remains owner for migrations. Existing migrations are untouched.
- **Performance**: one extra round-trip per user request (the `set_config` inside the transaction). Acceptable on Supabase pooler; measurable but small.
- **Out of scope**: rewriting `where: { userId }` predicates that already exist — they become belt-and-suspenders and stay. Future work can lint them away.
- **Risk**: this is the kind of change that, if half-done, looks fine in dev and leaks in prod. The proposal's tasks include an explicit verification step (the cross-tenant test) before declaring done.
- **Operational risk**: mixed `withUserContext` and `prismaAdmin` usage inside the same request handler can hide accidental escalation, so remaining exceptions must be explicit and reviewable.
