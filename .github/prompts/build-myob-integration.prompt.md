---
mode: agent
description: Build a MYOB integration for importing invoices into PaidSoon.
---

# Build MYOB Integration — PaidSoon

## Role
You are a senior full-stack engineer implementing a MYOB invoice provider integration for PaidSoon.

## Goal
Implement a MYOB provider that reads overdue invoices from MYOB AccountRight or MYOB Essentials and feeds them into PaidSoon's tracking flow.

> **Important:** MYOB integration is **not currently implemented** in this repository. Only implement this if the user explicitly requests it. If MYOB API credentials and documentation are not provided, document what is needed instead of inventing an integration.

## PaidSoon Context
PaidSoon uses a provider abstraction (`lib/providers/types.ts`) that allows plugging in different invoice sources. The only current provider is Stripe Connect (`lib/providers/stripe.ts`). MYOB would be a second provider.

## Files to Inspect
- `lib/providers/types.ts` — `InvoiceProvider` interface (must be implemented)
- `lib/providers/stripe.ts` — reference implementation
- `lib/providers/index.ts` — provider registry
- `lib/email/catchup.ts` — how providers are called during catch-up scan
- `prisma/schema.prisma` — `InvoiceConnection` model (stores provider credentials)
- `app/api/stripe/connect/` — OAuth connect flow (reference for MYOB OAuth)
- `docs/runbooks/README.md` — env var documentation pattern

## What MYOB Requires (Document If Not Available)
- MYOB API OAuth 2.0 credentials (Client ID, Client Secret)
- MYOB API endpoint for reading invoices
- Webhook or polling approach for detecting newly overdue invoices
- A MYOB developer account and registered application

If these are not available, output a `docs/runbooks/myob.md` runbook describing what is needed.

## Implementation Rules

### Provider Implementation
Create `lib/providers/myob.ts` implementing `InvoiceProvider`:
- `getOverdueInvoices(credentials)` — call MYOB API, filter overdue, map to `NormalizedInvoice`
- `getInvoiceDetails(credentials, externalId)` — fetch single invoice
- `verifyWebhookSignature` — implement if MYOB supports webhooks
- `parseWebhookEvent` — implement if MYOB supports webhooks

### Normalisation
Map MYOB invoice fields to `NormalizedInvoice`:
- `externalId` — MYOB invoice UID
- `provider = "myob"`
- `amountDue` — in cents (integer); convert from MYOB's decimal format
- `clientEmail`, `clientName`, `dueDate`, `currency`, `invoiceNumber`

### OAuth Connect Flow
Create `/api/myob/connect/authorize`, `/api/myob/connect/callback`, `/api/myob/connect/disconnect` routes following the Stripe Connect pattern.

### Environment Variables
New vars to document in `docs/runbooks/README.md`:
- `MYOB_CLIENT_ID`
- `MYOB_CLIENT_SECRET`
- `MYOB_WEBHOOK_SECRET` (if webhooks supported)

### Tests
- Test provider normalisation with mock MYOB API responses
- Test idempotency: same invoice imported twice = one row
- Never call real MYOB API from tests

## Expected Output

1. `lib/providers/myob.ts` implementation
2. OAuth connect routes in `app/api/myob/connect/`
3. Provider registered in `lib/providers/index.ts`
4. `docs/runbooks/myob.md` with setup instructions
5. `docs/runbooks/README.md` updated with new env vars
6. Tests in `tests/`
7. `docs/DDD.md` updated

## Acceptance Criteria
- `NormalizedInvoice` fields all populated correctly
- `amountDue` is always integer cents
- Provider implements full `InvoiceProvider` interface
- Tests pass
- No TypeScript errors
