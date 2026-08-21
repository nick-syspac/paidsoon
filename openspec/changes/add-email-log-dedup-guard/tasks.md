## 1. Schema

- [x] 1.1 Check for existing duplicate `(trackedInvoiceId, stage)` rows in
      `email_logs` via a throwaway read-only query before writing the
      migration
- [x] 1.2 Add `@@unique([trackedInvoiceId, stage])` to the `EmailLog` model
      in `prisma/schema.prisma`
- [x] 1.3 Run `npx prisma migrate dev --name add_email_log_dedup_unique` to
      generate the migration
- [x] 1.4 Confirm `prisma/rls-policies.sql` needs no changes for the new
      constraint (it doesn't add a new column or table)

## 2. Send-path guard

- [x] 2.1 Add a pre-send `EmailLog.findFirst({ where: { trackedInvoiceId,
      stage } })` check in `lib/email/send.ts` (or the cron loop) that skips
      sending when a row already exists
- [x] 2.2 Handle the Prisma unique-constraint violation (`P2002`) on
      `EmailLog.create()` as an "already sent" case rather than a hard
      failure
- [x] 2.3 Ensure `TrackedInvoice.currentStage`/`nextEmailAt` still advance
      correctly when a send is skipped due to an existing log

## 3. Tests

- [x] 3.1 Add a test asserting a second send attempt for an
      already-logged `(trackedInvoiceId, stage)` does not call the Resend
      client again
- [x] 3.2 Add a test simulating two concurrent send attempts for the same
      pair and asserting only one `EmailLog` row results
- [x] 3.3 Run `npm run test` and confirm the full suite passes

## 4. Verification

- [x] 4.1 Run `npm run verify-rls` against a real Supabase instance after
      the schema change
- [x] 4.2 Run `npm run lint` and `npx tsc --noEmit` and confirm no new
      errors are introduced
