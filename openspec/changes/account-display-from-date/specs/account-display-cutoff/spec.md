# Spec Delta

## Purpose

Define the tenant-owned business-date cutoff for reporting and automation while retaining historical source data, settlement integrity, and consistent results across interactive and scheduled consumers.

## ADDED Requirements

### Requirement: Owner can configure an optional cutoff

The system SHALL allow an authenticated account owner to save or clear a date-only Display from date under Settings → Account independently of the display-name setting. The page SHALL explain retention, reporting, automation, and customer-link effects and protect unsaved changes.

#### Scenario: Untouched account preserves legacy behavior

- **WHEN** an account has never configured a cutoff
- **THEN** reads SHALL apply no additional date restriction and SHALL NOT create a settings row merely to view the page

#### Scenario: Save clear and reset

- **WHEN** the owner changes or clears the date
- **THEN** the page SHALL retain a draft until Save succeeds, Reset SHALL restore the persisted value, and failed saves SHALL preserve the draft and show an error
- **AND** successful saves SHALL show the canonical persisted value and refresh affected views

#### Scenario: Cutoff and profile saves are independent

- **WHEN** the owner saves the cutoff with an unchanged or empty display-name draft
- **THEN** the cutoff SHALL save independently without changing profile fields or billing state

### Requirement: Configuration validates canonical dates and ownership

The system SHALL accept only a real Gregorian date from year 0001 through 9999 in YYYY-MM-DD form or explicit null. Future dates SHALL be allowed. Identity SHALL come from authentication; callers SHALL NOT select another tenant or write protected settings metadata.

#### Scenario: Invalid request changes nothing

- **WHEN** a request contains an impossible date, timestamp, locale-formatted date, empty string, missing date or revision, unknown field, malformed JSON, or invalid revision
- **THEN** the API SHALL return 400 without changing the setting or audit history

#### Scenario: Future date

- **WHEN** an owner saves a valid future date
- **THEN** the system SHALL persist it without clamping to today and SHALL exclude earlier business dates

#### Scenario: Authentication and cross-tenant access

- **WHEN** an unauthenticated caller requests account settings
- **THEN** the API SHALL return 401
- **WHEN** an authenticated caller attempts to access or change another account through the API or database role
- **THEN** tenant isolation SHALL prevent disclosure and mutation

### Requirement: Changes are atomic audited and concurrency safe

Every effective date change SHALL atomically increment an account revision and append an immutable event containing actor, previous and next date, resulting revision, and change time. Stale revision submissions SHALL return 409. Same-value saves SHALL NOT increment the revision or create an event.

#### Scenario: Set update and clear

- **WHEN** a date changes from null to a date, to another date, or back to null
- **THEN** exactly one event SHALL record each transition in the same commit as the setting change
- **AND** date values alone, not customer names, email addresses, or invoice contents, SHALL appear in the audit payload

#### Scenario: Concurrent edits

- **WHEN** two requests submit different dates against the same revision, including the first save
- **THEN** one SHALL commit and the other SHALL receive 409 without a lost update or extra audit event

#### Scenario: Persistence failure

- **WHEN** the audit write or settings write fails
- **THEN** neither change SHALL commit and the API SHALL return an error

#### Scenario: Direct role writes cannot defeat auditing

- **WHEN** a customer database role changes its own cutoff directly or attempts to forge revision or audit fields
- **THEN** valid changes SHALL receive the same automatic audit and revision guarantees, while protected-field edits and audit modification or deletion SHALL be denied

### Requirement: Inclusive boundaries use defined business dates

Date-only business values SHALL be compared as calendar dates. Actual timestamp events SHALL use midnight in Australia/Melbourne, including daylight-saving transitions. Existing filters SHALL intersect with the cutoff. Import, creation, and detection times SHALL NOT make old source records eligible.

#### Scenario: Inclusive day and timestamp

- **WHEN** the cutoff is 2026-07-01
- **THEN** business dates on that day SHALL qualify and earlier dates SHALL NOT
- **AND** timestamp events at 2026-06-30T14:00:00Z SHALL qualify while events immediately before that Melbourne midnight SHALL NOT

#### Scenario: Daylight-saving boundary

- **WHEN** the cutoff is a Melbourne date across an offset change
- **THEN** its timestamp boundary SHALL use the applicable IANA timezone offset, not a fixed ten-hour offset

#### Scenario: Existing filters cannot widen eligibility

- **WHEN** a caller selects all history, an older report range, or export parameters before the cutoff
- **THEN** the effective range SHALL remain the intersection and pre-cutoff records SHALL NOT be exposed

#### Scenario: Invoice issue-date fallback

- **WHEN** an invoice has a valid issue date
- **THEN** that date SHALL govern eligibility even when its due date is after the cutoff
- **WHEN** its issue date is absent
- **THEN** its valid due date SHALL govern eligibility

#### Scenario: Missing date and later import

- **WHEN** a record has no valid governing date or an old business date but a recent import time
- **THEN** it SHALL be excluded under an active cutoff rather than made current by import or creation time

### Requirement: Cash movement and settlement semantics remain correct

Period cash reporting SHALL use payment dates independently of invoice eligibility. Outstanding balances and settlement status for an eligible record SHALL use its complete ledger, including earlier payments and reversals. These ledger inputs SHALL NOT become independent pre-cutoff report rows.

#### Scenario: Older invoice paid after cutoff

- **WHEN** an excluded invoice receives a payment after the cutoff
- **THEN** the invoice SHALL remain unavailable in invoice views while the payment SHALL contribute once to eligible cash-flow totals without exposing the excluded invoice payload

#### Scenario: Eligible invoice paid before cutoff

- **WHEN** an eligible invoice has earlier payments or reversals
- **THEN** its true outstanding balance SHALL include their settlement effect without resending reminders for amounts already paid

#### Scenario: Refund credit and duplicate sources

- **WHEN** an eligible cash movement reverses an earlier payment or is present in multiple existing source representations
- **THEN** the reporting path SHALL preserve its signed economic effect and existing deduplication semantics without counting it twice

### Requirement: Forecasts preserve anchors and future obligations

The system SHALL retain explicitly dated current or opening balance anchors and eligible future recurring occurrences regardless of setup date. History-dependent estimates, comparisons, and balances without sufficient eligible inputs SHALL show insufficient data rather than healthy zeroes or fabricated opening balances.

#### Scenario: Old recurring setup with future due date

- **WHEN** a commitment was created before the cutoff but generates an occurrence on or after it
- **THEN** that occurrence SHALL remain eligible, while earlier occurrences SHALL NOT contribute

#### Scenario: Balance anchor versus transaction total

- **WHEN** a valid current balance anchor is available
- **THEN** forecasts SHALL retain the balance as a stock value without re-adding its historical constituent movements
- **WHEN** no valid anchor or sufficient history exists
- **THEN** the balance-dependent result SHALL be unavailable rather than zero

#### Scenario: Truncated baseline or comparison

- **WHEN** a required baseline or comparison window crosses the cutoff
- **THEN** the result SHALL indicate insufficient data and SHALL NOT present a full-period trend or alert derived from an incomplete baseline
- **AND** simple additive totals over the remaining range SHALL explicitly label their effective partial range

### Requirement: All business consumers enforce the same policy

The effective cutoff SHALL apply to dashboards, lists, details, mutations, badges, evidence, charts, exports, alerts, recommendations, and summaries across every financial module. Date mappings SHALL derive child and classification eligibility from dated business sources, not recent derived-output timestamps.

#### Scenario: Cross-module consistent results

- **WHEN** the same source contributes to Get Paid, SpendLeak, CostGuard, CashPlan, Tax Buffer, CommitGuard, MarginGuard, RunwayGuard, DepositGuard, or Owner’s Digest
- **THEN** each consumer SHALL apply the same record or occurrence eligibility and financial-integrity rules

#### Scenario: Excluded direct record

- **WHEN** an owner requests an excluded record's detail, evidence, export, or mutation endpoint
- **THEN** it SHALL return 404 or the equivalent unavailable page without exposing the record or changing it

#### Scenario: Deposit job context

- **WHEN** an older or undated deposit job has an eligible request or milestone
- **THEN** it SHALL remain available as minimal parent context for eligible children without including excluded child records or historical rollups
- **WHEN** it has neither an eligible start date nor an eligible child
- **THEN** it SHALL be unavailable under the active cutoff

#### Scenario: Configuration and billing are not business history

- **WHEN** an owner changes the cutoff
- **THEN** subscription usage, consumed chase allowance, entitlement rules, configuration access, security logs, and admin audit SHALL remain unchanged

### Requirement: Historical source data remains recoverable

Setting changes SHALL NOT delete source rows, suppress ingestion, rewrite workflow status, alter sync cursors, or discard settlement events. Clearing or moving the date backward SHALL restore eligibility under current workflow and idempotency rules without reimport.

#### Scenario: Clear restores existing history

- **WHEN** an owner clears a previously active cutoff
- **THEN** retained historical records SHALL become eligible again without source rewrites, import, reset of reminder stages, or replay of already delivered messages

#### Scenario: Webhooks and imports retain older data

- **WHEN** signed payment webhooks, sync, reconciliation, or spreadsheet imports contain pre-cutoff data
- **THEN** normal authenticated ingestion and reconciliation SHALL continue while downstream views and new business actions enforce eligibility

### Requirement: Derived results are tied to the effective revision

Persisted business snapshots, baselines, findings, alerts, and queued summaries SHALL identify the cutoff revision used for their inputs. Readers and delivery paths SHALL NOT reuse results from another revision. Failures to resolve policy SHALL fail closed, not be interpreted as no cutoff.

#### Scenario: Stale snapshot after save or clear

- **WHEN** the date changes, including clearing it
- **THEN** previous-revision outputs SHALL be rebuilt or shown as pending or unavailable and SHALL NOT be served as current

#### Scenario: Legacy unmarked output

- **WHEN** an output has no cutoff provenance
- **THEN** it SHALL be usable only for an untouched account at revision zero with no cutoff

#### Scenario: Policy storage failure

- **WHEN** policy resolution fails during a view, export, or job
- **THEN** the operation SHALL fail or retry without returning unfiltered business data or sending a message

### Requirement: Automation rechecks eligibility at execution and dispatch

Both scheduling runtimes SHALL enforce current eligibility when claiming work, executing it, and immediately before handing an external action to a provider. Stale computed payloads SHALL be discarded or rebuilt. Exclusion SHALL NOT permanently cancel retained workflows.

#### Scenario: Cutoff changes after work is queued

- **WHEN** queued reminder, digest, deposit reminder, or recommendation work executes after a cutoff change
- **THEN** it SHALL resolve the current revision, exclude ineligible source records, and rebuild stale payloads before dispatch

#### Scenario: Cutoff changes during computation

- **WHEN** the final pre-dispatch check sees a different revision
- **THEN** the action SHALL NOT dispatch the old payload and SHALL retry or rebuild against the new policy
- **AND** an external action already handed to a provider before the save SHALL NOT be represented as recallable

### Requirement: Excluded public links reject new actions

PaidSoon-hosted payment and promise links for excluded records SHALL show an unavailable state and SHALL NOT disclose business contents, create payment intents, accept promises, or redirect to payment checkout. Authentic provider reconciliation SHALL remain operational.

#### Scenario: Previously issued link

- **WHEN** a valid existing token references a now-excluded invoice or deposit request
- **THEN** the PaidSoon page and action API SHALL reject new actions with an unavailable response
- **AND** clearing the cutoff SHALL restore normal token behavior subject to existing expiry and permission checks

#### Scenario: External provider link limitation

- **WHEN** an external provider URL was already issued independently of PaidSoon
- **THEN** the system SHALL NOT claim to revoke it and SHALL continue processing authentic settlement notifications
