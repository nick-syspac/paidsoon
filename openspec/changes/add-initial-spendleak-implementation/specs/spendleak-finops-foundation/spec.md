## ADDED Requirements

### Requirement: SpendLeak SHALL ingest spend-side accounting data as a read-only analysis layer
The system SHALL import the spend-side accounting data needed for SpendLeak analyses from Xero and
MYOB without becoming the source of truth for bookkeeping. Imported records SHALL preserve source
references so findings can be traced back to the accounting platform.

#### Scenario: Spend-side sync imports bills and transactions
- **WHEN** a connected Xero or MYOB organisation is synced for SpendLeak
- **THEN** the system stores normalized bill, supplier, expense-account, and bank-transaction data
- **THEN** each stored record retains provider identifiers needed to trace the record back to the
  source system

#### Scenario: Source-of-truth boundary remains explicit
- **WHEN** a user reviews SpendLeak findings
- **THEN** the UI makes clear that Xero or MYOB remains the accounting system of record
- **THEN** SpendLeak does not offer direct mutation of provider bills or transactions in this MVP

### Requirement: SpendLeak SHALL generate explainable initial savings insights
The system SHALL generate an initial set of persisted, explainable findings covering recurring
subscriptions, price increases, duplicate spend, renewal alerts, supplier concentration/trend, and
cash-runway pressure. Each finding SHALL include the evidence needed for the user to understand why
it was raised.

#### Scenario: Recurring subscription is detected
- **WHEN** the imported spend history shows repeated charges from the same supplier on a stable
  cadence
- **THEN** the system creates a recurring-subscription finding with supplier, amount, cadence, and
  supporting transaction evidence

#### Scenario: Duplicate spend is detected
- **WHEN** two bills or payments from the same supplier match the duplicate-detection heuristics
- **THEN** the system creates a duplicate-spend finding that shows both source records and the
  evidence used to classify them as suspicious

#### Scenario: Renewal is approaching
- **WHEN** historical spend indicates an annual or fixed-term renewal is due within the configured
  alert window
- **THEN** the system creates a renewal finding with the expected renewal date and supporting spend
  history

### Requirement: Financial operations dashboard SHALL combine PaidSoon and SpendLeak signals
The system SHALL present SpendLeak findings alongside PaidSoon receivables signals so users can see
cash coming in, cash going out, and recommended next actions in one place.

#### Scenario: User opens the unified financial-operations overview
- **WHEN** a signed-in user with PaidSoon and SpendLeak data opens the relevant dashboard surface
- **THEN** the page shows receivables context, spend findings, and a summarized financial-health
  view without hiding the existing invoice-chasing workflow

#### Scenario: AI summary is generated from grounded findings
- **WHEN** the user asks where they are wasting money or opens the daily summary
- **THEN** the AI summary is derived from persisted SpendLeak findings and their evidence rather
  than inventing unsupported recommendations