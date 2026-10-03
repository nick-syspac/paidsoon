# Spec Delta

## MODIFIED Requirements

### Requirement: System syncs invoices from connected accounting providers on a daily schedule

The system SHALL run a daily cron job at 02:00 UTC that iterates over accounting connections
that are eligible for automated retry, including active connections and connections still
awaiting or retrying their first successful sync. It SHALL fetch updated invoice, contact,
and payment data from each provider. Each sync run SHALL be recorded in `accounting_sync_runs`
with start time, end time, invoice count, and any errors.

#### Scenario: Daily cron job processes an active connection

- **WHEN** the `/api/cron/sync-accounting` route is triggered by Vercel Cron
- **THEN** for each active `accounting_connections` row, the system fetches invoices modified since the last successful sync, upserts `TrackedInvoice` records, and writes a success entry to `accounting_sync_runs`

#### Scenario: Daily cron job retries a connection awaiting its first successful sync

- **WHEN** the `/api/cron/sync-accounting` route runs and an accounting connection is still awaiting or retrying its first successful sync
- **THEN** the system attempts that connection's sync again instead of waiting for a manual Sync now action

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
- **THEN** the system fetches all invoices with `status IN (AUTHORISED, PAID, VOIDED)` within the last 12 months from the provider and creates or updates `TrackedInvoice` and `provider_invoice_mappings` records

#### Scenario: First sync is triggered as part of connection finalisation

- **WHEN** a user completes an accounting connection flow and the provider organisation or company file is finalised
- **THEN** the system starts the first sync without requiring the user to wait for the next daily cron run or click Sync now manually

#### Scenario: First sync attempt fails

- **WHEN** the first sync attempt does not complete successfully
- **THEN** the system records the failed sync run, leaves `lastSyncedAt` unset, and keeps the connection eligible for retry by the daily cron or a manual Sync now action

#### Scenario: Incremental sync on subsequent runs

- **WHEN** a sync run starts for a connection that has a non-null `lastSyncedAt`
- **THEN** the system passes `modifiedAfter = lastSyncedAt` to the provider API and only processes the returned delta; `lastSyncedAt` is updated to the current run start time on success
