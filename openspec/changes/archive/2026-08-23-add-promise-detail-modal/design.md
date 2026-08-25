## Context

The dashboard invoice table (`components/dashboard/InvoiceTable.tsx`) already has a working
pattern for the Arrangement column: a clickable badge sets `selectedArrangementId`, a
`useEffect` fetches `/api/arrangements/[id]`, and a `DetailModal` renders the result. The
Promise column renders equivalent badges from `getP2PStatus(inv.promisesToPay)` but has no
click behavior. `inv.promisesToPay` (typed `PromiseToPay[]`) is already the full per-invoice
history — `loadDashboardInvoices` loads it with no status filter, ordered `createdAt: "desc"`.

## Goals / Non-Goals

**Goals:**
- Clicking any Promise badge opens a modal showing the full promise timeline for that invoice.
- Reuse the existing `DetailModal` component and visual conventions (hover/cursor styling)
  already used by the Arrangement column, for UI consistency.
- Zero new network requests — render entirely from props already passed into `InvoiceTable`.

**Non-Goals:**
- Debtor-wide (cross-invoice) promise history. `PromiseToPay` is 1:1 with `trackedInvoiceId`;
  aggregating a debtor's promises across other invoices would require a new loader/endpoint
  and is out of scope for this change.
- Any change to promise creation, breach detection, or email suppression logic.
- Any schema, RLS, or API route changes.

## Decisions

- **No fetch, local state only**: unlike Arrangement detail (which needs a fetch because an
  arrangement spans multiple invoices), the Promise modal renders directly from
  `inv.promisesToPay`, already present in the `invoices` prop. State is just
  `selectedPromiseInvoiceId: string | null`, resolved back to the invoice (and its
  `promisesToPay` array) by `.find()` at render time — no loading/error state needed.
- **Reuse `DetailModal`**: no new modal component. Title: `"Promise history"`.
- **All three badge states are clickable**: `Pays`, `Missed`, and `Broken history: N` each get
  `cursor-pointer` + `onClick` (with `event.stopPropagation()` so the row's own expand/collapse
  toggle isn't also triggered, matching the existing Arrangement cell's pattern).
- **Timeline ordering**: render `inv.promisesToPay` as-is (already `createdAt desc` from the
  loader) — newest promise first, so the current/active state is always at the top.
- **Empty/edge case**: if a row's Promise badges are somehow clicked with an empty
  `promisesToPay` array (shouldn't happen since badges only render when a promise exists), the
  modal shows "No promise history for this invoice." rather than erroring.

## Risks / Trade-offs

- [Risk] Duplicating some layout code between the Arrangement and Promise modal bodies →
  Mitigation: both are small, declarative JSX blocks; introducing a shared abstraction now
  would be premature for two call sites and isn't required by this change.
- [Risk] Future debtor-wide history request would require revisiting this as fetch-based →
  Mitigation: explicitly called out as a non-goal; today's single-invoice, no-fetch design is
  intentionally the minimal correct solution for the current data model.
