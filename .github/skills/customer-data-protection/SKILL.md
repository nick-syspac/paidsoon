# Skill: Customer Data Protection — PaidSoon

## When to Use This Skill
Use when handling, displaying, querying, or logging any customer invoice data, PII fields, or cross-tenant data in PaidSoon.

## Status
Confirmed applicable to this codebase.

## Inputs Required
- Code area handling customer data
- Whether it is user-facing (requires RLS) or system-level (cron/webhook)

## PII Fields in PaidSoon

| Field | Table | Classification |
|---|---|---|
| `clientEmail` | `tracked_invoices` | PII — email address of debtor |
| `clientName` | `tracked_invoices` | PII — name of debtor |
| `amountDue` | `tracked_invoices` | Sensitive financial data (cents) |
| `fromEmail` | `email_settings` | PII — user's custom sender |
| User email | Supabase Auth | PII — account holder email |

## Tenant Isolation Model

- RLS via `withUserContext` — DB-level isolation
- Every `TrackedInvoice` has a `userId` FK
- Policies ensure `auth.uid()::text = "userId"` for all SELECT/INSERT/UPDATE
- No user can read another user's invoices, even with a valid session

## Rules to Follow

### Querying
- Always use `withUserContext(userId, fn)` for user-scoped queries
- Do not add a `userId` filter as a substitute for RLS — it is defence-in-depth only
- Never use `prismaAdmin` for user-facing invoice queries

### Logging
- Never log `clientEmail`, `clientName`, or `amountDue` to `console.log` or `console.error`
- Log invoice actions by invoice ID only (not by client name or email)
- Cron and webhook logs must exclude PII

### API Responses
- Never return raw Prisma rows to the client
- Map to a safe display shape — omit internal IDs and fields not needed by the UI
- `clientEmail` should not appear in API responses unless the user explicitly needs it (e.g., displaying in their own dashboard)

### Email Templates
- Template receives `clientEmail` as the recipient address — it is used by Resend, not rendered in the email body
- Sanitize `clientName` before inserting into HTML templates
- Do not include internal IDs in email content sent to debtors

### Cross-Account Access Prevention
- Never accept invoice IDs from client-supplied URLs without verifying `userId` ownership via RLS
- Use `withUserContext` so RLS blocks any cross-user access attempts automatically
- Do not expose `externalId` (Stripe invoice ID) in client-facing URLs

## Safe Response Shape Example

```ts
// DO NOT return raw DB row:
return NextResponse.json(invoice)  // Leaks userId, internalId, raw timestamps

// DO map to a safe shape:
return NextResponse.json({
  id: invoice.id,
  clientName: invoice.clientName,
  amountDue: invoice.amountDue,  // Still in cents — format on client
  currency: invoice.currency,
  dueDate: invoice.dueDate.toISOString(),
  status: invoice.status,
  currentStage: invoice.currentStage,
  nextEmailAt: invoice.nextEmailAt?.toISOString() ?? null,
})
```

## Common Mistakes to Avoid
- Including `clientEmail` in console.error calls
- Returning `userId` or internal DB IDs in API responses
- Using raw Stripe invoice data in responses (it may contain payment card info)
- Querying invoices without `withUserContext`

## Output Format
- Mapped response shapes (not raw DB rows)
- RLS-protected queries
- No PII in logs

## Acceptance Checklist
- [ ] `withUserContext` used for all invoice queries
- [ ] No PII in console.log/console.error
- [ ] Raw DB rows not returned to client
- [ ] `npm run verify-rls` passes
- [ ] No cross-user data accessible via any route
