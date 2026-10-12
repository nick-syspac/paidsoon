# Spec Delta

## MODIFIED Requirements

### Requirement: The page MUST NOT describe multi-client management as a working capability
The `/features/client-manager` destination SHALL NOT state or imply that a prospective partner can, today, monitor or manage invoice follow-ups for multiple clients from one account, or that a multi-client debtor dashboard exists. The prior `/accountants` route SHALL permanently redirect directly to this destination.

#### Scenario: Visitor reads the multi-client management claim
- **WHEN** a visitor views the Client Manager page
- **THEN** multi-client management is described as planned/not yet available, not as a present-tense working feature

#### Scenario: Visitor reads the partner programme benefits list
- **WHEN** a visitor views the Accountant Partner Programme benefits list
- **THEN** unlimited clients under one account and a multi-client debtor dashboard are not presented as current benefits without a planned/coming-soon qualifier

#### Scenario: Visitor follows the former accountant marketing URL
- **WHEN** a visitor requests `/accountants`
- **THEN** the server permanently redirects directly to `/features/client-manager`
- **AND** the destination is the canonical, indexable page for this accountant/bookkeeper marketing offer

### Requirement: The page MUST route interest through the existing contact flow, not a new self-serve flow
The `/features/client-manager` page SHALL present contact/enquiry as the only call to action for the Accountant Partner programme and SHALL NOT imply a self-serve onboarding flow for multiple clients exists.

#### Scenario: Visitor looks for a way to get started
- **WHEN** a visitor wants to act on the Accountant Partner programme
- **THEN** the available action is the existing contact/enquiry flow, not a signup or self-serve onboarding flow for multiple clients

### Requirement: The page SHALL be permitted to describe capabilities that already work for a single client
The `/features/client-manager` page SHALL be permitted to describe invoice follow-up automation, promise-to-pay tracking, and dispute pause as available only for a single client/account at a time, since those capabilities are implemented on a per-client basis.

#### Scenario: Visitor reads about follow-up automation
- **WHEN** a visitor reads what the existing workflow does for an individual client's invoices
- **THEN** the copy may describe automated reminders, promise-to-pay tracking, and dispute pause as available for that client
- **AND** it does not imply a shared multi-client dashboard or bulk client-management capability is available