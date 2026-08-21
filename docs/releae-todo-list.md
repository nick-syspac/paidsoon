PaidSoon — Release Readiness TODO
Source: production release readiness audit, 2026-08-21. Ordered by priority. Each item
lists the evidence location so it can be re-verified after the fix lands.

P0 — Must Complete Before Release
 Implement password reset. No resetPasswordForEmail flow, /forgot-password
page, or confirm/update-password page exists anywhere in app/. Locked-out
customers currently have no self-service recovery.
 Fix or gate the weekly debtor summary email. weekly_summary_email is marked
implemented in lib/subscriptionPlans.ts (absent from UNIMPLEMENTED_FEATURES,
pricing page renders "✓" for Small Business+), but its only trigger is the Railway
Celery dispatch_weekly_debtor_summary task, and Railway is not deployed
(RAILWAY_WORKER_URL/WORKER_TRIGGER_SECRET unset in every .env*, and there is
no vercel.json cron entry for it). Either add a Vercel cron fallback trigger, or
move weekly_summary_email back into UNIMPLEMENTED_FEATURES until Railway ships.
 Populate the payment link in reminder emails. lib/email/send.ts:194 hardcodes
paymentUrl: undefined, so every chase email (all stages, all tiers) omits the
"Pay invoice" link. lib/providers/stripe.ts's getInvoiceDetails() already
returns hosted_invoice_url — wire it into sendFollowUpEmail().
 Implement the Stripe invoice.payment_failed webhook handler. Currently
unhandled (see docs/HLD.md:215, and the missing case in the billing webhook
route). Customers with a failed card payment keep full paid-tier access
indefinitely instead of moving to past_due.
 Fix or hide the "Invite member" Team Settings workflow.
app/api/settings/team/invite/route.ts hardcodes currentSeats = 1 and never
persists an invite (StaffInvitation row is never written, no email is sent), yet
returns success: true with a message implying an invite was sent. Either
implement persistence + invite email, or disable the form until team_seats ships.
P1 — Strongly Recommended Before Release
 Add retry/backoff to the Resend call in sendFollowUpEmail() and persist send
failures somewhere queryable (dashboard or EmailLog), instead of only
console.error.
 Write docs/runbooks/xero.md to match the existing docs/runbooks/myob.md —
Xero's integration code is complete but has no setup runbook.
 Correct .github/copilot-instructions.md's "Scaffolded Features" list — AI
rewrite/tone settings and custom email templates are both fully implemented and
persisted, not placeholders.
 Fix the stale comment on InvoiceConnection.stripeConnectAccountId in
prisma/schema.prisma:172 ("encrypted at app layer" — it isn't), or actually
encrypt it for consistency with AccountingConnection token encryption.
 Document VERCEL_URL's fallback role (used in lib/email/send.ts for the
promise-to-pay link base URL) in docs/runbooks/README.md's env matrix.
 Add an onboarding step or dashboard empty-state banner directing new users to
connect an invoice source (Stripe/Xero/MYOB/CSV) — today they land on a blank
dashboard after picking a plan.
P2 — Can Follow Shortly After Release
 Complete the Railway/Celery migration burn-in and cut over vercel.json
(openspec/changes/migrate-scheduled-jobs-to-railway-celery/tasks.md 8.1-8.3),
removing the theoretical future duplicate-send risk between Vercel Cron and
Railway Celery.
 Add explicit Stripe webhook event-ID idempotency tracking.
 Backfill the dashboard's import-anomaly metric
(lib/dashboard/attentionRequired.ts's loadImportAnomalyCount() currently
hardcoded to 0) once the ledger schema gains the relevant field.
 Fix the 16 TypeScript errors confined to tests/** fixtures and the 4 ESLint
unused-variable warnings.
 Add an end-to-end test covering the full CSV import → chase → pay → stop
workflow, and a test asserting paymentUrl/paymentLink is populated in sent
emails.
Verified Working (no action needed)
CSV/XLSX import, export, and payment reconciliation — production-ready end-to-end.
Reminder engine scheduling, stop-conditions, and custom template usage.
Xero and MYOB OAuth, token encryption/refresh, and incremental sync.
Stripe Connect, Checkout, and entitlement enforcement.
RLS/tenant isolation across all user-facing tables and routes.
Build, lint, and full test suite (683/683 passing).