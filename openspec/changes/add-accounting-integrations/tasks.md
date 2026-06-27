## 1. Research & Validation

- [x] 1.1 Confirm MYOB Business OAuth 2.0 granular scope identifiers that replace the deprecated `CompanyFile` scope (OQ-1 from design.md) — document in design.md
- [x] 1.2 Confirm Xero `modifiedAfter` incremental sync parameter name and format (OQ-2) — update design.md and invoice-sync spec accordingly
- [x] 1.3 Verify whether MYOB Business cloud API supports any form of webhook/event push (OQ-3)
- [x] 1.4 Evaluate `xero-node` npm package compatibility with current Xero Accounting API (OQ-4) — decide raw fetch vs SDK and document decision in design.md
- [x] 1.5 Confirm whether MYOB AccountRight Live API and MYOB Business cloud API share the same OAuth endpoint (OQ-5)
- [x] 1.6 Confirm exact field names and structure of Xero `/connections` response for tenant/org selection (OQ-6)
- [x] 1.7 Confirm MYOB Sale/Invoice endpoint field names for amount, balance due, due date, and status (OQ-2 / OQ-5 follow-up)

## 2. Database Schema

- [x] 2.1 Add `AccountingConnection` model to `prisma/schema.prisma` with fields: `id`, `userId`, `provider` (`xero`|`myob`), `organisationId`, `organisationName`, `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiresAt`, `scopes`, `status` (`active`|`disconnected`|`revoked`|`error`), `lastSyncedAt`, `createdAt`, `updatedAt`
- [x] 2.2 Add `AccountingSyncRun` model to `prisma/schema.prisma` with fields: `id`, `accountingConnectionId`, `provider`, `userId`, `startedAt`, `completedAt`, `status` (`success`|`partial`|`failed`), `invoicesCreated`, `invoicesUpdated`, `invoicesSkipped`, `errorMessage`
- [x] 2.3 Add `ProviderInvoiceMapping` model to `prisma/schema.prisma` with fields: `id`, `trackedInvoiceId`, `accountingConnectionId`, `providerInvoiceId`, `providerUpdatedAt`, `providerMetadata` (Json), `createdAt`, `updatedAt`; add `@@unique([providerInvoiceId, accountingConnectionId])`
- [x] 2.4 Add `ProviderContactMapping` model to `prisma/schema.prisma` with fields: `id`, `accountingConnectionId`, `providerContactId`, `contactName`, `contactEmail`, `providerMetadata` (Json), `createdAt`, `updatedAt`; add `@@unique([providerContactId, accountingConnectionId])`
- [x] 2.5 Add `OauthState` model to `prisma/schema.prisma` with fields: `id`, `userId`, `provider`, `nonce`, `expiresAt`, `createdAt`; add `@@unique([nonce])`
- [x] 2.6 Add nullable `providerMetadata` (Json) column to the `TrackedInvoice` model in `prisma/schema.prisma`
- [x] 2.7 Run `npx prisma migrate dev --name add-accounting-integrations` to generate the migration file
- [x] 2.8 Add RLS policies for `accounting_connections`, `accounting_sync_runs`, `provider_invoice_mappings`, `provider_contact_mappings`, and `oauth_states` to `prisma/rls-policies.sql` (users can only read/write their own rows; admin bypass for cron context)
- [x] 2.9 Run `npm run verify-rls` and confirm all new tables pass isolation checks

## 3. Token Encryption Utility

- [x] 3.1 Create `lib/providers/accounting/crypto.ts` with `encryptToken(plaintext: string): string` and `decryptToken(ciphertext: string): string` using AES-256-GCM and `TOKEN_ENCRYPTION_KEY`; add TODO comment for key rotation
- [x] 3.2 Write unit tests in `tests/accounting-crypto.test.ts` for encrypt/decrypt roundtrip and that `encryptToken` never returns plaintext input
- [x] 3.3 Add `TOKEN_ENCRYPTION_KEY` to `docs/runbooks/README.md` environment variable matrix

## 4. AccountingProvider Abstraction

- [x] 4.1 Create `lib/providers/accounting/types.ts` defining the `AccountingProvider` interface with methods: `getAuthorizationUrl(state: string): string`, `exchangeCodeForTokens(code: string): Promise<TokenSet>`, `refreshTokens(refreshToken: string): Promise<TokenSet>`, `revokeToken(accessToken: string): Promise<void>`, `getOrganisations(accessToken: string): Promise<Organisation[]>`, `getInvoices(accessToken: string, orgId: string, modifiedAfter?: Date): Promise<ProviderInvoice[]>`, `getContacts(accessToken: string, orgId: string, contactIds: string[]): Promise<ProviderContact[]>`
- [x] 4.2 Define `TokenSet`, `Organisation`, `ProviderInvoice`, and `ProviderContact` types in `lib/providers/accounting/types.ts`
- [x] 4.3 Create `lib/providers/accounting/index.ts` with a `getAccountingProvider(providerName: string): AccountingProvider` factory function

## 5. Xero Provider Implementation

- [x] 5.1 Create `lib/providers/accounting/xero.ts` implementing `AccountingProvider` for Xero
- [x] 5.2 Implement `getAuthorizationUrl` with scopes: `accounting.transactions.read accounting.contacts.read openid profile email offline_access`
- [x] 5.3 Implement `exchangeCodeForTokens` calling `https://identity.xero.com/connect/token`
- [x] 5.4 Implement `refreshTokens` calling `https://identity.xero.com/connect/token` with `grant_type=refresh_token`
- [x] 5.5 Implement `revokeToken` calling `https://identity.xero.com/connect/revocation`
- [x] 5.6 Implement `getOrganisations` calling `https://api.xero.com/connections` and returning tenant list
- [x] 5.7 Implement `getInvoices` calling `GET https://api.xero.com/api.xro/2.0/Invoices` with `Xero-Tenant-Id` header; support `modifiedAfter` parameter; paginate results; handle 429 with `Retry-After`
- [x] 5.8 Implement `getContacts` calling `GET https://api.xero.com/api.xro/2.0/Contacts` with contact ID filter
- [x] 5.9 Implement Xero field mapping to `ProviderInvoice` and `ProviderContact` types
- [x] 5.10 Add `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` to `docs/runbooks/README.md`
- [x] 5.11 Write unit tests in `tests/xero-provider.test.ts` with mocked fetch responses for each method

## 6. MYOB Provider Implementation

- [x] 6.1 Create `lib/providers/accounting/myob.ts` implementing `AccountingProvider` for MYOB Business
- [x] 6.2 Implement `getAuthorizationUrl` with confirmed granular scopes (from task 1.1)
- [x] 6.3 Implement `exchangeCodeForTokens` calling the MYOB OAuth token endpoint (TODO: confirm URL from MYOB developer portal)
- [x] 6.4 Implement `refreshTokens` using the MYOB refresh endpoint
- [x] 6.5 Implement `revokeToken` (TODO: confirm whether MYOB supports token revocation endpoint)
- [x] 6.6 Implement `getOrganisations` fetching available company files from MYOB
- [x] 6.7 Implement `getInvoices` calling the MYOB Business Sale/Invoice endpoint with `$filter` for modified date; paginate results; handle rate limits
- [x] 6.8 Implement `getContacts` calling the MYOB Customer/Contact endpoint
- [x] 6.9 Implement MYOB field mapping to `ProviderInvoice` and `ProviderContact` types
- [x] 6.10 Add `MYOB_CLIENT_ID`, `MYOB_CLIENT_SECRET`, `MYOB_REDIRECT_URI` to `docs/runbooks/README.md`
- [x] 6.11 Write unit tests in `tests/myob-provider.test.ts` with mocked fetch responses for each method

## 7. OAuth Connection Lifecycle Routes

- [x] 7.1 Create `app/api/integrations/[provider]/connect/route.ts` — validates session, checks `accountingIntegrations` feature flag, generates state nonce, stores in `oauth_states`, redirects to provider auth URL
- [x] 7.2 Create `app/api/integrations/[provider]/callback/route.ts` — validates `state` against `oauth_states`, exchanges code for tokens, encrypts tokens, fetches organisations, stores `accounting_connections` row (or redirects to org selection)
- [x] 7.3 Create `app/api/integrations/[provider]/select-org/route.ts` (POST) — receives selected org ID after multi-org callback, finalises `accounting_connections` row, triggers first sync
- [x] 7.4 Create `app/api/integrations/[provider]/disconnect/route.ts` (POST) — validates session, calls `revokeToken` (best-effort), marks connection `status = 'disconnected'`, transitions active invoices to `paused`
- [x] 7.5 Add `NEXT_PUBLIC_XERO_REDIRECT_URI` and `NEXT_PUBLIC_MYOB_REDIRECT_URI` environment entries to `docs/runbooks/README.md` if redirect URIs need to be known client-side (otherwise keep server-only)

## 8. Sync Orchestrator

- [x] 8.1 Create `lib/providers/accounting/sync.ts` with `syncConnection(connectionId: string): Promise<SyncResult>` that orchestrates token refresh, invoice fetch, contact fetch, upsert of `TrackedInvoice` + `ProviderInvoiceMapping` + `ProviderContactMapping`, and writes `AccountingSyncRun`
- [x] 8.2 Implement idempotent upsert for `TrackedInvoice` using `externalId + provider + userId` unique constraint (Prisma `upsert`)
- [x] 8.3 Implement invoice status mapping logic: Xero `AUTHORISED` → `pending`, Xero `PAID` → `paid`, Xero `VOIDED`/`DELETED` → `manually_resolved`; MYOB equivalents (TODO: confirm status values from task 1.7)
- [x] 8.4 Implement reminder cancellation: when a `TrackedInvoice` transitions to `paid` or `manually_resolved`, clear `nextEmailAt` and `currentStage`
- [x] 8.5 Implement incremental sync: pass `modifiedAfter = connection.lastSyncedAt` on non-first syncs
- [x] 8.6 Implement `syncAllActiveConnections(): Promise<void>` that iterates all `accounting_connections` with `status = 'active'` and calls `syncConnection` for each
- [x] 8.7 Implement exponential backoff retry (max 3 attempts, delays: 2s, 8s, 32s) for provider API calls within `syncConnection`
- [x] 8.8 Implement concurrent sync guard: check for an in-progress `AccountingSyncRun` for the same connection before starting; skip if found
- [x] 8.9 Write unit tests in `tests/accounting-sync.test.ts` with mocked provider and DB calls covering: first sync, incremental sync, paid invoice cancellation, voided invoice cancellation, error recording

## 9. Cron Route for Accounting Sync

- [x] 9.1 Create `app/api/cron/sync-accounting/route.ts` — verify `Authorization: Bearer CRON_SECRET`, call `syncAllActiveConnections()`, return summary JSON
- [x] 9.2 Add `{ "path": "/api/cron/sync-accounting", "schedule": "0 2 * * *" }` to `vercel.json` crons array
- [x] 9.3 Add `sync-accounting` route to `docs/DDD.md` API routes section

## 10. Manual Sync Route

- [x] 10.1 Create `app/api/integrations/[provider]/sync/route.ts` (POST) — validates user session, looks up `accounting_connections` row by provider and verifies ownership, calls `syncConnection(connectionId)`, returns sync result

## 11. Plan Feature Gate

- [x] 11.1 Add `accountingIntegrations: boolean` to the feature flags type in `lib/subscriptionPlans.ts`
- [x] 11.2 Set `accountingIntegrations: false` for `starter`/`free` tier and `true` for `solo`/`small_business` tier in `lib/subscriptionPlans.ts`
- [x] 11.3 Add test in `tests/subscription-plans.test.ts` verifying `hasPlanFeature` returns correct values for `accountingIntegrations` across all tiers

## 12. Settings UI

- [x] 12.1 Create `components/settings/AccountingConnectionsClient.tsx` — displays connected providers, last sync time, sync status, "Sync now" button, "Disconnect" button; shows upgrade prompt for Starter tier
- [x] 12.2 Create `app/dashboard/settings/integrations/page.tsx` — server component that fetches active connections and renders `AccountingConnectionsClient`
- [x] 12.3 Add "Integrations" link to the settings navigation
- [x] 12.4 Implement org/company selection UI for multi-org callback flow
- [x] 12.5 Implement revoked connection warning banner in the dashboard layout
- [x] 12.6 Implement sync history table (last 5 runs per connection) in `AccountingConnectionsClient`

## 13. Housekeeping & Security

- [x] 13.1 Add `oauth_states` TTL cleanup to the accounting sync cron: delete rows where `expiresAt < now()`
- [x] 13.2 Verify no access tokens or refresh tokens appear in any route response body or server logs (code review checklist item)
- [x] 13.3 Verify `clientEmail` from synced invoices is not logged to stdout/stderr in sync orchestrator

## 14. Documentation

- [x] 14.1 Update `docs/DDD.md` to document the five new database tables (`accounting_connections`, `accounting_sync_runs`, `provider_invoice_mappings`, `provider_contact_mappings`, `oauth_states`) and the `providerMetadata` column on `tracked_invoices`
- [x] 14.2 Update `docs/DDD.md` API routes section with all new routes from tasks 7.1–7.4, 9.1, 10.1
- [x] 14.3 Update `docs/runbooks/README.md` with all new environment variables from tasks 3.3, 5.10, 6.10
- [x] 14.4 Update `docs/HLD.md` to reflect the new `AccountingProvider` abstraction and pull-based sync architecture

## 15. MYOB API Correctness Fixes

Identified during post-implementation review against live MYOB developer documentation.

- [x] 15.1 Add missing `x-myobapi-key: ${clientId}` header to `_fetchInvoiceType` in `lib/providers/accounting/myob.ts` — required by MYOB for all authenticated API calls; its absence will cause 401s against real company files
- [x] 15.2 Add missing `x-myobapi-version: v2` header to `_fetchInvoiceType` in `lib/providers/accounting/myob.ts` — required by MYOB API; undocumented behaviour without it
- [x] 15.3 Add the same two headers (`x-myobapi-key`, `x-myobapi-version: v2`) to the `getContacts` method in `lib/providers/accounting/myob.ts`
- [x] 15.4 Fix company file name derivation in `app/api/integrations/myob/callback/route.ts`: `businessId.split("/").pop()` returns `""` for trailing-slash URIs — call `GET https://api.myob.com/accountright/` after token exchange to find the matching company file name by URI; fall back to the GUID if the call fails
- [x] 15.5 Fix token expiry during long sync runs in `lib/providers/accounting/sync.ts`: the access token is refreshed once at the start of `syncConnection` but MYOB tokens expire in 20 minutes — if a sync spans multiple invoice type fetches that exceed the token lifetime, the connection is incorrectly marked `revoked`; check and refresh the token between `MYOB_INVOICE_TYPES` iterations in `_fetchInvoiceType` or pass a token-refresh callback into the provider
- [x] 15.6 Clarify the `x-myobapi-cftoken: ""` comment in `_fetchInvoiceType` — update to document that empty string is intentional for online/cloud company files (MYOB Business); desktop/AccountRight Live files require `Base64(username:password)` but are out of scope for PaidSoon
- [ ] 15.7 End-to-end integration test against a real MYOB developer sandbox: verify all 5 invoice types are accessible under `sme-sales` scope, confirm `BalanceDue` field is present and correct, confirm `x-myobapi-key` and `x-myobapi-version` headers resolve the 401
