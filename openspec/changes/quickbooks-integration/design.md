# QuickBooks Integration Design

## Context

See proposal.md for motivation. The repository already has a shared accounting integration stack for Xero and MYOB Business: `AccountingConnection`, `AccountingSyncRun`, provider invoice/contact mappings, encrypted token helpers, accounting sync cron orchestration, provider-specific connect/callback/disconnect/sync routes, and a Connections settings UI. QuickBooks should extend those shared primitives rather than introducing a parallel integration model.

The user-provided outline assumes a dedicated `quickbooks_integration` table and standalone CRUD routes. In this codebase, the equivalent behavior belongs in the existing shared accounting data model and route conventions. The main missing pieces are QuickBooks-specific provider support, webhook delivery persistence, and the user/admin surfaces needed to operate the new provider.

## Goals / Non-Goals

**Goals:**

- Add QuickBooks Online as another supported `AccountingConnection.provider` value using the current shared accounting integration architecture.
- Support OAuth connection, token refresh, disconnect, manual sync, scheduled sync, and webhook-triggered reconciliation for QuickBooks companies.
- Reuse existing encrypted token storage, sync history, connection status, and plan-gating patterns.
- Persist accepted QuickBooks webhook deliveries so retries and audit visibility do not depend on provider replays.
- Keep user-facing reads under RLS and continue using privileged cron/webhook contexts only where the repo already permits them.

**Non-Goals:**

- Building a separate QuickBooks-only persistence model when shared accounting tables already exist.
- Introducing write-back behavior to QuickBooks such as invoice creation, customer updates, or payment posting.
- Replacing the current Xero or MYOB integrations, or redesigning the existing accounting sync framework.
- Generalising every existing webhook flow in the product into a single platform-wide event bus.

## Decisions

### D1. Extend the shared accounting connection model instead of adding `quickbooks_integration`

**Decision:** Store QuickBooks companies in the existing `accounting_connections` table with `provider = 'quickbooks'`, reusing `AccountingSyncRun`, `ProviderInvoiceMapping`, `ProviderContactMapping`, and `OauthState`.

**Rationale:** The current data model already captures the lifecycle QuickBooks needs: user ownership, provider-scoped organisation/company identity, encrypted access and refresh tokens, last successful sync state, and per-connection sync history. A dedicated QuickBooks table would duplicate logic, fragment admin and settings surfaces, and force future provider support into one-off models.

**Alternative considered:** Create the table shape from the input brief exactly as `quickbooks_integration`. Rejected because it conflicts with the codebase's existing generalised accounting architecture and would require duplicated route, UI, sync, and RLS handling.

### D2. Implement `QuickBooksProvider` beside Xero and MYOB

**Decision:** Add a QuickBooks provider implementation under `lib/providers/accounting/` that satisfies the existing `AccountingProvider` interface and is discoverable through the shared provider factory.

**Rationale:** This keeps OAuth, token refresh, invoice/customer fetches, and provider-specific response mapping isolated to one provider module while preserving the current orchestrator and tests. It also lets user-facing routes remain thin wrappers around shared connection and sync logic.

**Alternative considered:** Add QuickBooks-specific fetch logic directly in route handlers. Rejected because it would bypass the accounting provider abstraction that already exists and would make testing, retries, and future maintenance much harder.

### D3. Model QuickBooks company identity with the callback company identifier

**Decision:** Treat the QuickBooks company identifier returned during OAuth callback as the shared organisation identifier stored on the accounting connection.

**Rationale:** QuickBooks Online authorisation scopes a connection to one company realm at a time, so the callback identifier is the canonical tenant key for subsequent API and webhook reconciliation. Reusing the existing `organisationId` field avoids schema sprawl while keeping provider-specific semantics inside the provider module.

**Alternative considered:** Add dedicated QuickBooks company columns alongside `organisationId`. Rejected because the existing field already serves this purpose for provider-specific tenant identifiers.

### D4. Persist accepted webhook deliveries in a provider-aware event table

**Decision:** Add persistent webhook delivery storage for accepted QuickBooks webhook payloads with provider, delivery identifier, event type summary, processing status (`pending`, `processed`, `failed`), sanitised error state, and timestamps.

**Rationale:** QuickBooks webhook handling must survive transient failures and duplicate deliveries without losing the original payload. Persisting deliveries before reconciliation gives the system retry capability and audit visibility without forcing synchronous end-to-end processing inside the webhook request.

**Alternative considered:** Handle webhooks inline without persistence. Rejected because it makes retries dependent on provider replay behavior, weakens observability, and increases the chance of dropped changes during transient outages.

### D5. Reconcile webhooks through the same canonical mapping paths as pull sync

**Decision:** QuickBooks webhook handlers should not implement a second invoice/customer mapping path. Instead, accepted events should trigger targeted reconciliation through the existing sync and mapping primitives for the affected company and entities.

**Rationale:** One mapping path prevents drift between pull-based sync and event-driven updates. QuickBooks webhooks then become a near-real-time hint that tells the system what to refresh, not a separate source of record-shaping truth.

**Alternative considered:** Parse webhook payloads directly into `TrackedInvoice` mutations. Rejected because webhook payloads and query payloads can diverge, and duplicated mapping rules would create consistency bugs.

### D6. Keep security boundaries aligned with existing repo rules

**Decision:** User-facing connection and manual sync routes continue to derive the user from Supabase auth and use RLS-scoped reads for owned connection metadata. Privileged mutation paths that run without a user session, such as cron and webhook processing, continue to use the existing admin context only where necessary.

**Rationale:** This follows the repository's established security model instead of inventing a second access-control strategy for one provider. It also keeps QuickBooks behavior aligned with existing audit and diagnostics patterns.

**Alternative considered:** Use admin context in all QuickBooks routes for simplicity. Rejected because it would unnecessarily bypass RLS in user-facing flows.

### D7. Reuse the existing retry policy and add provider-specific rate-limit handling

**Decision:** QuickBooks sync and webhook-triggered fetches should use the existing bounded retry strategy for transient failures, while also honoring QuickBooks-specific retry hints where present.

**Rationale:** The current accounting sync model already distinguishes transient failures from revoked credentials. Reusing that framework keeps operational behavior consistent across providers and limits custom error-handling code.

**Alternative considered:** Introduce a bespoke QuickBooks retry subsystem. Rejected because the repo already has the right abstraction point in accounting sync orchestration.

## Risks / Trade-offs

- [Webhook payload volume and duplicates] -> Persist deliveries before reconciliation and deduplicate by provider delivery identity plus affected entity metadata where available.
- [Provider-specific mapping gaps] -> Keep all QuickBooks field translation in the provider module and cover invoice, customer, and payment-state rules with focused unit tests.
- [Credential revocation or token refresh drift] -> Mark the connection degraded immediately on unrecoverable auth failures and surface reconnect actions in the existing Connections UI.
- [Route and UI branching for another provider] -> Reuse shared connection view models and provider registries instead of hard-coding provider-specific switch blocks in multiple places.
- [Schema creep from provider-specific needs] -> Prefer shared columns and provider metadata JSON where behavior does not require first-class relational fields.

## Migration Plan

1. Extend shared accounting configuration and provider registries to recognise `quickbooks` as a supported provider.
2. Add any missing Prisma fields or tables needed for QuickBooks delivery persistence and provider-specific metadata, then generate a migration and matching RLS policy updates.
3. Add QuickBooks environment variables to the runbook and deployment environments, including OAuth credentials and the webhook verifier secret.
4. Implement provider logic, connection routes, and targeted webhook reconciliation behind the shared accounting abstractions.
5. Update connections UI, admin read models, and diagnostics surfaces to enumerate QuickBooks safely.
6. Validate with unit tests, mocked route/integration tests, lint, and build before enabling the provider in production.
