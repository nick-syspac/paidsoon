# customer-directory Specification

## Purpose
Gives every tenant a single, tenant-scoped customer record per debtor so that chase-eligibility, cadence, and unsubscribe preferences can be controlled once per customer instead of duplicated across every invoice belonging to that customer.
## Requirements
### Requirement: Customer records are unique per tenant and email
The system SHALL maintain one `Customer` record per `(userId, primaryEmail)` pair, where `primaryEmail` is compared case-insensitively.

#### Scenario: First invoice for a new debtor
- **WHEN** an invoice is ingested (via Stripe Connect sync, Xero sync, MYOB sync, or CSV/XLSX import commit) for a debtor email not yet known to that tenant
- **THEN** a new `Customer` record is created for that tenant with the invoice's client email as `primaryEmail`

#### Scenario: Subsequent invoice for an existing debtor
- **WHEN** an invoice is ingested for a debtor email that already has a `Customer` record for that tenant (case-insensitive match)
- **THEN** no duplicate `Customer` record is created and the existing record's id is attached to the new invoice

### Requirement: Existing invoice history is backfilled with customer records
The system SHALL provide a one-time migration that creates `Customer` records for every distinct `(userId, lower(clientEmail))` pair already present in `TrackedInvoice`, and attaches the resulting `customerId` to all matching `TrackedInvoice` and `Arrangement` rows.

#### Scenario: Tenant with pre-existing invoice history
- **WHEN** the backfill migration runs for a tenant that already has tracked invoices
- **THEN** every existing invoice and arrangement for that tenant ends up with a non-null `customerId` referencing a `Customer` row whose `primaryEmail` matches the invoice's `clientEmail`

### Requirement: Never-auto-chase customers are excluded from reminders
The system SHALL exclude any invoice belonging to a `Customer` with `neverAutoChase = true` from the reminder cron's send queue, regardless of the invoice's own status.

#### Scenario: Customer flagged never-auto-chase
- **WHEN** the reminder cron runs and an invoice's `Customer.neverAutoChase` is `true`
- **THEN** no reminder email is sent for that invoice and its `nextEmailAt` is not advanced

### Requirement: Unsubscribed customers are excluded from reminders
The system SHALL exclude any invoice belonging to a `Customer` with `unsubscribed = true` from the reminder cron's send queue.

#### Scenario: Customer marked unsubscribed
- **WHEN** the reminder cron runs and an invoice's `Customer.unsubscribed` is `true`
- **THEN** no reminder email is sent for that invoice

### Requirement: Per-customer cadence override
The system SHALL allow a tenant to set a `cadenceOverride` on a `Customer` record that, when present, takes precedence over the tenant's default `Schedule` when computing that customer's invoices' next reminder timing.

#### Scenario: Customer has a cadence override
- **WHEN** the reminder cron computes `nextEmailAt` for an invoice whose `Customer.cadenceOverride` is set
- **THEN** the override's day offsets are used instead of the tenant's default `Schedule` values

#### Scenario: Customer has no cadence override
- **WHEN** the reminder cron computes `nextEmailAt` for an invoice whose `Customer.cadenceOverride` is null
- **THEN** the tenant's default `Schedule` values are used, unchanged from current behavior

### Requirement: Customer records are tenant-isolated
The system SHALL enforce Row-Level Security on `Customer` such that a tenant can only read or write their own customer records, following the same `withUserContext` pattern as other tenant-scoped tables.

#### Scenario: Cross-tenant access attempt
- **WHEN** a query for `Customer` rows executes inside `withUserContext` for tenant A
- **THEN** no `Customer` rows belonging to any other tenant are returned

