## Context

See proposal.md - Why. The scaffold prompt `.github/prompts/build-dispute-pause-flow.prompt.md` originally suggested extending the existing `paused` status with a `pauseReason` qualifier. This design deviates from that suggestion (see Decisions) based on how the existing pause/resume routes and the reminder cron are structured.

## Goals / Non-Goals

**Goals:**
- Disputed invoices stop being reminded, using the cron's existing allowlist behavior, with no cron logic changes.
- Disputes are queryable/countable as their own category for the Needs Attention queue (`add-needs-attention-queue`, built on top of this).
- Resolving a dispute is a one-step action back to normal chasing.

**Non-Goals:**
- No dispute reason taxonomy (e.g. "goods not received" vs "billing error" as structured categories) - a single freeform note is sufficient for v1.
- No automatic dispute detection from customer email replies - disputes are always user-initiated in this change.
- No change to how a dispute interacts with an active promise-to-pay or arrangement; if both exist simultaneously, this change does not define new precedence rules between them.

## Decisions

- **`disputed` is a distinct `TrackedInvoice.status` value, not a `pauseReason` qualifier on `paused`.** The scaffold prompt suggested the qualifier approach; this design instead adds a first-class status. Rationale: the reminder cron already filters with an allowlist (`where: { status: "pending" }`), so a new status value requires zero cron changes, whereas a `pauseReason` field would still need the cron (or downstream consumers like Needs Attention) to inspect a second column to distinguish "paused for dispute" from "paused for any other reason." A distinct status is also more consistent with how `snoozed` and `manually_resolved` are already separate values rather than sub-flags of a generic paused state.
- **Resolving a dispute always returns to `pending`, not to whatever status preceded the dispute.** Simplest v1 behavior, and matches how the existing plain-pause resume route already works (resume always sets `pending`, it doesn't restore a prior state). Alternative considered: remembering pre-dispute state (e.g. it was `snoozed` before being disputed) - rejected as unnecessary complexity for launch; a user can re-snooze after resolving if still needed.
- **No cron query changes.** Confirmed by reading `app/api/cron/send-emails/route.ts`: it selects `where: { status: "pending" }`, an allowlist. Adding `disputed` as a new status value is automatically excluded without touching this file.

## Risks / Trade-offs

- [A disputed invoice that also has an active promise-to-pay or arrangement could send confusing signals about what state it's really in] → out of scope per Non-Goals; flagged for a future change once dispute/promise/arrangement interaction is scoped deliberately.
- [Marketing copy already claims this feature is live] → shipping this change makes that claim true; if this change is not implemented before launch, the roadmap/marketing pages should be corrected independently of this change's timeline (tracked as a separate follow-up, not blocked on this proposal).

## Migration Plan

1. Add `disputed` as an allowed `status` value (no enum type in Prisma schema today - it's a plain `String` with a comment listing allowed values - update the comment) plus `disputeNote`/`disputeRaisedAt`/`disputeResolvedAt` columns; `npx prisma migrate dev --name add-dispute-pause`.
2. Add the dispute/resolve-dispute API routes.
3. Add the UI badge and action button.
4. Rollback: the new status value and columns are additive; reverting means no code path ever sets `status = "disputed"` again, existing data with that status would need a one-off cleanup migration back to `pending` or `paused` if a rollback is needed after real disputes exist.
