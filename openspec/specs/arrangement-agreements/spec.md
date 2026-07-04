# arrangement-agreements Specification

## Purpose
TBD - created by syncing change arrangement-agreement-workflow. Update Purpose after implementation.
## Requirements
### Requirement: Freelancer can create arrangement agreements
The system SHALL allow a freelancer to create an internal arrangement agreement for a debtor from the dashboard.

#### Scenario: Freelancer creates single-invoice arrangement
- **WHEN** a freelancer records an arrangement for one overdue invoice
- **THEN** the system creates an arrangement linked to that invoice and stores the arrangement type, repayment terms, and debtor context

#### Scenario: Freelancer creates multi-invoice arrangement
- **WHEN** a freelancer records an arrangement that covers multiple overdue invoices for the same debtor within the same account
- **THEN** the system creates one arrangement and associates each selected invoice with that arrangement

### Requirement: Arrangement type determines allowed repayment structure
The system SHALL support full-payment arrangements, partial-payment arrangements, and instalment-plan arrangements.

#### Scenario: Freelancer creates full-payment arrangement
- **WHEN** a freelancer records a full-payment arrangement
- **THEN** the system stores a single promised settlement date for the covered balance

#### Scenario: Freelancer creates partial-payment arrangement
- **WHEN** a freelancer records a partial-payment arrangement
- **THEN** the system stores the agreed amount and the agreed date for that partial payment

#### Scenario: Freelancer creates instalment plan
- **WHEN** a freelancer records an instalment-plan arrangement
- **THEN** the system stores the plan schedule needed to evaluate future milestones

### Requirement: Multi-invoice arrangements are limited to one debtor
The system SHALL only allow a multi-invoice arrangement when all covered invoices belong to the same debtor within the same freelancer account.

#### Scenario: Selected invoices share debtor identity
- **WHEN** a freelancer selects multiple overdue invoices for the same debtor in the same account
- **THEN** the system allows those invoices to be attached to one arrangement

#### Scenario: Selected invoices span different debtors
- **WHEN** a freelancer selects overdue invoices that do not belong to the same debtor identity
- **THEN** the system rejects the multi-invoice arrangement request

### Requirement: Client-originated promise flow remains separate
The system SHALL reserve multi-invoice, partial-payment, and instalment arrangements for freelancer-managed workflows only.

#### Scenario: Client uses public promise link
- **WHEN** a client accesses the public promise-to-pay flow
- **THEN** the system does not offer any option to create a multi-invoice, partial-payment, or instalment arrangement