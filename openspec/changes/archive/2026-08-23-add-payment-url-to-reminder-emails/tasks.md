## 1. Schema

- [x] 1.1 In `prisma/schema.prisma`, add `paymentUrl String? @map("payment_url")` to the
      `TrackedInvoice` model (after `dueDate`, before `status` is fine)
- [x] 1.2 Run `npx prisma migrate dev --name add-tracked-invoice-payment-url` to generate
      and apply the migration locally
- [x] 1.3 Run `npm run verify-rls` and confirm all checks pass — no new RLS policy is
      needed since the existing `tracked_invoices` policy covers all columns

## 2. Stripe Catchup Ingest

- [x] 2.1 In `lib/email/catchup.ts`, add `paymentUrl: invoice.paymentUrl ?? null` to the
      `prisma.trackedInvoice.create({ data: { ... } })` call

## 3. CSV/XLSX Import Commit

- [x] 3.1 In `app/api/invoice-imports/[batchId]/commit/route.ts`, pass `paymentUrl` into
      the `trackedInvoice.create` / `trackedInvoice.update` data objects:
      `paymentUrl: values.payment_url?.trim() || null`
      (applies to both the create and upsert update branches)

## 4. Send-Time Passthrough

- [x] 4.1 In `lib/email/send.ts` inside `sendFollowUpEmail()`, replace the stub:
      ```
      paymentUrl: undefined, // TODO: enrich from provider.getInvoiceDetails if needed
      ```
      with:
      ```
      paymentUrl: invoice.paymentUrl ?? undefined,
      ```

## 5. Tests

- [x] 5.1 Add a test in `tests/` asserting that `sendFollowUpEmail` passes `invoice.paymentUrl`
      through to `buildTemplateVars` and that the resulting email subject/body contains a
      `{{paymentLink}}` resolved value when `paymentUrl` is set (mock `prisma` and `resend`
      per existing test conventions — see `tests/email-send.test.ts` or similar for the
      mock pattern)
- [x] 5.2 Add a test asserting that when `invoice.paymentUrl` is `null`, `paymentUrl` is
      `undefined` in `buildTemplateVars` and `paymentLink` resolves to `""` (no link rendered)

## 6. Verification

- [x] 6.1 Run `npm run test` and confirm all tests pass
- [x] 6.2 Run `npm run lint` — confirm no new warnings
- [x] 6.3 Run `npx tsc --noEmit` — confirm no new errors beyond the pre-existing 16
      test-fixture errors documented in `docs/go-live-to-do.md §20`
- [ ] 6.4 Manual smoke: trigger a catchup scan or CSV import for a Stripe test-mode
      invoice with `hosted_invoice_url` present, confirm `paymentUrl` is persisted in the
      DB row, then trigger the cron and confirm the reminder email body contains the link
