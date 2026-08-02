## 1. Promise detail modal state and wiring

- [x] 1.1 Add `selectedPromiseInvoiceId: string | null` state to `InvoiceTable` and helper functions `openPromiseDetail(invoiceId)` / `closePromiseDetail()`, mirroring the existing `selectedArrangementId` pattern.
- [x] 1.2 Resolve the selected invoice's `promisesToPay` array by looking it up from the `invoices` prop (`.find(i => i.id === selectedPromiseInvoiceId)`) at render time — no fetch, no loading/error state.

## 2. Make Promise badges clickable

- [x] 2.1 Add `cursor-pointer` styling and an `onClick` (with `event.stopPropagation()`) to the Promise-column `<td>`/badges for all three states (`Pays`, `Missed`, `Broken history: N`), calling `openPromiseDetail(inv.id)`.
- [x] 2.2 Match the Arrangement column's hover/visual treatment (e.g. `hover:underline`) so the two columns look consistent.

## 3. Promise history modal content

- [x] 3.1 Render a `<DetailModal title="Promise history" onClose={closePromiseDetail}>` when `selectedPromiseInvoiceId` is set.
- [x] 3.2 Inside the modal, list every `PromiseToPay` record for the resolved invoice (already ordered newest-first by the loader) showing: status, `promisedPayBy` (formatted), `promisedAmount` (formatted currency, or "Full balance" if null), `clientNotes` (if present), and `createdAt`.
- [x] 3.3 Handle the empty-array edge case with a "No promise history for this invoice." message instead of rendering nothing/erroring.

## 4. Verification

- [ ] 4.1 Manually verify in the dev dashboard: click each of the three Promise badge states on seeded/test data and confirm the modal opens with correct, chronologically-ordered content, and closes via ✕, Escape, and backdrop click.
- [x] 4.2 Run `npm run test` and `npx tsc --noEmit` to confirm no regressions (no new test file needed — this is a pure presentational change with no new business logic to unit test).
