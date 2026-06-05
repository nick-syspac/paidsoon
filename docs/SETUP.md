# PaidSoon — Setup Guide

This is a step-by-step guide to get PaidSoon running from a clean machine. It is written assuming you are new to most of these tools. Follow the sections in order — each one builds on the previous.

By the end you will have:

- A Supabase project (Postgres + Auth) with Row Level Security enforced
- A Vercel project deploying the Next.js app
- Stripe configured for both subscription billing and Connect (reading client invoices)
- Resend configured for sending follow-up emails
- A working local dev environment

---

## 0. What you need before starting

Install these on your machine if you don't have them:

- **Node.js 20+** — check with `node --version`. Install via [nvm](https://github.com/nvm-sh/nvm) if missing.
- **Git** — check with `git --version`.
- **psql** (Postgres CLI) — used once to apply RLS policies. On Ubuntu: `sudo apt install postgresql-client`.
- A code editor — VS Code recommended.

Create accounts on:

- [Supabase](https://supabase.com) — database + auth
- [Vercel](https://vercel.com) — hosting
- [Stripe](https://stripe.com) — billing + reading invoices
- [Resend](https://resend.com) — sending email
- [GitHub](https://github.com) — Vercel deploys from here

All four service accounts have free tiers that are enough for development.

---

## 1. Clone the repo and install

```bash
git clone <your-repo-url> paidsoon
cd paidsoon
npm install
```

If `npm install` complains about missing Node, install Node first (see step 0).

Create the local env file you will fill in as you go:

```bash
touch .env.local
```

`.env.local` is git-ignored. Never commit secrets.

---

## 2. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick a name (e.g. `paidsoon-dev`), a strong **database password** (save it somewhere safe — you will use it below), and a region close to you.
3. Wait ~2 minutes for it to provision.

Once it's ready, grab the values you'll need:

| Where to find it | What it is | Env var name |
|---|---|---|
| Project Settings → **API** → "Project URL" | Public URL of your Supabase project | `NEXT_PUBLIC_SUPABASE_URL` |
| Project Settings → **API Keys** → `publishable` | Public key (safe in the browser) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Project Settings → **API Keys** → `secret` | **SECRET** — server-only, bypasses RLS | `SUPABASE_SECRET_KEY` |

Put them in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SECRET_KEY="sb_secret_..."
```

> The secret key bypasses Row Level Security. **Never** put it in any variable starting with `NEXT_PUBLIC_` (that prefix bundles the value into the browser), and never log or commit it. The previous Supabase API naming used `anon` / `service_role` JWT keys; this project now uses the newer `sb_publishable_...` / `sb_secret_...` keys.

---

## 3. Set up the two database URLs

This project uses **two** different Postgres connections, on purpose:

- `DATABASE_URL` — used at runtime by the app. Connects as a non-owner role so Row Level Security (RLS) actually applies.
- `DIRECT_URL` — used only by `prisma migrate`. Connects as the owner role so it can create tables.

### 3.1 Find the connection strings

In Supabase: **Project Settings → Database**. You'll see two sections:

- **Connection pooling** — copy the URI for "Transaction" mode (port `6543`). This is your `DATABASE_URL`.
- **Connection string** → **URI** (port `5432`). This is your `DIRECT_URL`.

### 3.2 Edit them

The pooled URL Supabase gives you uses the `postgres` user. **Change the username to `authenticator`**. The password is the same database password you set when creating the project.

Final shape:

```bash
# Runtime — pooler, user=authenticator (RLS applies)
DATABASE_URL="postgresql://authenticator:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Migrations — direct, user=postgres (owner, bypasses RLS)
DIRECT_URL="postgresql://postgres:<DB_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres"
```

Add both to `.env.local`.

> **Why `authenticator`?** It's a built-in Supabase role that does not have `BYPASSRLS` and is allowed to switch into the `authenticated` role. Our `withUserContext` helper relies on this exact setup.

### 3.3 Apply the schema

From the project root:

```bash
npx prisma migrate deploy   # creates tables using DIRECT_URL
npx prisma generate         # generates the Prisma client
```

If `prisma migrate deploy` errors with "no migrations to apply" the first time and there are no migration files yet, run `npx prisma migrate dev --name init` instead.

### 3.4 Apply the RLS policies

The schema is only half the story — the policies in [prisma/rls-policies.sql](../prisma/rls-policies.sql) are what enforce tenant isolation.

```bash
psql "$DIRECT_URL" -f prisma/rls-policies.sql
```

(Or copy-paste the file's contents into the Supabase Dashboard → **SQL Editor** → "New query" → Run.)

### 3.5 Verify RLS works

There's a script that proves cross-tenant isolation:

```bash
npm install --save-dev tsx    # one-time, if not installed
node --import tsx scripts/verify-rls.ts
```

Expected output ends with `PASS: RLS is enforced.` If it fails, do not continue — fix it first. Common causes:

- `DATABASE_URL` is using `postgres` instead of `authenticator`
- You forgot to run `prisma/rls-policies.sql`
- Wrong password

---

## 4. Configure Supabase Auth

In Supabase: **Authentication → URL Configuration**.

Set **Site URL** to:
- Local dev: `http://localhost:3000`
- Production: your Vercel URL (you'll come back and update this in step 8)

Add **Redirect URLs** (both):
- `http://localhost:3000/auth/callback`
- `https://<your-vercel-domain>/auth/callback` (add later)

Under **Authentication → Sign In / Providers**, the **Email** provider is on by default — that's all this app needs.

---

## 5. Set up Stripe

This app uses Stripe **twice**, for two unrelated things:

1. **Stripe Billing** — your own customers paying you for the Pro tier (subscription).
2. **Stripe Connect** — your customers connecting *their* Stripe accounts so the app can read *their* invoices.

You need both. Start in **test mode** (toggle in the top-right of the Stripe dashboard).

### 5.1 Get your API keys

[Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys):

```bash
STRIPE_SECRET_KEY="sk_test_..."
```

### 5.2 Create the Pro subscription product

[Stripe → Products → Add product](https://dashboard.stripe.com/test/products):

- Name: `PaidSoon Pro` (anything is fine)
- Pricing: Recurring, monthly, your chosen price
- Save, then copy the **Price ID** (starts with `price_...`):

```bash
STRIPE_PRO_PRICE_ID="price_..."
```

### 5.3 Set up the billing webhook

[Stripe → Developers → Webhooks → Add endpoint](https://dashboard.stripe.com/test/webhooks):

- Endpoint URL: `http://localhost:3000/api/webhooks/stripe-billing` for local testing via the Stripe CLI, or `https://<your-domain>/api/webhooks/stripe-billing` for prod.
- Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- After creating, copy the **Signing secret** (starts with `whsec_...`):

```bash
STRIPE_BILLING_WEBHOOK_SECRET="whsec_..."
```

For **local development**, you can't receive webhooks at `localhost` directly. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing
```

The CLI prints a `whsec_...` secret — use that one locally, and the dashboard one in production.

### 5.4 Set up Stripe Connect

[Stripe → Connect → Settings](https://dashboard.stripe.com/test/settings/connect):

1. Choose **Standard** account type (simplest).
2. In **OAuth settings**, set the **Redirect URI** to:
   - `http://localhost:3000/api/stripe/connect/callback` (dev)
   - `https://<your-domain>/api/stripe/connect/callback` (prod) — add both
3. Copy the **Client ID** (starts with `ca_...`):

```bash
STRIPE_CONNECT_CLIENT_ID="ca_..."
```

Then create a **separate webhook** for Connect:

- Endpoint URL: `https://<your-domain>/api/webhooks/stripe-connect`
- "Listen to events on" → **Connected accounts** (this is the important toggle)
- Events: `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`
- Copy the signing secret:

```bash
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_..."
```

---

## 6. Set up Resend (email sending)

1. Sign up at [resend.com](https://resend.com).
2. **Add a domain** (e.g. `mail.yourdomain.com`) and add the DNS records Resend gives you. For local dev only, you can use Resend's `onboarding@resend.dev` sender to start.
3. [API Keys](https://resend.com/api-keys) → create one:

```bash
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="billing@yourdomain.com"     # must be on a verified domain in prod
RESEND_FROM_NAME="PaidSoon"
```

---

## 7. Other env vars

Two more before you can run the app:

```bash
# The base URL the app thinks it lives at. Used in redirects and OAuth callbacks.
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# A long random string. Vercel cron calls /api/cron/send-emails with this as a Bearer token.
# Generate one with: openssl rand -hex 32
CRON_SECRET="<long-random-hex-string>"
```

### 7.1 Complete `.env.local` checklist

By now your `.env.local` should contain all of these:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Database
DATABASE_URL=
DIRECT_URL=

# App
NEXT_PUBLIC_APP_URL=
CRON_SECRET=

# Stripe — billing
STRIPE_SECRET_KEY=
STRIPE_PRO_PRICE_ID=
STRIPE_BILLING_WEBHOOK_SECRET=

# Stripe — Connect
STRIPE_CONNECT_CLIENT_ID=
STRIPE_CONNECT_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_FROM_NAME=
```

If any line is blank, the app will crash at runtime when that feature is first used. Fix the env var before continuing.

### 7.2 Run it locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with an email, click the magic link in the email (or check Supabase → **Authentication → Users** if it doesn't arrive), and you should land on the dashboard.

---

## 8. Deploy to Vercel

### 8.1 Push to GitHub

```bash
git add .
git commit -m "Initial setup"
git push origin main
```

### 8.2 Import the project on Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import** your GitHub repo.
2. Framework Preset: **Next.js** (auto-detected).
3. Root Directory: leave as `/`.
4. **Do not click Deploy yet** — first add env vars.

### 8.3 Add env vars in Vercel

**Project → Settings → Environment Variables.** Add every single variable from your `.env.local` (section 7.1), one by one.

Two important differences from local:

- `NEXT_PUBLIC_APP_URL` — set to `https://<your-project>.vercel.app` (or your custom domain).
- `STRIPE_BILLING_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` — use the values from the **Stripe Dashboard webhooks** you created in section 5.3 and 5.4 (NOT the Stripe CLI ones).

For each variable, tick all three environments (Production, Preview, Development) unless you have a reason not to.

### 8.4 Deploy

Click **Deploy**. First build takes a few minutes.

### 8.5 Post-deploy fixups

Once you have a live URL:

1. **Supabase → Authentication → URL Configuration** — add your Vercel URL to Site URL and Redirect URLs (see section 4).
2. **Stripe → Webhooks** — make sure the endpoint URLs point at your Vercel URL.
3. **Stripe → Connect → OAuth Redirect URI** — make sure it includes your Vercel URL.
4. **Vercel → Settings → Cron Jobs** — should be auto-detected from [vercel.json](../vercel.json) (`/api/cron/send-emails` daily at 09:00 UTC).

### 8.6 Smoke test on production

- Sign up as a new user → should land on the dashboard.
- Open in two different browsers as two different users → each should see only their own data (this is RLS in action).
- Connect a Stripe account via **Settings → Stripe** → finish OAuth → returns you to the app.
- Trigger an upgrade via **Settings → Subscription** → completes a test-mode Stripe checkout.

---

## 9. How the code is organized (just the bits you'll edit most)

| Folder | What's in it |
|---|---|
| `app/` | Next.js App Router pages and API routes. URL = folder path. |
| `app/(auth)/` | Sign-in / sign-up pages. |
| `app/dashboard/` | Authenticated app pages. |
| `app/api/` | HTTP route handlers. |
| `components/` | React components. `Client.tsx` suffix = uses `"use client"`. |
| `lib/db/` | Prisma access. **Always import from here, not `@prisma/client` directly.** |
| `lib/supabase/` | Supabase auth clients (browser + server). |
| `lib/email/` | Email sending + templates. |
| `lib/providers/stripe.ts` | The shared Stripe client. |
| `prisma/schema.prisma` | Database schema. |
| `prisma/rls-policies.sql` | Row Level Security policies. |
| `scripts/verify-rls.ts` | RLS smoke test. |

### 9.1 The one rule about database access

There are **two** database clients. Picking the right one matters:

```ts
// User-facing code (pages, server actions, API routes serving a logged-in user):
import { withUserContext } from "@/lib/db/withUserContext"

const invoices = await withUserContext(user.id, (tx) =>
  tx.trackedInvoice.findMany({ where: { userId: user.id } }),
)
```

```ts
// Cron, webhooks, post-signup bootstrap — anywhere there is no user session:
import { prismaAdmin } from "@/lib/db/admin"

await prismaAdmin.trackedInvoice.update({ ... })
```

`prismaAdmin` **bypasses RLS**. If you import it from a user-facing route, you have just bypassed every tenant isolation guarantee. Reviewer rule: every `prismaAdmin` import should be obvious why it's there.

There is no `import { prisma } from "@/lib/prisma"` anymore — that file is gone on purpose.

---

## 10. Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `relation "..." does not exist` | Migrations didn't run | `npx prisma migrate deploy` against `DIRECT_URL` |
| `verify-rls.ts` shows "saw both rows" | Connecting as `postgres` (which bypasses RLS) | Change `DATABASE_URL` user to `authenticator` |
| `verify-rls.ts` shows "saw nothing" inside `withUserContext` | RLS policies missing | Re-run `prisma/rls-policies.sql` |
| Sign-up email never arrives | Supabase Site URL is wrong | Section 4 |
| Stripe webhook returns 400 | Wrong webhook signing secret | Use the **dashboard** secret in prod, **CLI** secret locally |
| Stripe Connect OAuth returns "redirect_uri mismatch" | Connect OAuth redirect not registered | Section 5.4, add both dev and prod URLs |
| Cron returns 401 | `CRON_SECRET` mismatch | Make sure Vercel env var matches what cron invokes with (Vercel injects this automatically when configured via Cron Jobs UI) |

---

## 11. Where to go next

- Read [openspec/changes/enforce-rls-via-prisma/design.md](../openspec/changes/enforce-rls-via-prisma/design.md) for the *why* behind the two-client database pattern.
- Read [openspec/changes/invoice-nudge-mvp/proposal.md](../openspec/changes/invoice-nudge-mvp/proposal.md) for the original MVP product overview (note: the product has since been renamed to PaidSoon).
- The [README.md](../README.md) has a quick reference for the database access split.
