# Skill: CSV Import — PaidSoon

## When to Use This Skill
Use when implementing or extending CSV-based invoice import for PaidSoon.

## Status
**Not currently implemented.** This skill covers the planned/optional implementation only. Only implement if explicitly requested by the user.

## Inputs Required
- CSV column mapping specification
- Tier/feature gating requirements
- Whether `amountDue` in CSV is in cents or decimal

## Files to Inspect (when implementing)
- `lib/providers/types.ts` — `NormalizedInvoice` target type
- `prisma/schema.prisma` — `TrackedInvoice` model (import target)
- `lib/billing.ts` — `getInvoiceLimitForTier` for limit checks
- `lib/db/withUserContext.ts` — DB access pattern
- `app/api/invoices/` — existing invoice routes (pattern)

## Expected CSV Format

```csv
invoiceNumber,clientName,clientEmail,amountDue,currency,dueDate
INV-001,Acme Corp,acme@example.com,150000,GBP,2026-01-15
```

- `amountDue` — integer pence/cents (no decimal separator)
- `currency` — ISO 4217 (default: `GBP`)
- `dueDate` — ISO 8601 date

## Implementation Rules

### Route
`POST /api/invoices/import/csv`
- Accept `multipart/form-data` with `file` field
- Max file size: 1 MB
- Max rows: 500 per import
- Parse, validate each row with Zod
- Use idempotency key: `(externalId=invoiceNumber, provider="csv", userId)`
- Check tier invoice limit before inserting
- Return: `{ imported: number, skipped: number, errors: RowError[] }`

### Zod Row Schema
```ts
const rowSchema = z.object({
  invoiceNumber: z.string().min(1),
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  amountDue: z.coerce.number().int().positive(),
  currency: z.string().length(3).default("GBP"),
  dueDate: z.coerce.date(),
})
```

### Security
- Never execute CSV content — treat all values as strings first
- Sanitize `clientName` and `clientEmail` before DB insertion
- Reject files over the size/row limit with a clear error

## Common Mistakes to Avoid
- Treating `amountDue` as decimal — must convert to integer cents
- Not validating email format in each row
- Not checking idempotency — same `invoiceNumber` should upsert, not duplicate
- Missing tier limit check before inserting rows

## Output Format
- Route handler + Zod schema
- CSV parser utility
- Response type with imported/skipped/error counts

## Acceptance Checklist
- [ ] File size and row count limits enforced
- [ ] Email validation on each row
- [ ] `amountDue` stored as integer cents
- [ ] Idempotency key prevents duplicates
- [ ] Tier limit respected
- [ ] Tests cover valid, invalid, and duplicate imports
