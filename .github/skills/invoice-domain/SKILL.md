# Skill: Invoice Domain — PaidSoon

## When to Use This Skill
Use when working with tracked invoices, invoice connections, the invoice status state machine, or any logic that reads from or writes to invoice data.

## Status
Confirmed implemented in this codebase.

## Inputs Required
- Which part of the invoice domain to work with (connections, tracking, status transitions, catch-up scan)

## Files to Inspect
- `prisma/schema.prisma` — `TrackedInvoice`, `InvoiceConnection`, `EmailLog` models
- `lib/providers/types.ts` — `InvoiceProvider` interface, `NormalizedInvoice` type
- `lib/providers/stripe.ts` — Stripe Connect provider implementation
- `lib/providers/index.ts` — provider registry
- `lib/email/catchup.ts` — `runCatchUpScan()` for detecting new overdue invoices
- `lib/email/schedule.ts` — `computeNextEmailAt()` timing
- `app/api/invoices/[id]/` — pause, resume, snooze, resolve routes
- `app/api/stripe/connect/` — connect/callback/disconnect routes

## Invoice Status State Machine

```
pending
  ↓ (email1DaysAfterDue elapsed, nextEmailAt reached)
  → stage 1 sent → stage 2 sent → stage 3 sent → sequence_complete
  
pending
  ↓ (user action)
paused ←→ pending (resume)

pending
  ↓ (user action: snooze)
snoozed → pending (when snoozedUntil <= now, cron resumes)

any status
  ↓ (user action)
manually_resolved

any status  
  ↓ (Stripe webhook: invoice.paid)
paid
```

## TrackedInvoice Key Fields

| Field | Type | Notes |
|---|---|---|
| `externalId` | String | Stripe invoice ID |
| `provider` | String | `"stripe"` |
| `userId` | String | FK to Supabase auth |
| `clientEmail` | String | PII — do not log |
| `clientName` | String | PII |
| `amountDue` | Int | Stored in **cents** |
| `currency` | String | ISO 4217 |
| `status` | String | State machine value |
| `currentStage` | Int | 0–3 |
| `nextEmailAt` | DateTime? | When next stage fires |
| `snoozedUntil` | DateTime? | Resume time for snoozed invoices |

## Idempotency Key
`(externalId, provider, userId)` — unique constraint prevents duplicate rows.

## NormalizedInvoice Interface
All providers must map their data to this shape:
```ts
interface NormalizedInvoice {
  externalId: string
  provider: string
  clientEmail: string
  clientName: string
  amountDue: number    // cents (integer)
  currency: string
  dueDate: Date
  paymentUrl?: string
  invoiceNumber?: string
}
```

## Rules to Follow
- `amountDue` always in cents — format with `Intl.NumberFormat` for display
- `clientEmail` is PII — never log, never include in error responses
- Use `withUserContext` for all user-facing invoice queries
- Idempotency check before upsert
- Check tier invoice limit before inserting: `getInvoiceLimitForTier(tier)`
- Status transitions are explicit — no direct `status` field updates without business logic

## Common Mistakes to Avoid
- Storing `amountDue` as decimal (must be integer cents)
- Logging `clientEmail` or `clientName`
- Returning raw DB row to client (map to safe shape)
- Forgetting idempotency check on import
- Sending emails to paused/snoozed/resolved invoices

## Output Format
- API routes with proper auth, validation, and RLS
- DB queries via `withUserContext`
- Safe response shapes (no raw DB rows)

## Acceptance Checklist
- [ ] `amountDue` is integer cents in DB
- [ ] Idempotency key checked before insert
- [ ] Tier limit checked before insert
- [ ] No PII in logs or error responses
- [ ] RLS enforced via `withUserContext`
- [ ] Status transitions follow the state machine
