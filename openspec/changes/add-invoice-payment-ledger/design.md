## Context

See proposal.md - Why. The reconciliation gap lives entirely in `app/api/invoice-imports/[batchId]/commit/route.ts`, which today does `amountDue: toCents(outstandingAmount)` on the `update_eligible` path with no comparison to prior state (see the route's existing comment: "never touch status/currentStage/nextEmailAt... so reminder history, promises-to-pay, and disputes... are preserved" - that same preservation principle should extend to payment history). Every `lib/dashboard/*` module currently treats `invoice.amountDue` as "the amount," following the project's established pattern of computing derived values from loaded rows rather than persisting cached aggregates (see `add-customer-entity` design.md for the same convention noted there).

## Goals / Non-Goals

**Goals:**
- `amountDue` keeps one unambiguous meaning (original invoice total) everywhere it's read.
- Reconciliation on re-upload never silently destroys evidence of what changed.
- Outstanding-balance computation is a single shared helper, not reimplemented per call site.

**Non-Goals:**
- No UI for browsing an invoice's full payment history in this change (the ledger exists and is queryable; a timeline view is separate work).
- No automatic detection of *partial* payments from Stripe/Xero/MYOB sync in this change - only CSV/XLSX reconciliation and manual recording produce `InvoicePayment` rows. Provider-sourced partial-payment detection is future work once each provider's payment-webhook/sync shape is scoped.
- No currency conversion - a payment's `currency` must match its invoice's `currency`; mismatches are rejected at the API boundary, not reconciled.

## Decisions

- **Computed-on-read, not a cached column.** Matches the existing `lib/dashboard/*` convention (pure functions over loaded invoice arrays) rather than introducing the codebase's first cached money total. A shared `computeOutstanding(invoice, payments)` helper lives in `lib/invoices/payments.ts` and is the single place this arithmetic happens. Alternative considered: a cached `amountOutstanding` column updated transactionally with each ledger insert - rejected as inconsistent with every other dashboard aggregate in the codebase and as an unnecessary second source of truth.
- **Anomaly, not auto-apply or block, when outstanding increases.** An increase during reconciliation is unusual enough (credit note reversal, wrong file re-uploaded, user error) that neither extreme is safe: silently increasing `amountDue` risks acting on a mistake, and hard-blocking the whole import batch over one row is too disruptive. The row is skipped for that invoice specifically and recorded as an anomaly (surfaced later by the Needs Attention queue in `add-needs-attention-queue`), while the rest of the batch commits normally.
- **`InvoicePayment.source` is a plain string enum (`manual` | `import_reconciliation`), not yet including provider-sync sources.** Kept narrow deliberately since provider-sourced payment detection is a Non-Goal; adding unused source values now would document behavior that doesn't exist yet.
- **`amountDue` is not renamed.** Renaming the column would touch every dashboard/reporting call site for a cosmetic gain; instead its meaning is clarified via a schema comment and this design doc. Alternative considered: renaming to `originalAmount` - rejected as unnecessarily broad a diff for this change.

## Risks / Trade-offs

- [Every existing `lib/dashboard/*` read of `invoice.amountDue` that implicitly means "current outstanding" today will be wrong for any invoice that gains a partial payment] → tasks include an explicit audit pass over `lib/dashboard/*` to switch reads to the new `computeOutstanding` helper before this ships, not after.
- [Import anomaly rows need somewhere to live until `add-needs-attention-queue` ships] → this change persists the anomaly flag on the invoice/import-batch record regardless of whether the consuming UI exists yet, so no data is lost in the gap between changes.
- [A manual "record a payment" action and a manual "mark as paid" action can both exist and be triggered inconsistently] → "mark as paid" is implemented as a thin wrapper that records a payment for the exact remaining outstanding balance, so there is only one underlying code path.

## Migration Plan

1. Add `InvoicePayment` model + RLS policy; `npx prisma migrate dev --name add-invoice-payment-ledger`.
2. Add `computeOutstanding` helper; audit and update `lib/dashboard/*` call sites to use it instead of raw `amountDue`.
3. Replace the blind-overwrite branch in the import commit route with the reconciliation comparison logic.
4. Add manual payment-recording and mark-as-paid API routes.
5. Rollback: `InvoicePayment` is purely additive (no columns removed from `TrackedInvoice`), so reverting means disabling the reconciliation branch and dashboard call sites revert to reading `amountDue` directly, same as before this change.
