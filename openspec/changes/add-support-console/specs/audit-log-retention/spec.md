## ADDED Requirements

### Requirement: Audit logs are retained for 7 years with automated archival

The system SHALL implement a retention policy for `AdminAuditEvent` records: active in Postgres for 90 days, warm archive in Postgres for 90 days to 2 years, cold archive in S3 (Parquet format, compressed) for 2 to 7 years, and auto-delete after 7 years. A daily cron job (Vercel Cron, 23:00 UTC) SHALL manage the migration between tiers.

#### Scenario: Recent audit events are queryable in real-time
- **WHEN** support staff queries `/api/admin/audit-log?targetUserId=X&days=7` (last 7 days)
- **THEN** the system returns results from the active Postgres table with full indexing
- **AND** query completes in < 500ms (SLA for admin UI)

#### Scenario: Warm archive events can be queried with degraded performance
- **WHEN** support staff queries `/api/admin/audit-log?targetUserId=X&startDate=2024-01-01` (6 months old)
- **THEN** the system queries the warm archive table in Postgres
- **AND** query completes in < 5 seconds (acceptable for historical requests)

#### Scenario: Cold archive events can be retrieved via export job
- **WHEN** a compliance officer needs a full audit report for 2024 (2 years old)
- **THEN** an export job is triggered: `/api/admin/audit-log/export?year=2024`
- **AND** the system fetches data from S3 cold storage, loads into temp table
- **AND** returns a Parquet file download (compressed, ~2GB for 1 year of data)
- **AND** job completes in ~5 minutes and notifies via email

#### Scenario: Archival cron job migrates events automatically
- **WHEN** daily at 23:00 UTC, the archival cron job runs
- **THEN** the job queries `AdminAuditEvent` with `createdAt < now() - 90 days`
- **AND** exports all matching rows to Parquet file: `s3://paidsoon-audit-logs/2026/06/30-audit.parquet`
- **AND** verifies record count matches source (integrity check)
- **AND** deletes matched rows from warm archive table
- **AND** logs completion: "Archived 5,432 events for 2026-06-30"

#### Scenario: Archival job is idempotent (safe to re-run)
- **WHEN** the archival cron job runs twice in one day (e.g., due to retry)
- **THEN** the second run detects existing S3 file via date check
- **AND** skips re-export if file already exists (or re-exports with append if incremental)
- **AND** does not attempt to delete rows that were already deleted

#### Scenario: Cold storage is readable for compliance queries
- **WHEN** a user requests their account data from 2 years ago (right-to-know)
- **AND** the system queries `/api/audit-log-export?userId=X&year=2024`
- **THEN** the system loads the relevant Parquet file from S3 and filters for that user
- **AND** returns a JSON export of their activity
- **AND** completes within 10 minutes

### Requirement: Retention policy is documented and auditable

The system SHALL maintain a `AuditRetentionLog` table that records each archival job execution: timestamp, records_archived, s3_path, success/failure status, and retention_tier. This log is itself retained forever (or summarized annually).

#### Scenario: Retention operations are transparent
- **WHEN** a compliance audit needs to verify retention policy compliance
- **AND** they query `/api/admin/retention-log`
- **THEN** they see: date, records archived, S3 location, success status
- **AND** can verify that all records for a given date were properly archived

#### Scenario: Failed archival is retried automatically
- **WHEN** archival job fails (e.g., S3 network error) on 2026-06-30
- **THEN** the job logs the failure with error message
- **AND** next run (2026-07-01) retries the failed date
- **AND** succeeds only when verified with record count match
