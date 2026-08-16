---
applyTo: "**/*.ts,**/*.tsx"
---

# Security Instructions — PaidSoon

## Auth Guardrails

- Always authenticate via `supabase.auth.getUser()` on the server. Never trust client-supplied user IDs.
- Return `401` immediately if no valid session is found — before any DB query or business logic.
- The proxy in `proxy.ts` (formerly `middleware.ts` — renamed per the Next.js 16 file convention) protects all `/dashboard` routes. Do not weaken it.
- Sign-out redirects to `/` — never to a URL derived from user input (open redirect prevention).
- The `LIVE` env var gates sign-in/sign-up — this is the pre-launch access control.

## Supabase RLS Guardrails

- All user-scoped tables have RLS enabled. `withUserContext(userId, fn)` activates those policies.
- Never use `prismaAdmin` in user-facing route handlers without an explicit documented reason.
- The `verify-rls.ts` script (`npm run verify-rls`) proves tenant isolation — run it after every migration.
- Do not `DISABLE ROW LEVEL SECURITY` on any user-scoped table.
- Do not `GRANT BYPASSRLS` to the runtime DB role.

## Secrets Handling

- Never hardcode API keys, tokens, or connection strings in source code.
- Never commit `.env`, `.env.local`, `.env.production`, `.env.staging` files.
- Never log secrets to `console.log` or `console.error`.
- Never expose server-only secrets via API responses or `NEXT_PUBLIC_` prefixed env vars.
- Secrets that must remain server-only: `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `STRIPE_*_WEBHOOK_SECRET`, and all derived database URLs.

## Webhook Security

- Both Stripe webhook routes must verify the signature using `stripe.webhooks.constructEvent()` before processing.
- `STRIPE_BILLING_WEBHOOK_SECRET` → `/api/webhooks/stripe-billing`
- `STRIPE_CONNECT_WEBHOOK_SECRET` → `/api/webhooks/stripe-connect`
- Return `400` for invalid signatures. Never process an unverified event.
- Read the raw request body as bytes for signature verification — do not parse JSON first.

## Customer Data Protection

- `clientEmail`, `clientName`, and `amountDue` are PII / sensitive financial data.
- Do not log these values to stdout/stderr.
- Do not include them in error messages returned to clients.
- Do not return raw DB rows — map to a safe response shape before sending to client.
- RLS prevents cross-user data exposure at the DB layer. The application layer must not introduce workarounds.

## Invoice and Payment Data Protection

- `amountDue` is stored in cents (integer). Never expose the raw Stripe invoice object to clients.
- Invoice data is per-user. Any query fetching invoices for a user must use `withUserContext`.
- The `externalId` (Stripe invoice ID) is stored but should not be exposed in client-facing URLs.
- Payment URLs (`paymentUrl` field) are from Stripe — pass them through but do not modify or log.

## Email Abuse Prevention

- Only send emails to `clientEmail` addresses from `TrackedInvoice` — never from arbitrary user input.
- The "From" address is either the system domain or a user-configured and Resend-verified domain.
- Check `EmailSettings.resendVerified = true` before using a custom From address.
- Email sending is idempotent: check `EmailLog(trackedInvoiceId, stage)` before each send.
- Paused and snoozed invoices must not receive emails until resumed.

## Input Validation

- Use Zod for all input validation at route boundaries.
- Validate request bodies, query params, and route params.
- Never trust data from request bodies for user identity — always use `supabase.auth.getUser()`.
- Strip unknown fields from validated objects before DB insertion (use Zod's `.strict()` or `.pick()`).

## Audit Logging

- Every sent email is logged to `email_logs` with `trackedInvoiceId`, `stage`, `sentAt`, `resendMessageId`, `fromAddress`, `subject`.
- Stripe webhook events that modify subscription state are acted on atomically — log failures.
- The `verify-rls.ts` script is the audit check for data isolation.

## Production Safety

- Cron requests require `Authorization: Bearer CRON_SECRET`. Verify this before executing.
- Never expose internal error details (`stack`, DB error messages) in API responses.
- All new routes should be reviewed for: auth check, input validation, RLS usage, and error handling.
- Do not add `export const dynamic = "force-static"` to routes that perform auth checks.
