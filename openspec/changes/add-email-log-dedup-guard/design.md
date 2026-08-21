## Context

`EmailLog` (`prisma/schema.prisma`) has no unique constraint or index beyond
its `cuid` primary key. `sendFollowUpEmail()` in `lib/email/send.ts` always
`.create()`s a log row; the cron in `app/api/cron/send-emails/route.ts` calls
it once per eligible invoice per pass with no prior existence check. The
separate Railway/Celery path (coded but undeployed — see B-5 in
`docs/go-live-to-do.md`) additionally takes a `pg_advisory_xact_lock` per
user, but that is transaction-scoped and offers no protection against two
independent Vercel Cron invocations. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Guarantee at most one email is sent per `(trackedInvoiceId, stage)` pair,
  even under concurrent or duplicate cron invocations.
- Keep the fix scoped to the send path and schema, not the cron's broader
  escalation/suppression business logic.

**Non-Goals:**
- Deploying the Railway worker (B-5 is a separate deployment decision).
- Changing the escalation/suppression logic already in the cron loop.
- Deduplicating across different stages for the same invoice — advancing
  from stage 1 to stage 2 to stage 3 is normal sequence behavior, not a
  duplicate.

## Decisions

- Add `@@unique([trackedInvoiceId, stage])` to `EmailLog` as the durable,
  database-enforced backstop. This holds even if an application-level check
  has a bug, or if two separate processes (Vercel Cron today, a future
  Railway worker) attempt a send at the same instant.
  Alternative considered: rely solely on an application-level `findFirst`
  check — rejected because a check-then-create is inherently racy without a
  database constraint backing it, and the missing check is exactly what B-2
  already identified as the bug.
- Add an explicit `findFirst`-then-skip pre-check as the fast path for the
  common (non-concurrent) case, so a normal single cron pass doesn't rely on
  catching a unique-violation exception for everyday correctness. The
  constraint violation path is reserved for the true race case.
- On catching the unique-constraint violation (Prisma error code `P2002`)
  after a send may have already been dispatched to Resend by the winning
  process, treat it as "already logged" rather than a hard error, and let
  the invoice's stage-advance logic proceed as if the send succeeded — the
  email was, in fact, sent by whichever process won the race.

## Risks / Trade-offs

- [Risk] Adding a unique constraint to an existing table could fail the
  migration if duplicate `(trackedInvoiceId, stage)` rows already exist in
  production data → Mitigation: check for existing duplicates via a
  read-only query before writing the migration; if any are found, decide
  how to reconcile (e.g., keep the row with the earliest `sentAt`) as an
  explicit, reviewed migration step rather than silently deleting data.
- [Risk] The pre-check-then-create window is still technically racy
  between two processes → Mitigation: the `@@unique` constraint is the
  actual guarantee; the pre-check is purely an optimization to avoid an
  unnecessary Resend API call in the common case.

## Open Questions

- Whether the unique-violation path should still attempt to update
  `TrackedInvoice.currentStage`/`nextEmailAt`, or leave that entirely to
  whichever process's pre-check succeeded first. Both processes converge on
  the same terminal state either way, so this does not affect the spec's
  guarantee or the task breakdown, and can be settled during
  implementation.
