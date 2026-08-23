## 1. Backend route

- [x] 1.1 Create `app/api/invoices/[id]/cancel-snooze/route.ts` following the
      existing pause/resume/snooze/resolve route pattern: auth via
      `supabase.auth.getUser()`, `withUserContext` transaction, guarded
      `findFirst({ id, userId, status: "snoozed" })`, then
      `update({ data: { status: "pending", snoozedUntil: null } })`, 401 when
      unauthenticated, 404 when the guard doesn't match.
- [x] 1.2 Add test coverage in `tests/invoice-routes.test.ts` for the new
      route: 401 unauthenticated, 404 when invoice not found/not owned/not
      snoozed, 200 + status transition + `snoozedUntil` cleared on success.
- [x] 1.3 Add the `snoozed → pending (cancel-snooze)` transition to the state
      machine table in `tests/invoice-state-machine.test.ts`, alongside the
      existing pause/resume/snooze/resolve transitions.

## 2. Dashboard UI

- [x] 2.1 In `components/dashboard/InvoiceTable.tsx`, extend `doBulkAction`'s
      action union to include `"cancel-snooze"` and add the corresponding
      "Cancel snooze" button to the bulk-action bar.
- [x] 2.2 Compute per-action eligibility from the current `selectedIds` +
      `invoices` (e.g. `canResume`, `canPause`, `canSnooze`, `canCancelSnooze`,
      derived as "every selected invoice's status is in that action's allowed
      source statuses") and use it to disable each bulk-action button instead
      of only checking `selectedIds.length === 0`.
- [x] 2.3 Update `doBulkAction` to inspect each fetch response; if any
      response is not `ok`, set a new `bulkActionError` state and surface it
      near the action bar instead of proceeding straight to
      `router.refresh()`.

## 3. Docs

- [x] 3.1 Add `POST /api/invoices/[id]/cancel-snooze` to the API routes table
      in `docs/DDD.md`, matching the existing entries' format.

## 4. Verification

- [x] 4.1 Run `npm run test` and confirm all tests (including the new
      cancel-snooze coverage) pass.
- [ ] 4.2 Manually verify in the dashboard: select a snoozed invoice, confirm
      only "Cancel snooze" (and Resolve) are enabled; click it; confirm the
      row becomes "Active" (pending) with `snoozedUntil` cleared.
