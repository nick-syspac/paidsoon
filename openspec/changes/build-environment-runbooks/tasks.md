## 1. Foundation — README and env-var matrix

- [ ] 1.1 Create `docs/runbooks/` directory.
- [ ] 1.2 Write `docs/runbooks/README.md` with: short intro, recommended execution order for a fresh environment, and the canonical env-var matrix (one row per env var, one column per environment: Local, Vercel Preview, Vercel Production; one column for source-runbook reference).
- [ ] 1.3 Verify every env var actually used in code appears as a row in the matrix (`grep -r "process.env\." app/ lib/ middleware.ts`); verify no env var listed in the matrix is unused in code.

## 2. Supabase runbook

- [ ] 2.1 Write `docs/runbooks/supabase.md` covering project creation (dev + prod), region choice, region trade-offs.
- [ ] 2.2 Document the two-URL Postgres setup: `DIRECT_URL` (owner, direct, port 5432) for migrations; `DATABASE_URL` (`authenticator` role, pooled, port 6543) for runtime. Show the username-swap recipe for the `authenticator` URL (same password as the project DB password).
- [ ] 2.3 Document `npx prisma migrate deploy` and `npx prisma generate`; document `psql "$DIRECT_URL" -f prisma/rls-policies.sql` for RLS policies; document `node --import tsx scripts/verify-rls.ts` as the gate.
- [ ] 2.4 Document Auth provider configuration: enable Email (confirm email: on) and Google OAuth (with Google Cloud Console OAuth client ID + secret); reference the in-code call sites in `app/(auth)/sign-in/page.tsx` and `app/(auth)/sign-up/page.tsx` so future readers understand why Google is required.
- [ ] 2.5 Document Auth URL configuration: Site URL and Redirect URLs per environment, including `http://localhost:3000/auth/callback` and `https://paidsoon.com/auth/callback`.
- [ ] 2.6 Document the new Supabase API key naming (`sb_publishable_…` / `sb_secret_…`), env var names `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, and the rule that the secret key never appears in any `NEXT_PUBLIC_…` var.
- [ ] 2.7 Add a "Wipe and re-run" appendix listing exactly which sections to re-execute when reprovisioning the Supabase project.

## 3. Stripe runbook

- [ ] 3.1 Write `docs/runbooks/stripe.md` opening with the test-vs-live posture: test mode covers local + preview; live mode covers production. Make the toggle location explicit (top-right of dashboard).
- [ ] 3.2 Document API key retrieval per mode (`sk_test_…` / `sk_live_…`) and that `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is NOT used by this app (call this out so future readers don't add it).
- [ ] 3.3 Document Pro product + price creation in both modes; capture `STRIPE_PRO_PRICE_ID` per mode.
- [ ] 3.4 Document Stripe Connect platform application: when to submit (day 1, async 1–5 business days), how to find Connect Client ID (`ca_…`) after approval; capture per mode.
- [ ] 3.5 Document the Stripe Billing webhook: URL `https://paidsoon.com/api/webhooks/stripe-billing`, events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed` with an explicit "as of <date> delivered but not yet handled in code — see follow-up `handle-billing-payment-failed-webhook`" note next to it.
- [ ] 3.6 Document the Stripe Connect webhook: URL `https://paidsoon.com/api/webhooks/stripe-connect`, "Listen to events on: Connected accounts", events `invoice.overdue` + `invoice.paid` (only); reference [stripe-connect route](app/api/webhooks/stripe-connect/route.ts) for the event list.
- [ ] 3.7 Document Stripe CLI for local development: install + login + the two `stripe listen` commands (one per webhook) + the `whsec_…` capture step + note that the CLI secret differs from the dashboard secret.
- [ ] 3.8 Add the "preview deploys do not receive Stripe webhooks" callout (D3 in design.md).
- [ ] 3.9 Add an "OAuth Redirect URIs" section listing every URI to register in Connect Settings: `http://localhost:3000/api/stripe/connect/callback` and `https://paidsoon.com/api/stripe/connect/callback`.

## 4. Vercel runbook

- [ ] 4.1 Write `docs/runbooks/vercel.md` covering project import from GitHub, framework auto-detection.
- [ ] 4.2 Document setting env vars per Vercel environment (Production / Preview / Development) with explicit reference to the matrix in `runbooks/README.md`; emphasize that `DATABASE_URL` on Preview points at the dev Supabase project, not prod.
- [ ] 4.3 Document custom domain setup (`paidsoon.com`), DNS records (CNAME / A) from Vercel.
- [ ] 4.4 Document the cron schedule: auto-detected from `vercel.json` (daily 09:00 UTC, `/api/cron/send-emails`), and the explicit "cron does NOT fire on Preview deployments" note (D4 in design.md).
- [ ] 4.5 Document `CRON_SECRET`: generate with `openssl rand -hex 32`; only required in Production (Preview / Development can skip).
- [ ] 4.6 Document the manual cron trigger for testing: exact `curl` with `Authorization: Bearer $CRON_SECRET` against `/api/cron/send-emails`.
- [ ] 4.7 Add a "Post-deploy fixups" section: update Supabase Site URL / Redirect URLs, register Stripe production webhooks (cross-reference the Stripe runbook sections).

## 5. Resend runbook

- [ ] 5.1 Write `docs/runbooks/resend.md` covering account creation, domain registration (`paidsoon.com`), DNS records (SPF, DKIM, Return-Path), and the "wait for Verified status" gate.
- [ ] 5.2 Document API key creation; document the dev posture (use `onboarding@resend.dev` sender locally, no domain required).
- [ ] 5.3 Document the three env vars per environment: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`; cross-reference the matrix.

## 6. Old docs removal and repo pointer

- [ ] 6.1 Update repository `README.md` to point at `docs/runbooks/README.md` as the operator entry point (remove any references to `docs/SETUP.md` or `docs/GO-LIVE.md`).
- [ ] 6.2 Delete `docs/SETUP.md`.
- [ ] 6.3 Delete `docs/GO-LIVE.md`.
- [ ] 6.4 Run `grep -r "SETUP.md\|GO-LIVE.md" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.yaml" --include="*.yml"` and update any remaining references.

## 7. Verification

- [ ] 7.1 Read each new runbook end-to-end and verify every env var name, every webhook URL, every webhook event list, and every Supabase API key name matches code (use the drift table in `proposal.md` as the checklist).
- [ ] 7.2 Verify the matrix in `runbooks/README.md` is consistent with each per-service runbook (no contradictions).
- [ ] 7.3 Have a fresh reader (or self after a break) attempt to follow `runbooks/README.md` execution order for a hypothetical new environment — note any "where do I go next?" moments and fix the cross-references.

## 8. Follow-up tracking (not executed in this change)

- [ ] 8.1 File a new OpenSpec change `handle-billing-payment-failed-webhook` to add a `case "invoice.payment_failed":` handler in [stripe-billing route](app/api/webhooks/stripe-billing/route.ts) that flips `subscriptionStatus` to `past_due`. Reference D6 in this change's `design.md`.
- [ ] 8.2 (Optional, future) File a CI improvement change: a script that asserts env vars named in `docs/runbooks/` all appear in code and vice versa, to prevent doc drift from recurring.
