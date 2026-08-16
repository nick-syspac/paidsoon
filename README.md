# PaidSoon

Next.js app that follows up on overdue invoices on behalf of freelancers. Connects to Stripe (Connect) to read invoices, sends reminder emails on a configurable schedule via Resend, runs on Vercel with Supabase as the database + auth layer.

## Setting up an environment

All operator setup (Supabase, Stripe, Vercel, Resend) lives in **[docs/runbooks/](docs/runbooks/README.md)**. Start there for:

- Bringing up Local, Vercel Preview, or Production from scratch.
- Reprovisioning a single service after wiping it.
- Looking up which env var goes where (canonical matrix in [docs/runbooks/README.md](docs/runbooks/README.md)).

## Local development quick reference

Use Node 24 for local development, CI, and Vercel deployments. The project declares this in package metadata and GitHub Actions to keep the runtime aligned across environments.

```bash
npm install
# Pull env vars from a configured Vercel project
vercel env pull .env.local --environment=development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Full local setup (including Supabase, Stripe CLI, and Resend): [docs/runbooks/README.md](docs/runbooks/README.md).

### Launch mode (`LIVE`)

- Set `LIVE=false` to run pre-launch mode: sign-in/sign-up routes are disabled and a top banner indicates the site is not live.
- Set `LIVE=true` for normal live behavior.
- Missing or malformed `LIVE` defaults to pre-launch mode (`false`).

## Database access: `withUserContext` vs `prismaAdmin`

Tenant isolation is enforced at the database layer via Supabase Row Level Security. To make RLS actually fire under Prisma, the codebase exposes two entry points and no default `prisma` client:

- `withUserContext(userId, (tx) => ...)` from [lib/db/withUserContext.ts](lib/db/withUserContext.ts) — the default for any code path serving a user request (server components, server actions, route handlers). It opens a Prisma `$transaction`, sets `request.jwt.claims` and `SET LOCAL ROLE authenticated`, then runs the callback. Inside the callback, `auth.uid()` resolves to `userId` and RLS policies apply.
- `prismaAdmin` from [lib/db/admin.ts](lib/db/admin.ts) — connects as the owner role and **bypasses RLS**. Use only from cron jobs, webhook handlers, and the post-signup profile bootstrap. Every import is a deliberate, reviewable escalation.

Supabase endpoints are derived from two canonical inputs:

- `SUPABASE_PROJECT_REF` — the non-secret 20-character project identifier.
- `SUPABASE_DB_PASSWORD` — the server-only database secret. It is percent-encoded in memory and never exposed to browser code.

Runtime derives the Shared Pooler transaction-mode URL on port `6543`. Prisma migrations and database administration derive the Shared Pooler session-mode URL on port `5432`. See [lib/config/supabaseEnvironment.ts](lib/config/supabaseEnvironment.ts) and [prisma.config.ts](prisma.config.ts).

A verification script lives at [scripts/verify-rls.ts](scripts/verify-rls.ts) and proves cross-tenant isolation holds at the DB layer.
