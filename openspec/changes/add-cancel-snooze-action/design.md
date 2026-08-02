## Context

`TrackedInvoice.status` currently supports `pending`, `paused`, `snoozed`,
`sequence_complete`, `paid`, and `manually_resolved`. Four manual dashboard
actions exist today (`app/api/invoices/[id]/{pause,resume,snooze,resolve}/route.ts`),
each following the same shape: auth via `supabase.auth.getUser()`, a single
`withUserContext` transaction that does a guarded `findFirst` (by `id`,
`userId`, and an allowed source `status`) followed by an `update`, returning
404 when the guard doesn't match.

`resume` is deliberately narrow (`paused` → `pending` only) and this is
locked in by `tests/invoice-state-machine.test.ts` ("only paused invoices
can be resumed") and documented across `docs/DDD.md`,
`.github/skills/invoice-domain/SKILL.md`, and the original
`invoice-nudge-mvp` spec, which all describe `snoozed` → `pending` as an
automatic transition owned by the cron/Celery sweep
(`lib/email/breachSweep.ts`) when `snoozedUntil <= now`, not a manual one.

On the frontend, `components/dashboard/InvoiceTable.tsx`'s bulk-action bar
(Snooze/Pause/Resume/Arrange/Resolve) enables every button whenever
`selectedIds.length > 0`, regardless of the status of the selected rows, and
`doBulkAction` fires `fetch` for every selected id via `Promise.all` without
inspecting any response — a request that 404s (wrong source status) fails
completely silently from the user's perspective.

Snoozing is unrelated to the `PromiseToPay` model: `PromiseToPay` records are
created independently via `/api/promise/[token]` and never read or write
`TrackedInvoice.status`/`snoozedUntil`. Cancelling a snooze early has no
side effects on promise-to-pay state.

## Goals / Non-Goals

**Goals:**
- Let a freelancer manually end an invoice's snooze before `snoozedUntil`
  elapses, returning it to `pending` immediately.
- Keep `resume`'s existing meaning (`paused` → `pending`) unchanged — do not
  widen its status guard or reinterpret the state machine.
- Make every bulk action button reflect whether it actually applies to the
  current selection, and make `doBulkAction` fail visibly instead of
  silently when any request in the batch doesn't succeed.

**Non-Goals:**
- Changing how snoozing is initiated, its fixed 7-day window, or the
  automatic cron/Celery resume sweep.
- Any change to `PromiseToPay` behavior or the promise-to-pay email flow.
- Partial/per-row bulk action results (e.g. "3 of 5 succeeded") — this
  change requires uniform eligibility across the selection instead.

## Decisions

**A new `cancel-snooze` route/verb, not an extended `resume`.**
Widening `resume`'s status guard to accept `snoozed` would silently change
an already-tested, documented state-machine rule ("only paused invoices can
be resumed") and conflate two different user intents (undo a pause vs. end
a snooze early). A distinct route keeps `resume` untouched and gives the
new capability its own explicit contract:
`POST /api/invoices/[id]/cancel-snooze`, guarded by
`status: "snoozed"`, transitioning to `{ status: "pending", snoozedUntil: null }`
— mirroring the existing pause/resume/snooze/resolve route shape exactly
(same auth, same `withUserContext` + guarded `findFirst`/`update` pattern,
same 404-on-guard-mismatch response).

**Bulk actions require full-selection eligibility, not best-effort.**
Given the bug we're fixing is a silent partial failure, buttons should be
disabled unless every currently selected invoice's status is a valid source
status for that action (e.g. "Cancel snooze" only enabled when every
selected row is `snoozed`; "Resume" only enabled when every selected row is
`paused`). This is computed client-side from the already-loaded `invoices`
prop (no new endpoint needed) and mirrors how `confirmBulkResolve` already
gates the Resolve button's two-step confirmation.

**`doBulkAction` checks each response.**
After the `Promise.all(...)` of per-invoice fetches, check `response.ok` for
each result; if any failed, set an error state (new, e.g.
`bulkActionError`) surfaced next to the button row instead of proceeding to
`router.refresh()` as if everything succeeded. This applies to all four
existing actions plus the new one, since the silent-failure bug is generic
to `doBulkAction`, not specific to Resume.

## Risks / Trade-offs

- **Scope creep into existing actions** → Mitigated by keeping the fix
  mechanical (an eligibility check + a response check applied uniformly),
  not touching each action's individual business rules.
- **All-or-nothing bulk eligibility could feel restrictive** if a user
  selects a mixed batch (some snoozed, some paused) → Acceptable: the
  buttons for each action light up/disable based on the current selection,
  so users naturally learn to select same-status rows for a given action;
  this is preferable to a re-introduced silent partial failure.
- **New route duplicates boilerplate** already present in four sibling
  routes → Accepted; consistent with the existing pattern in this codebase
  rather than introducing a shared abstraction for a one-off fifth action.

## Open Questions

- None — the existing pause/resume/snooze/resolve routes provide a
  sufficiently proven pattern to follow directly.
