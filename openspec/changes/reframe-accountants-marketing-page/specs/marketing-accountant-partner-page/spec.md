## Purpose
Define what the `/accountants` marketing page may claim about the Accountant Partner programme given that multi-client management is not yet implemented, so the page invites interest without promising a working self-serve multi-client tool.

## ADDED Requirements

### Requirement: The page MUST NOT describe multi-client management as a working capability
`/accountants` SHALL NOT state or imply that a prospective partner can, today, monitor or manage invoice follow-ups for multiple clients from one account, or that a multi-client debtor dashboard exists.

#### Scenario: Visitor reads the multi-client management claim
- **WHEN** a visitor views the multi-client management section of `/accountants`
- **THEN** the copy describes multi-client management as planned/not yet available, not as a present-tense working feature

#### Scenario: Visitor reads the partner programme benefits list
- **WHEN** a visitor views the Accountant Partner Programme benefits list
- **THEN** "Unlimited clients under one account" and "Multi-client debtor dashboard" are not presented as current benefits without a planned/coming-soon qualifier

### Requirement: The page MUST route interest through the existing contact flow, not a new self-serve flow
`/accountants` SHALL present "contact us" / register-interest as the only call to action for the Accountant Partner programme, and SHALL NOT imply a self-serve onboarding flow for multiple clients exists.

#### Scenario: Visitor looks for a way to get started
- **WHEN** a visitor wants to act on the Accountant Partner programme
- **THEN** the only available action is a contact/enquiry link routed through the existing `Accounting Partnerships` enquiry type, not a signup or self-serve onboarding flow

### Requirement: The page SHALL be permitted to describe capabilities that already work for a single client
`/accountants` SHALL be permitted to describe invoice follow-up automation, promise-to-pay tracking, and dispute pause as available, since a bookkeeper or accountant can use these today on a per-client (single-account) basis.

#### Scenario: Visitor reads about follow-up automation
- **WHEN** a visitor reads about what PaidSoon does for an individual client's invoices
- **THEN** the copy may describe automated reminders, promise-to-pay tracking, and dispute pause as available, since these are implemented today
