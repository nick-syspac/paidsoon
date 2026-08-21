# QuickBooks Integration Tasks

## 1. Shared Accounting Model

- [ ] 1.1 Extend shared accounting types, provider registries, and validation helpers to recognise `quickbooks` as a supported accounting provider.
- [ ] 1.2 Update `prisma/schema.prisma` to support QuickBooks within `AccountingConnection` and add persistent webhook delivery storage for accepted QuickBooks events.
- [ ] 1.3 Generate a Prisma migration for the QuickBooks schema changes and update `prisma/rls-policies.sql` to cover any new tables or provider-specific access paths.
- [ ] 1.4 Add or update server-side environment documentation for QuickBooks OAuth credentials, redirect URI, and webhook verification secret in the runbooks.

## 2. Provider And OAuth Flow

- [ ] 2.1 Implement `QuickBooksProvider` under `lib/providers/accounting/` using the existing `AccountingProvider` contract.
- [ ] 2.2 Add QuickBooks OAuth connect and callback routes that validate auth state, exchange tokens, encrypt credentials, and create or update the shared accounting connection row.
- [ ] 2.3 Add QuickBooks disconnect handling that revokes authorisation on a best-effort basis and marks the local connection disconnected without exposing secrets.
- [ ] 2.4 Extend shared accounting token refresh and provider factory paths so QuickBooks can refresh tokens during sync and recovery flows.

## 3. Sync And Reconciliation

- [ ] 3.1 Implement QuickBooks invoice and customer fetch logic with the query strategy defined in the design and map results into the existing tracked-invoice and provider-mapping model.
- [ ] 3.2 Extend the shared accounting sync orchestrator to run QuickBooks manual and scheduled syncs, update `lastSyncedAt`, and record `AccountingSyncRun` results.
- [ ] 3.3 Add QuickBooks-specific status and balance mapping so paid, partially paid, voided, and otherwise closed invoices affect reminder eligibility correctly.
- [ ] 3.4 Apply bounded exponential backoff and non-concurrent sync guards to QuickBooks sync operations using the existing accounting sync patterns.

## 4. Webhooks And Retry Handling

- [ ] 4.1 Create `/api/webhooks/quickbooks` with signature verification and early rejection of invalid deliveries.
- [ ] 4.2 Persist accepted QuickBooks webhook deliveries with pending, processed, and failed states plus sanitised error summaries.
- [ ] 4.3 Implement idempotent webhook reconciliation that routes invoice and customer events through the canonical QuickBooks sync and mapping logic.
- [ ] 4.4 Add a retry path for failed QuickBooks webhook deliveries and ensure duplicate deliveries do not repeat successful mutations.

## 5. User And Admin Surfaces

- [ ] 5.1 Update the Connections settings UI and related server read models to show QuickBooks as an available provider with connect, sync, disconnect, and recovery states.
- [ ] 5.2 Extend plan-gating checks so QuickBooks follows the existing accounting integration entitlement behavior and upgrade messaging.
- [ ] 5.3 Update admin connection, diagnostics, and audit views to surface QuickBooks connection state and sync health without exposing encrypted credentials or webhook payload secrets.

## 6. Tests, Documentation, And Validation

- [ ] 6.1 Add unit tests for QuickBooks OAuth URL construction, token refresh behavior, invoice and customer field mapping, and webhook signature verification.
- [ ] 6.2 Add mocked route or integration tests for QuickBooks connect, callback, disconnect, manual sync, and webhook ingestion flows.
- [ ] 6.3 Update architecture and API documentation to reflect QuickBooks support, webhook delivery persistence, and any new routes or environment variables.
- [ ] 6.4 Run focused validation with lint, targeted tests, and build checks for the new QuickBooks surfaces before enabling the provider.
