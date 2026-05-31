## Context

Invoice Nudge stores multi-tenant data (client email addresses, invoice amounts, payment status) belonging to real freelancer businesses. The MVP design picked Supabase Auth + Postgres specifically so that tenant isolation could be enforced at the DB layer via RLS, eliminating an entire class of "forgot the `WHERE userId = ?` clause" bugs.

The implementation took a shortcut: Prisma connects with the owner role, which bypasses RLS. Isolation is therefore application-layer only. The RLS policies in `prisma/rls-policies.sql` are inert — useful only if a future caller queries via supabase-js (which carries the user JWT and goes through PostgREST).

This change makes Prisma RLS-aware so the original guarantee actually holds.

## Goals / Non-Goals

**Goals**
- Every user-request query runs as a Postgres role where RLS applies and `auth.uid()` resolves to the caller's user id.
- Service-role access (cron, webhooks, post-signup bootstrap) is a clearly-named, separately-imported client — not the default.
- A test exists that would fail today and pass after the change, demonstrating cross-tenant isolation at the DB layer.

**Non-Goals**
- Removing existing `where: { userId }` predicates. They become defense-in-depth.
- Migrating any reads from Prisma to supabase-js.
- Per-row encryption, audit logging, or anything beyond the isolation guarantee.
- Reworking RLS policies themselves — the existing `auth.uid()::text = "userId"` policies are correct.

## Decisions

### D1: Use a transaction-scoped `SET LOCAL` to bind the user to each request

**Decision:** Wrap every user-scoped Prisma access in a helper that opens a `$transaction`, sets the JWT claim and role via `SET LOCAL`, and runs the callback.

```ts
// lib/db/withUserContext.ts (sketch — illustrative, not implementation)
export async function withUserContext<T>(
  userId: string,
  fn: (tx: PrismaTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" })
    await tx.$executeRawUnsafe(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      claims,
    )
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}
```

**Rationale:** `SET LOCAL` is transaction-scoped, so the setting cannot leak to the next request that picks up the same pooled connection. This is the standard pattern for Postgres-with-RLS behind a connection pooler. `auth.uid()` in Supabase reads from `request.jwt.claims->>'sub'`, so injecting that GUC makes the existing policies fire unchanged.

**Alternative considered:** Use Postgres prepared statements / a custom JWT minted per request. Rejected — heavier, requires a Supabase JWT signing secret in app code, and gains nothing over `set_config`.

---

### D2: Two clients, named for what they do

**Decision:** The codebase exports two Prisma-flavored entry points:

- `withUserContext(userId, fn)` — the default. Inside `fn`, `tx` is a Prisma transaction client where RLS is active. Every server component, server action, and route handler that has a user uses this.
- `prismaAdmin` — a plainly-named client that connects as the owner role (RLS bypassed). Imported only by cron, webhook handlers, and the post-signup profile creation. Each import site is a deliberate decision a reviewer can see.

We will not export a bare `prisma` from `lib/prisma.ts` anymore — current imports of `prisma` migrate to one of the two.

**Rationale:** The danger with RLS-via-Prisma is silent escalation: someone reaches for the convenient client when they should have used the scoped one. Naming the admin client `prismaAdmin` and removing the default `prisma` export forces the choice to be explicit at the import line.

**Alternative considered:** Keep a single `prisma` and rely on lint rules. Rejected — easier to bypass and harder to review.

---

### D3: Two database roles, two URLs

**Decision:**

- `DATABASE_URL` — connects as a new low-privilege role `app_user` (pgBouncer pooler). Used by Prisma at runtime. RLS applies.
- `DIRECT_URL` — connects as the owner / migration role (direct connection, no pooler). Used by `prisma migrate` only.

The `app_user` role is granted `SELECT, INSERT, UPDATE, DELETE` on all application tables, plus `USAGE` on the schema. It is NOT a superuser and is NOT `BYPASSRLS`.

**Rationale:** Supabase already ships with `authenticated` and `service_role` roles. We use `authenticated` (via `SET LOCAL ROLE authenticated` inside the transaction) for user requests, which matches how PostgREST + RLS already work in this DB. The `app_user` role exists as the connection role — it must have permission to switch to `authenticated`, which is the Supabase default.

**Alternative considered:** Reuse the existing `authenticated` role directly for the pooled connection. Rejected because connections need to outlive a single user; the `SET LOCAL ROLE` pattern is what allows one pool to serve many users safely.

---

### D4: Service-role writes from cron/webhooks stay on `prismaAdmin`

**Decision:** The cron worker and Stripe webhook handlers do not have a user JWT and must not pretend to. They use `prismaAdmin` and bear the responsibility of scoping their own queries (which they already do — e.g. the cron iterates `userId` per invoice).

The `email_logs` INSERT policy `WITH CHECK (true)` in `prisma/rls-policies.sql` becomes meaningful again: under the new scheme, if someone ever wrote to `email_logs` from a user context by mistake, the policy would allow it but the `withUserContext` wrapper would still scope reads correctly.

---

### D5: One integration test is the acceptance gate

**Decision:** A single test seeds two users with one `TrackedInvoice` each, then asserts that:

1. Inside `withUserContext('user-a')`, `tx.trackedInvoice.findMany()` (no `where`) returns exactly user A's row.
2. Inside `withUserContext('user-b')`, the same call returns exactly user B's row.
3. Outside any context (using a bare connection as `app_user`), the same call returns zero rows.

This test would currently be impossible to write meaningfully — it is the proof the change is real.

## Risks / Trade-offs

- **Latency:** ~1 extra round-trip per user request (the `SET LOCAL` statements piggyback on the transaction's first statement in practice, but conservatively assume one extra RTT). On Supabase pooler this is single-digit milliseconds.
- **Migration hazard:** mass-rewriting `prisma.foo` to `withUserContext(uid, (tx) => tx.foo)` is mechanical but tedious. Done in one pass with grep + review.
- **Forgotten escalations:** the cron and webhooks must use `prismaAdmin`. If someone wraps a webhook handler in `withUserContext` with a guessed user id, it will silently fail because `auth.uid()` won't match anything meaningful. This is preferable to silently succeeding with wrong scoping.
- **Existing `where: { userId }` predicates stay.** They are now redundant but harmless, and removing them is a separate cleanup that can be linted later.

## Open Questions

- Confirm Supabase's `authenticated` role is grantable to a custom `app_user` role on the project — or whether we should just connect as `authenticated` directly through the pooler. (Empirically: Supabase recommends connecting as `authenticated` for client-bearing connections; for a server-side pooled connection that multiplexes users, the wrapping pattern above is needed.)
- Should the post-signup user-profile and default-schedule creation move from `prismaAdmin` to a user-context call once the new user's JWT is available? Currently it runs before the user has a session.
