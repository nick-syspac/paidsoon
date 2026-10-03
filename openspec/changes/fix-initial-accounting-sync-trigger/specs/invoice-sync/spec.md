# Spec Delta

## MODIFIED Requirements

### Requirement: System syncs invoices from connected accounting providers on a daily schedule

The system SHALL run a daily cron job at 02:00 UTC that iterates over accounting connections
that are eligible for automated retry, including active connections and connections still
awaiting or retrying their first successful sync (`active`, `pending_first_sync`, or `error`), excluding `revoked` and `disconnected` connections. It SHALL fetch updated invoice, contact,
and payment data from each provider. Each sync run SHALL be recorded in `accounting_sync_runs`
with start time, end time, invoice count, and any errors.

#### Scenario: Daily cron job processes an active connection

- **WHEN** the `/api/cron/sync-accounting` route is triggered by Vercel Cron
- **THEN** for each active `accounting_connections` row, the system fetches invoices modified since the last successful sync, upserts `TrackedInvoice` records, and writes a success entry to `accounting_sync_runs`

#### Scenario: Daily cron job retries a connection awaiting its first successful sync

- **WHEN** the `/api/cron/sync-accounting` route runs and an accounting connection is still awaiting or retrying its first successful sync
- **THEN** the system attempts that connection's sync again instead of waiting for a manual Sync now action

#### Scenario: Daily cron encounters revoked or disconnected access

- **WHEN** the daily cron encounters a connection in `revoked` or `disconnected` state
- **THEN** it excludes that connection from sync attempts until the user reconnects it successfully

#### Scenario: Cron request lacks valid authorisation header

- **WHEN** the `/api/cron/sync-accounting` route is called without a valid `Authorization: Bearer CRON_SECRET` header
- **THEN** the system returns HTTP 401 and does not process any connections

#### Scenario: Provider API is unavailable during cron run

- **WHEN** a provider API call fails with a 5xx response during a cron run
- **THEN** the system retries up to 3 times with exponential backoff, then records a failure entry in `accounting_sync_runs` and continues processing the next connection; it does not abort the entire run

### Requirement: System performs incremental sync after first sync

After the first full sync for a connection, subsequent syncs SHALL only fetch invoices
modified since `lastSyncedAt` (stored on `accounting_connections`). The first sync SHALL be
triggered immediately when the connection is finalised and SHALL fetch all open and recently
closed invoices up to a configurable lookback window (default: 12 months). If incremental
sync is not supported by the provider endpoint, the system SHALL fall back to full re-fetch
with idempotent upsert.

#### Scenario: First sync for a new connection

- **WHEN** a new `accounting_connections` row is created and the first sync runs
- **THEN** the system fetches all invoices with `status IN (AUTHORISED, PAID, VOIDED)` within the last 12 months from the provider and creates or updates canonical financial invoice/contact records and linked `TrackedInvoice` chasing records using existing idempotent ingestion
- **AND** it does not restore the retired `provider_invoice_mappings` table

#### Scenario: First sync is triggered as part of connection finalisation

- **WHEN** a user completes an accounting connection flow and the provider organisation or company file is finalised
- **THEN** the system persists `pending_first_sync` with an unset `lastSyncedAt` and immediately attempts the first-sync trigger without requiring the next daily cron or a manual Sync now action
- **AND** accepted queued work leaves the connection pending until the sync subsystem records its outcome

#### Scenario: Previously connected source is reauthorized

- **WHEN** an existing Xero or MYOB connection is successfully finalized again
- **THEN** the same user/provider/organisation connection is updated, marked `pending_first_sync`, and has `lastSyncedAt` cleared before the immediate sync trigger
- **AND** repeated imports preserve existing invoice ingestion identity rather than creating duplicate financial or chasing records

#### Scenario: First sync attempt fails

- **WHEN** the first sync attempt fails for a reason other than revoked or unauthorized provider credentials
- **THEN** the system records the failed sync run, leaves `lastSyncedAt` unset, and marks the pending connection `error`, eligible for retry by Vercel daily cron or a manual Sync now action

#### Scenario: First sync fails because provider credentials are unauthorized

- **WHEN** the sync subsystem determines that provider credentials are unauthorized after the existing provider-specific retry policy
- **THEN** it records a sanitized failed sync run, leaves `lastSyncedAt` unset, and marks the connection `revoked`
- **AND** neither cron nor manual Sync now retries it until the user successfully reconnects through OAuth

#### Scenario: First sync completes with the existing partial-success outcome

- **WHEN** the first sync completes as `success` or `partial` under the existing sync policy
- **THEN** it preserves the existing promotion to `active`, writes the sync outcome and counts, and updates `lastSyncedAt`

#### Scenario: Incremental sync on subsequent runs

- **WHEN** a sync run starts for a connection that has a non-null `lastSyncedAt`
- **THEN** the system passes `modifiedAfter = lastSyncedAt` to the provider API and only processes the returned delta; `lastSyncedAt` is updated to the current run start time on success

### Requirement: User can trigger a manual sync from the settings UI

The system SHALL provide an authenticated, ownership-checked Sync now action for `active`, `pending_first_sync`, and `error` connections using the same execution policy as immediate connection-finalization sync. It SHALL reject `revoked` and `disconnected` connections and preserve the existing sync logic used by cron.

#### Scenario: User triggers manual sync

- **WHEN** a user clicks Sync now for an owned active accounting connection
- **THEN** `/api/integrations/[provider]/sync` triggers the existing sync logic and returns the existing inline result or queued acknowledgement with subsequent outcome in sync history

#### Scenario: Manual sync is triggered while cron is in progress

- **WHEN** a user triggers a manual sync and a cron-initiated sync for the same connection is already running
- **THEN** the system either queues the manual sync or returns an informational message that sync is already in progress; it SHALL NOT run two concurrent syncs for the same connection

#### Scenario: User retries a pending or failed first sync

- **WHEN** the authenticated owner requests a manual Xero or MYOB sync for `pending_first_sync` or `error`
- **THEN** the request is eligible for sync just as an active connection is

#### Scenario: User tries to sync revoked or disconnected access

- **WHEN** the authenticated owner requests a manual sync for `revoked` or `disconnected`
- **THEN** the route rejects the request without dispatching or contacting the provider

## ADDED Requirements

### Requirement: Immediate accounting sync dispatch follows configured execution mode

The system SHALL queue immediate sync through the worker when both worker URL and trigger secret are configured, and otherwise run inline. A configured-worker dispatch failure SHALL NOT cause automatic inline fallback. It SHALL be recorded as a sanitized failed dispatch attempt and remain retryable, without being classified as revoked provider credentials.

#### Scenario: Worker configuration is absent or incomplete

- **WHEN** an eligible connection's immediate trigger runs without both worker settings
- **THEN** it uses existing inline sync and returns its outcome

#### Scenario: Worker accepts immediate sync

- **WHEN** a configured worker returns a successful acknowledgement with `queued: true` and a non-empty claim identifier
- **THEN** the trigger returns that acknowledgement without running inline or changing the connection to active solely on dispatch acceptance

#### Scenario: Configured-worker dispatch fails

- **WHEN** dispatch encounters a network error, non-success HTTP response, or invalid acknowledgement while the database is available
- **THEN** one completed failed sync-history entry records that dispatch attempt with zero invoice counts and a fixed sanitized dispatch-failure message, excluding raw response bodies, secrets, and exception text
- **AND** an owned connection still awaiting its first successful sync transitions from pending to `error` without advancing `lastSyncedAt`
- **AND** the trigger returns the existing failed sync-result shape, performs no automatic inline fallback, and preserves eligibility for a later manual or Vercel cron retry

#### Scenario: Dispatch failure races with another connection outcome

- **WHEN** a connection becomes active, revoked, or disconnected, or gains a successful-sync timestamp before dispatch-failure recording finishes
- **THEN** recording preserves that newer connection state and timestamp rather than overwriting it as a first-sync error

#### Scenario: Worker rejects app authentication

- **WHEN** the worker rejects the trigger's authentication header
- **THEN** the failure is classified as a dispatch failure, not provider credential revocation

#### Scenario: Failure-history persistence is unavailable

- **WHEN** a dispatch fails and its failure-history write also fails
- **THEN** the OAuth or selection flow still returns to settings with safe server-side logging, without claiming durable failure recording or falling back inline

#### Scenario: Failure recording is tenant isolated

- **WHEN** a dispatch failure is recorded for an authenticated user's connection
- **THEN** ownership is verified and failure history and status writes are scoped to that user; another user's connection cannot be modified
- **AND** authenticated users may insert sync-history rows only when `userId` matches `auth.uid()` and receive no sync-history update or delete permission
