## Why

Clicking "Resume" on a snoozed invoice currently does nothing visible: the
`resume` route only accepts invoices in `paused` status, so a snoozed
invoice's resume request 404s, and the dashboard's bulk-action handler never
checks the response, so the failure is silent. There is currently no way for
a freelancer to end a snooze early — they must wait for the fixed 7-day
window (or the cron/worker sweep) to resume the invoice automatically, even
if the client pays or replies sooner. Freelancers need an explicit way to
cancel an in-progress snooze, and any bulk action that can't apply to a
selected invoice needs to fail visibly instead of silently.

## What Changes

- Add a new "Cancel snooze" action, distinct from "Resume", that transitions
  a `snoozed` invoice back to `pending` and clears `snoozedUntil`. "Resume"
  keeps its existing, narrower meaning (`paused` → `pending` only).
- New route `POST /api/invoices/[id]/cancel-snooze` following the same
  auth/`withUserContext`/status-guard pattern as the existing
  pause/resume/snooze/resolve routes.
- Dashboard bulk-action bar gains a "Cancel snooze" button alongside
  Snooze/Pause/Resume/Arrange/Resolve.
- Bulk action buttons (all of them, not just the new one) are only enabled
  when **every** currently selected invoice is eligible for that action,
  instead of always being enabled whenever any row is selected.
- The bulk-action handler (`doBulkAction` in `InvoiceTable.tsx`) checks each
  request's response and surfaces a visible error if any invoice in the
  batch fails to transition, instead of silently ignoring non-2xx responses.

## Capabilities

### New Capabilities
- `invoice-snooze-cancellation`: manual, immediate cancellation of an
  in-progress invoice snooze, returning the invoice to normal reminder
  eligibility ahead of its scheduled `snoozedUntil` date.

### Modified Capabilities
- (none — no existing `openspec/specs/` capability currently governs the
  pause/resume/snooze/resolve dashboard actions; this introduces the first
  formal spec for that surface via the new capability above)

## Impact

- `app/api/invoices/[id]/cancel-snooze/route.ts` (new)
- `components/dashboard/InvoiceTable.tsx` (new button, selection-eligibility
  gating for all bulk actions, response-checking in `doBulkAction`)
- `tests/invoice-routes.test.ts`, `tests/invoice-state-machine.test.ts` (new
  coverage for the `snoozed` → `pending` transition via cancel-snooze)
- `docs/DDD.md` API routes table (new route entry)
- No schema changes — reuses the existing `TrackedInvoice.status` /
  `snoozedUntil` columns.
