## Phase 1 — Domain & DNS

- [ ] 1.1 Confirm `paidsoon.com` is registered and you control its DNS (registrar: wherever it was bought)
- [ ] 1.2 In Resend dashboard → Domains → Add Domain: add `paidsoon.com`, region `us-east-1`
- [ ] 1.3 Add the SPF, DKIM, and Return-Path DNS records that Resend provides to your DNS registrar; wait for Resend to show status **Verified**
- [ ] 1.4 Decide disposition of legacy `invoicenudge.com` domain: park, 301-redirect to `paidsoon.com`, or release (does not block go-live)

## Phase 2 — Supabase

- [ ] 2.1 Create a Supabase project (name: `paidsoon-prod`); note the region — choose one close to your users
- [ ] 2.2 In Supabase dashboard → Project Settings → Database, copy:
  - **Direct URL** (used for migrations): `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`
  - **pgBouncer pooler URL** (used for runtime): `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true`
- [ ] 2.3 Retrieve the password for the **`authenticator`** role: Project Settings → Database → scroll to "Database roles" section
- [ ] 2.4 Construct the `authenticator` pgBouncer URL by substituting `postgres.[ref]` with `authenticator.[ref]` in the pooler URL (same password as step 2.3)
- [ ] 2.5 In Supabase → Authentication → Providers: enable **Email** (confirm email: on) and **Google** OAuth (add OAuth client ID + secret from Google Cloud Console)
- [ ] 2.6 In Supabase → Authentication → URL Configuration: set Site URL to your Vercel production URL (e.g. `https://paidsoon.com`); add `https://paidsoon.com/auth/callback` to Redirect URLs
- [ ] 2.7 Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → Project Settings → API
- [ ] 2.8 Copy `SUPABASE_SERVICE_ROLE_KEY` from the same API settings page (keep this secret — never expose client-side)
- [ ] 2.9 Run migrations from your local machine using the **Direct URL** (owner role):
  ```bash
  DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
  npx prisma migrate deploy
  ```
- [ ] 2.10 Apply RLS policies: in Supabase SQL Editor, paste and run the contents of `prisma/rls-policies.sql`
- [ ] 2.11 Verify schema in Supabase Table Editor: confirm all 6 tables exist (`user_profiles`, `invoice_connections`, `schedules`, `email_settings`, `tracked_invoices`, `email_logs`)

## Phase 3 — Stripe

> **Do 3.1 immediately** — Connect platform approval can take 1–5 business days. All other phases can proceed while you wait.

- [ ] 3.1 In Stripe dashboard → Connect → Get started: fill out and submit the Connect platform application. Select "Build a platform or marketplace". Note: this is the primary external dependency risk.
- [ ] 3.2 In Stripe dashboard → Products → Add product: create **PaidSoon Pro**, price = **$19.00 / month** (recurring, USD). Copy the **Price ID** (`price_xxx`) — this goes into `STRIPE_PRO_PRICE_ID` env var
- [ ] 3.3 Copy Stripe API keys: Dashboard → Developers → API keys → copy **Secret key** (`sk_live_xxx`) and **Publishable key** (`pk_live_xxx`)
- [ ] 3.4 *(After Connect approval)* In Stripe → Connect → Settings: copy the **Client ID** (`ca_xxx`) for OAuth — this is `STRIPE_CONNECT_CLIENT_ID`
- [ ] 3.5 *(After Vercel deploy in Phase 4)* Register billing webhook: Stripe → Developers → Webhooks → Add endpoint: URL = `https://paidsoon.com/api/webhooks/stripe-billing`, events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the **Signing secret** → `STRIPE_BILLING_WEBHOOK_SECRET`
- [ ] 3.6 *(After Vercel deploy)* Register Connect webhook: Stripe → Developers → Webhooks → Add endpoint: URL = `https://paidsoon.com/api/webhooks/stripe-connect`, events: `invoice.payment_overdue`, `invoice.paid`, connect type: **Account events**. Copy the **Signing secret** → `STRIPE_CONNECT_WEBHOOK_SECRET`

## Phase 4 — Vercel

- [ ] 4.1 In Vercel dashboard → Add New Project → import the `paidsoon` GitHub repository; set framework to **Next.js**
- [ ] 4.2 Set the following environment variables in Vercel (Settings → Environment Variables) for **Production** and **Preview**:

  | Variable | Value |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | from step 2.7 |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 2.7 |
  | `SUPABASE_SERVICE_ROLE_KEY` | from step 2.8 |
  | `DATABASE_URL` | authenticator pgBouncer URL from step 2.4 |
  | `DIRECT_URL` | direct URL from step 2.2 (for migrations) |
  | `STRIPE_SECRET_KEY` | from step 3.3 |
  | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | from step 3.3 |
  | `STRIPE_CONNECT_CLIENT_ID` | from step 3.4 (after Connect approval) |
  | `STRIPE_PRO_PRICE_ID` | from step 3.2 |
  | `STRIPE_BILLING_WEBHOOK_SECRET` | from step 3.5 |
  | `STRIPE_CONNECT_WEBHOOK_SECRET` | from step 3.6 |
  | `RESEND_API_KEY` | from Resend dashboard → API Keys |
  | `RESEND_FROM_EMAIL` | `billing@paidsoon.com` ← branding flip (D4) |
  | `RESEND_FROM_NAME` | `PaidSoon` ← branding flip (D4) |
  | `CRON_SECRET` | generate a strong random value: `openssl rand -hex 32` |
  | `NEXT_PUBLIC_URL` | `https://paidsoon.com` |

- [ ] 4.3 Mirror all the above env vars into your local `.env.local` (gitignored)
- [ ] 4.4 Add `paidsoon.com` as a custom domain in Vercel → Project → Settings → Domains; update your DNS registrar with the CNAME/A records Vercel provides
- [ ] 4.5 Trigger a production deploy (push to `main` or redeploy from Vercel dashboard); confirm build succeeds

## Phase 5 — Verification

- [ ] 5.1 Run build smoke test locally:
  ```bash
  npm run build
  ```
  Confirm zero TypeScript errors and a clean build output.

- [ ] 5.2 Run RLS verification script against the production Supabase DB:
  ```bash
  DATABASE_URL="<authenticator-pooler-url>" DIRECT_URL="<direct-url>" npx ts-node scripts/verify-rls.ts
  ```
  Expected: User A sees only User A's row; User B sees only User B's row; unauthenticated context sees zero rows.

- [ ] 5.3 Manual smoke test — open two private-browser windows signed in as two different accounts:
  - Load `/`, `/sign-in`, `/sign-up`, `/dashboard`, `/dashboard/settings/email`
  - Confirm every visible brand string reads **PaidSoon** (not "Invoice Nudge")
  - Confirm dashboard loads without errors for both accounts
  - Confirm neither account can see the other's data

- [ ] 5.4 End-to-end test (requires Stripe Connect approval):
  1. Sign up as a test user → connect a Stripe test-mode account via OAuth
  2. Create an overdue invoice in the connected Stripe test account (set due date in the past)
  3. Wait for or manually trigger the cron: `GET /api/cron/send-emails` with `Authorization: Bearer <CRON_SECRET>`
  4. Confirm Stage 1 email arrives in the inbox with `From: PaidSoon <billing@paidsoon.com>`
  5. Advance mock time (or wait) for Stage 2 and Stage 3; confirm all three emails arrive
  6. Mark the invoice as paid in Stripe test mode; confirm `status` flips to `paid` via the dashboard
  7. Confirm no further emails are sent after payment

- [ ] 5.5 Rotate the old `postgres`-role DB password in Supabase (Project Settings → Database → Reset database password) since it is no longer the runtime credential and should not be reused

- [ ] 5.6 Check Resend dashboard: confirm sends appear under the `paidsoon.com` domain with no deliverability warnings (SPF/DKIM pass)
