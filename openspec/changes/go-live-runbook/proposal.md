## Why

All application code is complete and committed on `main`. What remains is a set of operator actions that cannot be performed in code: creating external service accounts, configuring DNS, setting environment variables, and running the end-to-end smoke test that confirms everything works together in production. Without these steps, the application cannot be deployed or used.

This change collects every remaining ops/runbook item from `invoice-nudge-mvp`, `enforce-rls-via-prisma`, and `rename-to-paidsoon` into a single, ordered execution plan. It is a pure operator runbook — no code changes are required.

## What Changes

No code is written as part of this change. All work is external service configuration and environment-variable management.

- **Domain & DNS**: Confirm `paidsoon.com` is registered; add it as a Resend sending domain and complete SPF/DKIM verification; decide disposition of legacy `invoicenudge.com` domain.
- **Supabase**: Create project; retrieve `authenticator` role password; note connection strings; configure Auth providers (email/password + Google OAuth); run Prisma migrations; configure RLS credentials (`DATABASE_URL` → `authenticator` role).
- **Stripe**: Apply for Stripe Connect platform access; create the PaidSoon Pro product ($19/month); register billing and Connect webhooks pointing at the production deployment.
- **Vercel**: Create project; link GitHub repository; configure all production environment variables; trigger a production deploy.
- **Branding flip**: Update `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` to `paidsoon.com` values in Vercel (decoupled env-var flip per design D2 of `rename-to-paidsoon`).
- **Verification**: Run `scripts/verify-rls.ts` against a preview DB; perform manual cross-user isolation check; conduct full end-to-end test (connect Stripe → detect overdue invoice → receive 3 emails → detect payment → sequence stops).

## Capabilities

### No new capabilities — production enablement only

This change enables the capabilities already shipped in `invoice-nudge-mvp`. No spec changes are required.

## Impact

- **External services touched**: Supabase, Stripe (Billing + Connect), Resend, Vercel, DNS registrar
- **Secrets created/rotated**: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `CRON_SECRET`, `NEXT_PUBLIC_URL`
- **Risk**: Stripe Connect platform approval can take 1–5 business days; all other steps are self-service and can be completed in under 2 hours
