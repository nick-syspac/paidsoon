# Supabase runbook

Supabase provides three things for PaidSoon: Postgres (the application database), Authentication (email + Google OAuth), and the row-level-security (RLS) backbone that enforces tenant isolation.

> Env-var values come from [README.md](./README.md) — set them in the environment named in each row.

**Prerequisites:** none. This runbook can run first. Stripe and Resend can be set up in parallel.

---

## 1. Create the project

Do this twice — once for each Supabase project that backs an environment:

| Project name | Backs |
|---|---|
| `paidsoon-dev` | Local + Vercel Preview |
| `paidsoon-prod` | Production |

Steps (per project):

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name (`paidsoon-dev` or `paidsoon-prod`).
3. **Database password** — generate a strong one and save it in a password manager. You will use this exact string for both `DATABASE_URL` and `DIRECT_URL` — both connect as `postgres` (see §2).
4. **Region** — pick one close to your users. Region trade-offs:
   - Same region as Vercel Functions → lowest p99 latency for every DB query. Vercel Functions default to `iad1` (us-east-1), so `us-east-1` Supabase is the typical pairing.
   - Cross-region adds 50–200 ms per round-trip to every Prisma query, which compounds badly given each user request can issue several queries.
   - Pick the same region for `paidsoon-dev` and `paidsoon-prod` so they behave identically.
5. Wait ~2 minutes for provisioning.

---

## 2. Database — two connection strings

PaidSoon uses **two** Postgres connections, on purpose:

- **`DATABASE_URL`** — runtime connection. Goes through the **Shared Pooler (Supavisor), transaction mode** on `aws-[region].pooler.supabase.com:6543`. Supavisor is IPv4-only, which is what Vercel Functions need. RLS is enforced by [lib/db/withUserContext.ts](../../lib/db/withUserContext.ts), which issues `SET LOCAL ROLE authenticated` as the first statement of every user-scoped transaction — see §2.2.
- **`DIRECT_URL`** — migrations only. Connects as the `postgres` owner role on the direct host/port (`db.[ref].supabase.co:5432`). This bypasses RLS so `prisma migrate deploy` can DDL. Configured in [prisma.config.ts](../../prisma.config.ts). The direct host is IPv6-only without the IPv4 add-on, so it is usable from a developer machine but **not** from Vercel.

### 2.1 Find the strings

Supabase dashboard → **Connect** (top of the project page):

- **Direct connection** (port `5432`, host `db.[ref].supabase.co`) → this is your `DIRECT_URL` as-is.
- **Transaction pooler** (port `6543`, host `aws-[region].pooler.supabase.com`) → this is your `DATABASE_URL`; just append `&connection_limit=1`.

### 2.2 Use the `postgres.[ref]` user — do not swap it

The shared pooler's username is `postgres.[ref]`, where the suffix is how Supavisor resolves the tenant. **Supavisor only has a user record for `postgres`.** Substituting any other role — including Supabase's built-in `authenticator` — fails at connect time with:

```
FATAL XX000: (ENOTFOUND) tenant/user authenticator.[ref] not found
```

RLS is still enforced with the `postgres` user, because enforcement does not depend on the connection role. [withUserContext.ts](../../lib/db/withUserContext.ts) runs `SET LOCAL ROLE authenticated` before any query in the transaction, so `current_user` is `authenticated` — a role with neither `BYPASSRLS` nor table ownership — for the whole transaction. The `SET LOCAL` is transaction-scoped, so it cannot leak across requests sharing a pooled connection.

The connection role therefore only affects `prismaAdmin` code paths that deliberately run without a user session (cron, webhooks, post-signup bootstrap), which are meant to bypass RLS.

> If you need the runtime connection itself to be a non-owner role, the shared pooler cannot do it. That requires the Dedicated Pooler (PgBouncer, paid plan) or a direct connection, both of which need the [IPv4 add-on](https://supabase.com/docs/guides/platform/ipv4-address) to be reachable from Vercel.

The `connection_limit=1` query parameter is recommended for serverless deployments to avoid exhausting the pool.

### 2.3 Final shape

```bash
# Runtime — shared pooler (Supavisor) transaction mode, IPv4, user=postgres.[ref]
DATABASE_URL="postgresql://postgres.[ref]:[DB_PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Migrations — direct host, user=postgres (owner), bypasses RLS
DIRECT_URL="postgresql://postgres:[DB_PASSWORD]@db.[ref].supabase.co:5432/postgres"
```

> **Do not** point `DATABASE_URL` at `db.[ref].supabase.co:6543`. That host/port pair is the Dedicated Pooler and does not exist on the free tier; the direct host only listens on `5432`. The symptom is Prisma `P1001 Can't reach database server`.

Set these per the matrix in [README.md](./README.md) — `paidsoon-dev` values go into Local + Preview, `paidsoon-prod` into Production.

---

## 3. API keys

Supabase Project Settings → **API Keys**.

PaidSoon uses the newer Supabase API-key naming (`sb_publishable_…` / `sb_secret_…`), not the legacy `anon` / `service_role` JWTs.

| Supabase field | App env var | Used where |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | browser + server + cron |
| API Keys → `publishable` (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server (safe to expose) |
| API Keys → `secret` (`sb_secret_…`) | `SUPABASE_SECRET_KEY` | cron only — for `auth.admin.getUserById` |

> **Rule**: `SUPABASE_SECRET_KEY` bypasses RLS. It must **never** appear in any variable starting with `NEXT_PUBLIC_` (that prefix bundles the value into the browser bundle). It must never be logged. It is only read by [app/api/cron/send-emails/route.ts](../../app/api/cron/send-emails/route.ts).

Set both keys per the matrix in [README.md](./README.md).

---

## 4. Apply the schema (Prisma)

Run from your local machine (you only need this once per Supabase project — typically once for `paidsoon-dev` and once for `paidsoon-prod`).

```bash
# Set DIRECT_URL to the project you're migrating
export DIRECT_URL="postgresql://postgres:[DB_PASSWORD]@db.[ref].supabase.co:5432/postgres"

npx prisma migrate deploy    # creates tables using DIRECT_URL (owner role)
npx prisma generate          # generates the Prisma client into lib/generated/prisma/
```

Verify in Supabase → **Table Editor** that all six tables exist:

- `user_profiles`
- `invoice_connections`
- `schedules`
- `email_settings`
- `tracked_invoices`
- `email_logs`

---

## 5. Apply the RLS policies

The schema is only half the story. The policies in [prisma/rls-policies.sql](../../prisma/rls-policies.sql) are what enforce tenant isolation. Apply them with `psql`:

```bash
psql "$DIRECT_URL" -f prisma/rls-policies.sql
```

Or paste the file's contents into Supabase → **SQL Editor → New query → Run**.

### 5.1 Verify RLS works

There is a script that proves cross-tenant isolation. Run it against the target Supabase project (you'll need both `DATABASE_URL` and `DIRECT_URL` exported, or in `.env.local` if you're testing the dev project):

```bash
node --import tsx scripts/verify-rls.ts
```

**Expected output ends with**: `PASS: RLS is enforced.`

If it fails, **do not continue** — fix it first. Common causes:

- You forgot to apply `prisma/rls-policies.sql`.
- The `authenticated` role is missing `GRANT`s on the `public` schema/tables → `permission denied for schema public` after `SET LOCAL ROLE authenticated`.
- Wrong password.

---

## 6. Authentication providers

Supabase dashboard → **Authentication → Sign In / Providers**.

Two providers are required because the app wires both:

| Provider | Why required | Code reference |
|---|---|---|
| **Email** (magic-link, confirm email: on) | Default sign-in path | [app/(auth)/sign-in/page.tsx](../../app/%28auth%29/sign-in/page.tsx) |
| **Google OAuth** | Both sign-in and sign-up pages have a "Continue with Google" button | [sign-in.tsx L34](../../app/%28auth%29/sign-in/page.tsx#L34), [sign-up.tsx L40](../../app/%28auth%29/sign-up/page.tsx#L40) |

If Google OAuth is not configured, the "Continue with Google" buttons will return an error from Supabase. The app will not crash, but new users hitting the Google button get a poor experience.

### 6.1 Configure Google OAuth

You need a Google Cloud Console OAuth 2.0 client:

1. [Google Cloud Console](https://console.cloud.google.com) → create a project (or reuse one).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. **Authorized redirect URIs**: paste the URL Supabase shows you in **Authentication → Providers → Google** (it looks like `https://[ref].supabase.co/auth/v1/callback`).
5. Copy the **Client ID** and **Client Secret** into the Supabase Google provider settings.
6. Enable the provider.

Repeat per Supabase project (`paidsoon-dev` and `paidsoon-prod` each need their own redirect URI registered in Google Cloud, since they have different Supabase project references).

---

## 7. Auth URL configuration

Supabase dashboard → **Authentication → URL Configuration**.

This controls where Supabase sends users back after email confirmation and OAuth, and which redirect URLs it will trust.

### 7.1 `paidsoon-dev` (Local + Preview)

| Field | Value |
|---|---|
| **Site URL** | `http://localhost:3000` |
| **Redirect URLs** | `http://localhost:3000/auth/callback`, plus the wildcard pattern `https://*-<your-vercel-team>.vercel.app/auth/callback` (so per-PR preview URLs are accepted) |

If you do not use wildcard preview URLs, you can add each preview deployment URL manually as it comes up.

### 7.2 `paidsoon-prod` (Production)

| Field | Value |
|---|---|
| **Site URL** | `https://paidsoon.com` |
| **Redirect URLs** | `https://paidsoon.com/auth/callback` |

The auth callback route lives at [app/auth/callback/route.ts](../../app/auth/callback/route.ts) — it's where OAuth and email-confirmation flows land.

---

## 8. Wipe and re-run

If you need to reprovision a Supabase project (data corruption, RLS gone wrong, fresh start), do the following in order:

1. Delete the project in Supabase dashboard, then start over from §1.
2. Re-export the new `DIRECT_URL` and re-run §4 (`prisma migrate deploy` + `prisma generate`).
3. Re-run §5 (RLS policies + verify script). **Do not skip the verify script** — this is the gate that proves the new project is actually isolated.
4. Re-do §6 (Auth providers — Google OAuth needs the new Supabase callback URL added to Google Cloud Console).
5. Re-do §7 (URL configuration).
6. Update the matrix-referenced env vars in `.env.local` / Vercel.

You do **not** need to re-run §3 (API keys) as a separate step — the new project gets fresh keys automatically. You just need to copy them into your env config.

---

## 9. Production performance checks

Use these checks with the Vercel procedure in [vercel.md §11](./vercel.md#11-frontend-performance-checks).

1. Open `paidsoon-prod` → **Project Settings → Infrastructure** and record the immutable project/database region. Compare it with the Vercel Function region before proposing a move or replacement project.
2. Open **Reports → Database** and review connection count, pool usage, CPU, memory, disk I/O, and query latency during the same window used for Vercel measurements.
3. Open **Reports → Query Performance** and inspect normalized dashboard queries by total time, mean time, calls, and rows. Do not copy PII or literal query parameters into tickets or logs.
4. Run Supabase database advisors and inspect missing-index recommendations against `prisma/schema.prisma` and actual query plans. Do not create an index solely from an advisor suggestion; verify selectivity and write cost first.
5. Check Shared Pooler/Supavisor metrics and logs for wait time, connection saturation, and transaction acquisition failures. PaidSoon uses transaction mode and `connection_limit=1` per serverless process.
6. Use `EXPLAIN (ANALYZE, BUFFERS)` only on an approved non-production dataset or during an approved production diagnostic window. Preserve RLS-equivalent predicates and never paste customer values into documentation.
7. Confirm Auth request latency and error rate for `getUser()` separately from Postgres query latency.

After any schema or RLS change, follow the migration rules and rerun `npm run verify-rls`. Region or pool changes never justify bypassing `withUserContext()`.
