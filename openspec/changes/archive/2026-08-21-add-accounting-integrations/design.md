## Context

PaidSoon currently tracks invoices sourced exclusively from Stripe Connect. The existing
`InvoiceProvider` abstraction in `lib/providers/` covers fetching and webhook-parsing for
Stripe. The `TrackedInvoice` model uses `externalId + provider + userId` as its idempotency
key, and `InvoiceConnection` records which provider account is associated with a user.

Accounting integrations (Xero, MYOB) introduce a fundamentally different data-flow:

- **Pull-based, not push-based.** Accounting APIs do not deliver invoice events in real time
  (webhooks exist in Xero but are limited; MYOB has none at MVP scope). The primary sync
  strategy is scheduled polling plus manual trigger.
- **OAuth 2.0 with organisation/company selection.** Users may have multiple Xero
  organisations or MYOB company files. The system must handle multi-tenant token scoping.
- **Read-only at MVP.** PaidSoon never creates or modifies invoices in the provider. It only
  reads and maps.
- **Token lifecycle is user-owned.** Users may revoke consent from within Xero/MYOB at any
  time. The system must detect and surface this gracefully.

The existing `InvoiceProvider` interface is designed for push/webhook providers. Accounting
providers are pull/polling providers — a distinct contract. Rather than shoehorning them into
the same interface, this design introduces a parallel `AccountingProvider` abstraction.

## Goals / Non-Goals

**Goals:**

- Introduce an `AccountingProvider` interface alongside (not replacing) the existing
  `InvoiceProvider` interface
- Support Xero and MYOB Business as the first two `AccountingProvider` implementations
- Store OAuth tokens encrypted at rest; refresh transparently before expiry
- Support multi-organisation / multi-company-file selection per user per provider
- Sync invoices (unpaid, overdue, partially paid, paid, voided) on a daily schedule and on
  user demand
- Map provider invoice data into `TrackedInvoice` records idempotently
- Detect paid/voided invoices and suppress or cancel reminder sequences accordingly
- Record sync run history and surface provider errors to the user in the UI
- Gate accounting integrations behind the Solo tier and above

**Non-Goals:**

- Invoice creation or modification in Xero or MYOB
- Payment recording in Xero or MYOB
- Xero webhooks (designed as future enhancement)
- MYOB webhooks (no webhook support in MYOB Business API as of design date — TODO: verify
  with MYOB developer portal)
- Migrating or deprecating the existing `InvoiceProvider` / Stripe Connect flow
- Supporting legacy MYOB AccountRight desktop API (target is MYOB Business cloud API only —
  TODO: confirm whether AccountRight Live API shares the same OAuth endpoint)
- Multi-user org sharing within a single PaidSoon account (future)

## Decisions

### D1 — Separate `AccountingProvider` abstraction, not merged with `InvoiceProvider`

**Decision:** Define a new `AccountingProvider` interface in `lib/providers/accounting/`.
Do not modify `InvoiceProvider`.

**Rationale:** The two contracts are fundamentally different. `InvoiceProvider` is
event-driven (webhooks); `AccountingProvider` is poll-driven (fetch all + delta). Merging
them would add optional/nullable fields and conditional logic that reduces type-safety and
makes each implementation harder to reason about.

**Alternative considered:** Single unified `Provider` interface with a `supportsWebhooks`
flag. Rejected: causes method signatures to be conditionally meaningful, losing the
correctness guarantees of TypeScript's structural typing.

### D2 — `accounting_connections` table instead of extending `InvoiceConnection`

**Decision:** Introduce a new `accounting_connections` table rather than repurposing
`InvoiceConnection`.

**Rationale:** `InvoiceConnection` is tightly coupled to Stripe Connect semantics
(one account ID, one connection per user). Accounting connections require: per-organisation
rows, encrypted OAuth tokens (access + refresh), expiry timestamps, scopes, and sync state.
Extending `InvoiceConnection` would bloat it with nullable accounting-specific columns that
are meaningless for Stripe.

**Alternative considered:** JSON `metadata` blob on `InvoiceConnection`. Rejected: untyped,
not queryable, and makes index-based deduplication impossible.

### D3 — Token encryption with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`

**Decision:** Encrypt access and refresh tokens using AES-256-GCM before writing to
`accounting_connections`. Decrypt in-memory at use time in `lib/providers/accounting/`.

**Rationale:** Supabase Postgres is the storage layer. RLS prevents cross-user reads, but
defence-in-depth requires that a DB credential leak or SQL injection does not expose raw
OAuth tokens.

**Key management:** `TOKEN_ENCRYPTION_KEY` is a 32-byte hex secret stored in Vercel
environment variables (never committed). Rotation requires a background re-encryption job
(out of scope for MVP — add TODO).

**Alternative considered:** Supabase Vault (transparent column encryption). Not yet GA and
adds Supabase vendor lock-in for a security primitive. Revisit when GA.

### D4 — PKCE + `oauth_states` table for CSRF protection on OAuth callbacks

**Decision:** Store a per-connection `state` nonce in an `oauth_states` table with a 10-
minute TTL. On callback, verify the `state` param matches and delete the row.

**Rationale:** The OAuth callback endpoint is unauthenticated (Xero/MYOB redirect back
without a session cookie). A stateless approach (HMAC-signed state param) is also viable but
requires a fixed signing key. The DB-backed nonce is simpler to audit and rotate.

**Alternative considered:** HMAC-signed `state` JWT. Viable but adds complexity for MVP.
Revisit if `oauth_states` cleanup becomes a maintenance burden.

### D5 — `provider_invoice_mappings` table for provider ↔ PaidSoon ID correlation

**Decision:** Introduce `provider_invoice_mappings` to store the relationship between a
provider invoice ID and a `TrackedInvoice.id`, alongside provider-specific metadata (JSON).

**Rationale:** `TrackedInvoice.externalId + provider` already provides idempotency. The
mapping table adds: (a) a place to store provider-specific fields without polluting
`TrackedInvoice`; (b) a record of the last provider-side `updatedAt` to support incremental
sync without fetching the full list every time; (c) a foreign key to
`accounting_connections` to know which organisation the invoice came from.

### D6 — Incremental sync using provider `updatedSince` / `modifiedAfter` parameter

**Decision:** On scheduled syncs after the first sync, pass `modifiedAfter = lastSyncedAt`
to provider APIs to fetch only changed invoices.

**Rationale:** Reduces API quota consumption and avoids re-processing thousands of invoices
daily.

**Xero (confirmed):** Xero's `/Invoices` endpoint uses the HTTP header `If-Modified-Since`
with format `yyyy-mm-ddThh:mm:ss` (UTC). This is **not** a query parameter. Example:
`If-Modified-Since: 2024-01-01T00:00:00`

**MYOB (confirmed):** MYOB Sale/Invoice endpoints support OData `$filter` with `LastModified`
field. Example: `GET {cf_uri}/Sale/Invoice/Service?$filter=LastModified gt datetime'2024-01-01T00:00:00'`
This applies to Service, Item, Professional, TimeBilling, and Miscellaneous invoice types.

**Fallback:** If incremental sync fails or is not supported for a resource type, fall back to
full re-fetch and upsert idempotently.

### D7 — Vercel Cron for scheduled sync, separate cron entry from email send

**Decision:** Add a new cron entry in `vercel.json` at `0 2 * * *` (02:00 UTC) calling
`/api/cron/sync-accounting`. This is separate from the existing `0 9 * * *` email send cron.

**Rationale:** Decoupled execution prevents a slow or failing accounting sync from delaying
the daily email send. Separate routes allow independent CRON_SECRET verification and
monitoring.

### D8 — Separate `AccountingProvider` from `InvoiceProvider` for sync orchestration

**Decision:** The sync orchestrator (`lib/providers/accounting/sync.ts`) calls
`AccountingProvider` methods and writes to the DB using `prismaAdmin` (cron context).

**Rationale:** Sync runs in a background cron context, not a user request context. Using
`prismaAdmin` is the established pattern (see `app/api/cron/send-emails/route.ts`). The
manual sync trigger route (`/api/integrations/[provider]/sync`) verifies the user session,
then calls the same orchestrator.

### D9 — MYOB scope strategy — granular scopes confirmed

**Decision:** Use MYOB's granular scopes. The confirmed scopes for PaidSoon's read-only
invoice + contact access are:
- `sme-sales` — access to Sale/Invoice endpoints (all invoice types)
- `sme-contacts-customer` — access to Contact/Customer endpoint

Do NOT request `sme-company-file` (legacy broad scope) or any payroll/banking/payroll scopes.

**Resolved (OQ-1):** Granular scope names confirmed from MYOB developer portal
(https://developer.myob.com/api/myob-business-api/api-overview/granular_data_scopes/).
The `CompanyFile` scope deprecation refers to the legacy broad scope — the new granular
`sme-*` scopes are the replacement and are available now.

### D10 — Unified Connections settings route with backward-compatible redirects

**Decision:** Introduce `/dashboard/settings/connections` as the canonical settings page for
all external provider setup. Replace separate top-level tabs ("Stripe Connection" and
"Integrations") with a single "Connections" tab. Keep legacy URLs operational via redirects:

- `/dashboard/settings/stripe` → `/dashboard/settings/connections`
- `/dashboard/settings/integrations` → `/dashboard/settings/connections`

All redirects must preserve query parameters to keep existing OAuth callback flows and saved
bookmarks functional.

**Rationale:** Users conceptualise provider setup as one job ("connect my systems"), not two
separate destinations. A unified page reduces navigation branching and removes ambiguity about
where to connect Stripe vs accounting providers.

**Compatibility notes:** Existing API routes currently hardcode callback redirect targets to
legacy settings URLs. During implementation, update those targets to the canonical route and
leave legacy URL redirects in place to avoid breaking in-flight OAuth authorisations.

**Alternative considered:** Keep separate tabs and add cross-links. Rejected: still creates a
split mental model and does not reduce callback-path coupling.

### D11 — MYOB sandbox verification is a manual pre-archive QA gate

**Decision:** Keep real MYOB developer sandbox verification as a manual QA gate outside CI,
required before archive sign-off for this change.

**Rationale:** The repo test suite intentionally avoids live third-party dependencies. MYOB
end-to-end validation depends on credentials, tenant state, and provider availability that are
not suitable for deterministic CI execution.

**Validation evidence:** Archive readiness requires timestamped, redacted sandbox evidence
showing all five MYOB invoice types, expected `BalanceDue` presence, and successful requests
with required `x-myobapi-key` / `x-myobapi-version` headers.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Xero rate limits (60 req/min per connection, 5000 req/day per app) | Implement exponential backoff; cache connection token for duration of sync run; batch invoice fetches; log rate-limit hits to `accounting_sync_runs` |
| MYOB API rate limits (access token expires in 20 min) | Refresh token proactively before sync runs; MYOB token endpoint: `https://secure.myob.com/oauth2/v1/authorize` |
| Token refresh race condition (two cron invocations overlap) | Use DB-level advisory lock or `SELECT FOR UPDATE` on `accounting_connections` row during token refresh; alternatively, short-circuit if `tokenExpiresAt > now() + 5 minutes` |
| MYOB company file migration (legacy → cloud API) | Only target MYOB Business cloud API; document clearly that AccountRight desktop is out of scope |
| Xero org deauthorisation between syncs | On 401 from Xero, mark connection `status = 'revoked'`, surface banner to user in dashboard |
| `TOKEN_ENCRYPTION_KEY` rotation | Rotation requires re-encrypting all rows. Design a migration script but leave it as a future task with a TODO comment in `lib/providers/accounting/crypto.ts` |
| MYOB scope deprecation (1 Sep 2026) | Do not use `CompanyFile` scope; verify granular scope list before implementation |
| Sync job timeout on large invoice lists | Paginate all provider calls; set Vercel function `maxDuration` for the sync route; process connections in batches |

## Migration Plan

1. **Schema migration**: `npx prisma migrate dev --name add-accounting-integrations` — adds
   `accounting_connections`, `accounting_sync_runs`, `provider_invoice_mappings`,
   `provider_contact_mappings`, `oauth_states`; adds `providerMetadata` Json column to
   `tracked_invoices`.
2. **RLS policies**: Add policies to `prisma/rls-policies.sql` for all new tables. Run
   `npm run verify-rls` before merging.
3. **Environment variables**: Add `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`,
   `XERO_REDIRECT_URI`, `MYOB_CLIENT_ID`, `MYOB_CLIENT_SECRET`, `MYOB_REDIRECT_URI`,
   `TOKEN_ENCRYPTION_KEY` to Vercel environment and `docs/runbooks/README.md`.
4. **Vercel Cron**: Add `{ "path": "/api/cron/sync-accounting", "schedule": "0 2 * * *" }`
   to `vercel.json`.
5. **No backfill required**: Existing `TrackedInvoice` records are Stripe-sourced; accounting
   connections are new user actions. First sync for each new connection produces fresh records.
6. **Rollback**: Revert migration; remove env vars; remove cron entry. No destructive effect
   on existing data (new tables only, plus a nullable column on `tracked_invoices`).

## Open Questions — RESOLVED

All original open questions have been resolved via official API documentation review:

- **OQ-1 (MYOB scopes) — RESOLVED**: Granular scopes are `sme-sales` (invoices) and
  `sme-contacts-customer` (contacts). Do NOT use `sme-company-file` or `CompanyFile`. See D9.
- **OQ-2 (Xero incremental sync) — RESOLVED**: Use `If-Modified-Since` HTTP header (not a
  query param). Format: `yyyy-mm-ddThh:mm:ss` UTC. See D6.
- **OQ-3 (MYOB webhooks) — RESOLVED**: MYOB Business API has no webhook support. Pull-based
  polling is the only option. Design proceeds as planned.
- **OQ-4 (xero-node SDK) — DECISION**: Use raw `fetch` against Xero API endpoints. No SDK
  dependency added. Raw fetch gives full control over headers and avoids SDK versioning risk.
- **OQ-5 (MYOB AccountRight vs Business) — RESOLVED**: The MYOB Business API supports both
  AccountRight and new Essentials/MYOB Business cloud files via the same OAuth endpoint
  (`https://secure.myob.com/`). The `businessId` returned in the OAuth callback IS the
  `cf_uri` used in all subsequent API calls (e.g., `https://ar1.api.myob.com/accountright/{uuid}`).
- **OQ-6 (Xero connections response) — RESOLVED**: Fields are `id`, `authEventId`,
  `tenantId`, `tenantType`, `tenantName`, `createdDateUtc`, `updatedDateUtc`. Use `tenantId`
  as the organisation identifier on all API calls via `Xero-tenant-id` header. `tenantType`
  is `ORGANISATION` for accounting tenants.
- **OQ-7 (Token encryption key) — RESOLVED**: AES-256-GCM requires a 32-byte key.
  `TOKEN_ENCRYPTION_KEY` should be a 64-character hex string (32 bytes hex-encoded).

## Confirmed API Details

### Xero
| Item | Value |
|------|-------|
| Auth URL | `https://login.xero.com/identity/connect/authorize` |
| Token URL | `https://identity.xero.com/connect/token` |
| Revocation URL | `https://identity.xero.com/connect/revocation` (POST with `token=<refresh_token>`) |
| Connections URL | `https://api.xero.com/connections` |
| Invoices URL | `https://api.xero.com/api.xro/2.0/Invoices` |
| Contacts URL | `https://api.xero.com/api.xro/2.0/Contacts` |
| Tenant header | `Xero-tenant-id: <tenantId>` |
| Incremental sync | `If-Modified-Since: yyyy-mm-ddThh:mm:ss` header |
| Access token expiry | 30 minutes |
| Refresh token expiry | 60 days |
| Scopes | `openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.payments.read` |
| Pagination | `?page=1&pageSize=250` |
| Disconnect tenant | `DELETE https://api.xero.com/connections/{connectionId}` |

### MYOB Business
| Item | Value |
|------|-------|
| Auth URL | `https://secure.myob.com/oauth2/account/authorize` |
| Token URL | `https://secure.myob.com/oauth2/v1/authorize` (POST) |
| Refresh URL | Same as token URL with `grant_type=refresh_token` |
| Company files | Returned via `businessId` in OAuth callback; format: `https://ar1.api.myob.com/accountright/{uuid}` |
| Invoice URL (Service) | `GET {cf_uri}/Sale/Invoice/Service` |
| Invoice URL (Item) | `GET {cf_uri}/Sale/Invoice/Item` |
| Contacts URL | `GET {cf_uri}/Contact/Customer` |
| Incremental sync | `$filter=LastModified gt datetime'2024-01-01T00:00:00'` query param |
| Access token expiry | 20 minutes (`expires_in: 1200`) |
| Scopes | `sme-sales sme-contacts-customer` |
| Pagination | Default page size 400, max 1000 (`$top`, `$skip`) |
| Invoice key field | `UID` (GUID), `Status`, `BalanceDue`, `TotalAmount`, `Terms.DueDate`, `LastModified` |
