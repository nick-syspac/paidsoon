## Why

PaidSoon's core value — stopping small businesses from chasing invoices manually — is undermined when users must manually re-enter invoice data from their accounting software. Xero and MYOB Business are the dominant accounting platforms used by Australian small businesses; connecting directly to them eliminates the data-entry friction and makes PaidSoon the automatic next step after raising an invoice. This is the single most-requested capability from target users and the clearest path to reducing churn and increasing activation rates.

## What Changes

- **NEW** OAuth 2.0 connect/disconnect flow for Xero (scopes: `accounting.transactions.read`, `accounting.contacts.read`, `openid`, `profile`, `email`, `offline_access`)
- **NEW** OAuth 2.0 connect/disconnect flow for MYOB Business (granular scopes required; legacy `CompanyFile` scope being deprecated 1 September 2026 — TODO: confirm exact replacement scopes from MYOB developer portal)
- **NEW** `AccountingProvider` abstraction with `XeroProvider` and `MyobProvider` implementations
- **NEW** Database tables: `accounting_connections`, `accounting_sync_runs`, `provider_invoice_mappings`, `provider_contact_mappings`, `oauth_states`
- **NEW** Scheduled daily sync job (Vercel Cron) that pulls unpaid/overdue invoices from connected providers
- **NEW** Manual sync trigger available from the dashboard settings
- **NEW** Mapping layer that translates provider invoice objects into PaidSoon `TrackedInvoice` records
- **NEW** Idempotent sync using provider invoice IDs as the external deduplication key (extending the existing `externalId` + `provider` pattern on `TrackedInvoice`)
- **NEW** Automatic reminder pause/cancellation when a provider invoice transitions to paid, voided, or deleted
- **NEW** Sync history and error log visible to users in the settings UI
- **MODIFIED** `TrackedInvoice` gains `providerMetadata` (JSON column) to carry provider-specific fields without schema pollution
- **MODIFIED** Onboarding flow gains an optional "Connect your accounting software" step after Stripe Connect

## Capabilities

### New Capabilities

- `accounting-integrations`: End-to-end capability covering provider abstraction, connection lifecycle (connect → callback → token exchange → organisation selection → sync), disconnect/revoke, and the data model that supports multiple providers per user account.
- `oauth-connections`: Secure storage, rotation, and revocation of OAuth 2.0 tokens for third-party accounting providers, including PKCE/state nonce handling, token encryption at rest, and graceful handling of revoked consent and expired tokens.
- `invoice-sync`: Scheduled and manual import of invoice, contact, and payment data from connected accounting providers into PaidSoon's internal model, including deduplication, status mapping, incremental sync, error handling, and sync run history.

### Modified Capabilities

- `subscription-plan-tiers`: Accounting integrations are gated at the Solo tier and above. Starter users see an upsell prompt when they attempt to connect. Existing plan-feature checks need a new `accountingIntegrations` feature flag.

## Impact

- **New API routes**: `/api/integrations/[provider]/connect`, `/api/integrations/[provider]/callback`, `/api/integrations/[provider]/disconnect`, `/api/integrations/[provider]/sync`, `/api/cron/sync-accounting`
- **New lib modules**: `lib/providers/xero.ts`, `lib/providers/myob.ts`, `lib/providers/index.ts` (AccountingProvider interface), `lib/providers/sync.ts` (sync orchestrator)
- **Database**: 5 new tables; 1 column added to `tracked_invoices`; new RLS policies required
- **Dependencies**: Xero Node SDK (`xero-node`) and/or raw fetch against Xero Accounting API; MYOB API — raw fetch (no official Node SDK as of writing — TODO: verify)
- **Environment variables**: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `MYOB_CLIENT_ID`, `MYOB_CLIENT_SECRET`, `MYOB_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`
- **Affected components**: `StripeConnectionClient.tsx` pattern reused for new `AccountingConnectionClient.tsx`; onboarding flow; settings page; `subscriptionPlans.ts`
- **Vercel Cron**: New cron entry `0 2 * * *` (02:00 UTC daily) for accounting sync, separate from the existing email send cron
- **Security**: OAuth tokens encrypted before DB storage; `oauth_states` table prevents CSRF on callback; no provider credentials exposed to browser
