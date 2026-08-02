## Why

The dashboard invoice table's **Arrangement** column lets a user click the badge to open a
read-only detail modal (type, status, repayment terms, covered invoices). The **Promise**
column shows equivalent badges (`🤝 Pays [date]`, `⚠️ Missed`, `Broken history: N`) but they
are inert — there is no way to see the full promise history (dates promised, amounts, client
notes, prior broken/superseded promises) for an invoice without leaving the dashboard. This is
inconsistent with the Arrangement UX and hides context a freelancer needs when deciding
whether to escalate a repeat-offending debtor.

## What Changes

- Make all three Promise-column badge states (`Pays`, `Missed`, `Broken history: N`) clickable,
  matching the Arrangement column's cursor/hover treatment.
- Clicking a badge opens the existing reusable `DetailModal` component showing a "Promise
  history" timeline for that invoice: every `PromiseToPay` record (newest first), each with
  status, promised date, promised amount (or "Full balance"), client notes, and created date.
- No new data fetch is required — `TrackedInvoice.promisesToPay` is already eager-loaded in
  full (all statuses, ordered by `createdAt desc`) by `loadDashboardInvoices`, so the modal
  renders directly from already-loaded client props.
- Scope is single-invoice only (not debtor-wide across a client's other invoices) — consistent
  with `PromiseToPay` being a 1:1-with-invoice record, unlike the debtor-scoped `Arrangement`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `promise-to-pay`: the existing "Dashboard promise indicators" requirement is extended so
  the dashboard badges are interactive and expose the full per-invoice promise timeline in a
  modal, not just the current promise's summary badge.

## Impact

- `components/dashboard/InvoiceTable.tsx`: add click handlers + modal state for promise detail,
  reusing `DetailModal`.
- No changes to `prisma/schema.prisma`, RLS policies, or any API route — purely a client-side
  rendering change over data already delivered to the page.
- No changes to `lib/dashboard/loadDashboardInvoices.ts` (data shape already sufficient).
