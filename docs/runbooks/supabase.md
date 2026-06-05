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
3. **Database password** — generate a strong one and save it in a password manager. You will use this exact string for both `DATABASE_URL` and `DIRECT_URL` (the `authenticator` role shares this password — see §2).
4. **Region** — pick one close to your users. Region trade-offs:
   - Same region as Vercel Functions → lowest p99 latency for every DB query. Vercel Functions default to `iad1` (us-east-1), so `us-east-1` Supabase is the typical pairing.
   - Cross-region adds 50–200 ms per round-trip to every Prisma query, which compounds badly given each user request can issue several queries.
   - Pick the same region for `paidsoon-dev` and `paidsoon-prod` so they behave identically.
5. Wait ~2 minutes for provisioning.

---

## 2. Database — two connection strings

PaidSoon uses **two** Postgres connections, on purpose:

- **`DATABASE_URL`** — runtime connection. Connects as the `authenticator` role through pgBouncer (port `6543`). This role is **not** allowed to bypass RLS, so the policies in [prisma/rls-policies.sql](../../prisma/rls-policies.sql) actually apply. The role then switches into `authenticated` inside each transaction via [lib/db/withUserContext.ts](../../lib/db/withUserContext.ts).
- **`DIRECT_URL`** — migrations only. Connects as the `postgres` owner role on the direct port (`5432`). This bypasses RLS so `prisma migrate deploy` can DDL. Configured in [prisma.config.ts](../../prisma.config.ts).

### 2.1 Find the strings

Supabase dashboard → **Project Settings → Database**:

- **Connection string** → **URI** (port `5432`) → this is your `DIRECT_URL` as-is.
- **Connection pooling** → "Transaction" mode (port `6543`) → this is the **base** for your `DATABASE_URL`, before the username swap below.

### 2.2 Build the `authenticator` URL (username swap)

The pooler URL Supabase hands you uses the `postgres` user. To make RLS apply at runtime, swap the username to `authenticator` while keeping the **same database password** from step 1.3:

```
# Original pooler URL (from Supabase dashboard):
postgresql://postgres.[ref]:[DB_PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Final DATABASE_URL — swap "postgres" → "authenticator":
postgresql://authenticator.[ref]:[DB_PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

`authenticator` is a built-in Supabase role that:

- Does **not** have `BYPASSRLS` (so RLS policies fire).
- Is permitted to `SET ROLE authenticated`, which is what [withUserContext.ts](../../lib/db/withUserContext.ts) does inside every user-scoped transaction.

> The `authenticator` role uses the **same password** as the project's `postgres` user. There is no separate "Database roles" password to retrieve.

The `connection_limit=1` query parameter is recommended for serverless deployments to avoid exhausting the pgBouncer pool.

### 2.3 Final shape

```bash
# Runtime — pooler, user=authenticator, RLS applies
DATABASE_URL="postgresql://authenticator.[ref]:[DB_PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Migrations — direct, user=postgres (owner), bypasses RLS
DIRECT_URL="postgresql://postgres:[DB_PASSWORD]@db.[ref].supabase.co:5432/postgres"
```

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

- `DATABASE_URL` is using `postgres` (or `postgres.[ref]`) instead of `authenticator.[ref]` → the connection bypasses RLS silently.
- You forgot to apply `prisma/rls-policies.sql`.
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
