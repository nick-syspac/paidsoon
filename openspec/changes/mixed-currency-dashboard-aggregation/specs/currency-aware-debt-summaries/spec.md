# currency-aware-debt-summaries Specification

## Purpose

Prevent dashboard and email debt summaries from silently combining invoice amounts across currencies.

## Requirements

### Requirement: Debt summaries must stay currency-aware

The system SHALL not combine invoices with different currencies into a single displayed debt total. When a summary contains invoices in more than one currency, the system SHALL partition the summary by currency and display each currency separately.

#### Scenario: Mixed-currency dashboard summary

- **WHEN** a tenant has active invoices in more than one currency
- **THEN** the dashboard money summaries render separate totals for each currency instead of a single merged amount

#### Scenario: Single-currency dashboard summary

- **WHEN** a tenant has active invoices in only one currency
- **THEN** the dashboard money summaries render the same single-currency output they did before

### Requirement: Debtor rankings must not merge currencies

The system SHALL rank debtors within each currency bucket rather than summing a debtor’s invoices across currencies into one ranking value.

#### Scenario: Debtor owes in multiple currencies

- **WHEN** a debtor has overdue invoices in more than one currency
- **THEN** the system shows that debtor separately per currency bucket, with each displayed total limited to invoices in that currency

#### Scenario: Debtor ranking remains stable in one currency

- **WHEN** all overdue invoices for a tenant are in the same currency
- **THEN** the biggest-debtors output remains a single list for that currency

### Requirement: Weekly debtor summary email reflects currency buckets

The system SHALL render weekly debtor summary totals and debtor lists per currency so the email never implies a cross-currency sum.

#### Scenario: Weekly debtor summary includes multiple currencies

- **WHEN** the weekly debtor summary is generated from invoices in more than one currency
- **THEN** the email contains separate currency sections for outstanding totals and top debtors
