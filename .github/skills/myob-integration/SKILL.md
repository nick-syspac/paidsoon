# Skill: MYOB Integration — PaidSoon

## When to Use This Skill
Use when implementing a MYOB AccountRight or MYOB Essentials invoice provider for PaidSoon.

## Status
**Not currently implemented.** This is a planned/optional integration. Only implement if explicitly requested by the user and MYOB API credentials are available.

## Inputs Required
- MYOB API credentials (Client ID, Client Secret)
- MYOB API version and endpoint documentation
- OAuth flow documentation
- Webhook support confirmation (if any)

## Files to Inspect (when implementing)
- `lib/providers/types.ts` — `InvoiceProvider` interface to implement
- `lib/providers/stripe.ts` — reference implementation
- `lib/providers/index.ts` — provider registry
- `lib/email/catchup.ts` — how providers are called
- `prisma/schema.prisma` — `InvoiceConnection` model (stores credentials)
- `app/api/stripe/connect/` — OAuth connect flow reference

## InvoiceProvider Interface to Implement

```ts
// lib/providers/myob.ts
export class MYOBInvoiceProvider implements InvoiceProvider {
  async getOverdueInvoices(credentials: ProviderCredentials): Promise<NormalizedInvoice[]>
  async getInvoiceDetails(credentials: ProviderCredentials, externalId: string): Promise<NormalizedInvoice | null>
  verifyWebhookSignature(payload: Buffer, headers: Record<string, string>, secret: string): boolean
  parseWebhookEvent(payload: Buffer): ParsedWebhookEvent
}
```

## NormalizedInvoice Mapping (MYOB → PaidSoon)

```ts
{
  externalId: myobInvoice.UID,        // MYOB unique ID
  provider: "myob",
  clientEmail: myobContact.Email,
  clientName: myobContact.CompanyName ?? myobContact.FirstName,
  amountDue: Math.round(myobInvoice.Balance * 100),  // Convert to cents
  currency: "AUD",                    // MYOB default
  dueDate: new Date(myobInvoice.DueDate),
  invoiceNumber: myobInvoice.InvoiceNumber,
  paymentUrl: undefined,              // MYOB may not have payment links
}
```

## New Environment Variables

Document in `docs/runbooks/README.md`:
- `MYOB_CLIENT_ID` — MYOB OAuth application client ID
- `MYOB_CLIENT_SECRET` — MYOB OAuth application secret
- `MYOB_WEBHOOK_SECRET` — if MYOB webhooks are supported

## OAuth Flow Routes

Follow the Stripe Connect pattern:
- `app/api/myob/connect/authorize/route.ts` — redirect to MYOB OAuth
- `app/api/myob/connect/callback/route.ts` — exchange code, store credentials
- `app/api/myob/connect/disconnect/route.ts` — deactivate connection

## Rules to Follow
- Map `amountDue` to cents (integer) — MYOB uses decimal
- Use idempotency key: `(externalId, provider="myob", userId)`
- Store OAuth refresh tokens securely in `InvoiceConnection.stripeConnectAccountId` or a new field
- Check tier invoice limits during catch-up scan
- Never log `clientEmail` or `clientName`

## Common Mistakes to Avoid
- Storing decimal `amountDue` (must convert to integer cents)
- Hardcoding MYOB API endpoint URLs
- Not refreshing OAuth tokens before API calls
- Not implementing the full `InvoiceProvider` interface

## Output Format
- `lib/providers/myob.ts` implementing `InvoiceProvider`
- OAuth routes in `app/api/myob/connect/`
- `docs/runbooks/myob.md` setup guide
- `docs/runbooks/README.md` updated
- Tests with mock MYOB API responses

## Acceptance Checklist
- [ ] Full `InvoiceProvider` interface implemented
- [ ] `amountDue` always integer cents
- [ ] Provider registered in `lib/providers/index.ts`
- [ ] `docs/runbooks/myob.md` created
- [ ] Tests pass without real MYOB API calls
