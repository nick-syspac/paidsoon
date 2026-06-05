# PaidSoon — Go-Live Checklist

All application code is on `main`. This document is the operator checklist to get PaidSoon running in production. Work through the phases in order — each phase produces credentials needed by the next.

> **Critical path**: Stripe Connect platform approval (step 3.1) can take 1–5 business days. Submit it on day 1 and work through Phases 1–2 while you wait.

---

## Phase 1 — Domain & DNS

- [ ] **1.1** Confirm `paidsoon.com` is registered and you control its DNS
- [ ] **1.2** In Resend dashboard → Domains → Add Domain: add `paidsoon.com`, region `us-east-1`
- [ ] **1.3** Add the SPF, DKIM, and Return-Path DNS records Resend provides; wait for status **Verified**
- [ ] **1.4** Decide disposition of legacy `invoicenudge.com` domain (park / 301-redirect / release) — does not block go-live

---

## Phase 2 — Supabase

- [ ] **2.1** Create Supabase project (name: `paidsoon-prod`); choose a region close to your users
- [ ] **2.2** In Project Settings → Database, copy both connection strings:
  - **Direct URL** (migrations): `postgresql://postgres:[pw]@db.[ref].supabase.co:5432/postgres`
  - **pgBouncer pooler URL** (runtime): `postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true`
- [ ] **2.3** Retrieve the `authenticator` role password: Project Settings → Database → Database roles
- [ ] **2.4** Construct the `authenticator` pgBouncer URL: replace `postgres.[ref]` with `authenticator.[ref]` in the pooler URL (same password as 2.3)
- [ ] **2.5** Authentication → Providers: enable **Email** (confirm email: on) and **Google** OAuth (requires Google Cloud Console OAuth client)
- [ ] **2.6** Authentication → URL Configuration: set Site URL to `https://paidsoon.com`; add `https://paidsoon.com/auth/callback` to Redirect URLs
- [ ] **2.7** Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API
- [ ] **2.8** Copy `SUPABASE_SERVICE_ROLE_KEY` from the same API page *(never expose client-side)*
- [ ] **2.9** Run migrations (from your local machine, using the Direct URL):
  ```bash
  DIRECT_URL="postgresql://postgres:[pw]@db.[ref].supabase.co:5432/postgres" \
  npx prisma migrate deploy
  ```
- [ ] **2.10** Apply RLS policies: paste and run `prisma/rls-policies.sql` in Supabase SQL Editor
- [ ] **2.11** Verify in Table Editor: confirm all 6 tables exist (`user_profiles`, `invoice_connections`, `schedules`, `email_settings`, `tracked_invoices`, `email_logs`)

---

## Phase 3 — Stripe

> Submit **3.1 immediately** — everything else in this phase can follow after approval arrives.

- [ ] **3.1** Stripe dashboard → Connect → Get started: submit the Connect platform application. Select "Build a platform or marketplace" ⚠️ *async — up to 5 business days*
- [ ] **3.2** Products → Add product: create **PaidSoon Pro**, price = **$19.00 / month** (recurring, USD). Copy the **Price ID** (`price_xxx`) → `STRIPE_PRO_PRICE_ID`
- [ ] **3.3** Developers → API keys: copy **Secret key** (`sk_live_xxx`) → `STRIPE_SECRET_KEY` and **Publishable key** (`pk_live_xxx`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] **3.4** *(After Connect approval)* Connect → Settings: copy **Client ID** (`ca_xxx`) → `STRIPE_CONNECT_CLIENT_ID`
- [ ] **3.5** *(After Phase 4 deploy)* Developers → Webhooks → Add endpoint:
  - URL: `https://paidsoon.com/api/webhooks/stripe-billing`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Copy Signing secret → `STRIPE_BILLING_WEBHOOK_SECRET`
- [ ] **3.6** *(After Phase 4 deploy)* Add a second endpoint:
  - URL: `https://paidsoon.com/api/webhooks/stripe-connect`
  - Events: `invoice.payment_overdue`, `invoice.paid`; type: **Account events**
  - Copy Signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`

---

## Phase 4 — Vercel

- [ ] **4.1** Vercel dashboard → Add New Project → import the `paidsoon` GitHub repo; framework: **Next.js**
- [ ] **4.2** Settings → Environment Variables — add all of the following for **Production** and **Preview**:

  | Variable | Source |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | step 2.7 |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | step 2.7 |
  | `SUPABASE_SERVICE_ROLE_KEY` | step 2.8 |
  | `DATABASE_URL` | authenticator pgBouncer URL — step 2.4 |
  | `DIRECT_URL` | direct URL — step 2.2 |
  | `STRIPE_SECRET_KEY` | step 3.3 |
  | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | step 3.3 |
  | `STRIPE_CONNECT_CLIENT_ID` | step 3.4 |
  | `STRIPE_PRO_PRICE_ID` | step 3.2 |
  | `STRIPE_BILLING_WEBHOOK_SECRET` | step 3.5 |
  | `STRIPE_CONNECT_WEBHOOK_SECRET` | step 3.6 |
  | `RESEND_API_KEY` | Resend dashboard → API Keys |
  | `RESEND_FROM_EMAIL` | `billing@paidsoon.com` |
  | `RESEND_FROM_NAME` | `PaidSoon` |
  | `CRON_SECRET` | generate: `openssl rand -hex 32` |
  | `NEXT_PUBLIC_URL` | `https://paidsoon.com` |

- [ ] **4.3** Mirror all env vars into local `.env.local` (gitignored)
- [ ] **4.4** Project → Settings → Domains: add `paidsoon.com`; update DNS registrar with Vercel's CNAME/A records
- [ ] **4.5** Trigger production deploy (push to `main` or redeploy from dashboard); confirm build succeeds

---

## Phase 5 — Verification

- [ ] **5.1** Local build smoke test:
  ```bash
  npm run build
  ```
  Expected: zero TypeScript errors, clean output.

- [ ] **5.2** RLS verification script:
  ```bash
  node --env-file=.env.local --import tsx scripts/verify-rls.ts
  ```
  Expected: User A sees only User A's row; User B sees only User B's row; unauthenticated context sees zero rows.

- [ ] **5.3** Manual smoke test (two private-browser windows, two different accounts):
  - Load `/`, `/sign-in`, `/sign-up`, `/dashboard`, `/dashboard/settings/email`
  - Every visible brand string reads **PaidSoon** (not "Invoice Nudge")
  - Dashboard loads without errors for both accounts
  - Neither account can see the other's data

- [ ] **5.4** End-to-end test *(requires Stripe Connect approval)*:
  1. Sign up → connect a Stripe test-mode account via OAuth
  2. Create an overdue invoice in the connected test account (due date in the past)
  3. Trigger the cron manually: `GET /api/cron/send-emails` with header `Authorization: Bearer <CRON_SECRET>`
  4. Confirm Stage 1 email arrives with `From: PaidSoon <billing@paidsoon.com>`
  5. Trigger cron again after advancing `nextEmailAt` dates; confirm Stage 2 and Stage 3 emails arrive
  6. Mark invoice paid in Stripe test mode; confirm dashboard shows `paid` status
  7. Trigger cron one more time; confirm no further emails are sent

- [ ] **5.5** Rotate the `postgres`-role DB password in Supabase (Project Settings → Database → Reset database password) — it is no longer the runtime credential

- [ ] **5.6** Check Resend dashboard: confirms sends appear under `paidsoon.com` with no deliverability warnings (SPF/DKIM pass)
