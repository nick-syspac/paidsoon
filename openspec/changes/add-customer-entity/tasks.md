## 1. Schema and RLS

- [x] 1.1 Add `Customer` model to `prisma/schema.prisma` (`userId`, `primaryEmail`, `primaryEmailLower`, `displayName`, `neverAutoChase`, `unsubscribed`, `cadenceOverride Json?`, timestamps) with `@@unique([userId, primaryEmailLower])`
- [x] 1.2 Add nullable `customerId` FK to `TrackedInvoice` and `Arrangement`
- [x] 1.3 Run `npx prisma migrate dev --name add-customer-entity`
- [x] 1.4 Add matching RLS policies for `Customer` to `prisma/rls-policies.sql`
- [x] 1.5 Run `npm run verify-rls` and confirm tenant isolation on the new table

## 2. Shared find-or-create helper

- [x] 2.1 Implement `findOrCreateCustomer(tx, userId, email, displayName?)` in `lib/db/customers.ts`, matching on lowercased email inside the caller's `withUserContext` transaction
- [x] 2.2 Add a unit test for `findOrCreateCustomer` covering: new email creates a row, existing email (same case) returns it, existing email (different case) returns it without creating a duplicate

## 3. Wire ingestion paths

- [x] 3.1 Call `findOrCreateCustomer` from the Stripe Connect invoice sync path and attach `customerId` to created/updated `TrackedInvoice` rows
- [x] 3.2 Call `findOrCreateCustomer` from the Xero sync path
- [x] 3.3 Call `findOrCreateCustomer` from the MYOB sync path
- [x] 3.4 Call `findOrCreateCustomer` from `app/api/invoice-imports/[batchId]/commit/route.ts` for both the create and update-eligible branches

## 4. Backfill

- [x] 4.1 Write a one-time backfill script (`scripts/backfill-customer-entities.ts`) that groups existing `TrackedInvoice` rows by `(userId, lower(clientEmail))`, upserts `Customer` rows via `prismaAdmin`, and attaches `customerId` back onto matching `TrackedInvoice` and `Arrangement` rows; document the `prismaAdmin` exception inline per project convention
- [x] 4.2 Confirm the script is idempotent (safe to re-run without creating duplicates) with a local dry run

## 5. Cron enforcement

- [x] 5.1 Update `app/api/cron/send-emails/route.ts` to exclude invoices whose `Customer.neverAutoChase` or `Customer.unsubscribed` is true
- [x] 5.2 Update the cron's `nextEmailAt` computation to use `Customer.cadenceOverride` day offsets when present, falling back to the tenant's `Schedule` otherwise
- [x] 5.3 Add/update cron tests in `tests/` covering never-auto-chase, unsubscribed, and cadence-override cases without hitting a real database

## 6. Docs

- [x] 6.1 Add `Customer` to the database-model section of `docs/DDD.md`
