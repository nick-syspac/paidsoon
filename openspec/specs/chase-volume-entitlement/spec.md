# chase-volume-entitlement Specification

## Purpose
TBD - created by archiving change monthly-chase-volume-limits. Update Purpose after archive.
## Requirements
### Requirement: Allowance consumption at first chase

The system SHALL consume one unit of an account's chased-invoice allowance when the first
reminder for an invoice is sent, and SHALL NOT consume allowance for any subsequent reminder
for that invoice. An invoice SHALL consume allowance at most once for its lifetime.

#### Scenario: First reminder is sent for an invoice

- **WHEN** the system sends the first reminder for an invoice that has not previously been
  chased
- **THEN** the account's allowance usage for the current period increases by one

#### Scenario: Later reminders in the same sequence are sent

- **WHEN** the system sends the second or third reminder for an invoice that has already
  been chased
- **THEN** the account's allowance usage does not change

#### Scenario: Invoice is synced but never chased

- **WHEN** an invoice is synced and is resolved, paid, or removed before any reminder is sent
- **THEN** the invoice consumes no allowance

### Requirement: Allowance period anchored to the billing period

The system SHALL measure allowance usage over the account's current subscription billing
period. For an account in trial, the system SHALL use the trial window as the current period.
Where neither a billing period nor a trial window is available, the system SHALL use the
current calendar month in Australia/Melbourne. Usage SHALL reset when a new period begins.

#### Scenario: New billing period begins

- **WHEN** an account's subscription billing period rolls over
- **THEN** allowance usage for the new period starts at zero, and invoices held for allowance
  become eligible to be chased

#### Scenario: Account is in trial

- **WHEN** allowance usage is calculated for an account whose subscription is trialing
- **THEN** usage is counted over the trial window

#### Scenario: Account has neither a billing period nor a trial window

- **WHEN** allowance usage is calculated for an account with no recorded billing period and
  no trial window
- **THEN** usage is counted over the current calendar month in Australia/Melbourne

### Requirement: Invoices are always visible regardless of allowance

The system SHALL create and retain every synced invoice regardless of the account's remaining
allowance. Allowance SHALL govern whether follow-up begins, and SHALL NOT govern whether an
invoice is recorded or displayed.

#### Scenario: Invoice is synced while the account is at capacity

- **WHEN** an invoice is synced for an account that has consumed its full allowance
- **THEN** the invoice is created and appears on the debtor dashboard

#### Scenario: Held invoice is presented to the user

- **WHEN** an invoice is due for its first reminder but the account has no remaining
  allowance
- **THEN** the dashboard indicates that the invoice is waiting for allowance and states when
  it will be chased

### Requirement: Sequences in progress are never interrupted

The system SHALL continue sending the remaining reminders of any sequence that has already
begun, regardless of the account's remaining allowance.

#### Scenario: Account reaches capacity mid-sequence

- **WHEN** an account consumes its full allowance while invoices are partway through their
  reminder sequences
- **THEN** those invoices continue to receive their remaining reminders on schedule

### Requirement: Capacity warning and capacity notice

The system SHALL notify an account when it has used at least 80% of its allowance for the
current period, and SHALL notify the account when it has used its full allowance. The system
SHALL NOT apply overage charges.

#### Scenario: Account reaches 80% of allowance

- **WHEN** an account's usage for the current period reaches 80% of its allowance
- **THEN** the dashboard displays a warning stating current usage and the allowance

#### Scenario: Account reaches full allowance

- **WHEN** an account's usage for the current period equals its allowance
- **THEN** the dashboard states that new chases are paused until the next period, and that
  sequences already under way will continue

#### Scenario: Account exceeds no charge

- **WHEN** an account reaches its full allowance
- **THEN** no additional charge is applied to the account

### Requirement: Uniform enforcement across invoice sources

The system SHALL apply the same allowance rules to every invoice source, including Stripe
Connect and accounting connections. No invoice source SHALL be exempt from allowance
enforcement.

#### Scenario: Invoices arrive from an accounting connection

- **WHEN** invoices are synced from an accounting connection for an account at capacity
- **THEN** the invoices are created, and their first reminders are held exactly as they would
  be for a Stripe Connect source

#### Scenario: Invoices arrive from more than one source

- **WHEN** an account receives invoices from multiple invoice sources within one period
- **THEN** allowance usage is counted across all sources against a single account allowance

