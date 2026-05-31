## MODIFIED Requirements

### Requirement: Row Level Security enforces tenant isolation
The system SHALL enforce Supabase Row Level Security on all application tables so that, for any database query executed on behalf of an authenticated user, only rows where `userId = auth.uid()` are visible — regardless of whether the application-level query includes a `userId` predicate.

To make this guarantee hold under the Prisma client used by the application, every user-scoped database access SHALL run inside a transaction that:

1. Sets `request.jwt.claims` to a JSON object containing the user's id as `sub`, via `SELECT set_config('request.jwt.claims', $1, true)`, AND
2. Switches the session role to `authenticated` via `SET LOCAL ROLE authenticated`

Both statements use transaction-scoped settings so they cannot leak across requests sharing a pooled connection.

The runtime database connection (`DATABASE_URL`) SHALL use a non-owner Postgres role that does not have the `BYPASSRLS` attribute. Migrations connect via a separate `DIRECT_URL` using the owner role.

#### Scenario: Query without userId predicate is still scoped
- **WHEN** a request running on behalf of user A invokes a Prisma query with no `where` clause on a table containing rows for both user A and user B
- **THEN** only user A's rows SHALL be returned

#### Scenario: Setting does not leak across requests
- **WHEN** two requests on behalf of different users are served sequentially on the same pooled database connection
- **THEN** each request SHALL see only its own user's rows, because the `SET LOCAL` settings end with the transaction

#### Scenario: Connection role cannot bypass RLS
- **WHEN** a query is executed on the runtime connection without first establishing user context via the wrapper
- **THEN** zero rows SHALL be returned from any RLS-protected table

---

## ADDED Requirements

### Requirement: Service-role database access is explicitly named
The system SHALL provide a separately-named database client (`prismaAdmin`) for code paths that legitimately operate without a user session — namely the email-dispatch cron, Stripe webhook handlers, and the post-signup profile bootstrap. This client SHALL be the only path that bypasses RLS, and every import of it SHALL be reviewable as a deliberate escalation.

The system SHALL NOT export a default Prisma client that ambiguously serves both user and service contexts.

#### Scenario: Cron worker uses the admin client
- **WHEN** the daily email cron iterates over pending invoices across all users
- **THEN** it uses `prismaAdmin` and is responsible for filtering by `userId` per iteration

#### Scenario: User route handler cannot accidentally escalate
- **WHEN** a developer writes a new `/api/...` route handler that serves a user request
- **THEN** importing the admin client is visibly distinct from importing the user-context wrapper, so the choice is reviewable
