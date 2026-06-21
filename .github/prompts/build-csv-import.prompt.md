---
mode: agent
description: Build a CSV invoice import flow for PaidSoon.
---

# Build CSV Import — PaidSoon

## Role
You are a senior full-stack engineer implementing CSV invoice import for PaidSoon.

## Goal
Allow users to upload a CSV file of invoices and have PaidSoon import them as tracked invoices, ready for email follow-up.

> **Important:** CSV import is **not currently implemented** in this repository. Build it from scratch following PaidSoon conventions.

## PaidSoon Context
PaidSoon currently imports invoices only via Stripe Connect. A CSV import would provide an alternative for users whose invoicing tool is not yet integrated. The `InvoiceProvider` abstraction can be bypassed for one-shot CSV imports, or a `csv` pseudo-provider can be used.

## Files to Inspect
- `prisma/schema.prisma` — `TrackedInvoice` model (target of import)
- `lib/providers/types.ts` — `NormalizedInvoice` type to map CSV rows to
- `lib/email/catchup.ts` — how invoices are upserted after detection
- `lib/billing.ts` — `getInvoiceLimitForTier` for limit checks
- `lib/db/withUserContext.ts` — DB access pattern
- `app/api/` — existing route patterns
- `lib/subscriptionPlans.ts` — decide if CSV import is tier-gated

## CSV Format Specification

Define and validate an expected CSV format:

```
invoiceNumber,clientName,clientEmail,amountDue,currency,dueDate
INV-001,Acme Corp,acme@example.com,150000,GBP,2026-01-15
```

Column rules:
- `invoiceNumber` — used as `externalId`; must be unique per user
- `clientName` — required; trim whitespace
- `clientEmail` — required; validate email format
- `amountDue` — required; in **pence/cents** (integer) OR decimal pounds/dollars depending on spec decision — document clearly
- `currency` — ISO 4217, default `GBP`
- `dueDate` — ISO 8601 date string

## Implementation Rules

### API Route
Create: `POST /api/invoices/import/csv`
- Authenticate via `supabase.auth.getUser()`
- Accept `multipart/form-data` with a `file` field
- Parse CSV — consider a lightweight CSV parser or Node's built-in stream
- Validate each row with Zod
- Check tier invoice limit before inserting
- Use `withUserContext(userId, fn)` for upsert
- Idempotency key: `(externalId, provider="csv", userId)`
- Return: `{ imported: number, skipped: number, errors: RowError[] }`

### Input Validation (per row)
```ts
const rowSchema = z.object({
  invoiceNumber: z.string().min(1),
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  amountDue: z.number().int().positive(),
  currency: z.string().length(3).default("GBP"),
  dueDate: z.string().datetime({ offset: true }),
})
```

### File Safety
- Limit file size (e.g., 1 MB)
- Maximum row count (e.g., 500 rows per import)
- Do not execute CSV content as code
- Sanitize all string fields before DB insertion

### UI
- File upload component in the dashboard (new page or modal)
- Show import summary (imported, skipped, errors)
- Link to the dashboard after import

### Tests
- Test valid CSV parses correctly
- Test invalid email addresses are rejected
- Test duplicate imports are idempotent
- Test tier limit is enforced
- Never touch real DB in unit tests

## Expected Output

1. `POST /api/invoices/import/csv` route
2. Zod row schema
3. CSV parser/validator utility
4. UI component for upload
5. Tests in `tests/`
6. `docs/DDD.md` update

## Acceptance Criteria
- Valid CSV imports successfully
- Invalid rows rejected with per-row error details
- Duplicates are idempotent
- Tier limit respected
- File size/row limits enforced
- `npm run test` passes
- No TypeScript errors
