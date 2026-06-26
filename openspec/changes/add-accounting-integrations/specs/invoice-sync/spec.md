## ADDED Requirements

### Requirement: System syncs invoices from connected accounting providers on a daily schedule
The system SHALL run a daily cron job at 02:00 UTC that iterates over all active
`accounting_connections` rows and fetches updated invoice, contact, and payment data from
each provider. Each sync run SHALL be recorded in `accounting_sync_runs` with start time,
end time, invoice count, and any errors.

#### Scenario: Daily cron job processes an active connection
- **WHEN** the `/api/cron/sync-accounting` route is triggered by Vercel Cron
- **THEN** for each active `accounting_connections` row, the system fetches invoices modified since the last successful sync, upserts `TrackedInvoice` records, and writes a success entry to `accounting_sync_runs`

#### Scenario: Cron request lacks valid authorisation header
- **WHEN** the `/api/cron/sync-accounting` route is called without a valid `Authorization: Bearer CRON_SECRET` header
- **THEN** the system returns HTTP 401 and does not process any connections

#### Scenario: Provider API is unavailable during cron run
- **WHEN** a provider API call fails with a 5xx response during a cron run
- **THEN** the system retries up to 3 times with exponential backoff, then records a failure entry in `accounting_sync_runs` and continues processing the next connection; it does not abort the entire run

### Requirement: User can trigger a manual sync from the settings UI
The system SHALL provide a "Sync now" action in the integrations settings page that
immediately triggers a sync for the selected accounting connection. The route SHALL be
authenticated (user session required) and SHALL run the same sync logic as the cron job.

#### Scenario: User triggers manual sync
- **WHEN** a user clicks "Sync now" for an active accounting connection in settings
- **THEN** the system calls `/api/integrations/[provider]/sync`, runs a full sync for that connection, and returns the number of invoices synced and any errors

#### Scenario: Manual sync is triggered while cron is in progress
- **WHEN** a user triggers a manual sync and a cron-initiated sync for the same connection is already running
- **THEN** the system either queues the manual sync or returns an informational message that sync is already in progress; it SHALL NOT run two concurrent syncs for the same connection

### Requirement: System performs incremental sync after first sync
After the first full sync for a connection, subsequent syncs SHALL only fetch invoices
modified since `lastSyncedAt` (stored on `accounting_connections`). The first sync fetches
all open and recently closed invoices up to a configurable lookback window (default: 12
months). If incremental sync is not supported by the provider endpoint, the system SHALL
fall back to full re-fetch with idempotent upsert.

#### Scenario: First sync for a new connection
- **WHEN** a new `accounting_connections` row is created and the first sync runs
- **THEN** the system fetches all invoices with `status IN (AUTHORISED, PAID, VOIDED)` within the last 12 months from the provider and creates or updates `TrackedInvoice` and `provider_invoice_mappings` records

#### Scenario: Incremental sync on subsequent runs
- **WHEN** a sync run starts for a connection that has a non-null `lastSyncedAt`
- **THEN** the system passes `modifiedAfter = lastSyncedAt` to the provider API and only processes the returned delta; `lastSyncedAt` is updated to the current run start time on success

### Requirement: System maps provider invoice data to PaidSoon's internal model
The system SHALL translate each provider invoice object into a `TrackedInvoice` record using
a defined field mapping. Provider-specific fields that have no equivalent in `TrackedInvoice`
SHALL be stored in `provider_invoice_mappings.providerMetadata` (JSON) and SHALL NOT be
added as columns on `tracked_invoices`.

#### Scenario: Xero invoice is mapped to TrackedInvoice
- **WHEN** a Xero `AUTHORISED` invoice is fetched during sync
- **THEN** the system creates or updates a `TrackedInvoice` with: `externalId = Xero InvoiceID`, `provider = 'xero'`, `clientEmail` from Contact Email, `clientName` from Contact Name, `amountDue = AmountDue * 100` (converted to cents), `currency = CurrencyCode`, `dueDate = DueDate`, `invoiceNumber = InvoiceNumber`

#### Scenario: MYOB invoice is mapped to TrackedInvoice
- **WHEN** a MYOB Business sale invoice is fetched during sync
- **THEN** the system creates or updates a `TrackedInvoice` with fields mapped from the MYOB Sale/Invoice response; TODO: confirm exact MYOB field names (`UID`, `Contact`, `TotalAmount`, `BalanceDue`, `Terms.DueDate`) against the MYOB API reference

#### Scenario: Provider invoice currency is non-AUD
- **WHEN** a provider invoice has a currency other than AUD
- **THEN** the system stores the currency code as-is in `TrackedInvoice.currency` without conversion; no currency conversion is performed

### Requirement: System deduplicates invoices using provider invoice IDs
The system SHALL use the combination of `externalId + provider + userId` as the unique key
for `TrackedInvoice` records. Importing the same provider invoice twice SHALL result in an
upsert (update), not a duplicate row.

#### Scenario: Duplicate invoice encountered during sync
- **WHEN** a sync run returns an invoice that already exists in `TrackedInvoice` (same `externalId`, `provider`, `userId`)
- **THEN** the system updates the existing record's `amountDue`, `dueDate`, `status`, and `updatedAt` fields rather than inserting a new row

#### Scenario: Same invoice exists in both Stripe and Xero connections
- **WHEN** a user has both a Stripe connection and a Xero connection and the same customer invoice appears in both
- **THEN** the system creates two separate `TrackedInvoice` records — one with `provider = 'stripe'` and one with `provider = 'xero'` — and does NOT merge them

### Requirement: System identifies and classifies invoice payment status
The system SHALL map provider-specific invoice statuses to PaidSoon's internal status model.
It SHALL treat invoices as follows: unpaid/authorised → `status = 'pending'`; partially paid
→ `status = 'pending'` (with `amountDue` reflecting remaining balance); paid/closed → mark
as `status = 'paid'`; voided/deleted → mark as `status = 'manually_resolved'` and cancel
reminder sequence.

#### Scenario: Xero invoice transitions to PAID
- **WHEN** a sync run detects a Xero invoice with `Status = 'PAID'` that was previously tracked as `pending`
- **THEN** the system updates the `TrackedInvoice.status` to `'paid'`, clears `nextEmailAt`, and cancels any pending reminder sequence for that invoice

#### Scenario: Xero invoice is VOIDED
- **WHEN** a sync run detects a Xero invoice with `Status = 'VOIDED'`
- **THEN** the system updates the `TrackedInvoice.status` to `'manually_resolved'` and cancels any pending reminder sequence

#### Scenario: MYOB invoice is closed
- **WHEN** a sync run detects a MYOB invoice with a fully paid status (TODO: confirm MYOB status field name and values)
- **THEN** the system updates the `TrackedInvoice.status` to `'paid'` and cancels any pending reminder sequence

#### Scenario: Partially paid invoice is synced
- **WHEN** a sync run detects an invoice that is partially paid (`BalanceDue > 0` but `AmountDue > BalanceDue`)
- **THEN** the system updates `TrackedInvoice.amountDue` to reflect the remaining balance and leaves the reminder sequence active

### Requirement: System never sends reminders for paid, voided, or disconnected invoices
The system SHALL prevent the email send cron from sending follow-up reminders for any
`TrackedInvoice` whose source `accounting_connections` record has `status = 'disconnected'`
or `status = 'revoked'`, or whose own status is `'paid'` or `'manually_resolved'`. This
check applies to both scheduled and manual reminder sends.

#### Scenario: Email send cron encounters a paid invoice
- **WHEN** the email send cron evaluates a `TrackedInvoice` with `status = 'paid'`
- **THEN** it skips that invoice and does not send any email

#### Scenario: Email send cron encounters an invoice from a revoked connection
- **WHEN** the email send cron evaluates a `TrackedInvoice` whose `accounting_connections.status = 'revoked'`
- **THEN** it skips all invoices from that connection without sending emails

### Requirement: System records sync run history and surfaces errors
The system SHALL write a row to `accounting_sync_runs` for every sync run (cron or manual),
recording: provider, connection ID, start time, end time, status (success/partial/failed),
invoices created, invoices updated, invoices skipped, and any provider error messages. Error
messages SHALL be sanitised before storage (no PII, no raw token values).

#### Scenario: Successful sync run is recorded
- **WHEN** a sync run completes successfully for a connection
- **THEN** an `accounting_sync_runs` row is written with `status = 'success'`, accurate invoice counts, and the end time

#### Scenario: Sync run fails with provider error
- **WHEN** a sync run exhausts retries due to a provider API error
- **THEN** an `accounting_sync_runs` row is written with `status = 'failed'` and the sanitised error message; `accounting_connections.lastSyncedAt` is NOT updated

#### Scenario: User views sync history
- **WHEN** a user opens the integrations settings page
- **THEN** the UI shows the last 5 sync run entries for each connection, including date, status, and invoice counts

### Requirement: System maps provider contacts to PaidSoon's contact model
The system SHALL store a mapping between provider contact/customer IDs and PaidSoon-internal
identifiers in `provider_contact_mappings`. This allows future features (contact deduplication,
debtor summaries) without denormalising the `TrackedInvoice` table.

#### Scenario: New contact is encountered during invoice sync
- **WHEN** a synced invoice references a provider contact ID not yet in `provider_contact_mappings`
- **THEN** the system creates a `provider_contact_mappings` row with the provider contact ID, provider name, connection ID, and contact name/email

#### Scenario: Existing contact is referenced on a subsequent invoice
- **WHEN** a synced invoice references a provider contact ID already in `provider_contact_mappings`
- **THEN** the system updates the contact metadata if name or email has changed, and reuses the existing mapping row

### Requirement: Sync job is idempotent
Running the same sync job multiple times for the same connection and time window SHALL produce
the same result as running it once. Duplicate runs SHALL NOT create duplicate `TrackedInvoice`
records, double-send emails, or write multiple `accounting_sync_runs` rows for the same run
window (identified by connection ID + run start time rounded to the minute).

#### Scenario: Sync job runs twice due to Vercel retry
- **WHEN** the cron route is invoked twice for the same connection within a short window
- **THEN** the second invocation detects the in-progress or completed sync run and exits early without processing; no duplicate invoices are created

### Requirement: System handles provider rate limits with backoff
The system SHALL detect HTTP 429 responses and `Retry-After` headers from provider APIs,
pause the sync for the indicated duration, and resume. If rate limits cannot be resolved
within the sync window, the system records a partial success in `accounting_sync_runs`.

#### Scenario: Xero returns 429 during invoice fetch
- **WHEN** the Xero API returns HTTP 429 with a `Retry-After: 60` header
- **THEN** the system waits 60 seconds and retries the request; if the retry succeeds the sync continues; if it fails again the run records a partial success

## Out of Scope

- Real-time invoice sync via webhooks (future enhancement)
- Invoice creation or payment recording in provider systems
- Currency conversion for multi-currency invoices
- Bulk historical import beyond 12-month lookback
- Contact deduplication across providers (future feature using `provider_contact_mappings`)
