---
mode: agent
description: Build or extend the three-stage invoice reminder email flow.
---

# Build Invoice Reminder Flow — PaidSoon

## Role
You are a senior full-stack engineer working on the core email automation engine in PaidSoon.

## Goal
Implement or extend the three-stage overdue invoice reminder email flow, following all PaidSoon email, security, and data conventions.

## PaidSoon Context
PaidSoon already has a working 3-stage reminder flow:
- Stage 1: friendly reminder (default: 3 days after due)
- Stage 2: firmer follow-up (default: 10 days after due)
- Stage 3: final notice (default: 21 days after due)

The cron job at `/api/cron/send-emails` drives the flow daily at 09:00 UTC.

## Files to Inspect
- `lib/email/send.ts` — `sendFollowUpEmail()` entry point
- `lib/email/templates.ts` — per-stage email templates
- `lib/email/schedule.ts` — `computeNextEmailAt()` timing logic
- `lib/email/catchup.ts` — `runCatchUpScan()` for detecting new overdue invoices
- `app/api/cron/send-emails/route.ts` — cron handler orchestrating the full flow
- `prisma/schema.prisma` — `TrackedInvoice`, `EmailLog`, `Schedule`, `EmailSettings` models
- `lib/billing.ts` — feature checks (`email_reminder_sequence` is available on all tiers)
- `lib/subscriptionPlans.ts` — feature flags

## Implementation Rules

### Email Sending
- All sending through `lib/email/send.ts` → `sendFollowUpEmail()`. Never call Resend directly.
- Check `EmailLog(trackedInvoiceId, stage)` before sending to prevent duplicates.
- Use custom From address only if: `hasPlanFeature(tier, "own_email_address") && emailSettings.resendVerified`.
- Fall back to `RESEND_FROM_EMAIL` otherwise.
- Log every send to `email_logs` via `prismaAdmin`.

### Invoice Status Gates
- Only process invoices with `status = "pending"` AND `nextEmailAt <= now` AND `currentStage < 3`.
- Paused, snoozed, resolved, and paid invoices must not receive emails.
- After stage 3: set `status = "sequence_complete"`, `nextEmailAt = null`.
- After stages 1–2: advance `currentStage`, compute new `nextEmailAt`.

### Idempotency
- The `(externalId, provider, userId)` unique key prevents duplicate `TrackedInvoice` creation.
- The `(trackedInvoiceId, stage)` key in `EmailLog` prevents duplicate sends.

### Template Safety
- Sanitize all template variables before inserting.
- `amountDue` in cents → format with `Intl.NumberFormat` before rendering.
- `firmDeadline` in stage 3 must be exactly 7 days from the send date.

### Tests
- Test `computeNextEmailAt()` with fixed dates.
- Test that duplicate emails are not sent if `EmailLog` entry exists.
- Stub `sendFollowUpEmail` in tests — never send real emails.

## Expected Output

1. Changes to `lib/email/` with full implementation
2. Updated cron handler if orchestration logic changed
3. Tests in `tests/`
4. `docs/DDD.md` update if behaviour changed

## Acceptance Criteria
- Stage 1, 2, 3 emails send in correct order
- Custom From address only used when tier and verification conditions met
- Duplicate send prevention is proven by test
- `npm run test` passes
