## 1. Schema and RLS

- [x] 1.1 Add `InvoicePayment` model to `prisma/schema.prisma` (`trackedInvoiceId`, `userId`, `amount`, `currency`, `source`, `note`, `recordedAt`, `createdAt`)
- [x] 1.2 Run `npx prisma migrate dev --name add-invoice-payment-ledger`
- [x] 1.3 Add matching RLS policy to `prisma/rls-policies.sql` and run `npm run verify-rls`
- [x] 1.4 Add a schema comment on `TrackedInvoice.amountDue` clarifying it is the original invoice total, not the current outstanding balance

## 2. Shared outstanding-balance helper

- [x] 2.1 Implement `computeOutstanding(invoice, payments)` in `lib/invoices/payments.ts`
- [x] 2.2 Add unit tests: zero payments, single full payment, multiple partial payments, overpayment edge case

## 3. Audit existing readers of `amountDue`

- [x] 3.1 Update `lib/dashboard/*` modules that currently read `amountDue` as "amount owed" to use `computeOutstanding` instead (ageing, biggestDebtors, topKpiCards, currencySummary, collectionMetrics, attentionRequired)
- [x] 3.2 Update the invoice table UI and weekly debtor summary email to display computed outstanding balance instead of raw `amountDue`

## 4. Reconciliation logic

- [x] 4.1 Replace the blind `amountDue: toCents(outstandingAmount)` overwrite in `app/api/invoice-imports/[batchId]/commit/route.ts` with a comparison against the invoice's currently computed outstanding balance
- [x] 4.2 On a lower reported outstanding balance, insert an `InvoicePayment` with `source = "import_reconciliation"` for the difference
- [x] 4.3 On the reported outstanding balance reaching zero, also set invoice status to `paid`
- [x] 4.4 On a higher reported outstanding balance, skip applying any change for that invoice and record it as an import anomaly on the batch result instead
- [x] 4.5 Add tests covering all four reconciliation branches (paid off, partial, unchanged, anomaly)

## 5. Manual payment actions

- [x] 5.1 Add `POST /api/invoices/[id]/payments` for manually recording a payment (amount, optional note)
- [x] 5.2 Reimplement "mark as paid" as a call into the same payment-recording path, using the invoice's full remaining outstanding balance
- [x] 5.3 Validate request bodies with Zod; reject payments in a currency different from the invoice's currency

## 6. Docs

- [x] 6.1 Update `docs/DDD.md` database-model section with `InvoicePayment` and the clarified meaning of `amountDue`
