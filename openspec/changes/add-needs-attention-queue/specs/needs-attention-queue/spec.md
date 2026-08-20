## Purpose

Gives a business owner one category-counted view of every invoice or customer that needs a human decision right now, instead of requiring them to scan the full invoice table for problems.

## ADDED Requirements

### Requirement: Needs Attention queue counts every exception category
The system SHALL display a single "Needs Attention" summary showing a total count and a per-category breakdown covering: broken promises, disputed invoices, bounced reminder emails, invoices overdue 60 or more days, customers with no contact email, and import reconciliation anomalies.

#### Scenario: Multiple exception types present
- **WHEN** a tenant has 2 broken promises, 1 disputed invoice, 1 bounced email, and 2 invoices overdue more than 60 days
- **THEN** the Needs Attention summary shows a total of 6 and lists each category with its own count

#### Scenario: No exceptions present
- **WHEN** a tenant has no broken promises, disputes, bounces, long-overdue invoices, missing-contact-email customers, or import anomalies
- **THEN** the Needs Attention summary shows a total of 0 and is not displayed as an alarming state

### Requirement: Each category is clickable through to the relevant filtered view
The system SHALL make each category in the Needs Attention summary a link to a filtered view of the underlying invoices or customers driving that count.

#### Scenario: User clicks the disputed-invoices category
- **WHEN** a user clicks the "1 disputed" category
- **THEN** they are taken to a view showing exactly the disputed invoice(s) counted

### Requirement: Long-overdue threshold is 60 days
The system SHALL count an invoice under the "overdue 60+ days" category when its due date is 60 or more days in the past and it is not paid, disputed-and-excluded, or otherwise resolved.

#### Scenario: Invoice exactly at the threshold
- **WHEN** an active invoice's due date was exactly 60 days ago
- **THEN** it is counted under the overdue 60+ days category
