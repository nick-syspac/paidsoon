---
mode: agent
description: Build an invoice import flow for PaidSoon (CSV or third-party provider).
---

# Build Invoice Import — PaidSoon

## Role
You are a senior full-stack engineer implementing an invoice import capability for PaidSoon.

## Goal
Implement a way for users to import invoices into PaidSoon — either via CSV file upload or a third-party provider integration. Only implement a provider if it already exists in the codebase or the user explicitly requests it.

> **Important:** Only implement this provider if the repository already contains the provider or the user explicitly requests it. Otherwise, document the missing provider setup instead of inventing one.

## PaidSoon Context
Currently, PaidSoon reads invoices exclusively via the Stripe Connect OAuth provider (`lib/providers/stripe.ts`). CSV import and MYOB integration are **not currently implemented**. The `InvoiceProvider` interface at `lib/providers/types.ts` defines the abstraction for new providers.

## Files to Inspect
- `lib/providers/types.ts` — `InvoiceProvider` interface and `NormalizedInvoice` type
- `lib/providers/stripe.ts` — reference implementation of a provider
- `lib/providers/index.ts` — provider registry
- `lib/email/catchup.ts` — how providers are called during catch-up scan
- `prisma/schema.prisma` — `InvoiceConnection` and `TrackedInvoice` models
- `app/api/stripe/connect/` — existing connect flow for reference

## Implementation Rules

### Provider Interface
Any new provider must implement `InvoiceProvider` from `lib/providers/types.ts`:
- `getOverdueInvoices(credentials): Promise<NormalizedInvoice[]>`
- `getInvoiceDetails(credentials, externalId): Promise<NormalizedInvoice | null>`

### CSV Import (if requested)
- Accept CSV file uploads at a new route: `POST /api/invoices/import/csv`
- Parse and validate CSV with Zod schema
- Map CSV columns to `NormalizedInvoice` fields
- `amountDue` must be stored in cents (integer) — convert from the CSV currency format
- Use idempotency key: `(externalId, provider, userId)` — set `provider = "csv"`
- Never process arbitrary CSV files without column validation

### Data Rules
- `clientEmail` is PII — do not log
- `amountDue` always stored as integer cents
- Set `provider` field appropriately so invoices are distinguishable by source

### Auth and RLS
- Route must authenticate via `supabase.auth.getUser()`
- Use `withUserContext(userId, fn)` for all DB writes
- Check tier limits before inserting: `getInvoiceLimitForTier(tier)`

### Tests
- Test CSV parsing with valid and invalid inputs
- Test the idempotency key prevents duplicates
- Do not send real emails from tests

## Expected Output

1. New provider file in `lib/providers/` (or CSV parser in `lib/`)
2. API route for import
3. UI component for upload (if applicable)
4. Tests in `tests/`
5. Docs update in `docs/DDD.md`
6. `docs/runbooks/README.md` update if new env vars needed

## Acceptance Criteria
- Import succeeds for valid input
- Duplicate imports are idempotent
- Tier limit is respected
- `npm run test` passes
- No TypeScript errors
