## Why

The reminder-email cron (`app/api/cron/send-emails/route.ts`) has no durable
guard against sending the same `(trackedInvoiceId, stage)` reminder twice:
`EmailLog` has no unique constraint beyond its primary key, and
`sendFollowUpEmail()` only ever creates a new log row — it never checks for
an existing one first. A duplicate cron invocation (manual retrigger,
platform-level retry, or the still-undeployed Railway worker eventually
running alongside Vercel Cron) can cause a customer to receive the same
reminder email twice, a trust risk in the product's core revenue-protecting
workflow. Flagged as release blocker B-2 in `docs/go-live-to-do.md`.

## What Changes

- Add a `@@unique([trackedInvoiceId, stage])` constraint to the `EmailLog`
  model via a new Prisma migration.
- Add a check-before-send guard so the reminder send path skips sending when
  an `EmailLog` row already exists for the target `(trackedInvoiceId,
  stage)` pair, with the unique constraint acting as the durable backstop
  for any race between concurrent invocations.
- Add tests covering a duplicate-send attempt and a simulated concurrent
  double-send.

## Capabilities

### New Capabilities
- `reminder-email-deduplication`: defines the guarantee that at most one
  reminder email is sent per `(trackedInvoiceId, stage)` pair, and how
  duplicate send attempts are detected and handled.

### Modified Capabilities
(none)

## Impact

- `prisma/schema.prisma`, a new file under `prisma/migrations/`
- `lib/email/send.ts` (`sendFollowUpEmail`)
- `app/api/cron/send-emails/route.ts`
- `tests/` (new/updated tests)
