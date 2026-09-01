# QuickBooks Integration Proposal

## Why

PaidSoon already supports pull-based accounting integrations for Xero and MYOB Business, but QuickBooks Online remains a gap for users whose receivables live in the Intuit ecosystem. Adding QuickBooks closes a real activation and retention gap by letting those users authorise their ledger, import overdue invoices, and keep reminder automation aligned with invoice and payment events without manual re-entry.

## What Changes

- **NEW** QuickBooks Online OAuth 2.0 connection lifecycle under the existing accounting integrations architecture, including connect, callback, disconnect, and manual sync actions
- **NEW** QuickBooks provider implementation for invoice, customer, and payment-aware synchronisation using the existing `AccountingProvider` patterns already used for Xero and MYOB

> **Sequencing (added 2026-08-31):** This change is implemented **after**
> `canonical-financial-data-model`. The QuickBooks adapter is written against the canonical
> ingestion contract (`lib/financial/ingest.ts`) and writes `FinancialInvoice`/`FinancialContact`/
> `FinancialPayment` records with `sourceSystem: 'quickbooks'` — not the retired
> `TrackedInvoice`/`ProviderInvoiceMapping` shape. Intuit developer/app/credential setup proceeds in
> parallel as external lead time. QuickBooks is the first external validation that the canonical
> model is provider-neutral (its documented Invoice/Customer/Payment shapes informed the canonical
> field lists).
- **NEW** QuickBooks webhook ingestion for invoice and customer events, with persisted delivery records, signature verification, and replay-safe processing
- **NEW** Retry and failure handling for QuickBooks sync and webhook processing, including integration status transitions and user-visible error states
- **MODIFIED** Accounting connections UI and admin visibility to expose QuickBooks connection status, sync history, and recovery actions alongside existing providers
- **MODIFIED** Subscription-gated accounting integrations behavior so eligible plans can connect QuickBooks in addition to the currently supported providers

## Capabilities

### New Capabilities

- `quickbooks-connection-lifecycle`: Authorise, persist, refresh, revoke, and manage QuickBooks Online connections through PaidSoon's existing accounting integration flow.
- `quickbooks-sync`: Import QuickBooks invoices and customers into PaidSoon's internal invoice-tracking model, support manual and scheduled sync, and keep reminder eligibility aligned with provider-side payment state.
- `quickbooks-webhook-ingestion`: Accept signed QuickBooks event deliveries, persist them for audit and retry handling, and reconcile affected PaidSoon records idempotently.

### Modified Capabilities

- `subscription-plan-tiers`: Extend accounting integration entitlement rules so the same eligible tiers that can use accounting integrations may connect QuickBooks Online, and ineligible tiers receive the existing upgrade path.

## Impact

- **Affected API routes**: new QuickBooks integration routes under `/api/integrations/quickbooks/*`, a QuickBooks webhook endpoint under `/api/webhooks/quickbooks`, and updated settings/admin read models that enumerate available accounting providers
- **Affected data model**: extend the existing shared accounting integration schema rather than introducing a one-off `quickbooks_integration` table; add only the provider-specific fields or event-log storage still missing for QuickBooks behavior
- **Affected business logic**: `lib/providers/accounting/*`, sync orchestration, webhook reconciliation, connection status handling, and audit/error logging paths
- **Affected UI**: connections settings, manual sync and disconnect controls, and admin diagnostics/audit views for provider health
- **Dependencies and configuration**: QuickBooks OAuth credentials, webhook verifier secret, encrypted token storage using the existing accounting token encryption utility, and test fixtures for QuickBooks API/webhook flows
