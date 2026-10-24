# Spec Delta

## MODIFIED Requirements

### Requirement: Sync job is idempotent
Running the same sync job multiple times for the same connection and time window SHALL produce
the same result as running it once. Duplicate runs SHALL NOT create duplicate `TrackedInvoice`
records, double-send emails, or write multiple `accounting_sync_runs` rows for the same run
window (identified by connection ID + run start time rounded to the minute). Stale `running`
rows older than the configured processing window SHALL be auto-recovered to a terminal failure
state before evaluating whether a new run is blocked.

#### Scenario: Sync job runs twice due to Vercel retry
- **WHEN** the cron route is invoked twice for the same connection within a short window
- **THEN** the second invocation detects the in-progress or completed sync run and exits early without processing; no duplicate invoices are created

#### Scenario: Stale running row is recovered before new sync attempt
- **WHEN** a sync attempt starts for a connection that has an older stale `accounting_sync_runs` row with `status = 'running'`
- **THEN** the stale row is transitioned to a terminal failed state with completion metadata before the new in-progress check
- **AND** the new sync attempt proceeds if no fresh in-progress row remains for that connection

### Requirement: System records sync run history and surfaces errors
The system SHALL write a row to `accounting_sync_runs` for every sync run (cron or manual),
recording: provider, connection ID, start time, end time, status (success/partial/failed),
invoices created, invoices updated, invoices skipped, and any provider error messages. Error
messages SHALL be sanitised before storage (no PII, no raw token values). Recovery actions for
stale in-progress rows SHALL also be recorded using deterministic, sanitised failure metadata.

#### Scenario: Successful sync run is recorded
- **WHEN** a sync run completes successfully for a connection
- **THEN** an `accounting_sync_runs` row is written with `status = 'success'`, accurate invoice counts, and the end time

#### Scenario: Sync run fails with provider error
- **WHEN** a sync run exhausts retries due to a provider API error
- **THEN** an `accounting_sync_runs` row is written with `status = 'failed'` and the sanitised error message; `accounting_connections.lastSyncedAt` is NOT updated

#### Scenario: User views sync history
- **WHEN** a user opens the integrations settings page
- **THEN** the UI shows the last 5 sync run entries for each connection, including date, status, and invoice counts

#### Scenario: Recovered stale run appears in history
- **WHEN** a stale `running` sync row is auto-recovered during a new sync attempt
- **THEN** that historical row is visible as a failed run with completion timestamp and deterministic recovery reason
- **AND** the row does not remain indefinitely in `running`
