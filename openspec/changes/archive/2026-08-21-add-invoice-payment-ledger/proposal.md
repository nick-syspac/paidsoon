## Why

`TrackedInvoice.amountDue` is a single static number, and CSV/XLSX re-import currently overwrites it silently (`app/api/invoice-imports/[batchId]/commit/route.ts`) with no record of what changed. A $10k invoice with $7k paid shows as simply "unpaid" today, and re-uploading a spreadsheet with a lower outstanding balance destroys the evidence of what payment occurred. A payment ledger makes partial payments visible and turns spreadsheet re-uploads into an auditable reconciliation instead of a blind overwrite.

## What Changes

- New `InvoicePayment` model: an append-only ledger of payment events per invoice (`amount`, `currency`, `source`, `note`, `recordedAt`).
- `TrackedInvoice.amountDue` becomes the fixed original invoice total; "amount outstanding" is computed as `amountDue - Σ InvoicePayment.amount`, following the existing `lib/dashboard/*` convention of computing derived values from source rows rather than caching a running total.
- CSV/XLSX import reconciliation (`app/api/invoice-imports/[batchId]/commit/route.ts`) stops blindly overwriting `amountDue` on re-upload. Instead, it compares the file's reported outstanding balance to the currently computed outstanding balance for that invoice and:
  - if the new outstanding balance is lower, inserts an `InvoicePayment` for the difference (with `status` moving to `paid` when it reaches zero)
  - if the new outstanding balance is unchanged, no-ops
  - if the new outstanding balance is *higher* than before, does **not** auto-apply anything; the invoice is flagged as an import anomaly for manual review rather than silently accepted or blocked
- New manual "record a payment" action for invoices sourced outside the reconciliation flow (e.g. cash, bank transfer noted by the user directly).
- Manual "mark as paid" continues to exist as a distinct action for the case where a user wants to close out an invoice without itemizing a payment amount (records a payment for the full remaining outstanding balance).

## Capabilities

### New Capabilities
- `invoice-payment-ledger`: append-only payment-event ledger per invoice, computed outstanding-balance derivation, and reconciliation logic for spreadsheet re-imports

## Impact

- Prisma schema: new `InvoicePayment` model; no change to `TrackedInvoice.amountDue` semantics beyond documentation (it now explicitly means "original total," not "current outstanding").
- Code touched: `app/api/invoice-imports/[batchId]/commit/route.ts` (reconciliation logic replaces blind overwrite), `lib/dashboard/*` (every place currently reading `amountDue` as "the amount owed" needs to instead compute outstanding via the new derivation helper), new `app/api/invoices/[id]/payments/route.ts` for manual payment recording.
- Any UI currently displaying `amountDue` directly (invoice table, dashboard KPIs, weekly debtor summary email) needs to switch to the computed outstanding value once payments exist for an invoice.
- Depends on nothing from `add-customer-entity`; can ship independently.
