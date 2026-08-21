# QuickBooks Sync Spec

## Purpose

Define how PaidSoon imports QuickBooks invoices and customers, keeps reminder eligibility aligned with provider-side changes, and runs that reconciliation safely through scheduled and manual sync paths.

## ADDED Requirements

### Requirement: System can run manual and scheduled QuickBooks syncs
The system SHALL support both user-triggered and scheduled QuickBooks syncs using the shared accounting sync orchestration flow. Each run SHALL record a durable status entry that operators and users can inspect.

#### Scenario: Scheduled sync processes an active QuickBooks connection
- **WHEN** the accounting sync cron processes an active QuickBooks connection
- **THEN** the system fetches the relevant QuickBooks invoice and customer changes, applies them to PaidSoon records, and records a sync-run outcome for that connection

#### Scenario: User triggers a manual QuickBooks sync
- **WHEN** the owning user invokes the QuickBooks sync endpoint for their connection
- **THEN** the system runs the same reconciliation logic used by the scheduler and returns a started or completed sync response without requiring elevated privileges

#### Scenario: Duplicate syncs target the same connection concurrently
- **WHEN** a second sync is requested while another QuickBooks sync for the same connection is already running
- **THEN** the system prevents duplicate concurrent processing for that connection and returns an in-progress or skipped result

### Requirement: QuickBooks invoices and customers map into the existing invoice model idempotently
The system SHALL map QuickBooks invoice and customer data into the existing tracked-invoice and provider-mapping model without creating duplicate records for the same user, provider, and external invoice identifier.

#### Scenario: New QuickBooks invoice is imported
- **WHEN** a QuickBooks invoice that is not yet tracked in PaidSoon is returned by sync
- **THEN** the system creates or updates the corresponding customer mapping, creates a tracked invoice using the QuickBooks invoice identifier as the provider external ID, and stores provider-specific metadata separately from core invoice fields

#### Scenario: Existing QuickBooks invoice is re-imported
- **WHEN** sync receives a QuickBooks invoice whose provider identifier is already mapped for that user connection
- **THEN** the system updates the existing tracked invoice and mapping records instead of inserting duplicates

#### Scenario: Sync processes a QuickBooks customer missing an email address
- **WHEN** the related QuickBooks customer record has no primary email value
- **THEN** the system still stores the invoice and customer mapping but preserves an empty client email so follow-up sending rules can decide whether the invoice is contactable

### Requirement: Reminder eligibility follows QuickBooks payment and closure state
The system SHALL use QuickBooks invoice balance and status changes to keep reminder automation correct. Paid or otherwise closed invoices SHALL stop follow-up activity, while partially paid invoices SHALL continue with the remaining balance.

#### Scenario: Invoice becomes paid in QuickBooks
- **WHEN** a previously active tracked invoice syncs from QuickBooks with no remaining balance or a paid-equivalent state
- **THEN** the system marks the tracked invoice paid, clears pending reminder scheduling, and preserves the payment-aligned sync outcome

#### Scenario: Invoice is voided or otherwise closed in QuickBooks
- **WHEN** sync receives a QuickBooks invoice that should no longer be chased because it is voided, deleted, or otherwise terminal
- **THEN** the system marks the tracked invoice as manually resolved or equivalent non-chaseable state and cancels pending reminders

#### Scenario: Invoice is partially paid in QuickBooks
- **WHEN** sync receives a QuickBooks invoice with an outstanding balance smaller than the original total
- **THEN** the system updates the tracked amount due to the remaining balance and leaves the reminder lifecycle active

### Requirement: Incremental sync updates the shared accounting connection state
The system SHALL update the QuickBooks connection's last-sync state after a successful run and SHALL use that state on subsequent runs to reduce unnecessary full imports where the provider supports incremental fetches.

#### Scenario: First QuickBooks sync completes successfully
- **WHEN** a new QuickBooks connection finishes its initial import
- **THEN** the system records the run as successful and sets the connection's last successful sync timestamp

#### Scenario: Subsequent QuickBooks sync runs after initial import
- **WHEN** a QuickBooks connection with a prior successful sync runs again
- **THEN** the system requests only the delta or constrained invoice/customer set supported by QuickBooks and updates the last successful sync timestamp on success

#### Scenario: QuickBooks sync fails after retries
- **WHEN** the provider remains unavailable or continues returning transient failures after the retry policy is exhausted
- **THEN** the system records a failed or partial sync outcome, does not advance the connection's last successful sync timestamp, and surfaces the degraded state on the connection

### Requirement: QuickBooks sync retries transient failures safely
The system SHALL retry transient QuickBooks sync failures with bounded exponential backoff and SHALL distinguish transient provider issues from unrecoverable credential or validation failures.

#### Scenario: QuickBooks returns a transient server error
- **WHEN** a QuickBooks sync request fails with a retryable transport or server-side error
- **THEN** the system retries according to the configured backoff policy before marking the run failed

#### Scenario: QuickBooks rejects the request due to invalid credentials
- **WHEN** a QuickBooks sync request fails because the credentials are invalid or revoked
- **THEN** the system does not continue retrying as though the failure were transient and instead marks the connection for user recovery