---
applyTo: "**/lib/email/**,**/app/api/cron/**,**/app/api/settings/email/**"
---

# Email Automation Instructions — PaidSoon

## Email Provider

- Resend (`resend@6.12.3`) is the email provider. Requires `RESEND_API_KEY`.
- All email sending goes through `lib/email/send.ts` → `sendFollowUpEmail()`.
- Never call `resend.emails.send()` directly from route handlers or components.
- System "From" address: `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` env vars.

## Three-Stage Reminder Sequence

PaidSoon sends a maximum of 3 follow-up emails per tracked invoice:

| Stage | Trigger | Tone | Default timing |
|-------|---------|------|----------------|
| 1 | `dueDate + email1DaysAfterDue` days | Friendly, light-touch | 3 days after due |
| 2 | `dueDate + email2DaysAfterDue` days | Firmer, requesting timeline | 10 days after due |
| 3 | `dueDate + email3DaysAfterDue` days | Final notice, urgent | 21 days after due |

- Timing is user-configurable via `Schedule` model (see `/api/settings/schedule`).
- After stage 3 is sent, the invoice status becomes `sequence_complete`.
- `nextEmailAt` is computed by `computeNextEmailAt()` in `lib/email/schedule.ts`.

## Template Rules

- Email templates are in `lib/email/templates.ts`.
- Each stage has a fixed subject and HTML/text body.
- Template variables: `clientName`, `amountDue` (formatted), `dueDate`, `invoiceNumber`, `daysOverdue`, `firmDeadline`, `paymentUrl` (optional).
- **Sanitize all values** before inserting into templates — do not trust any string directly from the DB.
- The `firmDeadline` in stage 3 is 7 days from the send date.
- `amountDue` must be formatted using `Intl.NumberFormat` — it is stored in cents as an integer.
- Never include PII beyond what is needed for the recipient to identify their invoice.

## Custom "From" Address Rules

- Business+ tier users can send from their own domain IF `EmailSettings.resendVerified = true`.
- Check: `hasPlanFeature(tier, "own_email_address") && emailSettings.resendVerified`.
- If either condition is false, fall back to the system domain (`RESEND_FROM_EMAIL`).
- Domain verification status is polled from the Resend API in `GET /api/settings/email`.
- Use `resend.domains.list()` → `domains?.data?.find(...)` to check verification.
- Never mark `resendVerified = true` without confirming with the Resend API.

## Idempotency and Duplicate Prevention

- Before sending any email, check `EmailLog` for an existing record with `(trackedInvoiceId, stage)`.
- If a log entry exists, skip the send entirely.
- This prevents duplicates if the cron job is triggered twice or retried.
- The cron job handles this check in `app/api/cron/send-emails/route.ts`.

## Invoice Status and Email Gate

Only send emails to invoices with:
- `status = "pending"` (not paused, snoozed, resolved, or paid)
- `nextEmailAt <= now`
- `currentStage < 3`

Never send to:
- `status = "paused"` — user has explicitly paused follow-up
- `status = "snoozed"` — user has snoozed until a future date
- `status = "manually_resolved"` — user has marked as resolved
- `status = "paid"` — Stripe webhook confirmed payment
- `status = "sequence_complete"` — all 3 stages already sent

## Snoozed Invoice Handling

- Snoozed invoices have `status = "snoozed"` and a non-null `snoozedUntil` date.
- The cron job resumes snoozed invoices: `UPDATE SET status='pending' WHERE snoozedUntil <= now`.
- After resuming, the normal send logic applies.

## Test-Mode Email Behaviour

- Never send real emails from tests.
- Stub `sendFollowUpEmail` in test files.
- The Resend client should be mockable — do not instantiate it at module load time without a guard.
- Test email schedule logic with injected dates, not `Date.now()` calls inside the function.

## Email Logging Requirements

- Every dispatched email must create an `EmailLog` record via `prismaAdmin`:
  - `trackedInvoiceId`
  - `stage`
  - `sentAt` (current timestamp)
  - `resendMessageId` (from Resend API response)
  - `fromAddress`
  - `subject`
- Log is written after successful Resend API call.
- If Resend throws, do not write the log — the cron will retry on next run.

## Cron Job Safety

- The cron route (`/api/cron/send-emails`) must verify `Authorization: Bearer CRON_SECRET`.
- It uses `prismaAdmin` — all users' invoices are processed in a single run.
- Errors for a single invoice must not abort the entire run — catch per-invoice errors and continue.
- Log per-invoice errors with `console.error` but do not include PII.
